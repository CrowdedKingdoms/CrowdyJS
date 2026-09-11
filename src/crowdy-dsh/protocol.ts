/**
 * Wire protocol between the Crowdy Studio page and the DeepSeek Harness that
 * runs in a Web Worker inside the Studio agent pane.
 *
 * The harness side lives in the published `@crowdedkingdoms/crowdy-dsh`
 * package (`bridge-protocol` export); this file mirrors it so the SDK stays
 * dependency-free. Keep the two in step.
 *
 * Two channels exist:
 *
 *   - `postMessage` between the page and the harness iframe: the iframe says
 *     `crowdy-dsh:ready`, the page answers `crowdy-dsh:boot` with the home
 *     files to seed and a one-time `nonce`, and the iframe reports
 *     `crowdy-dsh:booted` or `:failed`.
 *   - one `BroadcastChannel` (name chosen by the page) between the page and
 *     the worker: the worker asks the page to do what only the page can
 *     (draft tests, screenshots, project switching, game observation) and the
 *     page pushes token, project and context updates.
 *
 * A `BroadcastChannel` is open to every same-origin script, so the channel
 * name is unguessable and every frame carries the boot nonce; a frame without
 * the right nonce is dropped. The page still confirms a live deploy with the
 * player before running it, because the harness UI's approval is inside the
 * iframe and the page cannot see it.
 */

export const CROWDY_DSH_PROTOCOL_VERSION = 2 as const;

export type DshBridgeSide = 'page' | 'worker';

export type DshBridgeFrame =
  | { v: 2; n: string; from: DshBridgeSide; t: 'req'; id: string; method: string; params: unknown }
  | { v: 2; n: string; from: DshBridgeSide; t: 'res'; id: string; result: unknown }
  | { v: 2; n: string; from: DshBridgeSide; t: 'err'; id: string; code: string; message: string }
  | { v: 2; n: string; from: DshBridgeSide; t: 'event'; event: string; payload: unknown };

export interface DshScreenshotResult {
  name: string;
  mediaType: 'image/png' | 'image/jpeg' | 'image/webp';
  bytes: ArrayBuffer;
  width: number;
  height: number;
  caption?: string;
}

export interface DshDiagnostic {
  target: 'SERVER' | 'CLIENT';
  path: string;
  line?: number;
  column?: number;
  severity: 'error' | 'warning' | 'info';
  message: string;
}

export interface DshRuntimeStatus {
  target: 'SERVER' | 'CLIENT';
  phase: string;
  moduleName?: string;
  runningRevision?: string;
  savedRevision?: string;
  message?: string;
}

export interface DshBuildResult {
  ok: boolean;
  mode: 'draft' | 'live';
  summary: string;
  diagnostics: DshDiagnostic[];
  buildLog: string;
  runtime: DshRuntimeStatus[];
  screenshot?: DshScreenshotResult;
}

export interface DshProjectSummary {
  projectId: string;
  name: string;
  kind: string;
  updatedAt: string;
  github?: string;
}

export interface DshBridgeRequestMap {
  'studio.screenshot': { params: { label?: string }; result: DshScreenshotResult };
  'studio.draftTest': { params: Record<string, never>; result: DshBuildResult };
  'studio.deployLive': { params: Record<string, never>; result: DshBuildResult };
  'studio.runtimeStatus': { params: Record<string, never>; result: { runtime: DshRuntimeStatus[] } };
  'studio.runtimeLogs': { params: { limit?: number }; result: { lines: string[]; truncated: boolean } };
  'studio.clientLogs': { params: { limit?: number }; result: { lines: string[]; truncated: boolean } };
  'studio.projectList': {
    params: Record<string, never>;
    result: { projects: DshProjectSummary[]; currentProjectId: string | null };
  };
  'studio.projectOpen': { params: { projectId: string }; result: { project: DshProjectSummary } };
  'studio.projectCreate': { params: { name: string; template?: string }; result: { project: DshProjectSummary } };
  'game.observe': { params: Record<string, never>; result: { observation: unknown; capturedAt: string } };
}

export type DshBridgeMethod = keyof DshBridgeRequestMap;

export interface DshPageEventMap {
  'page.hello': { appId: string; projectId: string | null; appToken?: string };
  'page.token': { appToken: string };
  'page.project': { projectId: string | null };
  'page.saved': { revision?: string };
  'page.context': {
    observation?: unknown;
    clientLogs?: string[];
    diagnostics?: DshDiagnostic[];
    runtime?: DshRuntimeStatus[];
    note?: string;
  };
  'page.capture': DshScreenshotResult;
  /** Text for the agent, queued into the latest live session (or a new one). */
  'page.prompt': { text: string; mode?: 'queue' | 'steer' };
  'page.bye': Record<string, never>;
}

export interface DshWorkerEventMap {
  'worker.ready': { root: string; store?: string };
  'worker.fileChanged': { target: 'SERVER' | 'CLIENT'; path: string };
  'worker.warning': { message: string };
  'worker.openFile': { target: 'SERVER' | 'CLIENT'; path: string; line?: number };
}

/** Messages the harness iframe posts to its parent (`source: 'crowdy-dsh'`). */
export type DshFrameMessage =
  | { source: 'crowdy-dsh'; type: 'crowdy-dsh:ready' }
  | { source: 'crowdy-dsh'; type: 'crowdy-dsh:booted'; mount: string }
  | { source: 'crowdy-dsh'; type: 'crowdy-dsh:failed'; message: string };

/** The page's answer to `crowdy-dsh:ready`. */
export interface DshBootMessage {
  type: 'crowdy-dsh:boot';
  /**
   * Home-relative files to seed (`crowdy.json`, `settings.yaml`). Never the
   * app token: that travels over the channel (`page.hello` / `page.token`) and
   * lives only in the worker's memory.
   */
  files: Record<string, string>;
  /** One-time secret every bridge frame must carry; also in `crowdy.json`. */
  nonce: string;
  /** OPFS scope for restored sessions; omit to start fresh. */
  persistScope?: string;
  mount?: string;
}

export function isDshBridgeFrame(value: unknown, nonce?: string): value is DshBridgeFrame {
  if (!value || typeof value !== 'object') return false;
  const frame = value as Partial<DshBridgeFrame>;
  if (frame.v !== CROWDY_DSH_PROTOCOL_VERSION || typeof frame.n !== 'string' || typeof frame.t !== 'string') return false;
  if (frame.from !== 'page' && frame.from !== 'worker') return false;
  return nonce === undefined || frame.n === nonce;
}

export function isDshFrameMessage(value: unknown): value is DshFrameMessage {
  return !!value && typeof value === 'object' && (value as { source?: unknown }).source === 'crowdy-dsh';
}
