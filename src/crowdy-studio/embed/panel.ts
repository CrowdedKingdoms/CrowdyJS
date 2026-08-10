import {
  mountCrowdyStudio,
  type MountCrowdyStudioOptions,
} from '../mount.js';
import type {
  CrowdyStudioController,
  CrowdyStudioPlayerCompute,
  CrowdyStudioPlayerWallet,
} from '../controller.js';
import type { CrowdyStudioProjectProvider } from '../models.js';
import type {
  CrowdyAgentMode,
  CrowdyAgentPreemptionReason,
  CrowdyStudioAgentController,
  CrowdyStudioAgentTransportV1,
} from '../../crowdy-agent/index.js';
import type {
  AgentControlLeaseManager,
  AgentControlLeaseManagerOptionsV1,
  PlayerHostAdapterV1,
} from '../../player-host/index.js';
import type {
  PlayerCodeGridBounds,
  PlayerCodeHostCall,
  PlayerCodePresentation,
} from '../../player-runtime/player-code-broker.js';
import {
  CROWDY_STUDIO_EMBED_NARROW_BREAKPOINT_PX,
  CrowdyStudioEmbedDock,
  addBodyClass,
  removeBodyClass,
  type CrowdyStudioEmbedDockStorage,
} from './dock.js';
import { ensureCrowdyStudioEmbedStyles } from './embed-styles.js';
import type { CrowdyStudioTextHud } from './hud-layer.js';
import { CrowdyGraphQLError } from '../../errors.js';

const TITLE_ID = 'ck-crowdy-studio-embed-title';
const DESCRIPTION_ID = 'ck-crowdy-studio-embed-description';
const SHELL_ID = 'ck-crowdy-studio-embed-shell';
const DRAWER_ID = 'ck-crowdy-studio-embed-drawer';

export type CrowdyStudioEmbedDisplayMode = 'docked' | 'fullscreen';

/**
 * The studio-facing domain services the embed needs. `CrowdyClient`
 * satisfies this structurally, so most games pass their client directly.
 */
export interface CrowdyStudioEmbedServices {
  crowdyStudio: CrowdyStudioProjectProvider;
  playerCompute: CrowdyStudioPlayerCompute;
  playerWallet?: CrowdyStudioPlayerWallet;
  /** Production agent transport; omission keeps the agent fail-closed/hidden. */
  crowdyStudioAgent?: CrowdyStudioAgentTransportV1;
  /**
   * Rotate the app-scoped gameplay token (UDP-safe). Used before Studio mounts
   * and again on Retry when mount fails with `UNAUTHENTICATED` / expired token.
   * `CrowdyClient.refreshGameplayToken` satisfies this.
   */
  refreshGameplayToken?(): Promise<unknown>;
}

export interface CrowdyStudioEmbedTargetPermission {
  canWrite: boolean;
  canRun: boolean;
}

export interface CrowdyStudioEmbedTargetPermissions {
  SERVER: CrowdyStudioEmbedTargetPermission;
  CLIENT: CrowdyStudioEmbedTargetPermission;
}

export interface CrowdyStudioEmbedHandle {
  readonly api: 'crowdy-studio';
  readonly controller: CrowdyStudioController;
  readonly agent: CrowdyStudioAgentController | null;
  readonly controlLeaseManager: AgentControlLeaseManager | null;
  destroy(): void;
}

export interface CrowdyStudioEmbedAgentSessionOptions {
  mode?: CrowdyAgentMode;
  providerDataConsent?: boolean;
  /** Prefixes the generated per-session idempotency key. */
  idempotencyKeyPrefix?: string;
}

/** Static, game-lifetime configuration for the embed shell. */
export interface CrowdyStudioEmbedOptions {
  client: CrowdyStudioEmbedServices;
  appId: string | (() => string);
  /** Header title. Defaults to "Crowdy Studio". */
  title?: string;
  /** Game name used in the screen-reader description of the panel. */
  gameName?: string;
  /**
   * Keyboard code that closes the studio from chrome (not from text entry).
   * Defaults to `KeyM` to match the common open keybind; `null` disables the
   * key entirely. Escape always closes.
   */
  closeKeyCode?: string | null;
  agentSession?: CrowdyStudioEmbedAgentSessionOptions;
  controlGate?: AgentControlLeaseManagerOptionsV1;
  onLocalPreempt?(reason: CrowdyAgentPreemptionReason): void;
  /**
   * Suppress gameplay input and return a restoration callback. Used only by
   * the narrow-screen modal; the desktop dock remains non-modal.
   */
  suppressGameplayInput?(): () => void;
  /** Re-measure the game canvas and HUD after dock geometry changes. */
  onLayoutChange?(): void;
  onAgentMounted?(handle: CrowdyStudioEmbedHandle): void;
  onAgentUnavailable?(message: string): void;
  onAgentUnmounted?(): void;
  /** Called after the panel closes for any reason (Escape, key, close()). */
  onClosed?(): void;
  dockStorage?: CrowdyStudioEmbedDockStorage | null;
  /** Browser-regression-only fault/config injection; never set by a game. */
  runtimeOverrides?: Partial<MountCrowdyStudioOptions>;
}

/** Per-open context: the grid the player is editing and its capabilities. */
export interface CrowdyStudioEmbedContext {
  gridId: string;
  /** Chunk AABB; required to run CLIENT projects. */
  grid?: PlayerCodeGridBounds;
  targetPermissions: CrowdyStudioEmbedTargetPermissions;
  /** Optional provenance note rendered under the permission cards. */
  permissionsNote?: string;
  /** Same-origin glue worker URL; required to run CLIENT projects. */
  workerUrl?: string;
  /** Allow-listed world reads/writes for CLIENT projects. */
  onHostCall?(call: PlayerCodeHostCall): Promise<unknown>;
  /** Text-only HUD sink; enables the drawer HUD preview when provided. */
  hud?: CrowdyStudioTextHud;
  /** Custom presentation routing; defaults to `hud` when omitted. */
  onPresentation?(presentation: PlayerCodePresentation): void;
  /** Game Play adapter; with `client.crowdyStudioAgent` enables the agent. */
  playerHost?: PlayerHostAdapterV1;
}

/**
 * Responsive game shell around CrowdyJS's project-first Crowdy Studio.
 * Desktop uses a resizable right dock; narrow screens use a focus-trapped
 * modal. Construct once per game and `toggle(context)` per open.
 */
export class CrowdyStudioEmbed {
  private root: HTMLDivElement | null = null;
  private mountElement: HTMLDivElement | null = null;
  private statusElement: HTMLDivElement | null = null;
  private drawerElement: HTMLElement | null = null;
  private drawerButton: HTMLButtonElement | null = null;
  private handle: CrowdyStudioEmbedHandle | null = null;
  private context: CrowdyStudioEmbedContext | null = null;
  private previousFocus: HTMLElement | null = null;
  private restoreGameplayInput: (() => void) | null = null;
  private unmountHudPreview: (() => void) | null = null;
  private mountGeneration = 0;
  private displayMode: CrowdyStudioEmbedDisplayMode | null = null;
  private readonly dock: CrowdyStudioEmbedDock;
  /** Stable across Studio open/close remounts so attach idempotency can correlate. */
  private readonly embedClientInstanceId = createEmbedClientInstanceId();
  /** Caps UNAUTHENTICATED refresh→remount to one attempt per open/Retry. */
  private studioAuthRemounts = 0;

  constructor(private readonly options: CrowdyStudioEmbedOptions) {
    this.dock = new CrowdyStudioEmbedDock(
      (width) => {
        this.applyDockWidth(width);
      },
      options.dockStorage === undefined ? undefined : options.dockStorage,
    );
  }

  get open(): boolean {
    return this.root !== null;
  }

  get modal(): boolean {
    return this.displayMode === 'fullscreen';
  }

  get mode(): CrowdyStudioEmbedDisplayMode | null {
    return this.displayMode;
  }

  toggle(context: CrowdyStudioEmbedContext): void {
    if (this.root) this.close();
    else this.show(context);
  }

  destroy(): void {
    this.close();
    this.dock.destroy();
  }

  close(): void {
    if (!this.root) return;
    const context = this.context;
    this.mountGeneration++;
    this.options.onAgentUnmounted?.();
    this.handle?.destroy();
    this.handle = null;
    this.unmountHudPreview?.();
    this.unmountHudPreview = null;
    this.leaveModalMode();
    this.dock.deactivate();
    window.removeEventListener('resize', this.viewportResize);
    this.root.removeEventListener('keydown', this.keyDown);
    this.root.removeEventListener('keyup', this.stopKeyboardEvent);
    this.root.removeEventListener('keypress', this.stopKeyboardEvent);
    this.root.remove();
    removeBodyClass(
      'ck-crowdy-studio-embed-open',
      'ck-crowdy-studio-embed-docked',
      'ck-crowdy-studio-embed-fullscreen',
      'ck-crowdy-studio-embed-resizing',
    );
    this.clearDockWidth();
    this.root = null;
    this.mountElement = null;
    this.statusElement = null;
    this.drawerElement = null;
    this.drawerButton = null;
    this.context = null;
    this.displayMode = null;
    if (context) this.options.onLayoutChange?.();
    const restore = this.previousFocus;
    this.previousFocus = null;
    if (restore?.isConnected) restore.focus();
    this.options.onClosed?.();
  }

  private show(context: CrowdyStudioEmbedContext): void {
    ensureCrowdyStudioEmbedStyles();
    this.context = context;
    this.studioAuthRemounts = 0;
    this.previousFocus =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const root = document.createElement('div');
    root.className = 'ck-crowdy-studio-embed';
    root.setAttribute('aria-labelledby', TITLE_ID);
    root.setAttribute('aria-describedby', DESCRIPTION_ID);
    root.tabIndex = -1;
    root.addEventListener('keydown', this.keyDown);
    root.addEventListener('keyup', this.stopKeyboardEvent);
    root.addEventListener('keypress', this.stopKeyboardEvent);
    root.addEventListener('mousedown', stopEventPropagation);
    root.addEventListener('pointerdown', stopEventPropagation);
    root.addEventListener('pointerup', stopEventPropagation);
    root.addEventListener('click', stopEventPropagation);
    root.addEventListener('dblclick', stopEventPropagation);
    root.addEventListener('wheel', stopEventPropagation);
    root.addEventListener('contextmenu', stopEventPropagation);

    const shell = document.createElement('section');
    shell.className = 'ck-crowdy-studio-embed-shell';
    shell.id = SHELL_ID;
    const header = this.header(context);
    const workspace = document.createElement('div');
    workspace.className = 'ck-crowdy-studio-embed-workspace';
    const main = document.createElement('main');
    main.className = 'ck-crowdy-studio-embed-main';

    const status = document.createElement('div');
    status.className = 'ck-crowdy-studio-embed-status is-loading';
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    const mountElement = document.createElement('div');
    mountElement.className = 'ck-crowdy-studio-embed-mount';
    mountElement.setAttribute('data-ck-crowdy-studio-embed-root', '');
    main.append(status, mountElement);
    const drawer = this.drawer(context);
    workspace.append(main, drawer);
    shell.append(header, workspace);
    this.dock.separator.setAttribute('aria-controls', SHELL_ID);
    root.append(this.dock.separator, shell);
    document.body.appendChild(root);
    addBodyClass('ck-crowdy-studio-embed-open');

    this.root = root;
    this.mountElement = mountElement;
    this.statusElement = status;
    this.drawerElement = drawer;
    window.addEventListener('resize', this.viewportResize);
    this.updateDisplayMode();

    header
      .querySelector<HTMLButtonElement>('.ck-crowdy-studio-embed-close')
      ?.focus();
    void this.mountStudio();
  }

  /**
   * Single compact header row: title, context pill, on-demand Context drawer
   * toggle, Close. Project context and permission details live in the drawer
   * so every workflow starts with maximum studio space.
   */
  private header(context: CrowdyStudioEmbedContext): HTMLElement {
    const header = document.createElement('header');
    header.className = 'ck-crowdy-studio-embed-header';
    const title = document.createElement('h1');
    title.id = TITLE_ID;
    title.textContent = this.options.title ?? 'Crowdy Studio';
    const description = document.createElement('p');
    description.id = DESCRIPTION_ID;
    description.className = 'ck-crowdy-studio-embed-visually-hidden';
    description.textContent = this.accessibleDescription(context.gridId);
    const pill = contextPill('Grid', context.gridId);

    const contextButton = document.createElement('button');
    contextButton.type = 'button';
    contextButton.className = 'ck-crowdy-studio-embed-context-toggle';
    contextButton.textContent = 'Context';
    contextButton.title = context.hud
      ? 'Grid bounds, permissions, and HUD preview'
      : 'Grid bounds and permissions';
    contextButton.setAttribute('aria-expanded', 'false');
    contextButton.setAttribute('aria-controls', DRAWER_ID);
    contextButton.addEventListener('click', () => this.toggleDrawer());
    this.drawerButton = contextButton;

    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'ck-crowdy-studio-embed-close';
    close.setAttribute('aria-label', 'Close Crowdy Studio');
    close.title = this.closeKeyLabel()
      ? `Close Crowdy Studio (Escape or ${this.closeKeyLabel()})`
      : 'Close Crowdy Studio (Escape)';
    close.textContent = 'Close';
    close.addEventListener('click', () => this.close());
    header.append(title, description, pill, contextButton, close);
    return header;
  }

  /**
   * On-demand context drawer: grid context, effective permissions, and (when
   * a HUD sink is supplied) a lazily mounted HUD preview. Hidden by default;
   * toggled from the header.
   */
  private drawer(context: CrowdyStudioEmbedContext): HTMLElement {
    const aside = document.createElement('aside');
    aside.className = 'ck-crowdy-studio-embed-drawer';
    aside.id = DRAWER_ID;
    aside.setAttribute('aria-label', 'Crowdy Studio context');
    aside.hidden = true;

    const contextTitle = document.createElement('h2');
    contextTitle.textContent = 'Project context';
    const grid = document.createElement('dl');
    grid.className = 'ck-crowdy-studio-embed-grid-context';
    appendDefinition(grid, 'Grid', context.gridId);
    if (context.grid) {
      appendDefinition(grid, 'Low chunk', formatChunk(context.grid.low));
      appendDefinition(grid, 'High chunk', formatChunk(context.grid.high));
    }

    const permissionsTitle = document.createElement('h2');
    permissionsTitle.textContent = 'Effective permissions';
    const summary = document.createElement('p');
    summary.textContent = permissionSummary(context.targetPermissions);
    const permissions = document.createElement('div');
    permissions.className = 'ck-crowdy-studio-embed-permissions';
    permissions.append(
      permissionCard('SERVER', context.targetPermissions.SERVER),
      permissionCard('CLIENT', context.targetPermissions.CLIENT),
    );
    aside.append(contextTitle, grid, permissionsTitle, summary, permissions);
    if (context.permissionsNote) {
      const source = document.createElement('p');
      source.className = 'ck-crowdy-studio-embed-permission-source';
      source.textContent = context.permissionsNote;
      aside.append(source);
    }

    if (context.hud) {
      const hud = context.hud;
      const previewDisclosure = document.createElement('details');
      previewDisclosure.className =
        'ck-crowdy-studio-embed-hud-preview-disclosure';
      const previewSummary = document.createElement('summary');
      previewSummary.textContent = 'HUD preview';
      const preview = document.createElement('div');
      preview.className = 'ck-crowdy-studio-embed-hud-preview';
      preview.setAttribute('aria-live', 'polite');
      previewDisclosure.append(previewSummary, preview);
      previewDisclosure.addEventListener('toggle', () => {
        if (previewDisclosure.open) {
          this.unmountHudPreview ??= hud.mountPreview(
            preview,
            this.presentationSource(context.gridId),
          );
        } else {
          this.unmountHudPreview?.();
          this.unmountHudPreview = null;
        }
      });
      aside.append(previewDisclosure);
    }

    const hint = document.createElement('p');
    hint.className = 'ck-crowdy-studio-embed-shortcuts';
    hint.textContent = this.shortcutHint();
    aside.append(hint);
    return aside;
  }

  private toggleDrawer(force?: boolean): void {
    const drawer = this.drawerElement;
    if (!drawer) return;
    const open = force ?? drawer.hidden;
    drawer.hidden = !open;
    this.drawerButton?.setAttribute('aria-expanded', String(open));
    if (!open) {
      const disclosure = drawer.querySelector<HTMLDetailsElement>(
        '.ck-crowdy-studio-embed-hud-preview-disclosure',
      );
      if (disclosure) disclosure.open = false;
      this.unmountHudPreview?.();
      this.unmountHudPreview = null;
    }
  }

  private async mountStudio(): Promise<void> {
    const context = this.context;
    const mountElement = this.mountElement;
    const status = this.statusElement;
    if (!context || !mountElement || !status) return;
    const generation = ++this.mountGeneration;
    this.options.onAgentUnmounted?.();
    this.handle?.destroy();
    this.handle = null;
    mountElement.replaceChildren();
    status.replaceChildren();
    status.className = 'ck-crowdy-studio-embed-status is-loading';
    const spinner = document.createElement('span');
    spinner.className = 'ck-crowdy-studio-embed-spinner';
    spinner.setAttribute('aria-hidden', 'true');
    const loading = document.createElement('span');
    loading.textContent = 'Opening your projects…';
    status.append(spinner, loading);

    try {
      // Fresh bearer before project list / agent create — Retry alone used to
      // remount with the same expired app token (~30m TTL).
      await this.refreshGameplayTokenBestEffort();
      if (generation !== this.mountGeneration || this.root === null) return;
      const handle = await this.mountSdkStudio(mountElement, context);
      if (generation !== this.mountGeneration || this.root === null) {
        handle.destroy();
        return;
      }
      this.handle = handle;
      this.options.onAgentMounted?.(handle);
      status.className = 'ck-crowdy-studio-embed-status hidden';
      status.replaceChildren();
      this.root.dataset.crowdyStudioApi = handle.api;
    } catch (error) {
      if (generation !== this.mountGeneration || this.root === null) return;
      if (
        isUnauthenticatedError(error) &&
        this.studioAuthRemounts < 1
      ) {
        this.studioAuthRemounts += 1;
        const refreshed = await this.refreshGameplayTokenBestEffort();
        if (
          refreshed &&
          generation === this.mountGeneration &&
          this.root !== null
        ) {
          void this.mountStudio();
          return;
        }
      }
      this.options.onAgentUnavailable?.(errorMessage(error));
      status.className = 'ck-crowdy-studio-embed-status is-error';
      status.replaceChildren();
      const title = document.createElement('strong');
      title.textContent = 'Crowdy Studio could not open';
      const message = document.createElement('span');
      message.textContent = isUnauthenticatedError(error)
        ? `${errorMessage(error)}. Reload this tab or re-enter from ` +
          'Overworld for a fresh gameplay token. Your grid access is ' +
          'unchanged and no project data was removed.'
        : `${errorMessage(error)}. Your grid access is unchanged and no ` +
          'project data was removed.';
      const retry = document.createElement('button');
      retry.type = 'button';
      retry.className = 'ck-crowdy-studio-embed-retry';
      retry.textContent = 'Retry';
      retry.addEventListener('click', () => {
        // Allow one more refresh cycle on explicit Retry.
        this.studioAuthRemounts = 0;
        void this.mountStudio();
      });
      status.append(title, message, retry);
    }
  }

  /**
   * Best-effort UDP-safe token rotation. Returns true when a refresher ran
   * without throwing; false when omitted or when refresh itself failed.
   */
  private async refreshGameplayTokenBestEffort(): Promise<boolean> {
    const refresh = this.options.client.refreshGameplayToken;
    if (!refresh) return false;
    try {
      await refresh();
      return true;
    } catch {
      return false;
    }
  }

  /** Assemble mount options from the game client + per-open context. */
  private async mountSdkStudio(
    element: HTMLElement,
    context: CrowdyStudioEmbedContext,
  ): Promise<CrowdyStudioEmbedHandle> {
    const { client } = this.options;
    const appId = this.currentAppId();
    element.className += ' ck-crowdy-studio-embed-sdk-host';
    const hud = context.hud;
    const onPresentation =
      context.onPresentation ??
      (hud
        ? (presentation: PlayerCodePresentation): void => {
            if (presentation.channel !== 'hud') return;
            hud.set({
              source: this.presentationSource(context.gridId),
              label: 'Crowdy Studio preview',
              payload: presentation.payload,
            });
          }
        : undefined);
    const handle = await mountCrowdyStudio(element, {
      projectProvider: client.crowdyStudio,
      playerCompute: client.playerCompute,
      playerWallet: client.playerWallet,
      appId,
      gridId: context.gridId,
      grid: context.grid,
      workerUrl: context.workerUrl,
      targetPermissions: context.targetPermissions,
      onHostCall: context.onHostCall,
      onPresentation,
      ...(client.crowdyStudioAgent && context.playerHost
        ? {
            agent: {
              transport: client.crowdyStudioAgent,
              clientInstanceId: this.embedClientInstanceId,
              createSession: {
                appId,
                gridId: context.gridId,
                mode: this.options.agentSession?.mode ?? 'ASK',
                providerDataConsent:
                  this.options.agentSession?.providerDataConsent ?? false,
                idempotencyKey: this.agentIdempotencyKey(),
              },
              playerHost: context.playerHost,
              controlGate: this.options.controlGate,
              onLocalPreempt: this.options.onLocalPreempt,
            },
          }
        : {}),
      ...this.options.runtimeOverrides,
    });
    element.dataset.crowdyStudioApi = 'project-first';
    let destroyed = false;
    return {
      api: 'crowdy-studio',
      controller: handle.controller,
      agent: handle.agent,
      controlLeaseManager: handle.controlLeaseManager,
      destroy: () => {
        if (destroyed) return;
        destroyed = true;
        handle.destroy();
      },
    };
  }

  private currentAppId(): string {
    const { appId } = this.options;
    return typeof appId === 'function' ? appId() : appId;
  }

  private agentIdempotencyKey(): string {
    const prefix =
      this.options.agentSession?.idempotencyKeyPrefix ?? 'ck-agent-session:';
    const random =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    return `${prefix}${random}`;
  }

  private presentationSource(gridId: string): string {
    return `crowdy-studio:${gridId}`;
  }

  private accessibleDescription(gridId: string): string {
    const game = this.options.gameName ?? 'This game';
    return (
      `${game} live coding studio for grid ${gridId}. ` +
      'Edits autosave; Test draft or Deploy live applies them. ' +
      `${this.shortcutHint()}`
    );
  }

  private shortcutHint(): string {
    const key = this.closeKeyLabel();
    return key
      ? `Escape closes. ${key} closes from chrome; ${key} still types in editors.`
      : 'Escape closes.';
  }

  private closeKeyLabel(): string | null {
    const code = this.closeKeyCode();
    if (!code) return null;
    return code.startsWith('Key') ? code.slice(3) : code;
  }

  private closeKeyCode(): string | null {
    return this.options.closeKeyCode === undefined
      ? 'KeyM'
      : this.options.closeKeyCode;
  }

  private readonly viewportResize = (): void => {
    this.updateDisplayMode();
  };

  private updateDisplayMode(): void {
    if (!this.root) return;
    const next: CrowdyStudioEmbedDisplayMode =
      window.innerWidth < CROWDY_STUDIO_EMBED_NARROW_BREAKPOINT_PX
        ? 'fullscreen'
        : 'docked';
    if (next === this.displayMode) {
      if (next === 'docked') this.dock.refresh();
      return;
    }

    const previous = this.displayMode;
    this.displayMode = next;
    this.root.dataset.mode = next;
    this.root.className = `ck-crowdy-studio-embed ${
      next === 'docked' ? 'is-docked' : 'is-fullscreen'
    }`;

    if (next === 'fullscreen') {
      this.dock.deactivate();
      removeBodyClass('ck-crowdy-studio-embed-docked');
      addBodyClass('ck-crowdy-studio-embed-fullscreen');
      this.clearDockWidth();
      this.root.setAttribute('role', 'dialog');
      this.root.setAttribute('aria-modal', 'true');
      this.enterModalMode();
      this.options.onLayoutChange?.();
      return;
    }

    this.leaveModalMode();
    removeBodyClass('ck-crowdy-studio-embed-fullscreen');
    addBodyClass('ck-crowdy-studio-embed-docked');
    this.root.setAttribute('role', 'complementary');
    this.root.removeAttribute('aria-modal');
    if (previous === null && document.pointerLockElement) {
      void document.exitPointerLock();
    }
    this.dock.activate();
  }

  private enterModalMode(): void {
    if (!this.root || !this.context || this.restoreGameplayInput) return;
    this.restoreGameplayInput =
      this.options.suppressGameplayInput?.() ?? (() => {});
    if (document.pointerLockElement) void document.exitPointerLock();
    document.addEventListener('keydown', this.documentKeyDown);
    document.addEventListener('keydown', this.captureEscape, true);
    document.addEventListener('keyup', this.documentKeyUp);
    document.addEventListener('focusin', this.keepFocusInside);
    if (!this.root.contains(document.activeElement)) {
      this.root
        .querySelector<HTMLButtonElement>('.ck-crowdy-studio-embed-close')
        ?.focus();
    }
  }

  private leaveModalMode(): void {
    document.removeEventListener('keydown', this.documentKeyDown);
    document.removeEventListener('keydown', this.captureEscape, true);
    document.removeEventListener('keyup', this.documentKeyUp);
    document.removeEventListener('focusin', this.keepFocusInside);
    this.restoreGameplayInput?.();
    this.restoreGameplayInput = null;
  }

  private applyDockWidth(width: number): void {
    if (!this.root || this.displayMode !== 'docked') return;
    document.body.style.setProperty(
      '--ck-crowdy-studio-embed-dock-width',
      `${width}px`,
    );
    document.body.style.setProperty('--ck-game-right-inset', `${width}px`);
    this.options.onLayoutChange?.();
  }

  private clearDockWidth(): void {
    document.body.style.removeProperty('--ck-crowdy-studio-embed-dock-width');
    document.body.style.removeProperty('--ck-game-right-inset');
  }

  private readonly keyDown = (event: KeyboardEvent): void => {
    this.handleDialogKey(event);
  };

  private readonly documentKeyDown = (event: KeyboardEvent): void => {
    if (!this.root || this.root.contains(event.target as Node | null)) return;
    this.handleDialogKey(event);
  };

  private readonly captureEscape = (event: KeyboardEvent): void => {
    if (!this.root || !this.modal || event.code !== 'Escape' || event.repeat) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    this.close();
  };

  private handleDialogKey(event: KeyboardEvent): void {
    if (!this.root) return;
    if (event.code === 'Escape' && !event.repeat) {
      event.preventDefault();
      event.stopPropagation();
      this.close();
      return;
    }
    const closeKey = this.closeKeyCode();
    if (
      closeKey !== null &&
      event.code === closeKey &&
      !event.repeat &&
      !event.altKey &&
      !event.ctrlKey &&
      !event.metaKey &&
      !isTextEntryTarget(event.target)
    ) {
      event.preventDefault();
      event.stopPropagation();
      this.close();
      return;
    }
    if (event.code === 'Tab' && this.modal) this.trapTab(event);
    event.stopPropagation();
  }

  private trapTab(event: KeyboardEvent): void {
    if (!this.root) return;
    const focusable = focusableElements(this.root);
    if (focusable.length === 0) {
      event.preventDefault();
      this.root.focus();
      return;
    }
    const active = document.activeElement;
    const index = focusable.indexOf(active as HTMLElement);
    if (event.shiftKey && index <= 0) {
      event.preventDefault();
      focusable.at(-1)?.focus();
    } else if (
      !event.shiftKey &&
      (index < 0 || index === focusable.length - 1)
    ) {
      event.preventDefault();
      focusable[0]?.focus();
    }
  }

  private readonly stopKeyboardEvent = (event: KeyboardEvent): void => {
    event.stopPropagation();
  };

  private readonly documentKeyUp = (event: KeyboardEvent): void => {
    if (this.root && !this.root.contains(event.target as Node | null)) {
      event.stopPropagation();
    }
  };

  private readonly keepFocusInside = (event: FocusEvent): void => {
    if (!this.root || this.root.contains(event.target as Node | null)) return;
    const first = focusableElements(this.root)[0];
    if (first) first.focus();
    else this.root.focus();
  };
}

/** Convenience factory mirroring the class constructor. */
export function createCrowdyStudioEmbed(
  options: CrowdyStudioEmbedOptions,
): CrowdyStudioEmbed {
  return new CrowdyStudioEmbed(options);
}

function contextPill(label: string, value: string): HTMLElement {
  const pill = document.createElement('span');
  pill.className = 'ck-crowdy-studio-embed-context-pill';
  const key = document.createElement('small');
  key.textContent = label;
  const text = document.createElement('strong');
  text.textContent = value;
  pill.append(key, text);
  return pill;
}

function appendDefinition(
  list: HTMLElement,
  label: string,
  value: string,
): void {
  const term = document.createElement('dt');
  term.textContent = label;
  const description = document.createElement('dd');
  description.textContent = value;
  list.append(term, description);
}

function permissionCard(
  target: 'SERVER' | 'CLIENT',
  permissions: CrowdyStudioEmbedTargetPermission,
): HTMLElement {
  const card = document.createElement('section');
  card.className =
    !permissions.canWrite && !permissions.canRun
      ? 'ck-crowdy-studio-embed-permission is-disabled'
      : 'ck-crowdy-studio-embed-permission';
  const title = document.createElement('strong');
  title.textContent = target;
  const write = permissionBadge('Write', permissions.canWrite);
  const run = permissionBadge('Run', permissions.canRun);
  card.append(title, write, run);
  return card;
}

function permissionBadge(label: string, allowed: boolean): HTMLElement {
  const badge = document.createElement('span');
  badge.className = allowed ? 'is-allowed' : 'is-denied';
  badge.textContent = `${label} ${allowed ? 'allowed' : 'unavailable'}`;
  return badge;
}

function permissionSummary(
  permissions: CrowdyStudioEmbedTargetPermissions,
): string {
  const target = (
    label: 'SERVER' | 'CLIENT',
    value: CrowdyStudioEmbedTargetPermission,
  ): string => {
    const capabilities = [
      value.canWrite ? 'write' : '',
      value.canRun ? 'run' : '',
    ].filter(Boolean);
    return `${label} ${capabilities.join('/') || 'unavailable'}`;
  };
  return [
    target('SERVER', permissions.SERVER),
    target('CLIENT', permissions.CLIENT),
  ].join(' · ');
}

function formatChunk(chunk: { x: bigint; y: bigint; z: bigint }): string {
  return `${chunk.x}, ${chunk.y}, ${chunk.z}`;
}

function focusableElements(root: HTMLElement): HTMLElement[] {
  return Array.from(
    root.querySelectorAll<HTMLElement>(
      'button:not([disabled]), a[href], input:not([disabled]), ' +
        'select:not([disabled]), textarea:not([disabled]), ' +
        '[contenteditable="true"], [tabindex]:not([tabindex="-1"])',
    ),
  ).filter(
    (element) =>
      !element.hidden &&
      element.getAttribute('aria-hidden') !== 'true' &&
      element.closest('.hidden') === null,
  );
}

function isTextEntryTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    (target instanceof HTMLElement && target.isContentEditable) ||
    target.closest(
      '[contenteditable="true"], [role="textbox"], .monaco-editor, ' +
        '.ck-crowdy-studio-editor',
    ) !== null
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** True when Game API rejected the app-scoped gameplay bearer. */
function isUnauthenticatedError(error: unknown): boolean {
  if (error instanceof CrowdyGraphQLError && error.code === 'UNAUTHENTICATED') {
    return true;
  }
  const message = errorMessage(error).toLowerCase();
  return (
    message.includes('token is invalid or expired') ||
    message.includes('unauthenticated')
  );
}

function createEmbedClientInstanceId(): string {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `embed-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function stopEventPropagation(event: Event): void {
  event.stopPropagation();
}
