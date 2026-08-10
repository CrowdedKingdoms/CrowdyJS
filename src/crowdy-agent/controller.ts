import {
  CrowdyAgentError,
  toAgentError,
  type AgentErrorV1,
} from './errors.js';
import type { CrowdyAgentBrowserToolDispatcher } from './browser-dispatcher.js';
import { isDecimalString } from './schema.js';
import type {
  CrowdyAgentApprovalV1,
  CrowdyAgentBudgetV1,
  CrowdyAgentCheckpointV1,
  CrowdyAgentEventV1,
  CrowdyAgentLeaseV1,
  CrowdyAgentMessageV1,
  CrowdyAgentMode,
  CrowdyAgentPreemptionReason,
  CrowdyAgentRegisteredToolV1,
  CrowdyAgentSessionV1,
  CrowdyAgentToolTimelineItemV1,
} from './types.js';
import { CROWDY_AGENT_EVENT_TYPES } from './types.js';
import type {
  CrowdyAgentCreateSessionInputV1,
  CrowdyAgentEventSubscriptionV1,
  CrowdyStudioAgentTransportV1,
} from './transport.js';

export type CrowdyStudioAgentConnectionState =
  | 'DISCONNECTED'
  | 'ATTACHING'
  | 'REPLAYING'
  | 'CONNECTED'
  | 'RECONNECTING'
  | 'ERROR';

export interface CrowdyStudioAgentStateV1 {
  readonly connection: CrowdyStudioAgentConnectionState;
  readonly session: CrowdyAgentSessionV1 | null;
  readonly clientEpoch: string | null;
  readonly lastContiguousSeq: string;
  readonly lastAcknowledgedSeq: string;
  readonly events: readonly CrowdyAgentEventV1[];
  readonly messages: readonly CrowdyAgentMessageV1[];
  readonly streamingText: string;
  readonly tools: readonly CrowdyAgentToolTimelineItemV1[];
  readonly approvals: readonly CrowdyAgentApprovalV1[];
  readonly leases: readonly CrowdyAgentLeaseV1[];
  readonly checkpoints: readonly CrowdyAgentCheckpointV1[];
  readonly budget: CrowdyAgentBudgetV1 | null;
  readonly toolDescriptors: readonly CrowdyAgentRegisteredToolV1[];
  readonly lastHeartbeatAt: string | null;
  readonly playLeaseFreshUntil: string | null;
  readonly lastError: AgentErrorV1 | null;
  readonly reconnectRequired: boolean;
}

export interface CrowdyStudioAgentControllerOptionsV1 {
  readonly transport: CrowdyStudioAgentTransportV1;
  readonly sessionId?: string;
  readonly createSession?:
    | CrowdyAgentCreateSessionInputV1
    | (() =>
        | CrowdyAgentCreateSessionInputV1
        | Promise<CrowdyAgentCreateSessionInputV1>);
  /** Resolve the currently selected, fully saved Studio project at attach time. */
  readonly resolveProjectBinding?: () =>
    | { readonly projectId?: string; readonly gridId?: string }
    | Promise<{ readonly projectId?: string; readonly gridId?: string }>;
  readonly browserDispatcher?: CrowdyAgentBrowserToolDispatcher;
  /** Stable browser UUID reused across fresh attach epochs. */
  readonly clientInstanceId?: string;
  /** Flush autosave and validate conflicts before accepting a human turn. */
  readonly beforeAgentWork?: (mode: CrowdyAgentMode) => void | Promise<void>;
  /** Called synchronously for local preemption before transport cleanup. */
  readonly onPreempt?: (reason: CrowdyAgentPreemptionReason) => void;
  readonly onEpochAttached?: (clientEpoch: string) => void;
  readonly onLeaseChanged?: (lease: CrowdyAgentLeaseV1) => void;
  readonly createIdempotencyKey?: (operation: string) => string;
  readonly historyPageSize?: number;
  readonly maxRetainedEvents?: number;
  readonly autoReconnect?: boolean;
  readonly reconnectDelayMs?: number;
  readonly maxReconnectAttempts?: number;
  readonly heartbeatIntervalMs?: number;
  readonly heartbeatStaleMs?: number;
  readonly workspaceRenewIntervalMs?: number;
  readonly onStateChange?: (state: CrowdyStudioAgentStateV1) => void;
}

/**
 * Durable session client for the `crowdy.studio-agent/1` protocol. The
 * transport is injectable and contains no generated GraphQL dependency.
 */
export class CrowdyStudioAgentController {
  private state: CrowdyStudioAgentStateV1 = {
    connection: 'DISCONNECTED',
    session: null,
    clientEpoch: null,
    lastContiguousSeq: '0',
    lastAcknowledgedSeq: '0',
    events: [],
    messages: [],
    streamingText: '',
    tools: [],
    approvals: [],
    leases: [],
    checkpoints: [],
    budget: null,
    toolDescriptors: [],
    lastHeartbeatAt: null,
    playLeaseFreshUntil: null,
    lastError: null,
    reconnectRequired: false,
  };
  private readonly listeners = new Set<
    (state: CrowdyStudioAgentStateV1) => void
  >();
  private readonly buffered = new Map<string, CrowdyAgentEventV1>();
  private readonly appliedEventIds = new Map<string, string>();
  private subscription: CrowdyAgentEventSubscriptionV1 | null = null;
  private generation = 0;
  private drainPromise: Promise<void> | null = null;
  private acknowledgePromise: Promise<void> = Promise.resolve();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setTimeout> | null = null;
  private workspaceRenewTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private keySequence = 0;
  private readonly clientInstanceId: string;
  private pageVisible = true;
  private destroyed = false;
  private initializePromise: Promise<void> | null = null;
  private attachTail: Promise<unknown> = Promise.resolve();

  constructor(private readonly options: CrowdyStudioAgentControllerOptionsV1) {
    if (!options.sessionId && !options.createSession) {
      throw new CrowdyAgentError(
        'AGENT_SESSION_NOT_FOUND',
        'Provide sessionId or createSession to initialize the agent client',
      );
    }
    this.clientInstanceId =
      options.clientInstanceId ?? createClientInstanceId();
    if (options.onStateChange) this.listeners.add(options.onStateChange);
  }

  getState(): CrowdyStudioAgentStateV1 {
    return this.state;
  }

  subscribe(
    listener: (state: CrowdyStudioAgentStateV1) => void,
  ): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  setPageVisible(visible: boolean): void {
    if (this.pageVisible === visible) return;
    this.pageVisible = visible;
    if (
      !visible &&
      this.state.connection === 'CONNECTED' &&
      this.state.session?.mode === 'PLAY'
    ) {
      this.preemptLocal('DISCONNECTED');
      this.update({ leases: [], playLeaseFreshUntil: null });
    }
    this.refreshHeartbeat(visible);
  }

  async initialize(): Promise<void> {
    this.ensureAlive();
    if (
      this.state.connection === 'CONNECTED' &&
      this.subscription &&
      this.state.session
    ) {
      return;
    }
    if (this.initializePromise) return this.initializePromise;
    this.initializePromise = this.runInitialize().finally(() => {
      this.initializePromise = null;
    });
    return this.initializePromise;
  }

  private async runInitialize(): Promise<void> {
    try {
      const binding = await this.options.resolveProjectBinding?.();
      let session: CrowdyAgentSessionV1;
      if (this.options.sessionId) {
        session = await this.options.transport.getSession(this.options.sessionId);
        this.assertProjectBinding(
          session,
          binding?.projectId,
          Boolean(this.options.resolveProjectBinding),
        );
      } else {
        const configured =
          typeof this.options.createSession === 'function'
            ? await this.options.createSession()
            : this.options.createSession!;
        const createInput: CrowdyAgentCreateSessionInputV1 = {
          ...configured,
          ...(this.options.resolveProjectBinding
            ? binding?.projectId
              ? { projectId: binding.projectId }
              : { projectId: undefined }
            : {}),
          ...(binding?.gridId ? { gridId: binding.gridId } : {}),
        };
        if (createInput.mode === 'BUILD' && !createInput.projectId) {
          throw new CrowdyAgentError(
            'AGENT_CONTEXT_CHANGED',
            'BUILD requires the currently selected saved Crowdy Studio project',
          );
        }
        session = await this.createSessionOrReuse(createInput);
        this.assertProjectBinding(
          session,
          binding?.projectId,
          Boolean(this.options.resolveProjectBinding),
        );
      }
      this.update({ session, lastError: null });
      await this.attach('ATTACHING');
    } catch (error) {
      // Surface AGENT_PERMISSION_DENIED / AGENT_OPERATOR_KILLED / etc. in the
      // dock status instead of a bare DISCONNECTED with no lastError.
      this.fail(error);
      throw error;
    }
  }

  private async createSessionOrReuse(
    createInput: CrowdyAgentCreateSessionInputV1,
  ): Promise<CrowdyAgentSessionV1> {
    try {
      return await this.options.transport.createSession(createInput);
    } catch (error) {
      const reused = await this.reuseActiveSessionAfterRateLimit(
        createInput,
        error,
      );
      if (reused) return reused;
      throw error;
    }
  }

  /**
   * When createSession hits the per-player active-session cap, reuse a matching
   * orphan instead of failing closed. Skip PAUSED sessions that already carry a
   * clientEpoch — re-attaching those fences the old epoch (EPOCH_STALE).
   */
  private async reuseActiveSessionAfterRateLimit(
    createInput: CrowdyAgentCreateSessionInputV1,
    error: unknown,
  ): Promise<CrowdyAgentSessionV1 | null> {
    const agentError = toAgentError(error);
    if (agentError.code !== 'AGENT_RATE_LIMITED') return null;
    const page = await this.options.transport.listSessions({
      appId: createInput.appId,
      first: 50,
    });
    const candidates = page.nodes.filter((session) => {
      if (session.status === 'CLOSED') return false;
      if (session.status === 'PAUSED' && session.clientEpoch) return false;
      if (session.status !== 'ACTIVE' && session.status !== 'PAUSED') {
        return false;
      }
      if (createInput.projectId) {
        return session.projectId === createInput.projectId;
      }
      return !session.projectId;
    });
    candidates.sort((left, right) => {
      if (left.status !== right.status) {
        return left.status === 'ACTIVE' ? -1 : 1;
      }
      if (left.mode === createInput.mode && right.mode !== createInput.mode) {
        return -1;
      }
      if (right.mode === createInput.mode && left.mode !== createInput.mode) {
        return 1;
      }
      return right.updatedAt.localeCompare(left.updatedAt);
    });
    return candidates[0] ?? null;
  }

  /**
   * Fail closed when the human selects another project. The v1 Game API has no
   * set-project mutation, so callers must create/remount a session for it.
   */
  projectSelectionChanged(projectId: string | undefined): void {
    const session = this.state.session;
    if (!session || session.projectId === projectId) return;
    const clientEpoch = this.state.clientEpoch;
    if (clientEpoch) {
      for (const lease of this.state.leases.filter(
        (entry) => entry.status === 'ACTIVE',
      )) {
        void this.options.transport
          .revokeLease({
            sessionId: session.sessionId,
            clientEpoch,
            leaseId: lease.leaseId,
            reason: 'CONTEXT_CHANGED',
            idempotencyKey: this.nextKey(
              `project-switch-revoke-${lease.leaseId}`,
            ),
          })
          .catch(() => {});
      }
      if (session.currentRun?.runId) {
        void this.options.transport
          .cancelRun({
            sessionId: session.sessionId,
            clientEpoch,
            runId: session.currentRun.runId,
            idempotencyKey: this.nextKey('project-switch-cancel'),
          })
          .catch(() => {});
      }
      void this.options.transport
        .pause({
          sessionId: session.sessionId,
          clientEpoch,
          idempotencyKey: this.nextKey('project-switch-pause'),
        })
        .catch(() => {});
    }
    this.preemptLocal('CONTEXT_CHANGED');
    this.stopHeartbeat();
    this.generation++;
    this.disconnectSubscription();
    const error = new CrowdyAgentError(
      'AGENT_CONTEXT_CHANGED',
      'Selected project changed; create a new agent session for this project',
    );
    this.update({
      connection: 'ERROR',
      clientEpoch: null,
      leases: [],
      approvals: [],
      reconnectRequired: true,
      lastError: error.toJSON(),
    });
  }

  async reconnect(): Promise<void> {
    this.ensureAlive();
    if (this.initializePromise) await this.initializePromise;
    if (!this.state.session) {
      await this.initialize();
      return;
    }
    await this.attach('RECONNECTING');
  }

  async sendMessage(content: string): Promise<{ runId: string }> {
    const normalized = content.trim();
    if (
      normalized.length < 1 ||
      new TextEncoder().encode(normalized).byteLength > 16_384
    ) {
      throw new CrowdyAgentError(
        'AGENT_TOOL_INPUT_INVALID',
        'Agent message must be 1 to 16384 UTF-8 bytes',
      );
    }
    const session = this.requireSession();
    await this.options.beforeAgentWork?.(session.mode);
    return this.options.transport.sendMessage({
      ...this.mutationContext('send-message'),
      message: normalized,
    });
  }

  async setMode(mode: CrowdyAgentMode): Promise<void> {
    if (!['ASK', 'BUILD', 'PLAY'].includes(mode)) {
      throw new CrowdyAgentError(
        'AGENT_TOOL_INPUT_INVALID',
        `Unknown agent mode ${String(mode)}`,
      );
    }
    if (mode === 'BUILD' && !this.requireSession().projectId) {
      throw new CrowdyAgentError(
        'AGENT_CONTEXT_CHANGED',
        'Create a project-bound agent session before selecting BUILD',
      );
    }
    this.preemptLocal('CONTEXT_CHANGED');
    const session = await this.options.transport.setMode({
      ...this.mutationContext('set-mode'),
      mode,
    });
    const context = await this.loadRemoteContext(session);
    this.update({
      session,
      ...context,
      leases: [],
      approvals: [],
      reconnectRequired: false,
    });
    this.refreshHeartbeat(true);
    this.refreshWorkspaceRenewal();
  }

  async approveTool(
    toolCallId: string,
    expectedArgumentHash?: string,
  ): Promise<void> {
    const approval = this.state.approvals.find(
      (entry) =>
        entry.toolCallId === toolCallId && entry.status === 'PENDING',
    );
    if (!approval) {
      throw new CrowdyAgentError(
        'AGENT_APPROVAL_MISMATCH',
        `No pending exact approval exists for ${toolCallId}`,
      );
    }
    if (
      expectedArgumentHash &&
      expectedArgumentHash !== approval.argumentHash
    ) {
      throw new CrowdyAgentError(
        'AGENT_APPROVAL_MISMATCH',
        'Displayed approval hash changed',
      );
    }
    if (Date.parse(approval.expiresAt) <= Date.now()) {
      throw new CrowdyAgentError(
        'AGENT_APPROVAL_EXPIRED',
        'Exact tool approval expired',
      );
    }
    await this.options.transport.approveTool({
      ...this.mutationContext('approve-tool'),
      toolCallId,
      argumentHash: approval.argumentHash,
    });
  }

  async rejectTool(toolCallId: string, reason?: string): Promise<void> {
    const approval = this.state.approvals.find(
      (entry) =>
        entry.toolCallId === toolCallId && entry.status === 'PENDING',
    );
    if (!approval) {
      throw new CrowdyAgentError(
        'AGENT_APPROVAL_MISMATCH',
        `No pending exact approval exists for ${toolCallId}`,
      );
    }
    await this.options.transport.rejectTool({
      ...this.mutationContext('reject-tool'),
      toolCallId,
      argumentHash: approval.argumentHash,
      ...(reason ? { reason: reason.slice(0, 512) } : {}),
    });
  }

  async grantPlayLease(input: {
    readonly scopes: readonly string[];
    readonly durationSeconds: number;
    readonly controlledEntityId: string;
    readonly hostCapabilityRevision: string;
  }): Promise<CrowdyAgentLeaseV1> {
    if (
      !Number.isInteger(input.durationSeconds) ||
      input.durationSeconds < 1 ||
      input.durationSeconds > 600
    ) {
      throw new CrowdyAgentError(
        'AGENT_LEASE_EXPIRED',
        'Play lease duration must be 1 to 600 seconds',
      );
    }
    if (input.scopes.length === 0 || input.scopes.length > 10) {
      throw new CrowdyAgentError(
        'AGENT_LEASE_SCOPE_MISSING',
        'Select 1 to 10 explicit Play scopes',
      );
    }
    const allowed = new Set([
      'observe',
      'locomotion',
      'interact',
      'craft',
      'combat',
      'communicate',
      'travel',
      'grid',
      'trust_consent',
      'commerce',
    ]);
    const invalid = input.scopes.find((scope) => !allowed.has(scope));
    if (invalid) {
      throw new CrowdyAgentError(
        'AGENT_LEASE_SCOPE_MISSING',
        `Unknown Play lease scope ${invalid}`,
      );
    }
    const lease = await this.options.transport.grantLease({
      ...this.mutationContext('grant-play-lease'),
      scopes: [...new Set(input.scopes)],
      durationSeconds: input.durationSeconds,
      controlledEntityId: input.controlledEntityId,
      hostCapabilityRevision: input.hostCapabilityRevision,
    });
    this.upsertLease(lease);
    this.options.onLeaseChanged?.(lease);
    return lease;
  }

  async revokeLease(
    leaseId: string,
    reason: CrowdyAgentPreemptionReason = 'HUMAN_STOP',
  ): Promise<void> {
    const lease = await this.options.transport.revokeLease({
      ...this.mutationContext('revoke-lease'),
      leaseId,
      reason,
    });
    this.upsertLease(lease);
    this.options.onLeaseChanged?.(lease);
  }

  async pause(): Promise<void> {
    this.preemptLocal('HUMAN_STOP');
    this.stopHeartbeat();
    this.stopWorkspaceRenewal();
    const session = await this.options.transport.pause(
      this.mutationContext('pause'),
    );
    this.update({ session, playLeaseFreshUntil: null });
  }

  async resume(): Promise<void> {
    const session = await this.options.transport.resume(
      this.mutationContext('resume'),
    );
    const context = await this.loadRemoteContext(session);
    this.update({
      session,
      ...context,
      reconnectRequired: false,
      // A Play lease is never restored by resume.
      leases:
        session.mode === 'PLAY'
          ? this.state.leases.filter((lease) => lease.kind !== 'PLAY')
          : this.state.leases,
    });
    this.refreshHeartbeat(true);
    this.refreshWorkspaceRenewal();
  }

  async cancelRun(runId = this.state.session?.currentRun?.runId): Promise<void> {
    if (!runId) {
      throw new CrowdyAgentError(
        'AGENT_RUN_NOT_ACTIVE',
        'No current run exists to cancel',
      );
    }
    await this.options.transport.cancelRun({
      ...this.mutationContext('cancel-run'),
      runId,
    });
  }

  /** Immediate human Stop: local preemption happens before transport calls. */
  async stop(): Promise<void> {
    this.preemptLocal('HUMAN_STOP');
    const activeLeases = this.state.leases.filter(
      (lease) => lease.status === 'ACTIVE',
    );
    await Promise.allSettled(
      activeLeases.map((lease) =>
        this.options.transport.revokeLease({
          ...this.mutationContext(`stop-revoke-${lease.leaseId}`),
          leaseId: lease.leaseId,
          reason: 'HUMAN_STOP',
        }),
      ),
    );
    await Promise.allSettled([
      this.cancelRun(),
      this.options.transport.pause(this.mutationContext('stop-pause')),
    ]);
  }

  /** Editor changes synchronously preempt Build before best-effort cleanup. */
  preemptForHumanEdit(): void {
    this.preemptLocal('HUMAN_EDIT');
    this.update({ reconnectRequired: true });
    const workspace = this.state.leases.find(
      (lease) => lease.kind === 'WORKSPACE' && lease.status === 'ACTIVE',
    );
    if (workspace) {
      void this.revokeLease(workspace.leaseId, 'HUMAN_EDIT').catch(() => {});
    }
    if (this.state.session?.currentRun) {
      void this.cancelRun().catch(() => {});
    }
  }

  async restoreCheckpoint(checkpointId: string): Promise<void> {
    const checkpoint = this.state.checkpoints.find(
      (entry) => entry.checkpointId === checkpointId,
    );
    if (!checkpoint) {
      throw new CrowdyAgentError(
        'AGENT_CHECKPOINT_NOT_FOUND',
        `Checkpoint ${checkpointId} is not loaded`,
      );
    }
    // This is user intent, not approval. The server/model must still propose
    // project.checkpoint.restore and issue an exact approval card.
    await this.sendMessage(
      `Request checkpoint restore for ${checkpoint.checkpointId} at project revision ${checkpoint.projectRevision} with content hash ${checkpoint.contentHash}. Do not execute without exact human approval.`,
    );
  }

  async close(): Promise<void> {
    this.preemptLocal('SESSION_CLOSED');
    this.stopHeartbeat();
    this.stopWorkspaceRenewal();
    const session = await this.options.transport.closeSession(
      this.mutationContext('close-session'),
    );
    this.generation++;
    this.disconnectSubscription();
    this.update({
      connection: 'DISCONNECTED',
      session,
      clientEpoch: null,
      leases: [],
      approvals: [],
    });
    this.options.browserDispatcher?.clearClosedSession();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.generation++;
    this.disconnectSubscription();
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.stopHeartbeat();
    this.stopWorkspaceRenewal();
    this.preemptLocal('DISCONNECTED');
    this.listeners.clear();
  }

  private async attach(
    connection: 'ATTACHING' | 'RECONNECTING',
  ): Promise<void> {
    const run = this.attachTail.then(() => this.runAttach(connection));
    this.attachTail = run.catch(() => undefined);
    await run;
  }

  private async runAttach(
    connection: 'ATTACHING' | 'RECONNECTING',
  ): Promise<void> {
    const session = this.requireSession();
    const generation = ++this.generation;
    this.stopHeartbeat();
    this.disconnectSubscription();
    if (connection === 'RECONNECTING') {
      this.preemptLocal('DISCONNECTED');
    }
    this.update({
      connection,
      lastError: null,
      reconnectRequired: connection === 'RECONNECTING',
    });
    try {
      const attached = await this.options.transport.attachClient({
        sessionId: session.sessionId,
        clientInstanceId: this.clientInstanceId,
        idempotencyKey: this.nextKey('attach-client'),
      });
      if (generation !== this.generation || this.destroyed) return;
      assertSequence(attached.clientEpoch, 'clientEpoch');
      assertSequence(attached.replayAfterSeq, 'replayAfterSeq');
      assertSequence(attached.session.lastEventSeq, 'lastEventSeq');
      if (
        attached.session.sessionId !== session.sessionId ||
        (attached.session.clientEpoch &&
          attached.session.clientEpoch !== attached.clientEpoch)
      ) {
        throw new CrowdyAgentError(
          'AGENT_CLIENT_EPOCH_STALE',
          'Attach response session or epoch is inconsistent',
        );
      }
      if (
        BigInt(attached.replayAfterSeq) > BigInt(attached.session.lastEventSeq)
      ) {
        throw new CrowdyAgentError(
          'AGENT_EVENT_CURSOR_INVALID',
          'Attach replay cursor exceeds committed session history',
        );
      }
      if (
        this.state.clientEpoch &&
        BigInt(attached.clientEpoch) <= BigInt(this.state.clientEpoch)
      ) {
        throw new CrowdyAgentError(
          'AGENT_CLIENT_EPOCH_STALE',
          'Server attach did not advance the client epoch',
        );
      }
      this.options.onEpochAttached?.(attached.clientEpoch);
      this.buffered.clear();
      const replayAfterSeq =
        BigInt(attached.replayAfterSeq) >
        BigInt(this.state.lastContiguousSeq)
          ? attached.replayAfterSeq
          : this.state.lastContiguousSeq;
      this.update({
        connection: 'REPLAYING',
        session: attached.session,
        clientEpoch: attached.clientEpoch,
        lastContiguousSeq: replayAfterSeq,
        lastAcknowledgedSeq:
          BigInt(replayAfterSeq) > BigInt(this.state.lastAcknowledgedSeq)
            ? replayAfterSeq
            : this.state.lastAcknowledgedSeq,
        leases: attached.session.activeLeases,
        approvals: attached.session.pendingApproval
          ? [attached.session.pendingApproval]
          : [],
      });
      for (const lease of attached.session.activeLeases) {
        this.options.onLeaseChanged?.(lease);
      }
      const context = await this.loadRemoteContext(attached.session);
      if (generation !== this.generation || this.destroyed) return;
      this.update(context);
      await this.replayHistory(generation);
      if (generation !== this.generation || this.destroyed) return;
      this.subscription = await this.options.transport.subscribeEvents(
        {
          sessionId: session.sessionId,
          afterSeq: this.state.lastContiguousSeq,
          clientEpoch: attached.clientEpoch,
        },
        {
          next: (event) => this.enqueueEvent(event, generation),
          error: (error) => this.handleDisconnect(error, generation),
          complete: () =>
            this.handleDisconnect(
              new CrowdyAgentError(
                'AGENT_DISCONNECTED',
                'Agent event stream closed',
                { retryable: true },
              ),
              generation,
            ),
        },
      );
      if (generation !== this.generation || this.destroyed) {
        this.subscription.close();
        this.subscription = null;
        return;
      }
      this.reconnectAttempts = 0;
      this.update({
        connection: 'CONNECTED',
        reconnectRequired: connection === 'RECONNECTING',
      });
      this.refreshHeartbeat(true);
      this.refreshWorkspaceRenewal();
    } catch (error) {
      if (generation !== this.generation || this.destroyed) return;
      this.stopHeartbeat();
      this.fail(error);
      throw error;
    }
  }

  private async replayHistory(generation: number): Promise<void> {
    let hasMore = true;
    while (hasMore && generation === this.generation && !this.destroyed) {
      const page = await this.options.transport.history({
        sessionId: this.requireSession().sessionId,
        afterSeq: this.state.lastContiguousSeq,
        first: this.options.historyPageSize ?? 100,
      });
      for (const event of page.events) this.bufferEvent(event);
      await this.drainBuffered(generation, true);
      hasMore = page.hasMore;
      if (page.hasMore && page.events.length === 0) {
        throw new CrowdyAgentError(
          'AGENT_EVENT_CURSOR_INVALID',
          'History page claimed more events without advancing the cursor',
        );
      }
    }
  }

  private enqueueEvent(event: CrowdyAgentEventV1, generation: number): void {
    if (generation !== this.generation || this.destroyed) return;
    try {
      this.bufferEvent(event);
    } catch (error) {
      this.fail(error);
      return;
    }
    this.startDrain(generation);
  }

  private startDrain(generation: number): void {
    if (this.drainPromise) return;
    this.drainPromise = this.drainBuffered(generation, true)
      .catch((error) => this.fail(error))
      .finally(() => {
        this.drainPromise = null;
        if (
          this.buffered.size > 0 &&
          generation === this.generation &&
          !this.destroyed
        ) {
          this.startDrain(generation);
        }
      });
  }

  private bufferEvent(event: CrowdyAgentEventV1): void {
    const session = this.requireSession();
    if (
      event === null ||
      typeof event !== 'object' ||
      event.protocolVersion !== 'crowdy.agent-event/1' ||
      !CROWDY_AGENT_EVENT_TYPES.includes(event.type) ||
      typeof event.eventId !== 'string' ||
      event.eventId.length < 1 ||
      event.eventId.length > 128
    ) {
      throw new CrowdyAgentError(
        'AGENT_EVENT_CURSOR_INVALID',
        'Event envelope or type is invalid',
      );
    }
    if (event.sessionId !== session.sessionId) {
      throw new CrowdyAgentError(
        'AGENT_EVENT_CURSOR_INVALID',
        'Event belongs to a different session',
      );
    }
    validateEventPayload(event);
    assertSequence(event.seq, 'event seq');
    const appliedId = this.appliedEventIds.get(event.seq);
    if (appliedId) {
      if (appliedId !== event.eventId) {
        throw new CrowdyAgentError(
          'AGENT_EVENT_CURSOR_INVALID',
          `Sequence ${event.seq} was reused by a different event`,
        );
      }
      return;
    }
    const buffered = this.buffered.get(event.seq);
    if (buffered && buffered.eventId !== event.eventId) {
      throw new CrowdyAgentError(
        'AGENT_EVENT_CURSOR_INVALID',
        `Buffered sequence ${event.seq} conflicts with another event`,
      );
    }
    if (BigInt(event.seq) <= BigInt(this.state.lastContiguousSeq)) return;
    this.buffered.set(event.seq, event);
  }

  private async drainBuffered(
    generation: number,
    recoverGaps: boolean,
  ): Promise<void> {
    let recoveredWithoutProgress = false;
    while (generation === this.generation && !this.destroyed) {
      const nextSeq = (BigInt(this.state.lastContiguousSeq) + 1n).toString();
      const next = this.buffered.get(nextSeq);
      if (next) {
        this.buffered.delete(nextSeq);
        this.applyEvent(next, generation);
        recoveredWithoutProgress = false;
        continue;
      }
      if (this.buffered.size === 0 || !recoverGaps) break;
      const firstBuffered = [...this.buffered.keys()].reduce((left, right) =>
        BigInt(left) < BigInt(right) ? left : right,
      );
      if (BigInt(firstBuffered) <= BigInt(this.state.lastContiguousSeq)) {
        this.buffered.delete(firstBuffered);
        continue;
      }
      const page = await this.options.transport.history({
        sessionId: this.requireSession().sessionId,
        afterSeq: this.state.lastContiguousSeq,
        first: this.options.historyPageSize ?? 100,
      });
      const before = this.buffered.size;
      for (const event of page.events) this.bufferEvent(event);
      if (
        page.events.length === 0 ||
        (this.buffered.size === before && recoveredWithoutProgress)
      ) {
        throw new CrowdyAgentError(
          'AGENT_EVENT_GAP',
          `Durable history could not fill missing sequence ${nextSeq}`,
          { retryable: true },
        );
      }
      recoveredWithoutProgress = this.buffered.size === before;
    }
    this.scheduleAcknowledge(generation);
  }

  private applyEvent(event: CrowdyAgentEventV1, generation: number): void {
    const maxEvents = this.options.maxRetainedEvents ?? 1_000;
    const events = [...this.state.events, event].slice(-maxEvents);
    let patch: Partial<CrowdyStudioAgentStateV1> = {
      events,
      lastContiguousSeq: event.seq,
    };
    switch (event.type) {
      case 'MODE_SELECTED':
        patch = {
          ...patch,
          session: this.patchSession({ mode: event.payload.mode }),
        };
        break;
      case 'SESSION_CREATED':
      case 'SESSION_PAUSED':
      case 'SESSION_RESUMED':
      case 'SESSION_CLOSED':
        patch = {
          ...patch,
          session: this.patchSession({
            ...(event.payload.status
              ? { status: event.payload.status }
              : event.type === 'SESSION_PAUSED'
                ? { status: 'PAUSED' }
                : event.type === 'SESSION_RESUMED'
                  ? { status: 'ACTIVE' }
                  : event.type === 'SESSION_CLOSED'
                    ? { status: 'CLOSED' }
                    : {}),
          }),
        };
        break;
      case 'CLIENT_ATTACHED':
      case 'CLIENT_DETACHED':
        break;
      case 'USER_MESSAGE':
      case 'ASSISTANT_MESSAGE':
        patch = {
          ...patch,
          messages: upsertMessage(this.state.messages, event.payload.message),
          ...(event.type === 'ASSISTANT_MESSAGE'
            ? { streamingText: '' }
            : {}),
        };
        break;
      case 'ASSISTANT_CHUNK':
        patch = {
          ...patch,
          streamingText: `${this.state.streamingText}${event.payload.content}`.slice(
            -65_536,
          ),
        };
        break;
      case 'RUN_STARTED':
      case 'RUN_PAUSED':
      case 'RUN_SUCCEEDED':
      case 'RUN_FAILED':
      case 'RUN_CANCELLED':
      case 'RUN_PREEMPTED':
        patch = {
          ...patch,
          session: this.patchSession({
            currentRun: {
              runId: event.payload.runId,
              status: event.payload.status,
              ...(event.payload.code
                ? { errorCode: event.payload.code }
                : {}),
              ...(event.payload.reason
                ? { reason: event.payload.reason }
                : {}),
              ...(event.payload.error
                ? { error: event.payload.error }
                : {}),
            },
          }),
        };
        break;
      case 'TOOL_PROPOSED':
      case 'TOOL_DISPATCHED':
      case 'TOOL_SUCCEEDED':
      case 'TOOL_FAILED':
      case 'TOOL_DENIED':
      case 'TOOL_TIMED_OUT':
      case 'TOOL_OUTCOME_UNKNOWN':
        patch = {
          ...patch,
          tools: upsertTool(this.state.tools, event),
        };
        break;
      case 'APPROVAL_REQUESTED':
      case 'APPROVAL_GRANTED':
      case 'APPROVAL_DENIED':
      case 'APPROVAL_CONSUMED':
      case 'APPROVAL_EXPIRED':
        patch = {
          ...patch,
          approvals: upsertBy(
            this.state.approvals,
            event.payload.approval,
            (entry) => entry.approvalId,
          ),
        };
        break;
      case 'CHECKPOINT_CREATED':
      case 'CHECKPOINT_RESTORED':
        patch = {
          ...patch,
          checkpoints: upsertBy(
            this.state.checkpoints,
            event.payload.checkpoint,
            (entry) => entry.checkpointId,
          ),
        };
        break;
      case 'LEASE_GRANTED':
      case 'LEASE_REVOKED':
      case 'LEASE_EXPIRED':
        patch = {
          ...patch,
          leases: upsertBy(
            this.state.leases,
            event.payload.lease,
            (entry) => entry.leaseId,
          ),
        };
        this.options.onLeaseChanged?.(event.payload.lease);
        if (event.type !== 'LEASE_GRANTED') {
          this.preemptLocal(
            event.payload.lease.revokedReason ??
              (event.type === 'LEASE_EXPIRED'
                ? 'LEASE_EXPIRED'
                : 'CONTEXT_CHANGED'),
          );
        }
        break;
      case 'BUDGET_UPDATED':
        patch = { ...patch, budget: event.payload.budget };
        break;
      case 'CONTEXT_CHANGED':
        patch = {
          ...patch,
          session: this.patchSession({
            contextVersion: event.payload.contextVersion,
          }),
          leases: [],
          approvals: [],
          reconnectRequired: true,
        };
        this.preemptLocal('CONTEXT_CHANGED');
        break;
    }
    this.appliedEventIds.set(event.seq, event.eventId);
    this.update(patch);
    this.refreshHeartbeat();
    this.refreshWorkspaceRenewal();
    if (
      event.type === 'TOOL_DISPATCHED' &&
      event.payload.invocation &&
      this.options.browserDispatcher
    ) {
      void this.dispatchBrowserTool(event.payload.invocation, generation).catch(
        (error) => this.fail(error),
      );
    }
  }

  private async dispatchBrowserTool(
    invocation: NonNullable<
      Extract<
        CrowdyAgentEventV1,
        { type: 'TOOL_DISPATCHED' }
      >['payload']['invocation']
    >,
    generation: number,
  ): Promise<void> {
    if (
      generation !== this.generation ||
      invocation.clientEpoch !== this.state.clientEpoch
    ) {
      return;
    }
    const result = await this.options.browserDispatcher!.dispatch(invocation);
    const currentContextVersion = this.state.session?.contextVersion;
    const leaseStillActive =
      !invocation.leaseId ||
      this.state.leases.some(
        (lease) =>
          lease.leaseId === invocation.leaseId &&
          lease.status === 'ACTIVE',
      );
    if (
      generation !== this.generation ||
      invocation.clientEpoch !== this.state.clientEpoch ||
      result.error?.code === 'AGENT_CLIENT_EPOCH_STALE' ||
      invocation.contextVersion !== currentContextVersion ||
      result.observedContextVersion !== currentContextVersion ||
      !leaseStillActive
    ) {
      return;
    }
    await this.options.transport.toolResult({
      ...this.mutationContext(`tool-result-${invocation.toolCallId}`),
      result,
    });
  }

  private scheduleAcknowledge(generation: number): void {
    const throughSeq = this.state.lastContiguousSeq;
    if (
      generation !== this.generation ||
      BigInt(throughSeq) <= BigInt(this.state.lastAcknowledgedSeq)
    ) {
      return;
    }
    this.acknowledgePromise = this.acknowledgePromise
      .then(async () => {
        if (
          generation !== this.generation ||
          BigInt(throughSeq) <= BigInt(this.state.lastAcknowledgedSeq)
        ) {
          return;
        }
        const acknowledged = await this.options.transport.acknowledgeEvents({
          ...this.mutationContext(`ack-${throughSeq}`),
          throughSeq,
        });
        if (
          generation === this.generation &&
          BigInt(acknowledged.throughSeq) >=
            BigInt(this.state.lastAcknowledgedSeq)
        ) {
          this.update({
            lastAcknowledgedSeq: acknowledged.throughSeq,
          });
        }
      })
      .catch((error) => {
        if (generation === this.generation) this.handleDisconnect(error, generation);
      });
  }

  private handleDisconnect(error: unknown, generation: number): void {
    if (generation !== this.generation || this.destroyed) return;
    this.generation++;
    this.stopHeartbeat();
    this.stopWorkspaceRenewal();
    this.disconnectSubscription();
    const reason =
      error instanceof CrowdyAgentError &&
      error.code === 'AGENT_OPERATOR_KILLED'
        ? 'OPERATOR_KILL'
        : error instanceof CrowdyAgentError &&
            error.code === 'AGENT_CLIENT_EPOCH_STALE'
          ? 'CLIENT_REATTACHED'
          : 'DISCONNECTED';
    this.preemptLocal(reason);
    this.update({
      connection: 'DISCONNECTED',
      clientEpoch: null,
      leases: [],
      approvals: [],
      playLeaseFreshUntil: null,
      reconnectRequired: true,
      lastError: toAgentError(error, 'AGENT_DISCONNECTED'),
    });
    const terminalPolicyError =
      error instanceof CrowdyAgentError &&
      [
        'AGENT_DISABLED',
        'AGENT_OPERATOR_KILLED',
        'AGENT_SESSION_CLOSED',
        'AGENT_PERMISSION_DENIED',
      ].includes(error.code);
    if (this.options.autoReconnect && !terminalPolicyError) {
      this.scheduleReconnect();
    }
  }

  private refreshHeartbeat(immediate = false): void {
    // Server `sweepExpired` detaches client cursors when last_heartbeat_at is
    // older than 5s — for every mode, not only PLAY. ASK/BUILD must heartbeat
    // or AcknowledgeEvents fails with AGENT_CLIENT_EPOCH_STALE ~5–10s after attach.
    const shouldRun =
      !this.destroyed &&
      this.pageVisible &&
      this.state.connection === 'CONNECTED' &&
      this.state.session?.status === 'ACTIVE' &&
      (this.state.session.mode === 'ASK' ||
        this.state.session.mode === 'BUILD' ||
        this.state.session.mode === 'PLAY') &&
      this.state.clientEpoch !== null;
    if (!shouldRun) {
      this.stopHeartbeat();
      if (this.state.playLeaseFreshUntil !== null) {
        this.update({ playLeaseFreshUntil: null });
      }
      return;
    }
    if (this.heartbeatTimer) return;
    const generation = this.generation;
    this.heartbeatTimer = setTimeout(
      () => {
        this.heartbeatTimer = null;
        void this.sendHeartbeat(generation);
      },
      immediate ? 0 : (this.options.heartbeatIntervalMs ?? 2_000),
    );
  }

  private async sendHeartbeat(generation: number): Promise<void> {
    if (generation !== this.generation || this.destroyed) return;
    try {
      const heartbeat = await withHeartbeatDeadline(
        this.options.transport.heartbeat(
          this.mutationContext('heartbeat'),
        ),
        this.options.heartbeatStaleMs ?? 5_000,
      );
      if (generation !== this.generation || this.destroyed) return;
      this.update({
        lastHeartbeatAt: heartbeat.serverTime,
        playLeaseFreshUntil: heartbeat.playLeaseFreshUntil ?? null,
      });
      this.refreshHeartbeat();
    } catch (error) {
      if (generation === this.generation) {
        this.handleDisconnect(error, generation);
      }
    }
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) clearTimeout(this.heartbeatTimer);
    this.heartbeatTimer = null;
  }

  private refreshWorkspaceRenewal(): void {
    const lease = this.state.leases.find(
      (entry) => entry.kind === 'WORKSPACE' && entry.status === 'ACTIVE',
    );
    const shouldRun =
      !this.destroyed &&
      this.state.connection === 'CONNECTED' &&
      this.state.session?.status === 'ACTIVE' &&
      this.state.session.mode === 'BUILD' &&
      this.state.clientEpoch !== null &&
      lease !== undefined;
    if (!shouldRun) {
      this.stopWorkspaceRenewal();
      return;
    }
    if (this.workspaceRenewTimer) return;
    const generation = this.generation;
    this.workspaceRenewTimer = setTimeout(() => {
      this.workspaceRenewTimer = null;
      void this.renewWorkspaceLease(lease, generation);
    }, this.options.workspaceRenewIntervalMs ?? 10_000);
  }

  private async renewWorkspaceLease(
    lease: CrowdyAgentLeaseV1,
    generation: number,
  ): Promise<void> {
    if (generation !== this.generation || this.destroyed) return;
    try {
      const heartbeat = await withHeartbeatDeadline(
        this.options.transport.heartbeat({
          ...this.mutationContext(`renew-workspace-${lease.leaseId}`),
        }),
        this.options.heartbeatStaleMs ?? 5_000,
      );
      if (!heartbeat.workspaceLeaseExpiresAt) {
        throw new CrowdyAgentError(
          'AGENT_LEASE_REVOKED',
          'Server did not renew the active workspace lease',
        );
      }
      const renewed: CrowdyAgentLeaseV1 = {
        ...lease,
        status: 'ACTIVE',
        expiresAt: heartbeat.workspaceLeaseExpiresAt,
      };
      if (
        generation !== this.generation ||
        this.destroyed ||
        this.state.session?.mode !== 'BUILD' ||
        !this.state.leases.some(
          (entry) =>
            entry.leaseId === lease.leaseId && entry.status === 'ACTIVE',
        )
      ) {
        return;
      }
      if (
        renewed.kind !== 'WORKSPACE' ||
        renewed.status !== 'ACTIVE' ||
        renewed.contextVersion !== this.state.session.contextVersion
      ) {
        throw new CrowdyAgentError(
          'AGENT_LEASE_REVOKED',
          'Workspace renewal returned stale lease context',
        );
      }
      this.upsertLease(renewed);
      this.options.onLeaseChanged?.(renewed);
      this.refreshWorkspaceRenewal();
    } catch (error) {
      if (generation !== this.generation || this.destroyed) return;
      if (
        error instanceof CrowdyAgentError &&
        error.code === 'AGENT_CLIENT_EPOCH_STALE'
      ) {
        this.handleDisconnect(error, generation);
        return;
      }
      this.preemptLocal('CONTEXT_CHANGED');
      const revoked: CrowdyAgentLeaseV1 = {
        ...lease,
        status: 'REVOKED',
        revokedReason: 'CONTEXT_CHANGED',
      };
      this.upsertLease(revoked);
      this.options.onLeaseChanged?.(revoked);
      this.update({
        lastError: toAgentError(error, 'AGENT_LEASE_REVOKED'),
        reconnectRequired: true,
      });
    }
  }

  private stopWorkspaceRenewal(): void {
    if (this.workspaceRenewTimer) clearTimeout(this.workspaceRenewTimer);
    this.workspaceRenewTimer = null;
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer || this.destroyed) return;
    const max = this.options.maxReconnectAttempts ?? 5;
    if (this.reconnectAttempts >= max) return;
    const delay =
      (this.options.reconnectDelayMs ?? 500) *
      Math.min(8, 2 ** this.reconnectAttempts);
    this.reconnectAttempts++;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.reconnect().catch(() => this.scheduleReconnect());
    }, delay);
  }

  private async loadRemoteContext(
    session: CrowdyAgentSessionV1,
  ): Promise<
    Pick<CrowdyStudioAgentStateV1, 'toolDescriptors' | 'budget'>
  > {
    const [descriptorSet, budget] = await Promise.all([
      this.options.transport.toolDescriptors(session.sessionId),
      this.options.transport.budget(session.sessionId),
    ]);
    if (descriptorSet.registryDigest !== session.registryDigest) {
      throw new CrowdyAgentError(
        'AGENT_CONTEXT_STALE',
        'Session registry digest does not match the effective descriptor set',
      );
    }
    return {
      toolDescriptors: descriptorSet.tools,
      budget,
    };
  }

  private assertProjectBinding(
    session: CrowdyAgentSessionV1,
    expectedProjectId: string | undefined,
    enforceSelection: boolean,
  ): void {
    if (session.mode === 'BUILD' && !session.projectId) {
      throw new CrowdyAgentError(
        'AGENT_CONTEXT_CHANGED',
        'BUILD session is not bound to a Crowdy Studio project',
      );
    }
    if (
      enforceSelection &&
      session.projectId !== expectedProjectId
    ) {
      throw new CrowdyAgentError(
        'AGENT_CONTEXT_CHANGED',
        'Agent session project does not match the selected Crowdy Studio project',
      );
    }
  }

  private mutationContext(operation: string): {
    sessionId: string;
    clientEpoch: string;
    idempotencyKey: string;
  } {
    const session = this.requireSession();
    const clientEpoch = this.state.clientEpoch;
    if (!clientEpoch) {
      throw new CrowdyAgentError(
        'AGENT_DISCONNECTED',
        'An attached client epoch is required',
      );
    }
    return {
      sessionId: session.sessionId,
      clientEpoch,
      idempotencyKey: this.nextKey(operation),
    };
  }

  private nextKey(operation: string): string {
    if (this.options.createIdempotencyKey) {
      return this.options.createIdempotencyKey(operation);
    }
    const random =
      globalThis.crypto?.randomUUID?.() ??
      `${Date.now().toString(36)}-${(++this.keySequence).toString(36)}`;
    return `crowdy-agent:${operation}:${random}`.slice(0, 240);
  }

  private patchSession(
    patch: Partial<CrowdyAgentSessionV1>,
  ): CrowdyAgentSessionV1 | null {
    return this.state.session ? { ...this.state.session, ...patch } : null;
  }

  private upsertLease(lease: CrowdyAgentLeaseV1): void {
    this.update({
      leases: upsertBy(
        this.state.leases,
        lease,
        (entry) => entry.leaseId,
      ),
    });
  }

  private disconnectSubscription(): void {
    this.subscription?.close();
    this.subscription = null;
  }

  private requireSession(): CrowdyAgentSessionV1 {
    if (!this.state.session) {
      throw new CrowdyAgentError(
        'AGENT_SESSION_NOT_FOUND',
        'Agent session is not initialized',
      );
    }
    return this.state.session;
  }

  private preemptLocal(reason: CrowdyAgentPreemptionReason): void {
    this.stopWorkspaceRenewal();
    this.options.browserDispatcher?.cancelActive();
    this.options.onPreempt?.(reason);
  }

  private update(patch: Partial<CrowdyStudioAgentStateV1>): void {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener(this.state);
  }

  private fail(error: unknown): void {
    this.stopHeartbeat();
    this.update({
      connection: 'ERROR',
      lastError: toAgentError(error, 'AGENT_EVENT_CURSOR_INVALID'),
      reconnectRequired: true,
    });
  }

  private ensureAlive(): void {
    if (this.destroyed) {
      throw new CrowdyAgentError(
        'AGENT_SESSION_CLOSED',
        'CrowdyStudioAgentController is destroyed',
      );
    }
  }
}

function createClientInstanceId(): string {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  const bytes = new Uint8Array(16);
  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index++) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join('-');
}

function withHeartbeatDeadline<T>(
  operation: Promise<T>,
  timeoutMs: number,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () =>
        reject(
          new CrowdyAgentError(
            'AGENT_DISCONNECTED',
            'Agent heartbeat exceeded the server freshness window',
            { retryable: true },
          ),
        ),
      timeoutMs,
    );
    operation.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function validateEventPayload(event: CrowdyAgentEventV1): void {
  const payload = asEventRecord(event.payload, `${event.type} payload`);
  if (event.type === 'MODE_SELECTED') {
    assertEventEnum(payload.mode, ['ASK', 'BUILD', 'PLAY'], 'mode');
    return;
  }
  if (
    event.type === 'SESSION_CREATED' ||
    event.type === 'SESSION_PAUSED' ||
    event.type === 'SESSION_RESUMED' ||
    event.type === 'SESSION_CLOSED'
  ) {
    if (payload.status !== undefined) {
      assertEventEnum(
        payload.status,
        ['ACTIVE', 'PAUSED', 'CLOSED', 'REVOKED'],
        'session status',
      );
    }
    return;
  }
  if (
    event.type === 'RUN_STARTED' ||
    event.type === 'RUN_PAUSED' ||
    event.type === 'RUN_SUCCEEDED' ||
    event.type === 'RUN_FAILED' ||
    event.type === 'RUN_CANCELLED' ||
    event.type === 'RUN_PREEMPTED'
  ) {
    assertEventEnum(
      payload.status,
      [
        'QUEUED',
        'RUNNING',
        'WAITING_FOR_TOOL',
        'WAITING_FOR_APPROVAL',
        'PAUSED',
        'SUCCEEDED',
        'FAILED',
        'CANCELLED',
        'PREEMPTED',
      ],
      'run status',
    );
    assertBoundedEventString(payload.runId, 'runId', 128);
    if (payload.code !== undefined && payload.code !== null) {
      assertBoundedEventString(payload.code, 'run code', 128);
    }
    if (payload.error !== undefined && payload.error !== null) {
      const error = asEventRecord(payload.error, 'run error');
      assertBoundedEventString(error.code, 'run error code', 128);
      assertBoundedEventString(error.message, 'run error message', 512);
      if (typeof error.retryable !== 'boolean') {
        throw invalidEvent('run error retryable must be boolean');
      }
    }
    return;
  }
  if (
    event.type === 'TOOL_PROPOSED' ||
    event.type === 'TOOL_DISPATCHED' ||
    event.type === 'TOOL_SUCCEEDED' ||
    event.type === 'TOOL_FAILED' ||
    event.type === 'TOOL_DENIED' ||
    event.type === 'TOOL_TIMED_OUT' ||
    event.type === 'TOOL_OUTCOME_UNKNOWN'
  ) {
    assertEventEnum(
      payload.status,
      [
        'PROPOSED',
        'WAITING_FOR_APPROVAL',
        'DISPATCHED',
        'RUNNING',
        'SUCCEEDED',
        'FAILED',
        'DENIED',
        'TIMED_OUT',
        'CANCELLED',
        'STALE',
        'OUTCOME_UNKNOWN',
      ],
      'tool status',
    );
    assertBoundedEventString(payload.toolCallId, 'toolCallId', 128);
    assertBoundedEventString(payload.name, 'tool name', 160);
    assertBoundedEventString(payload.version, 'tool version', 32);
    return;
  }
  if (
    event.type === 'APPROVAL_REQUESTED' ||
    event.type === 'APPROVAL_GRANTED' ||
    event.type === 'APPROVAL_DENIED' ||
    event.type === 'APPROVAL_CONSUMED' ||
    event.type === 'APPROVAL_EXPIRED'
  ) {
    const approval = asEventRecord(payload.approval, 'approval');
    assertEventEnum(
      approval.status,
      ['PENDING', 'GRANTED', 'DENIED', 'CONSUMED', 'REVOKED', 'EXPIRED'],
      'approval status',
    );
    if (
      typeof approval.argumentHash !== 'string' ||
      !/^sha256:[0-9a-f]{64}$/u.test(approval.argumentHash)
    ) {
      throw invalidEvent('approval argument hash is invalid');
    }
    assertBoundedEventString(approval.safeSummary, 'approval summary', 2_048);
    return;
  }
  if (
    event.type === 'LEASE_GRANTED' ||
    event.type === 'LEASE_REVOKED' ||
    event.type === 'LEASE_EXPIRED'
  ) {
    const lease = asEventRecord(payload.lease, 'lease');
    assertEventEnum(lease.kind, ['WORKSPACE', 'PLAY'], 'lease kind');
    assertEventEnum(lease.status, ['ACTIVE', 'REVOKED', 'EXPIRED'], 'lease status');
    assertBoundedEventString(lease.leaseId, 'leaseId', 128);
    return;
  }
  if (event.type === 'ASSISTANT_CHUNK') {
    assertBoundedEventString(payload.content, 'assistant chunk', 4_096, true);
    return;
  }
  if (event.type === 'USER_MESSAGE' || event.type === 'ASSISTANT_MESSAGE') {
    const message = asEventRecord(payload.message, 'message');
    assertEventEnum(message.role, ['USER', 'ASSISTANT'], 'message role');
    assertBoundedEventString(message.messageId, 'messageId', 128);
    assertBoundedEventString(message.content, 'message content', 65_536, true);
    return;
  }
  if (event.type === 'CONTEXT_CHANGED') {
    assertBoundedEventString(payload.contextVersion, 'contextVersion', 128);
  }
}

function asEventRecord(
  value: unknown,
  field: string,
): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw invalidEvent(`${field} must be an object`);
  }
  return value as Record<string, unknown>;
}

function assertEventEnum(
  value: unknown,
  allowed: readonly string[],
  field: string,
): void {
  if (typeof value !== 'string' || !allowed.includes(value)) {
    throw invalidEvent(`${field} contains an unknown enum value`);
  }
}

function assertBoundedEventString(
  value: unknown,
  field: string,
  maxLength: number,
  allowEmpty = false,
): void {
  if (
    typeof value !== 'string' ||
    (!allowEmpty && value.length === 0) ||
    value.length > maxLength
  ) {
    throw invalidEvent(`${field} is outside protocol bounds`);
  }
}

function invalidEvent(message: string): CrowdyAgentError {
  return new CrowdyAgentError('AGENT_EVENT_CURSOR_INVALID', message);
}

function assertSequence(value: string, field: string): void {
  if (
    typeof value !== 'string' ||
    value.length < 1 ||
    value.length > 40 ||
    !isDecimalString(value) ||
    value.startsWith('-')
  ) {
    throw new CrowdyAgentError(
      'AGENT_EVENT_CURSOR_INVALID',
      `${field} must be a non-negative decimal string`,
    );
  }
}

function upsertMessage(
  messages: readonly CrowdyAgentMessageV1[],
  next: CrowdyAgentMessageV1,
): CrowdyAgentMessageV1[] {
  return [
    ...messages.filter((message) => message.messageId !== next.messageId),
    next,
  ].sort((left, right) => left.createdAt.localeCompare(right.createdAt));
}

function upsertTool(
  tools: readonly CrowdyAgentToolTimelineItemV1[],
  event: Extract<
    CrowdyAgentEventV1,
    {
      type:
        | 'TOOL_PROPOSED'
        | 'TOOL_DISPATCHED'
        | 'TOOL_SUCCEEDED'
        | 'TOOL_FAILED'
        | 'TOOL_DENIED'
        | 'TOOL_TIMED_OUT'
        | 'TOOL_OUTCOME_UNKNOWN';
    }
  >,
): CrowdyAgentToolTimelineItemV1[] {
  const current = tools.find(
    (entry) => entry.toolCallId === event.payload.toolCallId,
  );
  const next: CrowdyAgentToolTimelineItemV1 = {
    toolCallId: event.payload.toolCallId,
    name: event.payload.name,
    version: event.payload.version,
    status: event.payload.status,
    ...(current?.risk ? { risk: current.risk } : {}),
    ...(event.payload.safeSummary
      ? { safeSummary: event.payload.safeSummary }
      : current?.safeSummary
        ? { safeSummary: current.safeSummary }
        : {}),
    ...(event.payload.argumentHash
      ? { argumentHash: event.payload.argumentHash }
      : current?.argumentHash
        ? { argumentHash: current.argumentHash }
        : {}),
    ...(event.payload.result ? { result: event.payload.result } : {}),
    ...(event.payload.error ? { error: event.payload.error } : {}),
    updatedAt: event.createdAt,
  };
  return [
    ...tools.filter((entry) => entry.toolCallId !== next.toolCallId),
    next,
  ];
}

function upsertBy<T>(
  values: readonly T[],
  next: T,
  key: (value: T) => string,
): T[] {
  const nextKey = key(next);
  return [...values.filter((value) => key(value) !== nextKey), next];
}
