/**
 * CrowdyJS SDK - Client SDK for Crowded Kingdoms GraphQL API.
 *
 * Usage:
 *
 *   import { CrowdyClient } from '@crowdedkingdomstudios/crowdyjs';
 *
 *   const client = new CrowdyClient({ graphqlEndpoint, wsEndpoint });
 *   const { token } = await client.auth.login({ email, password });
 *   const me = await client.users.me();
 *   const myOrgs = await client.orgs.myOrganizations();
 *   const checkout = await client.payments.createCheckout({ ... });
 *   const unsub = client.udp.subscribe({ onActorUpdate: (n) => { ... } });
 */

import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { version: VERSION } = require('../package.json') as { version: string };

export { VERSION };
console.log(`CrowdyJS v${VERSION}`);

export { CrowdyClient, type CrowdyClientConfig } from './crowdy-client.js';

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
  UdpNotification,
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
export type { UdpNotificationHandlers } from './subscriptions.js';

// -----------------------------------------------------------------------------
// Domain wrappers (exported so consumers can reference the API surface in
// their own type annotations).
// -----------------------------------------------------------------------------
export { AuthAPI } from './domains/auth.js';
export { UsersAPI } from './domains/users.js';
export { OrganizationsAPI } from './domains/organizations.js';
export { AppsAPI } from './domains/apps.js';
export { AppAccessAPI } from './domains/appAccess.js';
export { BillingAPI } from './domains/billing.js';
export { QuotasAPI } from './domains/quotas.js';
export { PaymentsAPI } from './domains/payments.js';
export { ChunksAPI } from './domains/chunks.js';
export { VoxelsAPI } from './domains/voxels.js';
export { ActorsAPI } from './domains/actors.js';
export { TeleportAPI } from './domains/teleport.js';
export { StateAPI } from './domains/state.js';
export { ServerStatusAPI } from './domains/serverStatus.js';
export { UdpAPI } from './domains/udp.js';

// -----------------------------------------------------------------------------
// Re-export schema-derived input/output types and enums from codegen.
// Consumers can `import type { CreateOrganizationInput } from '@crowdedkingdomstudios/crowdyjs'`
// and get the schema's input shape.
// -----------------------------------------------------------------------------
export type {
  // UDP / replication input shapes (now sourced from codegen so BigInt
  // fields are typed `string` and match the wire format).
  ChunkCoordinatesInput,
  VoxelCoordinatesInput,
  ActorUpdateRequestInput,
  VoxelUpdateRequestInput,
  ClientAudioPacketInput,
  ClientTextPacketInput,
  ClientEventNotificationInput,
  UdpProxyConnectionStatus,

  // Inputs
  LoginUserInput,
  RegisterUserInput,
  ResetPasswordInput,
  CreateOrganizationInput,
  CreateOrgTokenInput,
  UpdateOrgTokenInput,
  CreateOrgRoleInput,
  UpdateOrgRoleInput,
  InviteOrgMemberInput,
  CreateAppInput,
  UpdateAppInput,
  AppMarketplaceFilterInput,
  CreateAccessTierInput,
  UpdateAccessTierInput,
  GrantAppAccessInput,
  CreateCheckoutInput,
  CheckoutFilterInput,
  SetQuotaInput,
  CreateActorInput,
  UpdateActorInput,
  ActorFilterInput,
  BatchActorLookupInput,
  CreateUserAppStateInput,
  UpdateUserStateInput,
  UpdateAvatarStateInput,
  UpdateActorStateInput,
  UpdateGamertagInput,
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

  // Outputs
  Organization,
  OrgMember,
  OrgRole,
  OrgToken,
  OrgPermission,
  OrgMembership,
  App,
  AppsPage,
  AppAccessTier,
  AppUserAccess,
  AppBudget,
  OrgWallet,
  WalletTransaction,
  Checkout,
  CheckoutsPage,
  ServiceQuota,
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
  UsersPage,

  // Scalars passthrough
  Scalars,
} from './generated/graphql.js';

// Re-export schema enums as values (so consumers can switch on them).
export {
  PaymentProvider,
  CheckoutPurpose,
  CheckoutStatus,
  AppVisibility,
  AppStatus,
  ServerState,
} from './generated/graphql.js';
