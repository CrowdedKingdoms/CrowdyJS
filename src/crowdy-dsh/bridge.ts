/**
 * Page half of the Studio ↔ harness bridge.
 *
 * Owns the iframe handshake (seed files, persistence scope), the
 * `BroadcastChannel` the worker's tools call into, and the mapping from those
 * calls onto the headless `CrowdyStudioController` and the game's
 * `PlayerHostAdapterV1`. The model never gets a token, the network or DOM
 * input: everything it asks for runs here with the player's own authority,
 * through the same controller methods the human buttons use.
 */

import type { CrowdyStudioController, CrowdyStudioDeployResult, CrowdyStudioState } from '../crowdy-studio/controller.js';
import type { CrowdyStudioDiagnostic } from '../crowdy-studio/diagnostics.js';
import type { PlayerHostAdapterV1 } from '../player-host/types.js';
import {
  CROWDY_DSH_PROTOCOL_VERSION,
  isDshBridgeFrame,
  isDshFrameMessage,
  type DshBootMessage,
  type DshBridgeFrame,
  type DshBridgeMethod,
  type DshBridgeRequestMap,
  type DshBuildResult,
  type DshDiagnostic,
  type DshPageEventMap,
  type DshProjectSummary,
  type DshRuntimeStatus,
  type DshScreenshotResult,
  type DshWorkerEventMap,
} from './protocol.js';
import type { CrowdyStudioDshTransport, CrowdyStudioModelCatalogEntry } from './transport.js';

/** What the game supplies so the model can see and act. */
export interface CrowdyStudioDshHost {
  /**
   * Capture what the player sees. The game decides how (usually the WebGL
   * canvas right after a frame); the bridge downscales to `maxSide` and
   * encodes PNG. Omit when the game cannot capture; `screenshot` then fails
   * with a clear message.
   */
  captureFrame?(): Promise<HTMLCanvasElement | ImageBitmap | Blob | null>;
  /** One-line description of the current view, attached beside a capture. */
  describeView?(): string | undefined;
  /** Structured world observation; the `game_observe` tool and `context/`. */
  playerHost?: PlayerHostAdapterV1;
  /** Recent `crowdy::log` lines from the CLIENT module and browser runtime errors. */
  clientLogs?(): readonly string[];
}

export interface StudioDshBridgeOptions {
  controller: CrowdyStudioController;
  transport: CrowdyStudioDshTransport;
  appId: string;
  /** Stable per-player key for session persistence; never a token. */
  persistScope: string;
  getToken(): string | null;
  /** GraphQL endpoint the harness reads/writes project files through. */
  graphqlUrl: string;
  host?: CrowdyStudioDshHost;
  /** Longest screenshot side, in pixels. */
  maxCaptureSide?: number;
  /** Called when the worker changed a project file, after the controller reloaded. */
  onFileChanged?(change: { target: 'SERVER' | 'CLIENT'; path: string }): void;
  onWarning?(message: string): void;
  onStatus?(status: StudioDshBridgeStatus): void;
}

export type StudioDshBridgeStatus =
  | { phase: 'idle' }
  | { phase: 'waiting-for-frame' }
  | { phase: 'booting' }
  | { phase: 'ready'; store?: string }
  | { phase: 'failed'; message: string };

interface Pending {
  id: string;
  method: string;
}

const DEFAULT_MAX_SIDE = 1280;
const HELLO_DEBOUNCE_MS = 1_500;

export class StudioDshBridge {
  readonly channelName = `crowdy-dsh:${Math.random().toString(36).slice(2, 10)}`;
  private channel: BroadcastChannel | null = null;
  private frameListener: ((event: MessageEvent) => void) | null = null;
  private booted = false;
  private lastHelloAt = 0;
  private lastToken: string | null = null;
  private lastProjectId: string | null | undefined;
  private lastSaveState: CrowdyStudioState['saveState'] | undefined;
  private unsubscribeState: (() => void) | null = null;
  private tokenTimer: ReturnType<typeof setInterval> | null = null;
  private captureCounter = 0;
  private readonly inflight = new Set<Pending>();
  private models: CrowdyStudioModelCatalogEntry[] = [];
  private status: StudioDshBridgeStatus = { phase: 'idle' };

  constructor(private readonly options: StudioDshBridgeOptions) {}

  get currentStatus(): StudioDshBridgeStatus {
    return this.status;
  }

  /** The models the harness was booted with. */
  get catalog(): readonly CrowdyStudioModelCatalogEntry[] {
    return this.models;
  }

  /**
   * Attach to the iframe: answer its `ready` with the boot files and start the
   * broadcast channel. Resolves once the harness reports it booted.
   */
  async attach(frame: HTMLIFrameElement): Promise<void> {
    this.detach();
    this.setStatus({ phase: 'waiting-for-frame' });
    this.models = await this.options.transport.models(this.options.appId);
    if (this.models.length === 0) {
      throw new Error('No model is allowed for this app; ask the app owner to enable the Studio agent.');
    }
    this.connect();
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        cleanup();
        reject(new Error('The agent did not start within 60s.'));
      }, 60_000);
      const cleanup = () => {
        clearTimeout(timeout);
      };
      this.frameListener = (event: MessageEvent) => {
        if (event.source !== frame.contentWindow) return;
        if (event.origin !== location.origin) return;
        const data: unknown = event.data;
        if (!isDshFrameMessage(data)) return;
        if (data.type === 'crowdy-dsh:ready') {
          if (this.booted) return;
          this.setStatus({ phase: 'booting' });
          frame.contentWindow?.postMessage(this.bootMessage(), location.origin);
        } else if (data.type === 'crowdy-dsh:booted') {
          this.booted = true;
          cleanup();
          this.setStatus({ phase: 'ready' });
          this.hello(true);
          resolve();
        } else if (data.type === 'crowdy-dsh:failed') {
          cleanup();
          this.setStatus({ phase: 'failed', message: data.message });
          reject(new Error(data.message));
        }
      };
      window.addEventListener('message', this.frameListener);
    });
  }

  /**
   * Join the broadcast channel and start mirroring controller state, without
   * an iframe handshake. `attach` calls this; a host that boots the harness
   * itself (tests, a native shell) calls it directly.
   */
  connect(): void {
    if (this.channel) return;
    this.openChannel();
    this.watchController();
  }

  detach(): void {
    if (this.frameListener) window.removeEventListener('message', this.frameListener);
    this.frameListener = null;
    this.unsubscribeState?.();
    this.unsubscribeState = null;
    if (this.tokenTimer) clearInterval(this.tokenTimer);
    this.tokenTimer = null;
    if (this.channel) {
      this.emit('page.bye', {});
      this.channel.close();
    }
    this.channel = null;
    this.booted = false;
    this.inflight.clear();
    this.setStatus({ phase: 'idle' });
  }

  /** Push a capture the player took from the pane header into `captures/`. */
  async shareCapture(label?: string): Promise<DshScreenshotResult> {
    const shot = await this.screenshot(label);
    this.emit('page.capture', shot);
    return shot;
  }

  /** Queue text into the agent's current session (e.g. "Fix with AI"). */
  prompt(text: string, mode: 'queue' | 'steer' = 'queue'): void {
    if (!this.channel) {
      this.options.onWarning?.('The agent is not running yet; open the Agent pane first.');
      return;
    }
    this.emit('page.prompt', { text, mode });
  }

  /** Re-send the token (the page refreshed it). */
  tokenChanged(): void {
    const token = this.options.getToken();
    if (token && token !== this.lastToken) {
      this.lastToken = token;
      this.emit('page.token', { appToken: token });
    }
  }

  // ── boot ────────────────────────────────────────────────────────────────────

  private bootMessage(): DshBootMessage {
    const token = this.options.getToken() ?? '';
    this.lastToken = token;
    const projectId = this.options.controller.getState().project?.projectId ?? '';
    const crowdy = {
      graphqlUrl: this.options.graphqlUrl,
      appId: this.options.appId,
      projectId,
      appToken: token,
      bridgeChannel: this.channelName,
      githubFirst: true,
      root: '/dsh/workspace',
      persistScope: this.options.persistScope,
    };
    return {
      type: 'crowdy-dsh:boot',
      files: {
        'crowdy.json': JSON.stringify(crowdy, null, 2),
        'settings.yaml': renderSettingsYaml(this.options.transport.modelBaseUrl, this.models),
      },
      persistScope: this.options.persistScope,
      mount: '/dsh/workspace',
    };
  }

  // ── channel ─────────────────────────────────────────────────────────────────

  private openChannel(): void {
    this.channel = new BroadcastChannel(this.channelName);
    this.channel.addEventListener('message', (event: MessageEvent) => {
      void this.handle(event.data);
    });
  }

  private hello(force = false): void {
    const now = Date.now();
    if (!force && now - this.lastHelloAt < HELLO_DEBOUNCE_MS) return;
    this.lastHelloAt = now;
    const token = this.options.getToken();
    this.emit('page.hello', {
      appId: this.options.appId,
      projectId: this.options.controller.getState().project?.projectId ?? null,
      ...(token ? { appToken: token } : {}),
    });
  }

  private emit<E extends keyof DshPageEventMap>(event: E, payload: DshPageEventMap[E]): void {
    if (!this.channel) return;
    const frame: DshBridgeFrame = { v: CROWDY_DSH_PROTOCOL_VERSION, from: 'page', t: 'event', event, payload };
    this.channel.postMessage(frame);
  }

  private reply(id: string, result: unknown): void {
    const frame: DshBridgeFrame = { v: CROWDY_DSH_PROTOCOL_VERSION, from: 'page', t: 'res', id, result };
    this.channel?.postMessage(frame);
  }

  private fail(id: string, error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    const frame: DshBridgeFrame = { v: CROWDY_DSH_PROTOCOL_VERSION, from: 'page', t: 'err', id, code: 'PAGE_ERROR', message };
    this.channel?.postMessage(frame);
  }

  private async handle(data: unknown): Promise<void> {
    if (!isDshBridgeFrame(data) || data.from !== 'worker') return;
    if (data.t === 'event') {
      this.onWorkerEvent(data.event as keyof DshWorkerEventMap, data.payload);
      return;
    }
    if (data.t !== 'req') return;
    const pending: Pending = { id: data.id, method: data.method };
    this.inflight.add(pending);
    try {
      const result = await this.dispatch(data.method as DshBridgeMethod, data.params);
      this.reply(data.id, result);
    } catch (error) {
      this.fail(data.id, error);
    } finally {
      this.inflight.delete(pending);
    }
  }

  private onWorkerEvent(event: keyof DshWorkerEventMap, payload: unknown): void {
    switch (event) {
      case 'worker.ready': {
        const ready = payload as DshWorkerEventMap['worker.ready'];
        this.setStatus({ phase: 'ready', ...(ready.store ? { store: ready.store } : {}) });
        this.hello();
        return;
      }
      case 'worker.fileChanged': {
        const change = payload as DshWorkerEventMap['worker.fileChanged'];
        void this.options.controller.reloadProject().then(
          () => this.options.onFileChanged?.(change),
          (error: unknown) => this.options.onWarning?.(`The agent changed ${change.path} but the editor could not reload: ${String(error)}`),
        );
        return;
      }
      case 'worker.warning': {
        this.options.onWarning?.((payload as DshWorkerEventMap['worker.warning']).message);
        return;
      }
      case 'worker.openFile': {
        const ref = payload as DshWorkerEventMap['worker.openFile'];
        try {
          this.options.controller.openFile({ source: 'PROJECT', target: ref.target, path: ref.path });
        } catch {
          // The file may not exist yet; the editor shows what it has.
        }
        return;
      }
      default:
        return;
    }
  }

  // ── requests ────────────────────────────────────────────────────────────────

  private async dispatch<M extends DshBridgeMethod>(
    method: M,
    params: unknown,
  ): Promise<DshBridgeRequestMap[M]['result']> {
    const controller = this.options.controller;
    switch (method) {
      case 'studio.screenshot':
        return this.screenshot((params as { label?: string } | undefined)?.label) as never;
      case 'studio.draftTest':
        return this.build('draft') as never;
      case 'studio.deployLive':
        return this.build('live') as never;
      case 'studio.runtimeStatus':
        return { runtime: this.runtimeStatus(controller.getState()) } as never;
      case 'studio.runtimeLogs': {
        const limit = clampLimit((params as { limit?: number } | undefined)?.limit, 40);
        controller.setSurfaceVisible('logs', true);
        const lines = controller.getState().logs.map(formatRunLine);
        return { lines: lines.slice(-limit), truncated: lines.length > limit } as never;
      }
      case 'studio.clientLogs': {
        const limit = clampLimit((params as { limit?: number } | undefined)?.limit, 80);
        const lines = [...(this.options.host?.clientLogs?.() ?? [])];
        return { lines: lines.slice(-limit), truncated: lines.length > limit } as never;
      }
      case 'studio.projectList': {
        const state = controller.getState();
        return {
          projects: state.projects.map(summarize),
          currentProjectId: state.project?.projectId ?? null,
        } as never;
      }
      case 'studio.projectOpen': {
        const { projectId } = params as { projectId: string };
        await controller.switchProject(projectId);
        const project = controller.getState().project;
        if (!project) throw new Error(`Project ${projectId} did not open.`);
        this.emit('page.project', { projectId: project.projectId });
        return { project: summarizeProject(project.projectId, project.metadata.name, project.kind, project.revision.savedAt) } as never;
      }
      case 'studio.projectCreate': {
        const { name, template } = params as { name: string; template?: string };
        const kind = template === 'server' ? 'SERVER' : template === 'client' ? 'CLIENT' : 'FULL_STACK';
        const project = await controller.createProject({ name, kind: kind as never });
        this.emit('page.project', { projectId: project.projectId });
        return { project: summarizeProject(project.projectId, project.metadata.name, project.kind, project.revision.savedAt) } as never;
      }
      case 'game.observe': {
        const host = this.options.host?.playerHost;
        if (!host) throw new Error('This game does not expose a player host; nothing to observe.');
        const observation = await host.observe({ detail: 'STANDARD', maxNearbyActors: 16, maxNearbyVoxels: 64 });
        this.emit('page.context', { observation });
        return { observation, capturedAt: new Date().toISOString() } as never;
      }
      default:
        throw new Error(`Unsupported bridge method ${String(method)}`);
    }
  }

  private async build(mode: 'draft' | 'live'): Promise<DshBuildResult> {
    const controller = this.options.controller;
    if (!controller.getState().project) throw new Error('No project is open in Crowdy Studio.');
    const result: CrowdyStudioDeployResult = mode === 'draft' ? await controller.testDraft() : await controller.deployLive();
    const state = controller.getState();
    const diagnostics = [...state.authoritativeDiagnostics, ...state.localDiagnostics].map(toDshDiagnostic);
    const runtime = this.runtimeStatus(state);
    const ok = result.status === 'RUNNING';
    const build: DshBuildResult = {
      ok,
      mode,
      summary: result.message,
      diagnostics,
      buildLog: state.buildOutput.slice(-12_000),
      runtime,
    };
    this.emit('page.context', { diagnostics, runtime });
    if (ok && result.targets.includes('CLIENT') && this.options.host?.captureFrame) {
      // Let one frame render with the new client module before capturing.
      await new Promise((resolve) => setTimeout(resolve, 600));
      try {
        build.screenshot = await this.screenshot(`after ${mode} ${mode === 'draft' ? 'test' : 'deploy'}`);
      } catch {
        // A missing capture is not a failed build.
      }
    }
    return build;
  }

  private runtimeStatus(state: CrowdyStudioState): DshRuntimeStatus[] {
    const targets = state.project ? [...new Set(state.project.files.map((file) => file.target))] : [];
    return targets.map((target) => ({
      target,
      phase: state.runtime.target === target || state.runtime.target === undefined ? state.runtime.phase : 'IDLE',
      moduleName: target === 'SERVER' ? state.project?.metadata.serverModuleName : state.project?.metadata.clientModuleName,
      runningRevision: state.runtimeSync.state === 'RUNNING_SAVED' || state.runtimeSync.state === 'RUNNING_STALE' ? state.runtimeSync.savedRevisionId : undefined,
      savedRevision: state.project?.revision.id,
      message: state.runtime.message,
    }));
  }

  private async screenshot(label?: string): Promise<DshScreenshotResult> {
    const capture = this.options.host?.captureFrame;
    if (!capture) throw new Error('This game does not provide screenshots to the agent.');
    const source = await capture();
    if (!source) throw new Error('Nothing to capture right now (no frame rendered).');
    const encoded = await encodePng(source, this.options.maxCaptureSide ?? DEFAULT_MAX_SIDE);
    this.captureCounter += 1;
    const caption = [label, this.options.host?.describeView?.()].filter(Boolean).join(' — ');
    return {
      name: `capture-${String(this.captureCounter).padStart(4, '0')}.png`,
      mediaType: 'image/png',
      bytes: encoded.bytes,
      width: encoded.width,
      height: encoded.height,
      ...(caption ? { caption } : {}),
    };
  }

  // ── controller watch ────────────────────────────────────────────────────────

  private watchController(): void {
    const controller = this.options.controller;
    this.lastProjectId = controller.getState().project?.projectId ?? null;
    this.lastSaveState = controller.getState().saveState;
    this.unsubscribeState = controller.subscribe((state) => {
      const projectId = state.project?.projectId ?? null;
      if (projectId !== this.lastProjectId) {
        this.lastProjectId = projectId;
        this.emit('page.project', { projectId });
      }
      if (state.saveState === 'SAVED' && this.lastSaveState !== 'SAVED' && this.inflight.size === 0) {
        this.emit('page.saved', { revision: state.project?.revision.id });
      }
      this.lastSaveState = state.saveState;
    });
    this.tokenTimer = setInterval(() => this.tokenChanged(), 20_000);
  }

  private setStatus(status: StudioDshBridgeStatus): void {
    this.status = status;
    this.options.onStatus?.(status);
  }
}

// ── helpers ───────────────────────────────────────────────────────────────────

function clampLimit(value: number | undefined, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.max(1, Math.min(400, Math.floor(value)));
}

function formatRunLine(run: CrowdyStudioState['logs'][number]): string {
  const status = run.success ? 'ok' : 'FAILED';
  const error = run.errorMessage ? ` — ${run.errorMessage}` : '';
  return `${run.startedAt} ${run.moduleName} ${run.triggerSource} ${status} ${Math.round(run.durationUs / 1000)}ms fuel=${run.fuelUsed}${error}`;
}

function toDshDiagnostic(diagnostic: CrowdyStudioDiagnostic): DshDiagnostic {
  return {
    target: diagnostic.target,
    path: diagnostic.path,
    line: diagnostic.line,
    column: diagnostic.column,
    severity: diagnostic.severity === 'hint' ? 'info' : diagnostic.severity,
    message: diagnostic.code ? `${diagnostic.message} [${diagnostic.code}]` : diagnostic.message,
  };
}

function summarize(summary: CrowdyStudioState['projects'][number]): DshProjectSummary {
  return { projectId: summary.projectId, name: summary.name, kind: String(summary.kind), updatedAt: summary.updatedAt };
}

function summarizeProject(projectId: string, name: string, kind: string, updatedAt: string): DshProjectSummary {
  return { projectId, name, kind, updatedAt };
}

/** Render the harness settings that point its native adapter at the metered endpoint. */
export function renderSettingsYaml(modelBaseUrl: string, models: readonly CrowdyStudioModelCatalogEntry[]): string {
  const quote = (value: string) => JSON.stringify(value);
  const lines = [
    '# Written by Crowdy Studio at boot; the metered model endpoint fronts the platform key.',
    'llm-deepseek:',
    '  apiKeyEnv: CROWDY_APP_TOKEN',
    `  baseURL: ${quote(modelBaseUrl)}`,
    '  thinking: disabled',
    '  models:',
  ];
  for (const model of models) {
    lines.push(`    - id: ${quote(model.id)}`);
    lines.push(`      name: ${quote(model.name)}`);
    if (model.contextWindow) lines.push(`      contextWindow: ${model.contextWindow}`);
    lines.push('      maxTokens: 8192');
    lines.push(`      inputModalities: [${model.inputModalities.map(quote).join(', ')}]`);
  }
  const first = models[0];
  if (first) {
    lines.push('agent-default-model:', '  provider: deepseek-official', `  model: ${quote(first.id)}`);
  }
  return `${lines.join('\n')}\n`;
}

/** Downscale and PNG-encode a frame in the page. */
async function encodePng(
  source: HTMLCanvasElement | ImageBitmap | Blob,
  maxSide: number,
): Promise<{ bytes: ArrayBuffer; width: number; height: number }> {
  let bitmap: ImageBitmap | HTMLCanvasElement;
  if (source instanceof Blob) bitmap = await createImageBitmap(source);
  else bitmap = source;
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('2D canvas unavailable for the capture.');
  context.drawImage(bitmap as CanvasImageSource, 0, 0, width, height);
  if (source instanceof Blob && 'close' in bitmap) (bitmap as ImageBitmap).close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('PNG encoding failed.');
  return { bytes: await blob.arrayBuffer(), width, height };
}
