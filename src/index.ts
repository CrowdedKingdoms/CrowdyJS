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
 * Authentication is **passwordless** (as of v8): sign in with an emailed magic
 * link, a federated social provider, or — in dev — the dev bypass. The returned
 * identity session token is stored on the shared `AuthState` automatically.
 * Gameplay uses app-scoped tokens minted via `client.portal` (see the two-client
 * pattern in the README).
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
 *   // passwordless sign-in (magic link): emails a one-time link
 *   await client.auth.requestLoginLink({ email });
 *   // ...user clicks the link; the landing page calls:
 *   const { user } = await client.auth.completeLoginLink(tokenFromUrl);
 *   const me = await client.users.me();
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
export const VERSION = '8.2.0';

export { LbCookieStore } from './lb-cookie-store.js';
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
  CombatKit,
  EconomyKit,
  GameKitClient,
  InventoryKit,
  LootKit,
  NpcsKit,
  ObjectsKit,
  PlotsKit,
  ProgressionKit,
  QuestsKit,
  andPolicies,
  combatBlueprint,
  combatNames,
  composeBlueprints,
  economyBlueprint,
  economyCurrencyFn,
  economyNames,
  featureGate,
  inventoryBlueprint,
  inventoryNames,
  kitInvoke,
  kitPolicyJson,
  lockBlueprint,
  lockNames,
  lootBlueprint,
  lootNames,
  lootRollFn,
  mergeBlueprints,
  npcBehaviorFunctionName,
  npcBlueprint,
  ownerEqualsCaller,
  ownerMirrorProperty,
  ownerEquals,
  plotBlueprint,
  plotNames,
  progressionBlueprint,
  progressionNames,
  questsBlueprint,
  questsNames,
  toKitInvokeResult,
  trustedAuthorityFields,
  type CombatBlueprintOptions,
  type CombatKitOptions,
  type CombatNames,
  type EconomyBlueprintOptions,
  type EconomyKitOptions,
  type EconomyNames,
  type GameKitOptions,
  type InventoryBlueprintOptions,
  type InventoryKitOptions,
  type InventoryNames,
  type KitAchievementDef,
  type KitAchievementUnlock,
  type KitAutomationSpec,
  type KitAutomationTriggerSpec,
  type KitBlueprint,
  type KitCombatant,
  type KitDeployResult,
  type KitInvokePolicy,
  type KitInvokeResult,
  type KitItemStack,
  type KitLootRoll,
  type KitMarketListing,
  type KitNpc,
  type KitOwnerIdKind,
  type KitPlot,
  type KitProgress,
  type KitQuestDef,
  type KitQuestProgress,
  type KitSelectorSpec,
  type KitShopListing,
  type KitSkillDef,
  type KitSkillRank,
  type KitStatusEffect,
  type KitTradeOffer,
  type KitTrustedAuthority,
  type KitWallet,
  type LockAuthority,
  type LockBlueprintOptions,
  type LockNames,
  type LootBlueprintOptions,
  type LootDropSpec,
  type LootEntrySpec,
  type LootKitOptions,
  type LootNames,
  type LootTableSpec,
  type MergedBlueprints,
  type NpcBehaviorSpec,
  type NpcBehaviorTrigger,
  type NpcBlueprintOptions,
  type NpcsKitOptions,
  type ObjectsKitOptions,
  type PlotBlueprintOptions,
  type PlotNames,
  type PlotsKitOptions,
  type ProgressionBlueprintOptions,
  type ProgressionKitOptions,
  type ProgressionNames,
  type QuestAdvanceSpec,
  type QuestsBlueprintOptions,
  type QuestsKitOptions,
  type QuestsNames,
  type SelectorPermissionPredicate,
} from './kit/index.js';
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
export {
  AuthAPI,
  type AuthResponse,
  type AuthUser,
  type UserIdentity,
} from './domains/auth.js';
export { UsersAPI } from './domains/users.js';
export { AppsAPI, type AppRoute } from './domains/apps.js';
export {
  PortalAPI,
  BrowserSessionPkceStore,
  PortalConsentRequiredError,
  type AppTokenResponse,
  type PortalAuthorizationCode,
  type PortalConsentState,
  type AppAuthorizationGrant,
  type PkceStore,
  type BeginEntryParams,
} from './domains/portal.js';
export { generatePkcePair, generateState, type PkcePair } from './pkce.js';
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
