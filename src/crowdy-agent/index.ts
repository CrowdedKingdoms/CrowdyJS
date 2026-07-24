import { CrowdyAgentToolRegistry } from './registry.js';
import { CROWDY_AGENT_TOOL_DESCRIPTORS_V1 } from './tool-descriptors.js';

/** Frozen minimum registry for `crowdy.agent-tools/1`. */
export const CROWDY_AGENT_TOOL_REGISTRY_V1 = new CrowdyAgentToolRegistry(
  CROWDY_AGENT_TOOL_DESCRIPTORS_V1,
);
export const CROWDY_AGENT_REGISTRY_V1 = CROWDY_AGENT_TOOL_REGISTRY_V1;

export {
  CrowdyAgentBrowserToolDispatcher,
  type CrowdyAgentBrowserDispatcherOptionsV1,
  type CrowdyAgentBrowserToolContextV1,
  type CrowdyAgentBrowserToolHandlerV1,
  type CrowdyAgentBrowserToolHandlersV1,
} from './browser-dispatcher.js';
export {
  CrowdyStudioAgentController,
  CrowdyStudioAgentController as CrowdyStudioAgentClient,
  type CrowdyStudioAgentConnectionState,
  type CrowdyStudioAgentControllerOptionsV1,
  type CrowdyStudioAgentStateV1,
} from './controller.js';
export {
  CrowdyAgentGraphQLTransport,
  type CrowdyAgentGraphQLSubscriptionClient,
  type CrowdyAgentGraphQLTransportOptions,
} from './graphql-transport.js';
export {
  CROWDY_AGENT_ERROR_CODES,
  CrowdyAgentError,
  CrowdyAgentOutcomeUnknownError,
  toAgentError,
  type AgentErrorV1,
  type CrowdyAgentErrorCode,
} from './errors.js';
export {
  FORBIDDEN_AGENT_TOOL_SURFACES,
  CrowdyAgentToolRegistry,
  isDescriptorDigest,
  type CrowdyAgentRegistryFilter,
} from './registry.js';
export {
  FORBIDDEN_AGENT_AUTHORITY_FIELDS,
  assertBoundedJsonSchema,
  canonicalJson,
  deepFreeze,
  digestCanonicalJson,
  isDecimalString,
  sha256Digest,
  validateJsonSchemaValue,
  type JsonPrimitive,
  type JsonSchema,
  type JsonSchemaArray,
  type JsonSchemaBoolean,
  type JsonSchemaNull,
  type JsonSchemaNumber,
  type JsonSchemaObject,
  type JsonSchemaString,
  type JsonSchemaUnion,
  type JsonSchemaValidationOptions,
} from './schema.js';
export { CROWDY_AGENT_TOOL_DESCRIPTORS_V1 } from './tool-descriptors.js';
export {
  createCrowdyStudioAgentTools,
  crowdyStudioAgentProjectTargets,
  type CrowdyStudioAgentToolsOptionsV1,
} from './studio-tools.js';
export {
  CROWDY_AGENT_GRAPHQL_OPERATIONS_V1,
  type CrowdyAgentAttachResultV1,
  type CrowdyAgentConnectionV1,
  type CrowdyAgentCreateSessionInputV1,
  type CrowdyAgentEdgeV1,
  type CrowdyAgentEventSubscriptionHandlersV1,
  type CrowdyAgentEventSubscriptionV1,
  type CrowdyAgentHistoryPageV1,
  type CrowdyAgentPageInfoV1,
  type CrowdyStudioAgentTransportV1,
} from './transport.js';
export { CROWDY_AGENT_EVENT_TYPES } from './types.js';
export type {
  CrowdyAgentApprovalPolicy,
  CrowdyAgentApprovalStatus,
  CrowdyAgentApprovalV1,
  CrowdyAgentBudgetDimensionV1,
  CrowdyAgentBudgetV1,
  CrowdyAgentHeartbeatV1,
  CrowdyAgentCheckpointFileV1,
  CrowdyAgentCheckpointV1,
  CrowdyAgentEventPayloadMap,
  CrowdyAgentEventType,
  CrowdyAgentEventV1,
  CrowdyAgentIdempotencyClass,
  CrowdyAgentLeaseStatus,
  CrowdyAgentLeaseV1,
  CrowdyAgentMessageV1,
  CrowdyAgentMode,
  CrowdyAgentPreemptionReason,
  CrowdyAgentRedactionAction,
  CrowdyAgentRedactionRuleV1,
  CrowdyAgentRegisteredToolV1,
  CrowdyAgentRunStatus,
  CrowdyAgentRunV1,
  CrowdyAgentScopeRequirementV1,
  CrowdyAgentSessionStatus,
  CrowdyAgentSessionV1,
  CrowdyAgentToolCallStatus,
  CrowdyAgentToolCallAckV1,
  CrowdyAgentToolDescriptorV1,
  CrowdyAgentToolExecutor,
  CrowdyAgentToolInvocationV1,
  CrowdyAgentToolResultStatus,
  CrowdyAgentToolResultV1,
  CrowdyAgentToolRisk,
  CrowdyAgentToolTimelineItemV1,
} from './types.js';
