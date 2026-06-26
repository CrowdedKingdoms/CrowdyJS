/**
 * CrowdyJS SDK — client SDK for Crowded Kingdoms.
 *
 * As of the management/game-api split, the SDK targets **two** GraphQL
 * endpoints behind a single `CrowdyClient`:
 *
 *   - `cks-management-api` for identity (`client.auth`, `client.users`).
 *     This is where `game_tokens` get minted.
 *   - `cks-game-api` for everything game-side (`client.chunks`,
 *     `client.voxels`, `client.actors`, `client.teleport`, `client.state`,
 *     `client.serverStatus`, `client.udp`).
 *
 * Both clients share a single `AuthState` so the token returned by
 * `client.auth.login()` is automatically attached to every subsequent
 * request, regardless of which endpoint serves it.
 *
 * Usage:
 *
 *   import { CrowdyClient } from '@crowdedkingdoms/crowdyjs';
 *
 *   const client = new CrowdyClient({
 *     httpUrl: 'https://dev-game-api.crowdedkingdoms.com',
 *     wsUrl:   'wss://dev-game-api.crowdedkingdoms.com',
 *     managementUrl: 'https://dev-management-api.crowdedkingdoms.com',
 *   });
 *
 *   const { token, user } = await client.auth.login({ email, password });
 *   const me = await client.users.me();
 *   const unsub = client.udp.subscribe({ actorUpdate: (n) => { ... } }, appId);
 *
 * As of v6 the SDK wraps the **full** public surface of both APIs, namespaced
 * by audience: the game-client surface (`auth`, `users`, `udp`, `world`,
 * `chunks`/`voxels`/`actors`/`avatars`/`state`/`teleport`/`channels`/`teams`/
 * `gameModel`/`host`), the privileged studio-admin surface grouped under
 * `client.admin` (`organizations`, `appAccess`, `billing`, `payments`,
 * `quotas`, `environments`, `usage`, `sharedEnvironment`, `gameApps`; also
 * available top-level), and the operator control-plane surface under
 * `client.operator` (requires `is_operator`). Admin/operator calls still
 * require the appropriate token + permission — the server enforces them; the
 * SDK only provides typed wrappers. Drive admin/operator from a studio backend
 * or internal tooling, never an untrusted browser.
 */

/** The published package version. Mirrors `package.json`. */
export const VERSION = '1.0.1';

export {
  CrowdyClient,
  createCrowdyClient,
  type CrowdyClientConfig,
} from './crowdy-client.js';
export {
  BrowserLocalStorageTokenStore,
  SessionStore,
  type SessionListener,
  type TokenStore,
} from './session.js';
export {
  GraphQLClient,
  GraphQLTransport,
  type GraphQLClientConfig,
} from './client.js';
export {
  RealtimeClient,
  type RealtimeConfig,
  type RealtimeStatus,
  type SpatialNotification,
  type UdpNotification,
  type UdpNotificationHandlers,
} from './realtime.js';
export { WorldClient, ActorClient, type ActorOptions } from './world.js';
export {
  CrowdyError,
  CrowdyGraphQLError,
  CrowdyHttpError,
  CrowdyNetworkError,
  CrowdyProtocolError,
  CrowdyRealtimeError,
  CrowdyTimeoutError,
} from './errors.js';
export {
  SequenceAllocator,
  decodeBase64,
  encodeBase64,
  generateCrowdyUuid,
  validateChunkCoordinates,
  validateCrowdyUuid,
} from './utils.js';

// -----------------------------------------------------------------------------
// Hand-written types kept ONLY for the subscription notification union and
// its handlers. The schema-derived codegen types are canonical for inputs
// and scalars (see "Re-export schema-derived ..." block below).
// -----------------------------------------------------------------------------
export type {
  BigInt,
  ChunkCoordinates,
  VoxelCoordinates,
  ActorUpdateNotification,
  ActorUpdateResponse,
  VoxelUpdateNotification,
  VoxelUpdateResponse,
  ClientAudioNotification,
  ClientTextNotification,
  ClientEventNotification,
  ServerEventNotification,
  GenericErrorResponse,
  ActorUpdateHandler,
  ActorUpdateResponseHandler,
  VoxelUpdateHandler,
  VoxelUpdateResponseHandler,
  ClientAudioHandler,
  ClientTextHandler,
  ClientEventHandler,
  ServerEventHandler,
  GenericErrorHandler,
  UnsubscribeFn,
} from './types.js';

export { UdpErrorCode } from './types.js';

// -----------------------------------------------------------------------------
// Domain wrappers.
// AuthAPI / UsersAPI / AppsAPI target cks-management-api; the rest target
// cks-game-api.
// -----------------------------------------------------------------------------
export { AuthAPI } from './domains/auth.js';
export { UsersAPI } from './domains/users.js';
export { AppsAPI, type AppRoute } from './domains/apps.js';
export { PlatformAPI, type PlatformConfig } from './domains/platform.js';
export { OrganizationsAPI } from './domains/organizations.js';
export { AppAccessAPI } from './domains/appAccess.js';
export { BillingAPI } from './domains/billing.js';
export { PaymentsAPI } from './domains/payments.js';
export { QuotasAPI } from './domains/quotas.js';
export { EnvironmentsAPI } from './domains/environments.js';
export { UsageAPI } from './domains/usage.js';
export { SharedEnvironmentAPI } from './domains/sharedEnvironment.js';
export { ControlPlaneAPI } from './domains/controlPlane.js';
export { AdminAPI } from './domains/admin.js';
export { AvatarsAPI } from './domains/avatars.js';
export { HostAPI } from './domains/host.js';
export { GameAppsAPI } from './domains/gameApps.js';
export { ChunksAPI } from './domains/chunks.js';
export { VoxelsAPI } from './domains/voxels.js';
export { ActorsAPI } from './domains/actors.js';
export { TeleportAPI } from './domains/teleport.js';
export { StateAPI } from './domains/state.js';
export { ServerStatusAPI } from './domains/serverStatus.js';
export { ChannelsAPI } from './domains/channels.js';
export { TeamsAPI } from './domains/teams.js';
export { UdpAPI } from './domains/udp.js';
export { GameModelAPI } from './domains/gameModel.js';

// -----------------------------------------------------------------------------
// Re-export schema-derived game-side input/output types and enums from
// codegen. Run `npm run codegen` against `cks-game-api/schema.gql` after
// schema changes; the management-side types are no longer included.
// -----------------------------------------------------------------------------
export type {
  ChunkCoordinatesInput,
  VoxelCoordinatesInput,
  ActorUpdateRequestInput,
  VoxelUpdateRequestInput,
  ClientAudioPacketInput,
  ClientTextPacketInput,
  ClientEventNotificationInput,
  UdpProxyConnectionStatus,
  RealtimeConnectionEvent,
  GameClientBootstrap,

  // Management-api auth surface (used by AuthAPI / UsersAPI).
  LoginUserInput,
  RegisterUserInput,
  ResetPasswordInput,
  UpdateGamertagInput,

  CreateActorInput,
  UpdateActorInput,
  ActorFilterInput,
  BatchActorLookupInput,
  CreateUserAppStateInput,
  UpdateUserStateInput,
  UpdateAvatarStateInput,
  UpdateActorStateInput,
  UpdateChunkStateInput,
  UpdateChunkLodsInput,
  ChunkUpdateInput,
  UpdateVoxelInput,
  RollbackVoxelUpdatesInput,
  GetChunkInput,
  GetChunkLodsInput,
  GetChunksByDistanceInput,
  GetVoxelListInput,
  ListVoxelsInput,
  ListVoxelUpdatesByDistanceInput,
  TeleportRequestInput,
  LodDataInput,
  VoxelStateInput,

  Chunk,
  ChunkLodsResponse,
  ChunksByDistanceResponse,
  ChunkVoxelResponse,
  ChunkVoxelUpdatesResponse,
  Voxel,
  VoxelUpdatesByDistanceResponse,
  VoxelUpdateHistoryEvent,
  RollbackVoxelEventResult,
  Actor,
  Avatar,
  AvatarDto,
  TeleportResponse,
  UserAppState,
  ServerStatus,
  GraphQlServer,
  ServerVersionInfo,
  VersionInfo,
  PageInfo,
  UdpNotificationsSubscription,

  // Abstract game model (cks-game-api game-model module).
  GmContainer,
  GmContainerState,
  GmContainerType,
  GmPropertyDef,
  GmFunction,
  GmFunctionParam,
  GmFunctionMutation,
  GmSession,
  GmSessionParticipant,
  GmEdge,
  GmTraverseResult,
  GmInvokeResult,
  GmMutationApplied,
  GmEvent,
  GmTypeSchema,
  GmAppFeature,
  GmTierFeature,
  GmAppPolicy,
  GmSeedResult,
  UpsertContainerTypeInput,
  UpsertPropertyDefInput,
  UpsertFunctionInput,
  FunctionParamInput,
  FunctionMutationInput,
  SeedGameModelInput,
  SeedContainerInput,
  SeedContainerTypeInput,
  SeedPropertyDefInput,
  SeedFunctionInput,
  SeedEdgeInput,
  SeedPropertyInput,
  CreateSessionInput,
  JoinSessionInput,
  SetSessionTurnInput,
  CreateContainerInput,
  SetContainerPropertyInput,
  AddEdgeInput,
  InvokeFunctionInput,
  DefineAppFeatureInput,
  GrantTierFeatureInput,
  SetGameModelPolicyInput,

  Scalars,
} from './generated/graphql.js';

// -----------------------------------------------------------------------------
// Management-api admin surface input types (organizations, app-access,
// billing, payments, quotas) used by the studio-admin sub-clients.
// -----------------------------------------------------------------------------
export type {
  CreateAppInput,
  UpdateAppInput,
  CreateOrganizationInput,
  CreateOrgTokenInput,
  UpdateOrgTokenInput,
  InviteOrgMemberInput,
  CreateOrgRoleInput,
  UpdateOrgRoleInput,
  CreateAccessTierInput,
  UpdateAccessTierInput,
  GrantAppAccessInput,
  CreateCheckoutInput,
  CheckoutFilterInput,
  SetQuotaInput,
} from './generated/graphql.js';

export { ServerState, AppVisibility } from './generated/graphql.js';
