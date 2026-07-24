import { CrowdyAgentError, toAgentError } from '../crowdy-agent/errors.js';
import {
  canonicalJson,
  sha256Digest,
  validateJsonSchemaValue,
} from '../crowdy-agent/schema.js';
import type {
  CrowdyAgentLeaseV1,
  CrowdyAgentPreemptionReason,
} from '../crowdy-agent/types.js';
import {
  GAME_COMMAND_RESULT_SCHEMA_V1,
  GAME_COMMAND_SCHEMA_V1,
  GAME_OBSERVATION_SCHEMA_V1,
  OBSERVE_REQUEST_SCHEMA_V1,
  PLAYER_HOST_CAPABILITIES_SCHEMA_V1,
} from './schemas.js';
import type {
  GameCommandResultV1,
  GameCommandV1,
  GameObservationV1,
  ObserveRequestV1,
  PlayerHostAdapterV1,
  PlayerHostCapabilitiesV1,
  PlayerHostLeaseScope,
  ValidatedGateV1,
} from './types.js';

const TOOL_BY_COMMAND = Object.freeze({
  MOVE: 'game.control.move',
  LOOK: 'game.control.look',
  STOP: 'game.control.stop',
  INVENTORY_SELECT: 'game.inventory.select',
  INVENTORY_CONSUME: 'game.inventory.consume',
  INVENTORY_TRANSFER: 'game.inventory.transfer',
  INTERACT: 'game.interact',
  CRAFT: 'game.craft',
  MOUNT: 'game.mount',
  COMBAT_ATTACK: 'game.combat.attack',
  CHAT_SEND: 'game.chat.send',
  TRAVEL_TELEPORT: 'game.travel.teleport',
} as const);

export interface AgentControlDispatchV1 {
  readonly toolCallId: string;
  readonly clientEpoch: string;
  readonly leaseId?: string;
  readonly approvalGrant?: string;
  readonly command: GameCommandV1;
}

export interface AgentObservationDispatchV1 {
  readonly clientEpoch: string;
  readonly leaseId?: string;
}

export interface AgentControlLeaseSnapshotV1 {
  readonly connected: boolean;
  readonly clientEpoch: string | null;
  readonly lease: CrowdyAgentLeaseV1 | null;
  readonly capabilities: PlayerHostCapabilitiesV1 | null;
  readonly lastPreemption?: CrowdyAgentPreemptionReason;
}

export interface AgentControlLeaseManagerOptionsV1 {
  readonly now?: () => number;
  readonly contextVersion?: () => string;
  readonly maxLeaseSeconds?: number;
  readonly maxRememberedCalls?: number;
  readonly onChange?: (snapshot: AgentControlLeaseSnapshotV1) => void;
}

interface CommandRecord {
  readonly fingerprint: string;
  readonly promise: Promise<GameCommandResultV1>;
}

/**
 * Browser-local Play authority gate. Human takeover calls `preempt` and clears
 * intent synchronously before any server acknowledgement or async cleanup.
 */
export class AgentControlLeaseManager {
  private clientEpoch: string | null = null;
  private connected = false;
  private lease: CrowdyAgentLeaseV1 | null = null;
  private capabilitiesValue: PlayerHostCapabilitiesV1 | null = null;
  private readonly observations = new Map<string, GameObservationV1>();
  private readonly calls = new Map<string, CommandRecord>();
  private readonly rateWindows = new Map<string, number[]>();
  private expiryTimer: ReturnType<typeof setTimeout> | null = null;
  private lastPreemption?: CrowdyAgentPreemptionReason;
  private readonly now: () => number;

  constructor(
    private readonly adapter: PlayerHostAdapterV1,
    private readonly options: AgentControlLeaseManagerOptionsV1 = {},
  ) {
    if (adapter.contractVersion !== 'crowdy.player-host/1') {
      throw new CrowdyAgentError(
        'AGENT_HOST_UNAVAILABLE',
        'Unsupported PlayerHostAdapter contract version',
      );
    }
    this.now = options.now ?? Date.now;
  }

  snapshot(): AgentControlLeaseSnapshotV1 {
    return {
      connected: this.connected,
      clientEpoch: this.clientEpoch,
      lease: this.lease,
      capabilities: this.capabilitiesValue,
      ...(this.lastPreemption
        ? { lastPreemption: this.lastPreemption }
        : {}),
    };
  }

  attach(clientEpoch: string): void {
    assertDecimal(clientEpoch, 'clientEpoch');
    if (this.clientEpoch && this.clientEpoch !== clientEpoch) {
      this.preempt('CLIENT_REATTACHED');
    }
    this.clientEpoch = clientEpoch;
    this.connected = true;
    this.emit();
  }

  disconnect(): void {
    this.connected = false;
    this.preempt('DISCONNECTED');
  }

  async refreshCapabilities(): Promise<PlayerHostCapabilitiesV1> {
    const next = await this.adapter.capabilities();
    validateJsonSchemaValue(PLAYER_HOST_CAPABILITIES_SCHEMA_V1, next, {
      direction: 'OUTPUT',
    });
    if (
      new Set(next.commands.map((command) => command.kind)).size !==
        next.commands.length ||
      next.commands.some(
        (command) => TOOL_BY_COMMAND[command.kind] !== command.toolName,
      )
    ) {
      throw new CrowdyAgentError(
        'AGENT_HOST_CAPABILITY_CHANGED',
        'Host command capabilities contain duplicate or confused tool mappings',
      );
    }
    const previous = this.capabilitiesValue;
    this.capabilitiesValue = next;
    if (
      previous &&
      this.lease &&
      (previous.revision !== next.revision ||
        previous.controlledEntityId !== next.controlledEntityId)
    ) {
      this.preempt(
        previous.controlledEntityId !== next.controlledEntityId
          ? 'CONTROL_TARGET_CHANGED'
          : 'CONTEXT_CHANGED',
      );
    }
    this.emit();
    return next;
  }

  grantLease(lease: CrowdyAgentLeaseV1): void {
    const capabilities = this.requireCapabilities();
    if (!this.connected || !this.clientEpoch) {
      throw new CrowdyAgentError(
        'AGENT_DISCONNECTED',
        'Cannot grant Play control while the browser is disconnected',
      );
    }
    if (
      lease.kind !== 'PLAY' ||
      lease.status !== 'ACTIVE' ||
      lease.clientEpoch !== this.clientEpoch
    ) {
      throw new CrowdyAgentError(
        'AGENT_CLIENT_EPOCH_STALE',
        'Play lease is not active for the attached client epoch',
      );
    }
    if (
      lease.hostCapabilityRevision !== capabilities.revision ||
      lease.controlledEntityId !== capabilities.controlledEntityId
    ) {
      throw new CrowdyAgentError(
        'AGENT_HOST_CAPABILITY_CHANGED',
        'Play lease does not match the current host capability and target',
      );
    }
    if (
      this.options.contextVersion &&
      lease.contextVersion !== this.options.contextVersion()
    ) {
      throw new CrowdyAgentError(
        'AGENT_CONTEXT_STALE',
        'Play lease belongs to a stale game context',
      );
    }
    const now = this.now();
    const expiry = Date.parse(lease.expiresAt);
    const maxMs = (this.options.maxLeaseSeconds ?? 600) * 1_000;
    if (!Number.isFinite(expiry) || expiry <= now || expiry - now > maxMs) {
      throw new CrowdyAgentError(
        'AGENT_LEASE_EXPIRED',
        'Play lease expiry is invalid or exceeds the host maximum',
      );
    }
    for (const scope of lease.scopes) assertLeaseScope(scope);
    if (new Set(lease.scopes).size !== lease.scopes.length) {
      throw new CrowdyAgentError(
        'AGENT_LEASE_SCOPE_MISSING',
        'Play lease scopes must be unique',
      );
    }
    this.clearExpiryTimer();
    this.lease = lease;
    this.expiryTimer = setTimeout(() => {
      this.expiryTimer = null;
      if (this.lease?.leaseId === lease.leaseId) this.preempt('LEASE_EXPIRED');
    }, expiry - now);
    this.emit();
  }

  revoke(reason: CrowdyAgentPreemptionReason = 'HUMAN_STOP'): void {
    this.preempt(reason);
  }

  /** Human input, Escape, Stop, death, and context changes call this directly. */
  preempt(reason: CrowdyAgentPreemptionReason): void {
    // Intent is cleared first and synchronously. Do not move below async/state work.
    try {
      this.adapter.clearAgentIntent(reason);
    } finally {
      // A host cleanup bug cannot leave the SDK gate or lease active.
      this.clearExpiryTimer();
      this.lease = null;
      this.observations.clear();
      this.rateWindows.clear();
      this.lastPreemption = reason;
      this.emit();
    }
  }

  async observe(
    request: ObserveRequestV1,
    dispatch?: AgentObservationDispatchV1,
  ): Promise<GameObservationV1> {
    if (!this.connected) {
      throw new CrowdyAgentError('AGENT_DISCONNECTED', 'Browser host is disconnected');
    }
    validateJsonSchemaValue(OBSERVE_REQUEST_SCHEMA_V1, request, {
      direction: 'INPUT',
    });
    const capabilities =
      this.capabilitiesValue ?? (await this.refreshCapabilities());
    if (dispatch) {
      if (!this.clientEpoch || dispatch.clientEpoch !== this.clientEpoch) {
        throw new CrowdyAgentError(
          'AGENT_CLIENT_EPOCH_STALE',
          'Game observation belongs to a stale client epoch',
        );
      }
      if (dispatch.leaseId) {
        this.validateObservationLease(dispatch, capabilities);
      }
    }
    if (
      request.maxNearbyActors > capabilities.observation.maxNearbyActors ||
      request.maxNearbyVoxels > capabilities.observation.maxNearbyVoxels
    ) {
      throw new CrowdyAgentError(
        'AGENT_TOOL_INPUT_INVALID',
        'Observation request exceeds host-advertised bounds',
      );
    }
    const observation = await this.adapter.observe(request);
    validateJsonSchemaValue(GAME_OBSERVATION_SCHEMA_V1, observation, {
      direction: 'OUTPUT',
    });
    if (
      observation.nearbyActors.length > request.maxNearbyActors ||
      observation.nearbyVoxels.length > request.maxNearbyVoxels
    ) {
      throw new CrowdyAgentError(
        'AGENT_TOOL_OUTPUT_INVALID',
        'Game observation exceeded the requested deterministic bounds',
      );
    }
    this.validateObservationContext(observation, capabilities);
    this.observations.set(observation.observationId, observation);
    while (this.observations.size > 32) {
      const oldest = this.observations.keys().next().value as string | undefined;
      if (!oldest) break;
      this.observations.delete(oldest);
    }
    return observation;
  }

  private validateObservationLease(
    dispatch: AgentObservationDispatchV1,
    capabilities: PlayerHostCapabilitiesV1,
  ): void {
    const lease = this.lease;
    if (
      !lease ||
      lease.status !== 'ACTIVE' ||
      dispatch.leaseId !== lease.leaseId
    ) {
      throw new CrowdyAgentError(
        'AGENT_LEASE_REQUIRED',
        'Play observations require the current visible lease',
      );
    }
    if (Date.parse(lease.expiresAt) <= this.now()) {
      this.preempt('LEASE_EXPIRED');
      throw new CrowdyAgentError('AGENT_LEASE_EXPIRED', 'Play lease expired');
    }
    if (!lease.scopes.includes('observe')) {
      throw new CrowdyAgentError(
        'AGENT_LEASE_SCOPE_MISSING',
        'Game observation requires observe scope',
        { requiredScope: 'observe' },
      );
    }
    if (
      lease.hostCapabilityRevision !== capabilities.revision ||
      lease.controlledEntityId !== capabilities.controlledEntityId
    ) {
      this.preempt('CONTROL_TARGET_CHANGED');
      throw new CrowdyAgentError(
        'AGENT_CONTROL_TARGET_CHANGED',
        'Observation lease target or capability changed',
      );
    }
    if (
      this.options.contextVersion &&
      lease.contextVersion !== this.options.contextVersion()
    ) {
      this.preempt('CONTEXT_CHANGED');
      throw new CrowdyAgentError(
        'AGENT_CONTEXT_CHANGED',
        'Observation lease context changed',
      );
    }
  }

  dispatch(input: AgentControlDispatchV1): Promise<GameCommandResultV1> {
    if (
      typeof input.toolCallId !== 'string' ||
      input.toolCallId.length < 1 ||
      input.toolCallId.length > 128 ||
      typeof input.clientEpoch !== 'string' ||
      input.clientEpoch.length < 1 ||
      input.clientEpoch.length > 40 ||
      (input.leaseId !== undefined &&
        (typeof input.leaseId !== 'string' || input.leaseId.length < 1)) ||
      (input.leaseId?.length ?? 0) > 128 ||
      (input.approvalGrant !== undefined &&
        (typeof input.approvalGrant !== 'string' ||
          input.approvalGrant.length < 1)) ||
      (input.approvalGrant?.length ?? 0) > 512
    ) {
      return Promise.reject(
        new CrowdyAgentError(
          'AGENT_TOOL_INPUT_INVALID',
          'Game dispatch envelope is outside protocol bounds',
        ),
      );
    }
    validateJsonSchemaValue(GAME_COMMAND_SCHEMA_V1, input.command, {
      direction: 'INPUT',
    });
    const fingerprint = sha256Digest(
      canonicalJson({
        clientEpoch: input.clientEpoch,
        ...(input.leaseId ? { leaseId: input.leaseId } : {}),
        ...(input.approvalGrant
          ? { approvalGrant: input.approvalGrant }
          : {}),
        command: input.command,
      }),
    );
    const previous = this.calls.get(input.toolCallId);
    if (previous) {
      if (previous.fingerprint !== fingerprint) {
        return Promise.reject(
          new CrowdyAgentError(
            'AGENT_IDEMPOTENCY_CONFLICT',
            `Game tool call ${input.toolCallId} changed after first dispatch`,
          ),
        );
      }
      return previous.promise;
    }
    if (this.calls.size >= (this.options.maxRememberedCalls ?? 2_048)) {
      return Promise.reject(
        new CrowdyAgentError(
          'AGENT_RATE_LIMITED',
          'Game execute-once result cache is full',
        ),
      );
    }
    const promise = this.execute(input);
    this.calls.set(input.toolCallId, { fingerprint, promise });
    return promise;
  }

  clearClosedSession(): void {
    this.calls.clear();
  }

  private async execute(
    input: AgentControlDispatchV1,
  ): Promise<GameCommandResultV1> {
    if (input.command.kind === 'STOP') {
      this.preempt('HUMAN_STOP');
      return {
        contractVersion: 'crowdy.game-command-result/1',
        status: 'SUCCEEDED',
        commandKind: 'STOP',
      };
    }
    const gate = this.validateDispatch(input);
    try {
      const result = await this.adapter.dispatch(input.command, gate);
      validateJsonSchemaValue(GAME_COMMAND_RESULT_SCHEMA_V1, result, {
        direction: 'OUTPUT',
      });
      if (result.commandKind !== input.command.kind) {
        throw new CrowdyAgentError(
          'AGENT_TOOL_OUTPUT_INVALID',
          'Player host returned a result for a different command kind',
        );
      }
      return result;
    } catch (error) {
      // Validation and policy failures happen before this try. Once the adapter
      // starts, an exception is ambiguous and must never trigger a blind retry.
      return {
        contractVersion: 'crowdy.game-command-result/1',
        status: 'OUTCOME_UNKNOWN',
        commandKind: input.command.kind,
        observationId: input.command.observationId,
        error: toAgentError(error, 'AGENT_TOOL_OUTCOME_UNKNOWN'),
      };
    }
  }

  private validateDispatch(input: AgentControlDispatchV1): ValidatedGateV1 {
    if (input.command.kind === 'STOP') {
      throw new CrowdyAgentError(
        'AGENT_TOOL_INPUT_INVALID',
        'STOP bypasses the leased dispatch path',
      );
    }
    const command = input.command;
    if (!this.connected || !this.clientEpoch) {
      throw new CrowdyAgentError('AGENT_DISCONNECTED', 'Browser host is disconnected');
    }
    if (input.clientEpoch !== this.clientEpoch) {
      throw new CrowdyAgentError(
        'AGENT_CLIENT_EPOCH_STALE',
        'Game command belongs to a stale client epoch',
      );
    }
    const capabilities = this.requireCapabilities();
    const advertised = capabilities.commands.find(
      (candidate) => candidate.kind === command.kind,
    );
    if (!advertised) {
      throw new CrowdyAgentError(
        'AGENT_HOST_UNAVAILABLE',
        `Host does not advertise ${command.kind}`,
      );
    }
    const lease = this.lease;
    const now = this.now();
    if (
      !lease ||
      lease.status !== 'ACTIVE' ||
      input.leaseId !== lease.leaseId
    ) {
      throw new CrowdyAgentError(
        'AGENT_LEASE_REQUIRED',
        `${command.kind} requires the current visible Play lease`,
      );
    }
    if (lease.clientEpoch !== this.clientEpoch) {
      this.preempt('CLIENT_REATTACHED');
      throw new CrowdyAgentError(
        'AGENT_CLIENT_EPOCH_STALE',
        'Play lease belongs to a stale client epoch',
      );
    }
    if (Date.parse(lease.expiresAt) <= now) {
      this.preempt('LEASE_EXPIRED');
      throw new CrowdyAgentError('AGENT_LEASE_EXPIRED', 'Play lease expired');
    }
    if (
      lease.hostCapabilityRevision !== capabilities.revision ||
      lease.controlledEntityId !== capabilities.controlledEntityId
    ) {
      this.preempt('CONTROL_TARGET_CHANGED');
      throw new CrowdyAgentError(
        'AGENT_CONTROL_TARGET_CHANGED',
        'Controlled entity or host capability changed',
      );
    }
    if (
      this.options.contextVersion &&
      lease.contextVersion !== this.options.contextVersion()
    ) {
      this.preempt('CONTEXT_CHANGED');
      throw new CrowdyAgentError(
        'AGENT_CONTEXT_CHANGED',
        'Play lease game context changed',
      );
    }
    if (
      advertised.requiredScope &&
      !lease.scopes.includes(advertised.requiredScope)
    ) {
      throw new CrowdyAgentError(
        'AGENT_LEASE_SCOPE_MISSING',
        `${command.kind} requires ${advertised.requiredScope}`,
        { requiredScope: advertised.requiredScope },
      );
    }
    if (advertised.approval !== 'NONE' && !input.approvalGrant) {
      throw new CrowdyAgentError(
        'AGENT_APPROVAL_REQUIRED',
        `${command.kind} requires exact approval`,
      );
    }
    const observation = this.observations.get(command.observationId);
    if (!observation) {
      throw new CrowdyAgentError(
        'AGENT_OBSERVATION_STALE',
        'Command observation is missing or was invalidated',
      );
    }
    this.validateObservationContext(observation, capabilities);
    if (
      command.capabilityRevision !== observation.capabilityRevision ||
      command.controlledEntityId !== observation.controlledEntityId
    ) {
      throw new CrowdyAgentError(
        'AGENT_CONTROL_TARGET_CHANGED',
        'Command target does not match its observation',
      );
    }
    if (!observation.player.alive) {
      this.preempt('DEATH');
      throw new CrowdyAgentError('AGENT_PREEMPTED', 'Player is dead');
    }
    if (
      observation.inputState.modalOpen ||
      observation.inputState.textInputFocused
    ) {
      throw new CrowdyAgentError(
        'AGENT_CONTEXT_CHANGED',
        'Game modal or text input blocks agent control',
      );
    }
    if (observation.inputState.humanInputActive) {
      this.preempt('HUMAN_INPUT');
      throw new CrowdyAgentError('AGENT_PREEMPTED', 'Human input took control');
    }
    this.consumeRate(command.kind, advertised.rateLimitPerSecond, now);
    return {
      contractVersion: 'crowdy.validated-gate/1',
      clientEpoch: this.clientEpoch,
      leaseId: lease.leaseId,
      scopes: lease.scopes.map(asLeaseScope),
      contextVersion: lease.contextVersion,
      observationId: observation.observationId,
      validatedAt: new Date(now).toISOString(),
    };
  }

  private validateObservationContext(
    observation: GameObservationV1,
    capabilities: PlayerHostCapabilitiesV1,
  ): void {
    const now = this.now();
    const observedAt = Date.parse(observation.observedAt);
    const expiresAt = Date.parse(observation.expiresAt);
    if (
      !Number.isFinite(observedAt) ||
      !Number.isFinite(expiresAt) ||
      observedAt > now + 1_000 ||
      expiresAt <= now ||
      now - observedAt > capabilities.observation.maxAgeMs
    ) {
      throw new CrowdyAgentError(
        'AGENT_OBSERVATION_STALE',
        'Game observation is stale or has invalid freshness bounds',
      );
    }
    if (
      observation.capabilityRevision !== capabilities.revision ||
      observation.controlledEntityId !== capabilities.controlledEntityId
    ) {
      throw new CrowdyAgentError(
        'AGENT_CONTROL_TARGET_CHANGED',
        'Observation does not match the current host target',
      );
    }
  }

  private consumeRate(kind: string, limit: number, now: number): void {
    const window = (this.rateWindows.get(kind) ?? []).filter(
      (timestamp) => now - timestamp < 1_000,
    );
    if (window.length >= limit) {
      throw new CrowdyAgentError(
        'AGENT_RATE_LIMITED',
        `${kind} exceeded the host rate limit`,
        { retryable: true },
      );
    }
    window.push(now);
    this.rateWindows.set(kind, window);
  }

  private requireCapabilities(): PlayerHostCapabilitiesV1 {
    if (!this.capabilitiesValue) {
      throw new CrowdyAgentError(
        'AGENT_HOST_UNAVAILABLE',
        'Host capabilities must be refreshed before granting control',
      );
    }
    return this.capabilitiesValue;
  }

  private clearExpiryTimer(): void {
    if (this.expiryTimer) clearTimeout(this.expiryTimer);
    this.expiryTimer = null;
  }

  private emit(): void {
    this.options.onChange?.(this.snapshot());
  }
}

function assertDecimal(value: string, field: string): void {
  if (
    typeof value !== 'string' ||
    value.length < 1 ||
    value.length > 40 ||
    !/^(0|[1-9][0-9]*)$/u.test(value)
  ) {
    throw new CrowdyAgentError(
      'AGENT_TOOL_INPUT_INVALID',
      `${field} must be a decimal string`,
      { field },
    );
  }
}

function assertLeaseScope(value: string): asserts value is PlayerHostLeaseScope {
  if (
    ![
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
    ].includes(value)
  ) {
    throw new CrowdyAgentError(
      'AGENT_LEASE_SCOPE_MISSING',
      `Unknown Play lease scope ${value}`,
    );
  }
}

function asLeaseScope(value: string): PlayerHostLeaseScope {
  assertLeaseScope(value);
  return value;
}
