/**
 * CrowdyJS SDK - Client SDK for Crowded Kingdoms GraphQL API
 */

import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { version: VERSION } = require('../package.json') as { version: string };

export { VERSION };
console.log(`CrowdyJS v${VERSION}`);

export { CrowdyClient } from './crowdy-client.js';

// -----------------------------------------------------------------------------
// Hand-written types for the existing replication / subscription API.
// These remain the canonical types for `sendActorUpdate`, `onActorUpdate`,
// etc. They are not re-generated.
// -----------------------------------------------------------------------------
export type {
  CrowdyClientConfig,
  BigInt,
  ChunkCoordinates,
  ChunkCoordinatesInput,
  VoxelCoordinates,
  VoxelCoordinatesInput,
  UdpErrorCode,
  User,
  AuthResponse,
  UdpProxyConnectionStatus,
  ActorUpdateRequestInput,
  VoxelUpdateRequestInput,
  ClientAudioPacketInput,
  ClientTextPacketInput,
  ClientEventNotificationInput,
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

// -----------------------------------------------------------------------------
// Domain wrapper classes -- exported so consumers can reference the API
// surface in their own type annotations.
// -----------------------------------------------------------------------------
export { AuthAPI } from './domains/auth.js';
export { UsersAPI } from './domains/users.js';
export { OrganizationsAPI } from './domains/organizations.js';
export { AppsAPI } from './domains/apps.js';
export { AppAccessAPI } from './domains/appAccess.js';
export { BillingAPI } from './domains/billing.js';
export { QuotasAPI } from './domains/quotas.js';
export { ChunksAPI } from './domains/chunks.js';
export { VoxelsAPI } from './domains/voxels.js';
export { ActorsAPI } from './domains/actors.js';
export { TeleportAPI } from './domains/teleport.js';
export { StateAPI } from './domains/state.js';
export { ServerStatusAPI } from './domains/serverStatus.js';
export { GroupsAPI } from './domains/groups.js';

// -----------------------------------------------------------------------------
// Re-export generated GraphQL types (inputs, outputs, enums, query/mutation
// data + variables shapes) from the codegen module.
//
// Consumers can `import type { CreateOrganizationInput } from '@crowdedkingdomstudios/crowdyjs'`
// and get the schema-derived input type.
// -----------------------------------------------------------------------------
export type {
  // Inputs
  CreateOrganizationInput,
  CreateOrgTokenInput,
  InviteOrgMemberInput,
  CreateAccessTierInput,
  GrantAppAccessInput,
  SetQuotaInput,
  CreateActorInput,
  UpdateActorInput,
  ActorFilterInput,
  BatchActorLookupInput,
  CreateGroupInput,
  UpdateGroupInput,
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
  LoginUserInput,
  RegisterUserInput,
  ResetPasswordInput,
  LodDataInput,
  VoxelStateInput,
  // Output object types
  Organization,
  OrgMember,
  OrgToken,
  AppAccessTier,
  AppUserAccess,
  AppBudget,
  OrgWallet,
  WalletTransaction,
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
  Group,
  GroupMembership,
  ServerStatus,
  GraphQlServer,
  ServerVersionInfo,
  VersionInfo,
  // Scalars passthrough (string-typed in our codegen config)
  Scalars,
} from './generated/graphql.js';

// Re-export schema enums as values (so consumers can switch on them).
export {
  GroupMemberType,
  PaymentLinkType,
  ServerState,
} from './generated/graphql.js';
