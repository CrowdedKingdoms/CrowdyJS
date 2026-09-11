/**
 * The player host contract: how a game exposes its world to the Studio agent
 * for observation, and the JSON schemas that bound what crosses that seam.
 *
 * The lease-based game-control machinery that used to live here (control
 * gate, lease manager, HUD banner, browser tool handlers) belonged to the
 * Crowdy Agent's PLAY mode and left with it. The DeepSeek Harness pane reads
 * the world through `PlayerHostAdapterV1.observe` only.
 */
export {
  GAME_COMMAND_RESULT_SCHEMA_V1,
  GAME_COMMAND_SCHEMAS_V1,
  GAME_COMMAND_SCHEMA_V1,
  GAME_OBSERVATION_SCHEMA_V1,
  OBSERVE_REQUEST_SCHEMA_V1,
  PLAYER_HOST_CAPABILITIES_SCHEMA_V1,
} from './schemas.js';
export {
  CROWDY_AGENT_ERROR_CODES,
  CrowdyAgentError,
  CrowdyAgentOutcomeUnknownError,
  toAgentError,
  type AgentErrorV1,
  type CrowdyAgentErrorCode,
} from './agent-errors.js';
export type {
  CrowdyAgentApprovalPolicy,
  CrowdyAgentPreemptionReason,
  CrowdyAgentToolRisk,
} from './agent-types.js';
export {
  assertBoundedJsonSchema,
  canonicalJson,
  deepFreeze,
  digestCanonicalJson,
  isDecimalString,
  sha256Digest,
  validateJsonSchemaValue,
  type JsonSchema,
  type JsonSchemaArray,
  type JsonSchemaObject,
  type JsonSchemaString,
  type JsonSchemaUnion,
  type JsonSchemaValidationOptions,
} from './json-schema.js';
export type {
  GameChatSendCommandV1,
  GameCombatAttackCommandV1,
  GameCommandResultV1,
  GameCommandV1,
  GameCraftCommandV1,
  GameInteractCommandV1,
  GameInventoryConsumeCommandV1,
  GameInventorySelectCommandV1,
  GameInventoryTransferCommandV1,
  GameLookCommandV1,
  GameMountCommandV1,
  GameMoveCommandV1,
  GameObservationActorV1,
  GameObservationInventoryV1,
  GameObservationV1,
  GameStopCommandV1,
  GameTravelTeleportCommandV1,
  ObserveRequestV1,
  PlayerHostAdapterV1,
  PlayerHostCapabilitiesV1,
  PlayerHostCommandCapabilityV1,
  PlayerHostCommandKind,
  PlayerHostLeaseScope,
  PlayerHostLookV1,
  PlayerHostVector3V1,
  ValidatedGateV1,
} from './types.js';
