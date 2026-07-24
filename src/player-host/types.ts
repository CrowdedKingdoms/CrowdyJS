import type {
  CrowdyAgentApprovalPolicy,
  CrowdyAgentPreemptionReason,
  CrowdyAgentToolRisk,
} from '../crowdy-agent/types.js';
import type { AgentErrorV1 } from '../crowdy-agent/errors.js';

/** Decimal strings avoid coordinate precision loss across GraphQL and JSON. */
export interface PlayerHostVector3V1 {
  readonly x: string;
  readonly y: string;
  readonly z: string;
}

export interface PlayerHostLookV1 {
  readonly yaw: string;
  readonly pitch: string;
}

export type PlayerHostLeaseScope =
  | 'observe'
  | 'locomotion'
  | 'interact'
  | 'craft'
  | 'combat'
  | 'communicate'
  | 'travel'
  | 'grid'
  | 'trust_consent'
  | 'commerce';

export type PlayerHostCommandKind =
  | 'MOVE'
  | 'LOOK'
  | 'STOP'
  | 'INVENTORY_SELECT'
  | 'INVENTORY_CONSUME'
  | 'INVENTORY_TRANSFER'
  | 'INTERACT'
  | 'CRAFT'
  | 'MOUNT'
  | 'COMBAT_ATTACK'
  | 'CHAT_SEND'
  | 'TRAVEL_TELEPORT';

export interface PlayerHostCommandCapabilityV1 {
  readonly kind: PlayerHostCommandKind;
  readonly toolName: string;
  readonly requiredScope?: PlayerHostLeaseScope;
  readonly risk: CrowdyAgentToolRisk;
  readonly approval: CrowdyAgentApprovalPolicy;
  readonly rateLimitPerSecond: number;
}

export interface PlayerHostCapabilitiesV1 {
  readonly contractVersion: 'crowdy.player-host/1';
  readonly gameId: string;
  readonly revision: string;
  readonly controlledEntityId: string;
  readonly commands: readonly PlayerHostCommandCapabilityV1[];
  readonly observation: {
    readonly maxAgeMs: number;
    readonly maxNearbyActors: number;
    readonly maxNearbyVoxels: number;
  };
  readonly advertisedAt: string;
}

export interface ObserveRequestV1 {
  readonly detail: 'MINIMAL' | 'STANDARD' | 'TACTICAL';
  readonly maxNearbyActors: number;
  readonly maxNearbyVoxels: number;
}

export interface GameObservationActorV1 {
  readonly actorId: string;
  readonly kind: 'PLAYER' | 'NPC' | 'MOB' | 'OBJECT' | 'VEHICLE';
  readonly position: PlayerHostVector3V1;
  readonly distance: string;
  readonly disposition: 'SELF' | 'FRIENDLY' | 'NEUTRAL' | 'HOSTILE' | 'UNKNOWN';
  readonly label?: string;
  readonly health?: string;
}

export interface GameObservationInventoryV1 {
  readonly selectedSlot: number;
  readonly slots: readonly {
    readonly slot: number;
    readonly itemId: string;
    readonly quantity: number;
    readonly usable: boolean;
  }[];
  readonly craftableRecipeIds: readonly string[];
}

export interface GameObservationV1 {
  readonly contractVersion: 'crowdy.game-observation/1';
  readonly observationId: string;
  readonly capabilityRevision: string;
  readonly controlledEntityId: string;
  readonly observedAt: string;
  readonly expiresAt: string;
  readonly player: {
    readonly position: PlayerHostVector3V1;
    readonly velocity: PlayerHostVector3V1;
    readonly look: PlayerHostLookV1;
    readonly health: string;
    readonly alive: boolean;
  };
  readonly controlledEntity: {
    readonly kind: 'PLAYER' | 'MOUNT' | 'VEHICLE';
    readonly position: PlayerHostVector3V1;
    readonly velocity: PlayerHostVector3V1;
  };
  readonly target?: {
    readonly targetId: string;
    readonly kind: 'ACTOR' | 'VOXEL' | 'OBJECT' | 'NONE';
    readonly distance: string;
  };
  readonly inventory?: GameObservationInventoryV1;
  readonly grid?: {
    readonly gridRef: string;
    readonly low: PlayerHostVector3V1;
    readonly high: PlayerHostVector3V1;
    readonly effectiveScopes: readonly PlayerHostLeaseScope[];
  };
  readonly nearbyActors: readonly GameObservationActorV1[];
  readonly nearbyVoxels: readonly {
    readonly position: PlayerHostVector3V1;
    readonly material: string;
    readonly interaction: 'NONE' | 'MINE' | 'PLACE' | 'USE';
  }[];
  readonly inputState: {
    readonly modalOpen: boolean;
    readonly textInputFocused: boolean;
    readonly humanInputActive: boolean;
  };
}

interface PlannedCommandV1 {
  readonly observationId: string;
  readonly capabilityRevision: string;
  readonly controlledEntityId: string;
}

export interface GameMoveCommandV1 extends PlannedCommandV1 {
  readonly kind: 'MOVE';
  readonly direction: 'FORWARD' | 'BACKWARD' | 'LEFT' | 'RIGHT' | 'UP' | 'DOWN';
  readonly intensity: number;
  readonly durationMs: number;
}

export interface GameLookCommandV1 extends PlannedCommandV1 {
  readonly kind: 'LOOK';
  readonly deltaYaw: number;
  readonly deltaPitch: number;
}

export interface GameStopCommandV1 {
  readonly kind: 'STOP';
}

export interface GameInventorySelectCommandV1 extends PlannedCommandV1 {
  readonly kind: 'INVENTORY_SELECT';
  readonly slot: number;
}

export interface GameInventoryConsumeCommandV1 extends PlannedCommandV1 {
  readonly kind: 'INVENTORY_CONSUME';
  readonly slot: number;
  readonly quantity: number;
}

export interface GameInventoryTransferCommandV1 extends PlannedCommandV1 {
  readonly kind: 'INVENTORY_TRANSFER';
  readonly direction: 'TO_CONTAINER' | 'FROM_CONTAINER';
  readonly slot: number;
  readonly quantity: number;
  readonly containerRef: string;
}

export interface GameInteractCommandV1 extends PlannedCommandV1 {
  readonly kind: 'INTERACT';
  readonly action: 'MINE' | 'PLACE' | 'USE' | 'FISH' | 'NPC_TALK';
  readonly targetRef: string;
  readonly inventorySlot?: number;
}

export interface GameCraftCommandV1 extends PlannedCommandV1 {
  readonly kind: 'CRAFT';
  readonly recipeId: string;
  readonly quantity: number;
}

export interface GameMountCommandV1 extends PlannedCommandV1 {
  readonly kind: 'MOUNT';
  readonly action: 'MOUNT' | 'DISMOUNT';
  readonly mountRef?: string;
}

export interface GameCombatAttackCommandV1 extends PlannedCommandV1 {
  readonly kind: 'COMBAT_ATTACK';
  readonly targetRef: string;
  readonly attack: 'PRIMARY' | 'SECONDARY';
}

export interface GameChatSendCommandV1 extends PlannedCommandV1 {
  readonly kind: 'CHAT_SEND';
  readonly channel: 'LOCAL' | 'GROUP';
  readonly text: string;
}

export interface GameTravelTeleportCommandV1 extends PlannedCommandV1 {
  readonly kind: 'TRAVEL_TELEPORT';
  readonly destinationRef: string;
}

export type GameCommandV1 =
  | GameMoveCommandV1
  | GameLookCommandV1
  | GameStopCommandV1
  | GameInventorySelectCommandV1
  | GameInventoryConsumeCommandV1
  | GameInventoryTransferCommandV1
  | GameInteractCommandV1
  | GameCraftCommandV1
  | GameMountCommandV1
  | GameCombatAttackCommandV1
  | GameChatSendCommandV1
  | GameTravelTeleportCommandV1;

export interface GameCommandResultV1 {
  readonly contractVersion: 'crowdy.game-command-result/1';
  readonly status: 'SUCCEEDED' | 'FAILED' | 'DENIED' | 'OUTCOME_UNKNOWN';
  readonly commandKind: PlayerHostCommandKind;
  readonly observationId?: string;
  readonly details?: readonly {
    readonly name: string;
    readonly value: string;
  }[];
  readonly error?: AgentErrorV1;
}

/** Created only by AgentControlLeaseManager after all local checks pass. */
export interface ValidatedGateV1 {
  readonly contractVersion: 'crowdy.validated-gate/1';
  readonly clientEpoch: string;
  readonly leaseId?: string;
  readonly scopes: readonly PlayerHostLeaseScope[];
  readonly contextVersion: string;
  readonly observationId?: string;
  readonly validatedAt: string;
}

/**
 * Game integration boundary. Implementations call the same typed intent
 * services used by human input; they never expose SDK, DOM, transport, or host
 * call escape hatches.
 */
export interface PlayerHostAdapterV1 {
  readonly contractVersion: 'crowdy.player-host/1';
  capabilities(): Promise<PlayerHostCapabilitiesV1>;
  observe(request: ObserveRequestV1): Promise<GameObservationV1>;
  dispatch(
    command: GameCommandV1,
    gate: ValidatedGateV1,
  ): Promise<GameCommandResultV1>;
  clearAgentIntent(reason: CrowdyAgentPreemptionReason): void;
}
