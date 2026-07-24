import type {
  CrowdyAgentLeaseV1,
  CrowdyAgentPreemptionReason,
} from '../crowdy-agent/types.js';
import type { AgentControlLeaseManager } from './lease-manager.js';

/**
 * The slice of the studio agent controller the gate needs to observe and
 * revoke leases. `CrowdyStudioAgentController` satisfies this structurally.
 */
export interface PlayerControlGateAgentControl {
  getState(): {
    readonly leases: readonly CrowdyAgentLeaseV1[];
  };
  revokeLease(
    leaseId: string,
    reason?: CrowdyAgentPreemptionReason,
  ): Promise<void>;
  pause(): Promise<void>;
  stop(): Promise<void>;
}

export interface PlayerControlGateSnapshot {
  readonly bound: boolean;
  readonly activeLease: CrowdyAgentLeaseV1 | null;
  readonly lastPreemption?: CrowdyAgentPreemptionReason;
  readonly humanInputActive: boolean;
  readonly offlineStop: boolean;
}

export interface PlayerControlGateOptions {
  readonly window?: Window;
  readonly document?: Document;
  readonly now?: () => number;
  readonly humanInputActiveMs?: number;
  readonly onPreempt?: (reason: CrowdyAgentPreemptionReason) => void;
}

/**
 * The game's synchronous takeover seam around CrowdyJS's lease manager.
 * Capture listeners revoke before the game's own gameplay listeners run, but
 * never cancel or synthesize the human event. Offline Stop stays effective
 * with no GraphQL connection.
 */
export class PlayerControlGate {
  private readonly windowValue: Window | null;
  private readonly documentValue: Document | null;
  private readonly now: () => number;
  private readonly listeners = new Set<
    (snapshot: PlayerControlGateSnapshot) => void
  >();
  private leaseManager: AgentControlLeaseManager | null = null;
  private controller: PlayerControlGateAgentControl | null = null;
  private readonly locallyRevokedLeaseIds = new Set<string>();
  private started = false;
  private lastHumanInputAt = Number.NEGATIVE_INFINITY;
  private lastPreemption?: CrowdyAgentPreemptionReason;
  private offlineStop = false;

  constructor(
    private readonly clearAgentIntent: (
      reason: CrowdyAgentPreemptionReason,
    ) => void,
    private readonly options: PlayerControlGateOptions = {},
  ) {
    this.windowValue =
      options.window ?? (typeof window === 'undefined' ? null : window);
    this.documentValue =
      options.document ?? (typeof document === 'undefined' ? null : document);
    this.now = options.now ?? Date.now;
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    const win = this.windowValue;
    const doc = this.documentValue;
    win?.addEventListener('keydown', this.keyboardInput, true);
    win?.addEventListener('mousedown', this.pointerInput, true);
    win?.addEventListener('pointerdown', this.pointerInput, true);
    win?.addEventListener('mousemove', this.mouseMove, true);
    win?.addEventListener('wheel', this.pointerInput, true);
    win?.addEventListener('touchstart', this.pointerInput, true);
    win?.addEventListener('pagehide', this.pageHide, true);
    win?.addEventListener('offline', this.offline, true);
    doc?.addEventListener('visibilitychange', this.visibilityChange, true);
  }

  destroy(): void {
    if (this.started) {
      this.started = false;
      const win = this.windowValue;
      const doc = this.documentValue;
      win?.removeEventListener('keydown', this.keyboardInput, true);
      win?.removeEventListener('mousedown', this.pointerInput, true);
      win?.removeEventListener('pointerdown', this.pointerInput, true);
      win?.removeEventListener('mousemove', this.mouseMove, true);
      win?.removeEventListener('wheel', this.pointerInput, true);
      win?.removeEventListener('touchstart', this.pointerInput, true);
      win?.removeEventListener('pagehide', this.pageHide, true);
      win?.removeEventListener('offline', this.offline, true);
      doc?.removeEventListener('visibilitychange', this.visibilityChange, true);
    }
    this.preempt('DISCONNECTED', false);
    this.unbind();
    this.listeners.clear();
  }

  bind(
    leaseManager: AgentControlLeaseManager,
    controller: PlayerControlGateAgentControl,
  ): () => void {
    if (
      this.leaseManager &&
      (this.leaseManager !== leaseManager || this.controller !== controller)
    ) {
      this.preempt('CLIENT_REATTACHED', false);
    }
    this.leaseManager = leaseManager;
    this.controller = controller;
    this.offlineStop = false;
    this.emit();
    return () => {
      if (
        this.leaseManager === leaseManager &&
        this.controller === controller
      ) {
        this.preempt('DISCONNECTED', false);
        this.unbind();
      }
    };
  }

  subscribe(
    listener: (snapshot: PlayerControlGateSnapshot) => void,
  ): () => void {
    this.listeners.add(listener);
    listener(this.snapshot());
    return () => this.listeners.delete(listener);
  }

  snapshot(): PlayerControlGateSnapshot {
    return {
      bound: Boolean(this.leaseManager && this.controller),
      activeLease: this.activeLease(),
      ...(this.lastPreemption ? { lastPreemption: this.lastPreemption } : {}),
      humanInputActive: this.humanInputActive(),
      offlineStop: this.offlineStop,
    };
  }

  humanInputActive(): boolean {
    return (
      this.now() - this.lastHumanInputAt <
      (this.options.humanInputActiveMs ?? 150)
    );
  }

  preempt(reason: CrowdyAgentPreemptionReason, notifyServer = true): void {
    const lease = this.activeLease();
    if (lease) this.locallyRevokedLeaseIds.add(lease.leaseId);
    try {
      if (this.leaseManager) this.leaseManager.preempt(reason);
      else this.clearAgentIntent(reason);
    } catch {
      // CrowdyJS still clears the lease in its own finally block. A host
      // cleanup bug must not interrupt the human event or offline Stop.
    } finally {
      this.lastPreemption = reason;
      this.options.onPreempt?.(reason);
      this.emit();
    }
    if (notifyServer && lease && this.controller) {
      void this.controller
        .revokeLease(lease.leaseId, reason)
        .catch(() => undefined);
    }
  }

  /** Immediate local Pause; remote persistence is best effort. */
  pause(): void {
    this.preempt('HUMAN_STOP', false);
    void this.controller?.pause().catch(() => undefined);
  }

  /** Immediate local Stop remains effective with no GraphQL connection. */
  stop(): void {
    this.offlineStop = true;
    this.preempt('HUMAN_STOP', false);
    void this.controller?.stop().catch(() => undefined);
    this.emit();
  }

  death(): void {
    this.preempt('DEATH');
  }

  contextChanged(): void {
    this.preempt('CONTEXT_CHANGED');
  }

  permissionChanged(): void {
    this.preempt('PERMISSION_CHANGED');
  }

  controlTargetChanged(): void {
    this.preempt('CONTROL_TARGET_CHANGED');
  }

  disconnected(): void {
    this.preempt('DISCONNECTED', false);
  }

  private activeLease(): CrowdyAgentLeaseV1 | null {
    const local = this.leaseManager?.snapshot().lease;
    if (
      local?.status === 'ACTIVE' &&
      !this.locallyRevokedLeaseIds.has(local.leaseId)
    ) {
      return local;
    }
    return (
      this.controller
        ?.getState()
        .leases.find(
          (lease) =>
            lease.kind === 'PLAY' &&
            lease.status === 'ACTIVE' &&
            !this.locallyRevokedLeaseIds.has(lease.leaseId),
        ) ?? null
    );
  }

  private unbind(): void {
    this.leaseManager = null;
    this.controller = null;
    this.locallyRevokedLeaseIds.clear();
    this.emit();
  }

  private takeHumanInput(reason: CrowdyAgentPreemptionReason): void {
    this.lastHumanInputAt = this.now();
    if (this.activeLease()) this.preempt(reason);
    else this.emit();
  }

  private readonly keyboardInput = (event: KeyboardEvent): void => {
    this.takeHumanInput(event.code === 'Escape' ? 'ESCAPE' : 'HUMAN_INPUT');
  };

  private readonly pointerInput = (): void => {
    this.takeHumanInput('HUMAN_INPUT');
  };

  private readonly mouseMove = (event: MouseEvent): void => {
    if (event.movementX !== 0 || event.movementY !== 0 || event.buttons !== 0) {
      this.takeHumanInput('HUMAN_INPUT');
    }
  };

  private readonly pageHide = (): void => {
    this.disconnected();
  };

  private readonly offline = (): void => {
    this.disconnected();
  };

  private readonly visibilityChange = (): void => {
    if (this.documentValue?.visibilityState === 'hidden') this.disconnected();
  };

  private emit(): void {
    const snapshot = this.snapshot();
    for (const listener of [...this.listeners]) listener(snapshot);
  }
}
