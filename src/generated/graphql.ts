import type { TypedDocumentNode as DocumentNode } from '@graphql-typed-document-node/core';
export type Maybe<T> = T | null;
export type InputMaybe<T> = Maybe<T>;
export type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] };
export type MakeOptional<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]?: Maybe<T[SubKey]> };
export type MakeMaybe<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]: Maybe<T[SubKey]> };
export type MakeEmpty<T extends { [key: string]: unknown }, K extends keyof T> = { [_ in K]?: never };
export type Incremental<T> = T | { [P in keyof T]?: P extends ' $fragmentName' | '__typename' ? T[P] : never };
/** All built-in and custom scalars, mapped to their actual values */
export type Scalars = {
  ID: { input: string; output: string; }
  String: { input: string; output: string; }
  Boolean: { input: boolean; output: boolean; }
  Int: { input: number; output: number; }
  Float: { input: number; output: number; }
  /** BigInt custom scalar type. Input should be a string representation of a BigInt. */
  BigInt: { input: string; output: string; }
  /** A date-time string at UTC, such as 2019-12-03T09:54:33Z, compliant with the date-time format. */
  DateTime: { input: string; output: string; }
};

export type Actor = {
  __typename?: 'Actor';
  appId: Scalars['BigInt']['output'];
  avatarId: Maybe<Scalars['BigInt']['output']>;
  chunk: ChunkCoordinates;
  createdAt: Scalars['DateTime']['output'];
  privateState: Maybe<Scalars['String']['output']>;
  publicState: Maybe<Scalars['String']['output']>;
  userId: Scalars['BigInt']['output'];
  uuid: Scalars['ID']['output'];
};

export type ActorFilterInput = {
  appId?: InputMaybe<Scalars['BigInt']['input']>;
  avatarId?: InputMaybe<Scalars['BigInt']['input']>;
  chunk?: InputMaybe<ChunkCoordinatesInput>;
  uuid?: InputMaybe<Scalars['String']['input']>;
};

/** Notification received when an actor (player or NPC) state is updated by another client or the server. Received via the udpNotifications subscription. */
export type ActorUpdateNotification = {
  __typename?: 'ActorUpdateNotification';
  /** The ID of the app where the actor is located. */
  appId: Scalars['BigInt']['output'];
  /** The X coordinate of the chunk where the actor is located. */
  chunkX: Scalars['BigInt']['output'];
  /** The Y coordinate of the chunk where the actor is located. */
  chunkY: Scalars['BigInt']['output'];
  /** The Z coordinate of the chunk where the actor is located. */
  chunkZ: Scalars['BigInt']['output'];
  /** Decay algorithm (0-5) from the original message. */
  decayRate: Scalars['Int']['output'];
  /** Chunk replication distance (0-8) from the original message. */
  distance: Scalars['Int']['output'];
  /** Server-generated epoch milliseconds timestamp. */
  epochMillis: Scalars['BigInt']['output'];
  /** The sender's sequence number for this message (0-255). */
  sequenceNumber: Scalars['Int']['output'];
  /** The actor state data, base64-encoded. Decode this to get the full ActorState containing position, rotation, velocity, animation flags, etc. */
  state: Scalars['String']['output'];
  /** The unique identifier of the actor that was updated. */
  uuid: Scalars['String']['output'];
};

/** Input for sending an actor update request to the UDP game server. This updates the state of an actor (player character or NPC) in a specific chunk. */
export type ActorUpdateRequestInput = {
  /** The ID of the app where the actor is located. */
  appId: Scalars['BigInt']['input'];
  /** The chunk coordinates where the actor is located. A chunk is a 16x16x16 voxel cube. */
  chunk: ChunkCoordinatesInput;
  /** Decay algorithm for replication: 0 = none, 1 = exponential, 2 = linear 50%, 3 = linear 25%, 4 = linear 10%, 5 = linear 5%. Defaults to 1 (exponential) for actor updates. */
  decayRate?: InputMaybe<Scalars['Int']['input']>;
  /** Chunk replication distance (0-8). Defaults to 8 for actor updates. Clamped to 0-8. */
  distance?: InputMaybe<Scalars['Int']['input']>;
  /** Client's sequence number for this message (0-255, wraps). Used to match error responses. */
  sequenceNumber?: InputMaybe<Scalars['Int']['input']>;
  /** The actor state data, base64-encoded. May be an empty string for registration-only updates (no state payload). */
  state: Scalars['String']['input'];
  /** A unique identifier for the actor. Must be exactly 32 bytes when encoded as UTF-8. This is typically a client-generated UUID. */
  uuid: Scalars['String']['input'];
};

/** Response from the UDP game server for an actor update request. Received via the udpNotifications subscription. */
export type ActorUpdateResponse = {
  __typename?: 'ActorUpdateResponse';
  /** The ID of the app where the actor update was processed. */
  appId: Scalars['BigInt']['output'];
  /** The X coordinate of the chunk where the actor is located. */
  chunkX: Scalars['BigInt']['output'];
  /** The Y coordinate of the chunk where the actor is located. */
  chunkY: Scalars['BigInt']['output'];
  /** The Z coordinate of the chunk where the actor is located. */
  chunkZ: Scalars['BigInt']['output'];
  /** Decay algorithm (0-5) from the original message. */
  decayRate: Scalars['Int']['output'];
  /** Chunk replication distance (0-8) from the original message. */
  distance: Scalars['Int']['output'];
  /** Server-generated epoch milliseconds timestamp. */
  epochMillis: Scalars['BigInt']['output'];
  /** The sequence number echoed back from the request, used to correlate responses. */
  sequenceNumber: Scalars['Int']['output'];
  /** The unique identifier of the actor that was updated. */
  uuid: Scalars['String']['output'];
};

export type AppAccessTier = {
  __typename?: 'AppAccessTier';
  appId: Scalars['BigInt']['output'];
  billingPeriod: Maybe<Scalars['String']['output']>;
  createdAt: Scalars['DateTime']['output'];
  currency: Maybe<Scalars['String']['output']>;
  description: Maybe<Scalars['String']['output']>;
  isDefault: Scalars['Boolean']['output'];
  isFree: Scalars['Boolean']['output'];
  name: Scalars['String']['output'];
  priceCents: Maybe<Scalars['String']['output']>;
  status: Scalars['String']['output'];
  tierId: Scalars['ID']['output'];
  tierOrder: Scalars['Float']['output'];
  updatedAt: Scalars['DateTime']['output'];
};

export type AppBudget = {
  __typename?: 'AppBudget';
  appBudgetId: Scalars['ID']['output'];
  appId: Scalars['ID']['output'];
  createdAt: Scalars['DateTime']['output'];
  currentMonthUsageCents: Scalars['String']['output'];
  monthlyLimitCents: Maybe<Scalars['String']['output']>;
  orgId: Scalars['ID']['output'];
  periodStart: Scalars['DateTime']['output'];
  updatedAt: Scalars['DateTime']['output'];
};

export type AppUserAccess = {
  __typename?: 'AppUserAccess';
  appId: Scalars['BigInt']['output'];
  appUserAccessId: Scalars['ID']['output'];
  createdAt: Scalars['DateTime']['output'];
  expiresAt: Maybe<Scalars['DateTime']['output']>;
  grantedBy: Scalars['String']['output'];
  status: Scalars['String']['output'];
  subscriptionId: Maybe<Scalars['String']['output']>;
  tierId: Maybe<Scalars['ID']['output']>;
  updatedAt: Scalars['DateTime']['output'];
  userId: Scalars['BigInt']['output'];
};

export type AuthResponse = {
  __typename?: 'AuthResponse';
  gameTokenId: Scalars['String']['output'];
  token: Scalars['String']['output'];
  user: User;
};

export type Avatar = {
  __typename?: 'Avatar';
  avatarId: Scalars['ID']['output'];
  createdAt: Scalars['DateTime']['output'];
  name: Scalars['String']['output'];
  privateState: Maybe<Scalars['String']['output']>;
  publicState: Maybe<Scalars['String']['output']>;
  userId: Scalars['BigInt']['output'];
};

export type AvatarDto = {
  __typename?: 'AvatarDTO';
  avatarId: Scalars['ID']['output'];
  createdAt: Scalars['DateTime']['output'];
  name: Scalars['String']['output'];
  privateState: Maybe<Scalars['String']['output']>;
  publicState: Maybe<Scalars['String']['output']>;
  userId: Scalars['ID']['output'];
};

export type BatchActorLookupInput = {
  uuids: Array<Scalars['String']['input']>;
};

export type Chunk = {
  __typename?: 'Chunk';
  appId: Scalars['ID']['output'];
  cdnUploadedAt: Maybe<Scalars['DateTime']['output']>;
  chunkId: Scalars['ID']['output'];
  chunkState: Maybe<Scalars['String']['output']>;
  coordinates: ChunkCoordinates;
  createdAt: Scalars['DateTime']['output'];
  lods: Maybe<Array<LodData>>;
  owner: Maybe<Scalars['ID']['output']>;
  updatedAt: Scalars['DateTime']['output'];
  voxelStates: Array<VoxelState>;
  voxels: Maybe<Scalars['String']['output']>;
};

export type ChunkCoordinates = {
  __typename?: 'ChunkCoordinates';
  x: Scalars['BigInt']['output'];
  y: Scalars['BigInt']['output'];
  z: Scalars['BigInt']['output'];
};

export type ChunkCoordinatesInput = {
  x: Scalars['BigInt']['input'];
  y: Scalars['BigInt']['input'];
  z: Scalars['BigInt']['input'];
};

export type ChunkLodsResponse = {
  __typename?: 'ChunkLodsResponse';
  appId: Scalars['ID']['output'];
  chunkId: Scalars['ID']['output'];
  coordinates: ChunkCoordinates;
  lods: Array<LodData>;
  updatedAt: Scalars['DateTime']['output'];
};

export type ChunkUpdateInput = {
  appId: Scalars['BigInt']['input'];
  coordinates: ChunkCoordinatesInput;
  voxelStates?: InputMaybe<Array<VoxelStateInput>>;
  voxels?: InputMaybe<Scalars['String']['input']>;
};

export type ChunkVoxelResponse = {
  __typename?: 'ChunkVoxelResponse';
  coordinates: ChunkCoordinates;
  voxels: Array<Voxel>;
};

export type ChunkVoxelUpdatesResponse = {
  __typename?: 'ChunkVoxelUpdatesResponse';
  coordinates: ChunkCoordinates;
  voxels: Array<Voxel>;
};

export type ChunksByDistanceResponse = {
  __typename?: 'ChunksByDistanceResponse';
  chunks: Array<Chunk>;
  limit: Maybe<Scalars['Int']['output']>;
  skip: Maybe<Scalars['Int']['output']>;
};

/** Notification received when another client sends an audio packet (voice chat). Received via the udpNotifications subscription. */
export type ClientAudioNotification = {
  __typename?: 'ClientAudioNotification';
  /** The ID of the app where the audio is coming from. */
  appId: Scalars['BigInt']['output'];
  /** The compressed audio data, base64-encoded. */
  audioData: Scalars['String']['output'];
  /** The X coordinate of the chunk where the audio source is located. */
  chunkX: Scalars['BigInt']['output'];
  /** The Y coordinate of the chunk where the audio source is located. */
  chunkY: Scalars['BigInt']['output'];
  /** The Z coordinate of the chunk where the audio source is located. */
  chunkZ: Scalars['BigInt']['output'];
  /** Decay algorithm (0-5) from the original message. */
  decayRate: Scalars['Int']['output'];
  /** Chunk replication distance (0-8) from the original message. */
  distance: Scalars['Int']['output'];
  /** Server-generated epoch milliseconds timestamp. */
  epochMillis: Scalars['BigInt']['output'];
  /** The sender's sequence number for this message (0-255). */
  sequenceNumber: Scalars['Int']['output'];
  /** The unique identifier of the audio source (typically the player UUID sending the audio). */
  uuid: Scalars['String']['output'];
};

/** Input for sending a client audio packet (voice chat) to the UDP game server. The audio data is compressed and will be broadcast to nearby players. */
export type ClientAudioPacketInput = {
  /** The ID of the app where the audio is being sent from. */
  appId: Scalars['BigInt']['input'];
  /** The compressed audio data, base64-encoded. */
  audioData: Scalars['String']['input'];
  /** The chunk coordinates where the audio source is located. */
  chunk: ChunkCoordinatesInput;
  /** Decay algorithm for replication: 0 = none, 1 = exponential, 2 = linear 50%, 3 = linear 25%, 4 = linear 10%, 5 = linear 5%. Defaults to 0 (none) for audio packets. */
  decayRate?: InputMaybe<Scalars['Int']['input']>;
  /** Chunk replication distance (0-8). Defaults to 1 for audio packets. Clamped to 0-8. */
  distance?: InputMaybe<Scalars['Int']['input']>;
  /** Client's sequence number for this message (0-255, wraps). Used to match error responses. */
  sequenceNumber?: InputMaybe<Scalars['Int']['input']>;
  /** A unique identifier for the audio source (typically the player UUID). Must be exactly 32 bytes when encoded as UTF-8. */
  uuid: Scalars['String']['input'];
};

/** Notification received when another client sends a custom event. Received via the udpNotifications subscription. */
export type ClientEventNotification = {
  __typename?: 'ClientEventNotification';
  /** The ID of the app where the event is occurring. */
  appId: Scalars['BigInt']['output'];
  /** The X coordinate of the chunk where the event is located. */
  chunkX: Scalars['BigInt']['output'];
  /** The Y coordinate of the chunk where the event is located. */
  chunkY: Scalars['BigInt']['output'];
  /** The Z coordinate of the chunk where the event is located. */
  chunkZ: Scalars['BigInt']['output'];
  /** Decay algorithm (0-5) from the original message. */
  decayRate: Scalars['Int']['output'];
  /** Chunk replication distance (0-8) from the original message. */
  distance: Scalars['Int']['output'];
  /** Server-generated epoch milliseconds timestamp. */
  epochMillis: Scalars['BigInt']['output'];
  /** The event type ID (uint16). This determines how the event should be processed. */
  eventType: Scalars['Int']['output'];
  /** The sender's sequence number for this message (0-255). */
  sequenceNumber: Scalars['Int']['output'];
  /** The event state data, base64-encoded. The format is defined by the event type. */
  state: Scalars['String']['output'];
  /** The unique identifier of the object controlling this event. */
  uuid: Scalars['String']['output'];
};

/** Input for sending a client event notification to the UDP game server. Events are custom game events that can be used for various gameplay mechanics. The event type and state format are defined by the client/mod. */
export type ClientEventNotificationInput = {
  /** The ID of the app where the event is occurring. */
  appId: Scalars['BigInt']['input'];
  /** The chunk coordinates where the event is located. */
  chunk: ChunkCoordinatesInput;
  /** Decay algorithm for replication: 0 = none, 1 = exponential, 2 = linear 50%, 3 = linear 25%, 4 = linear 10%, 5 = linear 5%. Defaults to 0 (none) for events. */
  decayRate?: InputMaybe<Scalars['Int']['input']>;
  /** Chunk replication distance (0-8). Defaults to 8 for events. Clamped to 0-8. */
  distance?: InputMaybe<Scalars['Int']['input']>;
  /** The event type ID (uint16, 0-65535). This is a client-defined enum that determines how the event should be processed. */
  eventType: Scalars['Int']['input'];
  /** Client's sequence number for this message (0-255, wraps). Used to match error responses. */
  sequenceNumber?: InputMaybe<Scalars['Int']['input']>;
  /** The event state data, base64-encoded. The format is defined by the event type and is currently only processed by clients. */
  state: Scalars['String']['input'];
  /** A unique identifier for the object controlling this event. Must be exactly 32 bytes when encoded as UTF-8. */
  uuid: Scalars['String']['input'];
};

/** Notification received when another client sends a text message (chat). Received via the udpNotifications subscription. */
export type ClientTextNotification = {
  __typename?: 'ClientTextNotification';
  /** The ID of the app where the text message is coming from. */
  appId: Scalars['BigInt']['output'];
  /** The X coordinate of the chunk where the text source is located. */
  chunkX: Scalars['BigInt']['output'];
  /** The Y coordinate of the chunk where the text source is located. */
  chunkY: Scalars['BigInt']['output'];
  /** The Z coordinate of the chunk where the text source is located. */
  chunkZ: Scalars['BigInt']['output'];
  /** Decay algorithm (0-5) from the original message. */
  decayRate: Scalars['Int']['output'];
  /** Chunk replication distance (0-8) from the original message. */
  distance: Scalars['Int']['output'];
  /** Server-generated epoch milliseconds timestamp. */
  epochMillis: Scalars['BigInt']['output'];
  /** The sender's sequence number for this message (0-255). */
  sequenceNumber: Scalars['Int']['output'];
  /** The text message content, UTF-8 encoded. Display this to the user. */
  text: Scalars['String']['output'];
  /** The unique identifier of the text source (typically the player UUID sending the message). */
  uuid: Scalars['String']['output'];
};

/** Input for sending a text message (chat) to the UDP game server. The text will be broadcast to nearby players in the same chunk. */
export type ClientTextPacketInput = {
  /** The ID of the app where the text message is being sent from. */
  appId: Scalars['BigInt']['input'];
  /** The chunk coordinates where the text message source is located. */
  chunk: ChunkCoordinatesInput;
  /** Decay algorithm for replication: 0 = none, 1 = exponential, 2 = linear 50%, 3 = linear 25%, 4 = linear 10%, 5 = linear 5%. Defaults to 0 (none) for text packets. */
  decayRate?: InputMaybe<Scalars['Int']['input']>;
  /** Chunk replication distance (0-8). Defaults to 8 for text packets. Clamped to 0-8. */
  distance?: InputMaybe<Scalars['Int']['input']>;
  /** Client's sequence number for this message (0-255, wraps). Used to match error responses. */
  sequenceNumber?: InputMaybe<Scalars['Int']['input']>;
  /** The text message content, encoded as UTF-8. This will be displayed to nearby players. */
  text: Scalars['String']['input'];
  /** A unique identifier for the text source (typically the player UUID). Must be exactly 32 bytes when encoded as UTF-8. */
  uuid: Scalars['String']['input'];
};

/** Input for connecting to the UDP proxy. The server automatically selects the UDP game server with the least number of clients. This input type exists only because GraphQL requires input types to have at least one field - the _placeholder field can be ignored. */
export type ConnectUdpProxyInput = {
  /** Placeholder field (can be ignored). GraphQL requires input types to have at least one field. */
  _placeholder?: InputMaybe<Scalars['Boolean']['input']>;
};

export type CreateAccessTierInput = {
  appId: Scalars['BigInt']['input'];
  description?: InputMaybe<Scalars['String']['input']>;
  isDefault?: InputMaybe<Scalars['Boolean']['input']>;
  isFree?: InputMaybe<Scalars['Boolean']['input']>;
  name: Scalars['String']['input'];
  tierOrder?: InputMaybe<Scalars['Int']['input']>;
};

export type CreateActorInput = {
  appId: Scalars['BigInt']['input'];
  avatarId?: InputMaybe<Scalars['BigInt']['input']>;
  chunk: ChunkCoordinatesInput;
  privateState?: InputMaybe<Scalars['String']['input']>;
  publicState?: InputMaybe<Scalars['String']['input']>;
  uuid: Scalars['String']['input'];
};

export type CreateAvatarInput = {
  name?: InputMaybe<Scalars['String']['input']>;
};

export type CreateGridInput = {
  app_id: Scalars['BigInt']['input'];
  corner1: ChunkCoordinatesInput;
  corner2: ChunkCoordinatesInput;
};

export type CreateGridResponse = {
  __typename?: 'CreateGridResponse';
  error: UdpErrorCode;
  grid: Maybe<Grid>;
};

export type CreateGroupInput = {
  name: Scalars['String']['input'];
};

export type CreateOrgTokenInput = {
  label?: InputMaybe<Scalars['String']['input']>;
  orgId: Scalars['BigInt']['input'];
};

export type CreateOrganizationInput = {
  name: Scalars['String']['input'];
  slug: Scalars['String']['input'];
};

export type CreatePaymentLinkInput = {
  appId?: InputMaybe<Scalars['String']['input']>;
  cancelUrl?: InputMaybe<Scalars['String']['input']>;
  successUrl?: InputMaybe<Scalars['String']['input']>;
  type: PaymentLinkType;
};

export type CreateUserAppStateInput = {
  appId: Scalars['BigInt']['input'];
  state?: InputMaybe<Scalars['String']['input']>;
};

export type FreePlayWindowInfo = {
  __typename?: 'FreePlayWindowInfo';
  description: Scalars['String']['output'];
  isCurrentlyActive: Scalars['Boolean']['output'];
  nextWindowStart: Maybe<Scalars['String']['output']>;
};

/** Generic error response from the UDP game server. Uses the sequence number to match the original request that failed. */
export type GenericErrorResponse = {
  __typename?: 'GenericErrorResponse';
  /** Error code indicating the reason for the failure. */
  errorCode: UdpErrorCode;
  /** The sequence number from the original request, used to correlate this error with the request that caused it. */
  sequenceNumber: Scalars['Int']['output'];
};

export type GetChunkInput = {
  appId: Scalars['BigInt']['input'];
  coordinates: ChunkCoordinatesInput;
  includeAllLods?: InputMaybe<Scalars['Boolean']['input']>;
  requestedLodLevels?: InputMaybe<Array<Scalars['Int']['input']>>;
};

export type GetChunkLodsInput = {
  appId: Scalars['BigInt']['input'];
  coordinates: ChunkCoordinatesInput;
  lodLevels: Array<Scalars['Int']['input']>;
};

export type GetChunksByDistanceInput = {
  appId: Scalars['BigInt']['input'];
  centerCoordinate: ChunkCoordinatesInput;
  limit?: InputMaybe<Scalars['Int']['input']>;
  maxDistance: Scalars['Int']['input'];
  skip?: InputMaybe<Scalars['Int']['input']>;
};

export type GetVoxelListInput = {
  appId: Scalars['BigInt']['input'];
  coordinates: ChunkCoordinatesInput;
};

export type GrantAppAccessInput = {
  appId: Scalars['BigInt']['input'];
  grantedBy?: InputMaybe<Scalars['String']['input']>;
  tierId?: InputMaybe<Scalars['BigInt']['input']>;
  userId: Scalars['BigInt']['input'];
};

export type GraphQlServer = {
  __typename?: 'GraphQLServer';
  createdAt: Scalars['DateTime']['output'];
  graphqlServerId: Scalars['ID']['output'];
  ip4: Maybe<Scalars['String']['output']>;
  ip6: Maybe<Scalars['String']['output']>;
  status: ServerState;
  updatedAt: Scalars['DateTime']['output'];
};

export type Grid = {
  __typename?: 'Grid';
  app_id: Scalars['BigInt']['output'];
  created_at: Scalars['DateTime']['output'];
  grid_id: Scalars['BigInt']['output'];
  high_chunk: ChunkCoordinates;
  low_chunk: ChunkCoordinates;
};

export type Group = {
  __typename?: 'Group';
  createdAt: Scalars['DateTime']['output'];
  createdBy: Scalars['ID']['output'];
  groupId: Scalars['ID']['output'];
  name: Scalars['String']['output'];
};

/** The type of membership a user has in a group */
export enum GroupMemberType {
  Admin = 'ADMIN',
  Member = 'MEMBER',
  Moderator = 'MODERATOR',
  None = 'NONE',
  Owner = 'OWNER',
  SuperAdmin = 'SUPER_ADMIN'
}

export type GroupMembership = {
  __typename?: 'GroupMembership';
  createdAt: Scalars['DateTime']['output'];
  createdBy: Scalars['ID']['output'];
  groupId: Scalars['ID']['output'];
  groupMembershipId: Scalars['ID']['output'];
  memberType: GroupMemberType;
  userId: Scalars['ID']['output'];
};

export type InviteOrgMemberInput = {
  orgId: Scalars['BigInt']['input'];
  userId: Scalars['BigInt']['input'];
};

export type ListVoxelUpdatesByDistanceInput = {
  appId: Scalars['BigInt']['input'];
  centerCoordinate: ChunkCoordinatesInput;
  limit?: InputMaybe<Scalars['Int']['input']>;
  maxDistance: Scalars['Int']['input'];
  since?: InputMaybe<Scalars['DateTime']['input']>;
  skip?: InputMaybe<Scalars['Int']['input']>;
};

export type ListVoxelsInput = {
  appId: Scalars['BigInt']['input'];
  coordinates: ChunkCoordinatesInput;
  since?: InputMaybe<Scalars['DateTime']['input']>;
};

export type LodData = {
  __typename?: 'LodData';
  data: Scalars['String']['output'];
  level: Scalars['Int']['output'];
};

export type LodDataInput = {
  data: Scalars['String']['input'];
  level: Scalars['Int']['input'];
};

export type LoginUserInput = {
  email: Scalars['String']['input'];
  password: Scalars['String']['input'];
};

export type Mutation = {
  __typename?: 'Mutation';
  changePassword: Scalars['Boolean']['output'];
  confirmEmail: Scalars['Boolean']['output'];
  /** Open or replace the UDP proxy session for this game token: binds a socket and selects the game server with the fewest clients. Optional: send mutations and udpNotifications also create a session when none exists. Any existing session for this token is closed first. */
  connectUdpProxy: UdpProxyConnectionStatus;
  createAccessTier: AppAccessTier;
  createActor: Actor;
  createAvatar: Avatar;
  createGrid: CreateGridResponse;
  createGroup: Group;
  createOrgToken: OrgToken;
  createOrganization: Organization;
  createPaymentLink: PaymentLinkOutput;
  deleteActor: Actor;
  deleteAvatar: Avatar;
  deleteQuota: Scalars['Boolean']['output'];
  deleteUserAppState: UserAppState;
  /** Close the UDP proxy session and socket for this game token. Unsubscribing from udpNotifications does not disconnect; use this mutation (or rely on server inactivity timeout). */
  disconnectUdpProxy: Scalars['Boolean']['output'];
  grantAppAccess: AppUserAccess;
  inviteOrgMember: OrgMember;
  login: AuthResponse;
  logout: Scalars['Boolean']['output'];
  logoutAllDevices: Scalars['Boolean']['output'];
  register: AuthResponse;
  requestPasswordReset: Scalars['Boolean']['output'];
  resendConfirmationEmail: Scalars['Boolean']['output'];
  resetPassword: Scalars['Boolean']['output'];
  revokeAppAccess: AppUserAccess;
  rollbackVoxelUpdates: Array<RollbackVoxelEventResult>;
  /** Send an actor update to the game server. Opens a UDP proxy session automatically if none exists. Responses and GenericErrorResponse are delivered on udpNotifications. */
  sendActorUpdate: Scalars['Boolean']['output'];
  /** Send a voice audio packet to the game server. Opens a UDP proxy session automatically if none exists; notifications arrive on udpNotifications. */
  sendAudioPacket: Scalars['Boolean']['output'];
  /** Send a client event to the game server. Opens a UDP proxy session automatically if none exists; related notifications arrive on udpNotifications. */
  sendClientEvent: Scalars['Boolean']['output'];
  /** Send a text (chat) packet to the game server. Opens a UDP proxy session automatically if none exists; notifications arrive on udpNotifications. */
  sendTextPacket: Scalars['Boolean']['output'];
  /** Send a voxel update to the game server. Opens a UDP proxy session automatically if none exists; responses arrive on udpNotifications. */
  sendVoxelUpdate: Scalars['Boolean']['output'];
  setAppBudget: AppBudget;
  setQuota: ServiceQuota;
  teleportRequest: TeleportResponse;
  updateActor: Actor;
  updateActorState: Actor;
  updateAvatar: Avatar;
  updateAvatarState: Avatar;
  updateChunk: Chunk;
  updateChunkLods: Maybe<Chunk>;
  updateChunkState: Maybe<Chunk>;
  updateGamertag: User;
  updateGroup: Group;
  updateUserAppState: UserAppState;
  updateUserState: User;
  updateVoxel: Voxel;
};


export type MutationChangePasswordArgs = {
  currentPassword: Scalars['String']['input'];
  newPassword: Scalars['String']['input'];
};


export type MutationConfirmEmailArgs = {
  token: Scalars['String']['input'];
};


export type MutationConnectUdpProxyArgs = {
  input?: InputMaybe<ConnectUdpProxyInput>;
};


export type MutationCreateAccessTierArgs = {
  input: CreateAccessTierInput;
};


export type MutationCreateActorArgs = {
  input: CreateActorInput;
};


export type MutationCreateAvatarArgs = {
  input: CreateAvatarInput;
};


export type MutationCreateGridArgs = {
  input: CreateGridInput;
};


export type MutationCreateGroupArgs = {
  createGroupInput: CreateGroupInput;
};


export type MutationCreateOrgTokenArgs = {
  input: CreateOrgTokenInput;
};


export type MutationCreateOrganizationArgs = {
  input: CreateOrganizationInput;
};


export type MutationCreatePaymentLinkArgs = {
  input: CreatePaymentLinkInput;
};


export type MutationDeleteActorArgs = {
  uuid: Scalars['String']['input'];
};


export type MutationDeleteAvatarArgs = {
  id: Scalars['BigInt']['input'];
};


export type MutationDeleteQuotaArgs = {
  quotaId: Scalars['BigInt']['input'];
};


export type MutationDeleteUserAppStateArgs = {
  appId: Scalars['BigInt']['input'];
};


export type MutationGrantAppAccessArgs = {
  input: GrantAppAccessInput;
};


export type MutationInviteOrgMemberArgs = {
  input: InviteOrgMemberInput;
};


export type MutationLoginArgs = {
  loginUserInput: LoginUserInput;
};


export type MutationRegisterArgs = {
  registerUserInput: RegisterUserInput;
};


export type MutationRequestPasswordResetArgs = {
  email: Scalars['String']['input'];
};


export type MutationResendConfirmationEmailArgs = {
  email: Scalars['String']['input'];
};


export type MutationResetPasswordArgs = {
  resetPasswordInput: ResetPasswordInput;
};


export type MutationRevokeAppAccessArgs = {
  appId: Scalars['BigInt']['input'];
  userId: Scalars['BigInt']['input'];
};


export type MutationRollbackVoxelUpdatesArgs = {
  input: RollbackVoxelUpdatesInput;
};


export type MutationSendActorUpdateArgs = {
  input: ActorUpdateRequestInput;
};


export type MutationSendAudioPacketArgs = {
  input: ClientAudioPacketInput;
};


export type MutationSendClientEventArgs = {
  input: ClientEventNotificationInput;
};


export type MutationSendTextPacketArgs = {
  input: ClientTextPacketInput;
};


export type MutationSendVoxelUpdateArgs = {
  input: VoxelUpdateRequestInput;
};


export type MutationSetAppBudgetArgs = {
  appId: Scalars['BigInt']['input'];
  monthlyLimitCents: Scalars['BigInt']['input'];
  orgId: Scalars['BigInt']['input'];
};


export type MutationSetQuotaArgs = {
  input: SetQuotaInput;
};


export type MutationTeleportRequestArgs = {
  input: TeleportRequestInput;
};


export type MutationUpdateActorArgs = {
  input: UpdateActorInput;
  uuid: Scalars['String']['input'];
};


export type MutationUpdateActorStateArgs = {
  input: UpdateActorStateInput;
  uuid: Scalars['String']['input'];
};


export type MutationUpdateAvatarArgs = {
  id: Scalars['BigInt']['input'];
  input: UpdateAvatarInput;
};


export type MutationUpdateAvatarStateArgs = {
  id: Scalars['BigInt']['input'];
  input: UpdateAvatarStateInput;
};


export type MutationUpdateChunkArgs = {
  input: ChunkUpdateInput;
};


export type MutationUpdateChunkLodsArgs = {
  input: UpdateChunkLodsInput;
};


export type MutationUpdateChunkStateArgs = {
  input: UpdateChunkStateInput;
};


export type MutationUpdateGamertagArgs = {
  input: UpdateGamertagInput;
};


export type MutationUpdateGroupArgs = {
  id: Scalars['BigInt']['input'];
  updateGroupInput: UpdateGroupInput;
};


export type MutationUpdateUserAppStateArgs = {
  input: CreateUserAppStateInput;
};


export type MutationUpdateUserStateArgs = {
  input: UpdateUserStateInput;
};


export type MutationUpdateVoxelArgs = {
  input: UpdateVoxelInput;
};

export type OrgMember = {
  __typename?: 'OrgMember';
  createdAt: Scalars['DateTime']['output'];
  orgId: Scalars['ID']['output'];
  orgMemberId: Scalars['ID']['output'];
  status: Scalars['String']['output'];
  updatedAt: Scalars['DateTime']['output'];
  userId: Scalars['ID']['output'];
};

export type OrgToken = {
  __typename?: 'OrgToken';
  createdAt: Scalars['DateTime']['output'];
  expiresAt: Maybe<Scalars['DateTime']['output']>;
  isActive: Scalars['Boolean']['output'];
  label: Maybe<Scalars['String']['output']>;
  orgId: Scalars['ID']['output'];
  orgTokenId: Scalars['ID']['output'];
  updatedAt: Scalars['DateTime']['output'];
};

export type OrgWallet = {
  __typename?: 'OrgWallet';
  balanceCents: Scalars['String']['output'];
  createdAt: Scalars['DateTime']['output'];
  currency: Scalars['String']['output'];
  orgId: Scalars['ID']['output'];
  updatedAt: Scalars['DateTime']['output'];
  walletId: Scalars['ID']['output'];
};

export type Organization = {
  __typename?: 'Organization';
  createdAt: Scalars['DateTime']['output'];
  name: Scalars['String']['output'];
  orgId: Scalars['ID']['output'];
  ownerUserId: Scalars['ID']['output'];
  slug: Scalars['String']['output'];
  status: Scalars['String']['output'];
  updatedAt: Scalars['DateTime']['output'];
};

export type PaymentLinkOutput = {
  __typename?: 'PaymentLinkOutput';
  amountCents: Maybe<Scalars['Float']['output']>;
  createdAt: Scalars['DateTime']['output'];
  currency: Maybe<Scalars['String']['output']>;
  expiresAt: Maybe<Scalars['DateTime']['output']>;
  id: Scalars['String']['output'];
  type: Scalars['String']['output'];
  url: Scalars['String']['output'];
};

/** The type of payment link to create (donations or property tokens) */
export enum PaymentLinkType {
  Donation = 'DONATION',
  PropertyTokens = 'PROPERTY_TOKENS'
}

export type Query = {
  __typename?: 'Query';
  /** Returns only active (ReadyForClients) GraphQL servers */
  activeGraphQLServers: Array<GraphQlServer>;
  actor: Actor;
  actors: Array<Actor>;
  appAccessTiers: Array<AppAccessTier>;
  appBudget: Maybe<AppBudget>;
  avatar: Avatar;
  batchLookupActors: Array<Actor>;
  freePlayWindowInfo: FreePlayWindowInfo;
  getChunk: Maybe<Chunk>;
  getChunkLods: Maybe<ChunkLodsResponse>;
  getChunksByDistance: ChunksByDistanceResponse;
  getMyPaymentLinks: Array<PaymentLinkOutput>;
  getVoxelList: ChunkVoxelResponse;
  /** Returns all registered GraphQL servers */
  graphqlServers: Array<GraphQlServer>;
  group: Group;
  groupMemberships: Array<GroupMembership>;
  groups: Array<Group>;
  listVoxelUpdatesByDistance: VoxelUpdatesByDistanceResponse;
  listVoxels: Array<Voxel>;
  me: Maybe<User>;
  myAppAccess: Maybe<AppUserAccess>;
  myAvatars: Array<AvatarDto>;
  myDonationData: UserDonationData;
  myPropertyTokens: UserPropertyTokenData;
  orgMembers: Array<OrgMember>;
  organization: Maybe<Organization>;
  organizationBySlug: Maybe<Organization>;
  quotasForApp: Array<ServiceQuota>;
  quotasForOrg: Array<ServiceQuota>;
  /** Returns a random server from the lowest 20% of servers by client count to distribute load evenly */
  serverWithLeastClients: ServerStatus;
  /** UDP proxy session status for the game token on this request. Without a game token, returns connected: false. Does not open a session—use udpNotifications or connectUdpProxy. */
  udpProxyConnectionStatus: UdpProxyConnectionStatus;
  user: Maybe<User>;
  userAppState: Maybe<UserAppState>;
  userAppStates: Array<UserAppState>;
  userAvatars: Array<Avatar>;
  userGroupMemberships: Array<GroupMembership>;
  users: Array<User>;
  usersByEmail: Array<User>;
  usersByGamertag: Array<User>;
  /** Returns version information for the server and minimum client version requirements */
  versionInfo: ServerVersionInfo;
  voxelUpdateHistory: Array<VoxelUpdateHistoryEvent>;
  walletBalance: OrgWallet;
  walletTransactions: Array<WalletTransaction>;
};


export type QueryActorArgs = {
  uuid: Scalars['String']['input'];
};


export type QueryActorsArgs = {
  filter?: InputMaybe<ActorFilterInput>;
};


export type QueryAppAccessTiersArgs = {
  appId: Scalars['BigInt']['input'];
};


export type QueryAppBudgetArgs = {
  appId: Scalars['BigInt']['input'];
  orgId: Scalars['BigInt']['input'];
};


export type QueryAvatarArgs = {
  id: Scalars['BigInt']['input'];
};


export type QueryBatchLookupActorsArgs = {
  input: BatchActorLookupInput;
};


export type QueryGetChunkArgs = {
  input: GetChunkInput;
};


export type QueryGetChunkLodsArgs = {
  input: GetChunkLodsInput;
};


export type QueryGetChunksByDistanceArgs = {
  input: GetChunksByDistanceInput;
};


export type QueryGetVoxelListArgs = {
  input: GetVoxelListInput;
};


export type QueryGroupArgs = {
  id: Scalars['BigInt']['input'];
};


export type QueryGroupMembershipsArgs = {
  groupId: Scalars['BigInt']['input'];
};


export type QueryListVoxelUpdatesByDistanceArgs = {
  input: ListVoxelUpdatesByDistanceInput;
};


export type QueryListVoxelsArgs = {
  input: ListVoxelsInput;
};


export type QueryMyAppAccessArgs = {
  appId: Scalars['BigInt']['input'];
};


export type QueryOrgMembersArgs = {
  orgId: Scalars['BigInt']['input'];
};


export type QueryOrganizationArgs = {
  id: Scalars['BigInt']['input'];
};


export type QueryOrganizationBySlugArgs = {
  slug: Scalars['String']['input'];
};


export type QueryQuotasForAppArgs = {
  appId: Scalars['BigInt']['input'];
};


export type QueryQuotasForOrgArgs = {
  orgId: Scalars['BigInt']['input'];
};


export type QueryUserArgs = {
  id: Scalars['BigInt']['input'];
};


export type QueryUserAppStateArgs = {
  appId: Scalars['BigInt']['input'];
};


export type QueryUserAvatarsArgs = {
  userId: Scalars['BigInt']['input'];
};


export type QueryUserGroupMembershipsArgs = {
  userId: Scalars['BigInt']['input'];
};


export type QueryUsersByEmailArgs = {
  email: Scalars['String']['input'];
};


export type QueryUsersByGamertagArgs = {
  gamertag: Scalars['String']['input'];
};


export type QueryVoxelUpdateHistoryArgs = {
  appId: Scalars['BigInt']['input'];
  from?: InputMaybe<Scalars['DateTime']['input']>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  to?: InputMaybe<Scalars['DateTime']['input']>;
  userId?: InputMaybe<Scalars['BigInt']['input']>;
};


export type QueryWalletBalanceArgs = {
  orgId: Scalars['BigInt']['input'];
};


export type QueryWalletTransactionsArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orgId: Scalars['BigInt']['input'];
};

export type RegisterUserInput = {
  email: Scalars['String']['input'];
  gamertag?: InputMaybe<Scalars['String']['input']>;
  password: Scalars['String']['input'];
};

export type ResetPasswordInput = {
  newPassword: Scalars['String']['input'];
  token: Scalars['String']['input'];
};

export type RollbackVoxelEventResult = {
  __typename?: 'RollbackVoxelEventResult';
  appId: Scalars['BigInt']['output'];
  applied: Scalars['Boolean']['output'];
  coordinates: ChunkCoordinates;
  fromVoxelType: Maybe<Scalars['Int']['output']>;
  location: VoxelCoordinates;
  plannedAction: Scalars['String']['output'];
  reason: Maybe<Scalars['String']['output']>;
  toVoxelType: Maybe<Scalars['Int']['output']>;
};

export type RollbackVoxelUpdatesInput = {
  appId: Scalars['BigInt']['input'];
  dryRun?: Scalars['Boolean']['input'];
  from: Scalars['DateTime']['input'];
  to: Scalars['DateTime']['input'];
  userId: Scalars['BigInt']['input'];
};

/** Notification received when the server sends a custom event. Received via the udpNotifications subscription. */
export type ServerEventNotification = {
  __typename?: 'ServerEventNotification';
  /** The ID of the app where the event is occurring. */
  appId: Scalars['BigInt']['output'];
  /** The X coordinate of the chunk where the event is located. */
  chunkX: Scalars['BigInt']['output'];
  /** The Y coordinate of the chunk where the event is located. */
  chunkY: Scalars['BigInt']['output'];
  /** The Z coordinate of the chunk where the event is located. */
  chunkZ: Scalars['BigInt']['output'];
  /** Decay algorithm (0-5) from the original message. */
  decayRate: Scalars['Int']['output'];
  /** Chunk replication distance (0-8) from the original message. */
  distance: Scalars['Int']['output'];
  /** Server-generated epoch milliseconds timestamp. */
  epochMillis: Scalars['BigInt']['output'];
  /** The event type ID (uint16). This determines how the event should be processed. */
  eventType: Scalars['Int']['output'];
  /** The sender's sequence number for this message (0-255). */
  sequenceNumber: Scalars['Int']['output'];
  /** The event state data, base64-encoded. The format is defined by the event type. */
  state: Scalars['String']['output'];
  /** The unique identifier of the object controlling this event. */
  uuid: Scalars['String']['output'];
};

/** The current state of the server */
export enum ServerState {
  Offline = 'Offline',
  ReadyForClients = 'ReadyForClients',
  Starting = 'Starting',
  Stopping = 'Stopping'
}

export type ServerStatus = {
  __typename?: 'ServerStatus';
  clientPort: Scalars['Int']['output'];
  clientRecvBytesPerSec: Maybe<Scalars['Float']['output']>;
  clientRecvMsgsPerSec: Maybe<Scalars['Float']['output']>;
  clientSendBytesPerSec: Maybe<Scalars['Float']['output']>;
  clientSendIndividualMsgsPerSec: Maybe<Scalars['Float']['output']>;
  clientSendMsgsPerSec: Maybe<Scalars['Float']['output']>;
  clients: Scalars['Int']['output'];
  cpuPeakPct: Maybe<Scalars['Float']['output']>;
  createdAt: Scalars['DateTime']['output'];
  ip4: Scalars['String']['output'];
  ip6: Scalars['String']['output'];
  peerRecvBytesPerSec: Maybe<Scalars['Float']['output']>;
  peerRecvMsgsPerSec: Maybe<Scalars['Float']['output']>;
  peerSendBytesPerSec: Maybe<Scalars['Float']['output']>;
  peerSendMsgsPerSec: Maybe<Scalars['Float']['output']>;
  peers: Scalars['Int']['output'];
  serverId: Scalars['ID']['output'];
  status: ServerState;
  updatedAt: Scalars['DateTime']['output'];
};

export type ServerVersionInfo = {
  __typename?: 'ServerVersionInfo';
  /** Minimum accepted client version */
  minimumClientVersion: VersionInfo;
  /** Current server version */
  serverVersion: VersionInfo;
};

export type ServiceQuota = {
  __typename?: 'ServiceQuota';
  actionOnExceed: Scalars['String']['output'];
  appId: Maybe<Scalars['ID']['output']>;
  createdAt: Scalars['DateTime']['output'];
  limitValue: Scalars['String']['output'];
  metric: Scalars['String']['output'];
  orgId: Maybe<Scalars['ID']['output']>;
  period: Scalars['String']['output'];
  quotaId: Scalars['ID']['output'];
  tierId: Maybe<Scalars['ID']['output']>;
  updatedAt: Scalars['DateTime']['output'];
};

export type SetQuotaInput = {
  actionOnExceed?: InputMaybe<Scalars['String']['input']>;
  appId?: InputMaybe<Scalars['BigInt']['input']>;
  limitValue: Scalars['BigInt']['input'];
  metric: Scalars['String']['input'];
  orgId?: InputMaybe<Scalars['BigInt']['input']>;
  period?: InputMaybe<Scalars['String']['input']>;
  tierId?: InputMaybe<Scalars['BigInt']['input']>;
};

export type Subscription = {
  __typename?: 'Subscription';
  /** Downlink from the game server (responses, notifications, GenericErrorResponse). On subscribe, opens a UDP proxy session if none exists (least-loaded server). Requires a game token—without one, yields a single null then ends. Connection failures may yield null. Unsubscribing stops delivery only; call disconnectUdpProxy to release the session. */
  udpNotifications: Maybe<UdpNotification>;
};

export type TeleportRequestInput = {
  UUID: Scalars['String']['input'];
  appId: Scalars['BigInt']['input'];
  chunkAddress: ChunkCoordinatesInput;
  voxelAddress: VoxelCoordinatesInput;
};

export type TeleportResponse = {
  __typename?: 'TeleportResponse';
  errorCode: UdpErrorCode;
  success: Scalars['Boolean']['output'];
};

/** Error codes returned by UDP game servers in response messages. NO_ERROR (0) indicates success, all other values indicate various error conditions. */
export enum UdpErrorCode {
  AppNotFound = 'APP_NOT_FOUND',
  AppNotLoaded = 'APP_NOT_LOADED',
  BadPassword = 'BAD_PASSWORD',
  ChunkNotFound = 'CHUNK_NOT_FOUND',
  EmailAlreadyExists = 'EMAIL_ALREADY_EXISTS',
  EmailInvalid = 'EMAIL_INVALID',
  EmailNotFound = 'EMAIL_NOT_FOUND',
  EmailTooLong = 'EMAIL_TOO_LONG',
  EmailTooShort = 'EMAIL_TOO_SHORT',
  GamertagAlreadyExists = 'GAMERTAG_ALREADY_EXISTS',
  GameTokenWrongSize = 'GAME_TOKEN_WRONG_SIZE',
  GridAlreadyExists = 'GRID_ALREADY_EXISTS',
  GridOutsideAssignment = 'GRID_OUTSIDE_ASSIGNMENT',
  GridOverlapsExisting = 'GRID_OVERLAPS_EXISTING',
  InvalidAppId = 'INVALID_APP_ID',
  InvalidGridCoordinates = 'INVALID_GRID_COORDINATES',
  InvalidRequest = 'INVALID_REQUEST',
  InvalidStateData = 'INVALID_STATE_DATA',
  InvalidToken = 'INVALID_TOKEN',
  InvalidTokenLength = 'INVALID_TOKEN_LENGTH',
  NameTooLong = 'NAME_TOO_LONG',
  NoError = 'NO_ERROR',
  NoMatchingGridAssignment = 'NO_MATCHING_GRID_ASSIGNMENT',
  PasswordTooLong = 'PASSWORD_TOO_LONG',
  PasswordTooShort = 'PASSWORD_TOO_SHORT',
  Unauthorized = 'UNAUTHORIZED',
  UnknownError = 'UNKNOWN_ERROR',
  UserNotAppAdmin = 'USER_NOT_APP_ADMIN',
  UserNotAuthenticated = 'USER_NOT_AUTHENTICATED'
}

/** All game-server messages delivered over the UDP proxy as GraphQL payloads. Subscribe to udpNotifications before or with sending mutations so responses and GenericErrorResponse (correlate via sequenceNumber) are not missed. */
export type UdpNotification = ActorUpdateNotification | ActorUpdateResponse | ClientAudioNotification | ClientEventNotification | ClientTextNotification | GenericErrorResponse | ServerEventNotification | VoxelUpdateNotification | VoxelUpdateResponse;

/** UDP proxy session for the game token on the request. Returned by udpProxyConnectionStatus and connectUdpProxy. Binary UDP layouts are documented in database/client-wire-formats.md. */
export type UdpProxyConnectionStatus = {
  __typename?: 'UdpProxyConnectionStatus';
  /** Whether the user is currently connected to a UDP game server through the proxy. */
  connected: Scalars['Boolean']['output'];
  /** Timestamp of the last message received from the UDP server (only present when connected). Used to detect connection health. */
  lastMessageTime: Maybe<Scalars['DateTime']['output']>;
  /** The client port of the UDP game server (only present when connected). This is the port that native clients would connect to directly. */
  serverClientPort: Maybe<Scalars['Int']['output']>;
  /** The IPv6 address of the UDP game server (only present when connected). */
  serverIp6: Maybe<Scalars['String']['output']>;
};

export type UpdateActorInput = {
  appId?: InputMaybe<Scalars['BigInt']['input']>;
  avatarId?: InputMaybe<Scalars['BigInt']['input']>;
  chunk?: InputMaybe<ChunkCoordinatesInput>;
  privateState?: InputMaybe<Scalars['String']['input']>;
  publicState?: InputMaybe<Scalars['String']['input']>;
};

export type UpdateActorStateInput = {
  privateState?: InputMaybe<Scalars['String']['input']>;
  publicState?: InputMaybe<Scalars['String']['input']>;
};

export type UpdateAvatarInput = {
  name?: InputMaybe<Scalars['String']['input']>;
};

export type UpdateAvatarStateInput = {
  privateState?: InputMaybe<Scalars['String']['input']>;
  publicState?: InputMaybe<Scalars['String']['input']>;
};

export type UpdateChunkLodsInput = {
  appId: Scalars['BigInt']['input'];
  coordinates: ChunkCoordinatesInput;
  lods: Array<LodDataInput>;
};

export type UpdateChunkStateInput = {
  appId: Scalars['BigInt']['input'];
  chunkState?: InputMaybe<Scalars['String']['input']>;
  coordinates: ChunkCoordinatesInput;
};

export type UpdateGamertagInput = {
  disambiguation: Scalars['String']['input'];
  gamertag: Scalars['String']['input'];
};

export type UpdateGroupInput = {
  description?: InputMaybe<Scalars['String']['input']>;
  name?: InputMaybe<Scalars['String']['input']>;
};

export type UpdateUserStateInput = {
  state?: InputMaybe<Scalars['String']['input']>;
};

export type UpdateVoxelInput = {
  appId: Scalars['BigInt']['input'];
  coordinates: ChunkCoordinatesInput;
  location: VoxelCoordinatesInput;
  state?: InputMaybe<Scalars['String']['input']>;
  voxelType: Scalars['Float']['input'];
};

export type User = {
  __typename?: 'User';
  createdAt: Scalars['DateTime']['output'];
  disambiguation: Maybe<Scalars['String']['output']>;
  email: Maybe<Scalars['String']['output']>;
  externalId: Maybe<Scalars['String']['output']>;
  gamertag: Maybe<Scalars['String']['output']>;
  grantEarlyAccess: Scalars['Boolean']['output'];
  grantEarlyAccessOverride: Scalars['Boolean']['output'];
  isConfirmed: Scalars['Boolean']['output'];
  orgId: Maybe<Scalars['BigInt']['output']>;
  state: Maybe<Scalars['String']['output']>;
  userId: Scalars['BigInt']['output'];
  userType: Scalars['String']['output'];
};

export type UserAppState = {
  __typename?: 'UserAppState';
  appId: Scalars['ID']['output'];
  createdAt: Scalars['DateTime']['output'];
  state: Maybe<Scalars['String']['output']>;
  updatedAt: Scalars['DateTime']['output'];
  userId: Scalars['ID']['output'];
};

export type UserDonationData = {
  __typename?: 'UserDonationData';
  currency: Scalars['String']['output'];
  totalAmountCents: Scalars['String']['output'];
};

export type UserPropertyTokenData = {
  __typename?: 'UserPropertyTokenData';
  available: Scalars['String']['output'];
  inUse: Scalars['String']['output'];
  total: Scalars['String']['output'];
};

export type VersionInfo = {
  __typename?: 'VersionInfo';
  /** Build number */
  build: Scalars['Int']['output'];
  /** Major version number */
  major: Scalars['Int']['output'];
  /** Minor version number */
  minor: Scalars['Int']['output'];
  /** Patch version number */
  patch: Scalars['Int']['output'];
};

export type Voxel = {
  __typename?: 'Voxel';
  appId: Scalars['BigInt']['output'];
  coordinates: ChunkCoordinates;
  createdAt: Scalars['DateTime']['output'];
  createdBy: Scalars['BigInt']['output'];
  location: VoxelCoordinates;
  state: Maybe<Scalars['String']['output']>;
  voxelType: Scalars['Int']['output'];
  voxelUpdateId: Scalars['BigInt']['output'];
};

export type VoxelCoordinates = {
  __typename?: 'VoxelCoordinates';
  x: Scalars['Int']['output'];
  y: Scalars['Int']['output'];
  z: Scalars['Int']['output'];
};

export type VoxelCoordinatesInput = {
  x: Scalars['Int']['input'];
  y: Scalars['Int']['input'];
  z: Scalars['Int']['input'];
};

export type VoxelState = {
  __typename?: 'VoxelState';
  state: Maybe<Scalars['String']['output']>;
  voxelCoord: VoxelCoordinates;
  voxelType: Scalars['Int']['output'];
};

export type VoxelStateInput = {
  state?: InputMaybe<Scalars['String']['input']>;
  voxelCoord: VoxelCoordinatesInput;
  voxelType: Scalars['Int']['input'];
};

export type VoxelUpdateHistoryEvent = {
  __typename?: 'VoxelUpdateHistoryEvent';
  appId: Scalars['BigInt']['output'];
  changedAt: Scalars['DateTime']['output'];
  changedBy: Maybe<Scalars['BigInt']['output']>;
  coordinates: ChunkCoordinates;
  id: Scalars['BigInt']['output'];
  location: VoxelCoordinates;
  newVoxelType: Maybe<Scalars['Int']['output']>;
  oldVoxelType: Maybe<Scalars['Int']['output']>;
};

/** Notification received when a voxel (block) is updated by another client or the server. Received via the udpNotifications subscription. */
export type VoxelUpdateNotification = {
  __typename?: 'VoxelUpdateNotification';
  /** The ID of the app where the voxel is located. */
  appId: Scalars['BigInt']['output'];
  /** The X coordinate of the chunk containing the voxel. */
  chunkX: Scalars['BigInt']['output'];
  /** The Y coordinate of the chunk containing the voxel. */
  chunkY: Scalars['BigInt']['output'];
  /** The Z coordinate of the chunk containing the voxel. */
  chunkZ: Scalars['BigInt']['output'];
  /** Decay algorithm (0-5) from the original message. */
  decayRate: Scalars['Int']['output'];
  /** Chunk replication distance (0-8) from the original message. */
  distance: Scalars['Int']['output'];
  /** Server-generated epoch milliseconds timestamp. */
  epochMillis: Scalars['BigInt']['output'];
  /** The sender's sequence number for this message (0-255). */
  sequenceNumber: Scalars['Int']['output'];
  /** The unique identifier for this voxel update. */
  uuid: Scalars['String']['output'];
  /** The voxel state data, base64-encoded. */
  voxelState: Scalars['String']['output'];
  /** The voxel type ID that was set. */
  voxelType: Scalars['Int']['output'];
  /** The X coordinate of the voxel within the chunk. */
  voxelX: Scalars['Int']['output'];
  /** The Y coordinate of the voxel within the chunk. */
  voxelY: Scalars['Int']['output'];
  /** The Z coordinate of the voxel within the chunk. */
  voxelZ: Scalars['Int']['output'];
};

/** Input for sending a voxel update request to the UDP game server. This updates a single voxel (block) in a specific chunk. Voxel coordinates are relative to the chunk. */
export type VoxelUpdateRequestInput = {
  /** The ID of the app where the voxel is located. */
  appId: Scalars['BigInt']['input'];
  /** The chunk coordinates containing the voxel. A chunk is a 16x16x16 voxel cube. */
  chunk: ChunkCoordinatesInput;
  /** Decay algorithm for replication: 0 = none, 1 = exponential, 2 = linear 50%, 3 = linear 25%, 4 = linear 10%, 5 = linear 5%. Defaults to 0 (none) for voxel updates. */
  decayRate?: InputMaybe<Scalars['Int']['input']>;
  /** Chunk replication distance (0-8). Defaults to 8 for voxel updates. Clamped to 0-8. */
  distance?: InputMaybe<Scalars['Int']['input']>;
  /** Client's sequence number for this message (0-255, wraps). Used to match error responses. */
  sequenceNumber?: InputMaybe<Scalars['Int']['input']>;
  /** A unique identifier for this voxel update. Must be exactly 32 bytes when encoded as UTF-8. */
  uuid: Scalars['String']['input'];
  /** The voxel coordinates within the chunk. Values must be between -32768 and 32767 (int16 range). */
  voxel: VoxelCoordinatesInput;
  /** The voxel state data, base64-encoded. */
  voxelState: Scalars['String']['input'];
  /** The new voxel type ID. This determines the appearance and properties of the voxel. */
  voxelType: Scalars['Int']['input'];
};

/** Response from the UDP game server for a voxel update request. Received via the udpNotifications subscription. */
export type VoxelUpdateResponse = {
  __typename?: 'VoxelUpdateResponse';
  /** The ID of the app where the voxel update was processed. */
  appId: Scalars['BigInt']['output'];
  /** The X coordinate of the chunk containing the voxel. */
  chunkX: Scalars['BigInt']['output'];
  /** The Y coordinate of the chunk containing the voxel. */
  chunkY: Scalars['BigInt']['output'];
  /** The Z coordinate of the chunk containing the voxel. */
  chunkZ: Scalars['BigInt']['output'];
  /** Decay algorithm (0-5) from the original message. */
  decayRate: Scalars['Int']['output'];
  /** Chunk replication distance (0-8) from the original message. */
  distance: Scalars['Int']['output'];
  /** Server-generated epoch milliseconds timestamp. */
  epochMillis: Scalars['BigInt']['output'];
  /** The sequence number echoed back from the request, used to correlate responses. */
  sequenceNumber: Scalars['Int']['output'];
  /** The unique identifier for this voxel update. */
  uuid: Scalars['String']['output'];
};

export type VoxelUpdatesByDistanceResponse = {
  __typename?: 'VoxelUpdatesByDistanceResponse';
  centerCoordinate: ChunkCoordinates;
  chunks: Array<ChunkVoxelUpdatesResponse>;
  limit: Maybe<Scalars['Int']['output']>;
  skip: Maybe<Scalars['Int']['output']>;
};

export type WalletTransaction = {
  __typename?: 'WalletTransaction';
  amountCents: Scalars['String']['output'];
  appId: Maybe<Scalars['ID']['output']>;
  balanceAfter: Scalars['String']['output'];
  createdAt: Scalars['DateTime']['output'];
  description: Maybe<Scalars['String']['output']>;
  orgId: Scalars['ID']['output'];
  referenceId: Maybe<Scalars['String']['output']>;
  transactionId: Scalars['ID']['output'];
  transactionType: Scalars['String']['output'];
  walletId: Scalars['ID']['output'];
};

export type ActorQueryVariables = Exact<{
  uuid: Scalars['String']['input'];
}>;


export type ActorQuery = { __typename?: 'Query', actor: { __typename?: 'Actor', uuid: string, appId: string, userId: string, avatarId: string | null, privateState: string | null, publicState: string | null, createdAt: string, chunk: { __typename?: 'ChunkCoordinates', x: string, y: string, z: string } } };

export type ActorsQueryVariables = Exact<{
  filter?: InputMaybe<ActorFilterInput>;
}>;


export type ActorsQuery = { __typename?: 'Query', actors: Array<{ __typename?: 'Actor', uuid: string, appId: string, userId: string, avatarId: string | null, privateState: string | null, publicState: string | null, createdAt: string, chunk: { __typename?: 'ChunkCoordinates', x: string, y: string, z: string } }> };

export type BatchLookupActorsQueryVariables = Exact<{
  input: BatchActorLookupInput;
}>;


export type BatchLookupActorsQuery = { __typename?: 'Query', batchLookupActors: Array<{ __typename?: 'Actor', uuid: string, appId: string, userId: string, avatarId: string | null, privateState: string | null, publicState: string | null, createdAt: string, chunk: { __typename?: 'ChunkCoordinates', x: string, y: string, z: string } }> };

export type CreateActorMutationVariables = Exact<{
  input: CreateActorInput;
}>;


export type CreateActorMutation = { __typename?: 'Mutation', createActor: { __typename?: 'Actor', uuid: string, appId: string, userId: string, avatarId: string | null, privateState: string | null, publicState: string | null, createdAt: string, chunk: { __typename?: 'ChunkCoordinates', x: string, y: string, z: string } } };

export type DeleteActorMutationVariables = Exact<{
  uuid: Scalars['String']['input'];
}>;


export type DeleteActorMutation = { __typename?: 'Mutation', deleteActor: { __typename?: 'Actor', uuid: string, appId: string, userId: string } };

export type UpdateActorMutationVariables = Exact<{
  uuid: Scalars['String']['input'];
  input: UpdateActorInput;
}>;


export type UpdateActorMutation = { __typename?: 'Mutation', updateActor: { __typename?: 'Actor', uuid: string, appId: string, userId: string, avatarId: string | null, privateState: string | null, publicState: string | null, createdAt: string, chunk: { __typename?: 'ChunkCoordinates', x: string, y: string, z: string } } };

export type UpdateActorStateMutationVariables = Exact<{
  uuid: Scalars['String']['input'];
  input: UpdateActorStateInput;
}>;


export type UpdateActorStateMutation = { __typename?: 'Mutation', updateActorState: { __typename?: 'Actor', uuid: string, appId: string, userId: string, privateState: string | null, publicState: string | null } };

export type AppAccessTiersQueryVariables = Exact<{
  appId: Scalars['BigInt']['input'];
}>;


export type AppAccessTiersQuery = { __typename?: 'Query', appAccessTiers: Array<{ __typename?: 'AppAccessTier', tierId: string, appId: string, name: string, tierOrder: number, isFree: boolean, isDefault: boolean, priceCents: string | null, currency: string | null, billingPeriod: string | null, description: string | null, status: string, createdAt: string, updatedAt: string }> };

export type CreateAccessTierMutationVariables = Exact<{
  input: CreateAccessTierInput;
}>;


export type CreateAccessTierMutation = { __typename?: 'Mutation', createAccessTier: { __typename?: 'AppAccessTier', tierId: string, appId: string, name: string, tierOrder: number, isFree: boolean, isDefault: boolean, priceCents: string | null, currency: string | null, billingPeriod: string | null, description: string | null, status: string, createdAt: string, updatedAt: string } };

export type GrantAppAccessMutationVariables = Exact<{
  input: GrantAppAccessInput;
}>;


export type GrantAppAccessMutation = { __typename?: 'Mutation', grantAppAccess: { __typename?: 'AppUserAccess', appUserAccessId: string, appId: string, userId: string, tierId: string | null, status: string, grantedBy: string, subscriptionId: string | null, expiresAt: string | null, createdAt: string, updatedAt: string } };

export type MyAppAccessQueryVariables = Exact<{
  appId: Scalars['BigInt']['input'];
}>;


export type MyAppAccessQuery = { __typename?: 'Query', myAppAccess: { __typename?: 'AppUserAccess', appUserAccessId: string, appId: string, userId: string, tierId: string | null, status: string, grantedBy: string, subscriptionId: string | null, expiresAt: string | null, createdAt: string, updatedAt: string } | null };

export type RevokeAppAccessMutationVariables = Exact<{
  appId: Scalars['BigInt']['input'];
  userId: Scalars['BigInt']['input'];
}>;


export type RevokeAppAccessMutation = { __typename?: 'Mutation', revokeAppAccess: { __typename?: 'AppUserAccess', appUserAccessId: string, appId: string, userId: string, tierId: string | null, status: string, grantedBy: string, subscriptionId: string | null, expiresAt: string | null, createdAt: string, updatedAt: string } };

export type ChangePasswordMutationVariables = Exact<{
  currentPassword: Scalars['String']['input'];
  newPassword: Scalars['String']['input'];
}>;


export type ChangePasswordMutation = { __typename?: 'Mutation', changePassword: boolean };

export type ConfirmEmailMutationVariables = Exact<{
  token: Scalars['String']['input'];
}>;


export type ConfirmEmailMutation = { __typename?: 'Mutation', confirmEmail: boolean };

export type LoginMutationVariables = Exact<{
  input: LoginUserInput;
}>;


export type LoginMutation = { __typename?: 'Mutation', login: { __typename?: 'AuthResponse', token: string, gameTokenId: string, user: { __typename?: 'User', userId: string, email: string | null, gamertag: string | null, disambiguation: string | null, isConfirmed: boolean, createdAt: string, grantEarlyAccess: boolean, grantEarlyAccessOverride: boolean, orgId: string | null, externalId: string | null, userType: string } } };

export type LogoutMutationVariables = Exact<{ [key: string]: never; }>;


export type LogoutMutation = { __typename?: 'Mutation', logout: boolean };

export type LogoutAllDevicesMutationVariables = Exact<{ [key: string]: never; }>;


export type LogoutAllDevicesMutation = { __typename?: 'Mutation', logoutAllDevices: boolean };

export type RegisterMutationVariables = Exact<{
  input: RegisterUserInput;
}>;


export type RegisterMutation = { __typename?: 'Mutation', register: { __typename?: 'AuthResponse', token: string, gameTokenId: string, user: { __typename?: 'User', userId: string, email: string | null, gamertag: string | null, disambiguation: string | null, isConfirmed: boolean, createdAt: string, grantEarlyAccess: boolean, grantEarlyAccessOverride: boolean, orgId: string | null, externalId: string | null, userType: string } } };

export type RequestPasswordResetMutationVariables = Exact<{
  email: Scalars['String']['input'];
}>;


export type RequestPasswordResetMutation = { __typename?: 'Mutation', requestPasswordReset: boolean };

export type ResendConfirmationEmailMutationVariables = Exact<{
  email: Scalars['String']['input'];
}>;


export type ResendConfirmationEmailMutation = { __typename?: 'Mutation', resendConfirmationEmail: boolean };

export type ResetPasswordMutationVariables = Exact<{
  input: ResetPasswordInput;
}>;


export type ResetPasswordMutation = { __typename?: 'Mutation', resetPassword: boolean };

export type AppBudgetQueryVariables = Exact<{
  orgId: Scalars['BigInt']['input'];
  appId: Scalars['BigInt']['input'];
}>;


export type AppBudgetQuery = { __typename?: 'Query', appBudget: { __typename?: 'AppBudget', appBudgetId: string, orgId: string, appId: string, monthlyLimitCents: string | null, currentMonthUsageCents: string, periodStart: string, createdAt: string, updatedAt: string } | null };

export type SetAppBudgetMutationVariables = Exact<{
  orgId: Scalars['BigInt']['input'];
  appId: Scalars['BigInt']['input'];
  monthlyLimitCents: Scalars['BigInt']['input'];
}>;


export type SetAppBudgetMutation = { __typename?: 'Mutation', setAppBudget: { __typename?: 'AppBudget', appBudgetId: string, orgId: string, appId: string, monthlyLimitCents: string | null, currentMonthUsageCents: string, periodStart: string, createdAt: string, updatedAt: string } };

export type WalletBalanceQueryVariables = Exact<{
  orgId: Scalars['BigInt']['input'];
}>;


export type WalletBalanceQuery = { __typename?: 'Query', walletBalance: { __typename?: 'OrgWallet', walletId: string, orgId: string, balanceCents: string, currency: string, createdAt: string, updatedAt: string } };

export type WalletTransactionsQueryVariables = Exact<{
  orgId: Scalars['BigInt']['input'];
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
}>;


export type WalletTransactionsQuery = { __typename?: 'Query', walletTransactions: Array<{ __typename?: 'WalletTransaction', transactionId: string, walletId: string, orgId: string, amountCents: string, balanceAfter: string, transactionType: string, description: string | null, referenceId: string | null, appId: string | null, createdAt: string }> };

export type GetChunkQueryVariables = Exact<{
  input: GetChunkInput;
}>;


export type GetChunkQuery = { __typename?: 'Query', getChunk: { __typename?: 'Chunk', chunkId: string, appId: string, voxels: string | null, owner: string | null, createdAt: string, updatedAt: string, chunkState: string | null, cdnUploadedAt: string | null, coordinates: { __typename?: 'ChunkCoordinates', x: string, y: string, z: string }, voxelStates: Array<{ __typename?: 'VoxelState', voxelType: number, state: string | null, voxelCoord: { __typename?: 'VoxelCoordinates', x: number, y: number, z: number } }>, lods: Array<{ __typename?: 'LodData', level: number, data: string }> | null } | null };

export type GetChunkLodsQueryVariables = Exact<{
  input: GetChunkLodsInput;
}>;


export type GetChunkLodsQuery = { __typename?: 'Query', getChunkLods: { __typename?: 'ChunkLodsResponse', chunkId: string, appId: string, updatedAt: string, coordinates: { __typename?: 'ChunkCoordinates', x: string, y: string, z: string }, lods: Array<{ __typename?: 'LodData', level: number, data: string }> } | null };

export type GetChunksByDistanceQueryVariables = Exact<{
  input: GetChunksByDistanceInput;
}>;


export type GetChunksByDistanceQuery = { __typename?: 'Query', getChunksByDistance: { __typename?: 'ChunksByDistanceResponse', limit: number | null, skip: number | null, chunks: Array<{ __typename?: 'Chunk', chunkId: string, appId: string, voxels: string | null, owner: string | null, createdAt: string, updatedAt: string, chunkState: string | null, cdnUploadedAt: string | null, coordinates: { __typename?: 'ChunkCoordinates', x: string, y: string, z: string }, lods: Array<{ __typename?: 'LodData', level: number, data: string }> | null }> } };

export type GetVoxelListQueryVariables = Exact<{
  input: GetVoxelListInput;
}>;


export type GetVoxelListQuery = { __typename?: 'Query', getVoxelList: { __typename?: 'ChunkVoxelResponse', coordinates: { __typename?: 'ChunkCoordinates', x: string, y: string, z: string }, voxels: Array<{ __typename?: 'Voxel', voxelUpdateId: string, appId: string, voxelType: number, state: string | null, createdBy: string, createdAt: string, coordinates: { __typename?: 'ChunkCoordinates', x: string, y: string, z: string }, location: { __typename?: 'VoxelCoordinates', x: number, y: number, z: number } }> } };

export type UpdateChunkMutationVariables = Exact<{
  input: ChunkUpdateInput;
}>;


export type UpdateChunkMutation = { __typename?: 'Mutation', updateChunk: { __typename?: 'Chunk', chunkId: string, appId: string, voxels: string | null, chunkState: string | null, updatedAt: string, coordinates: { __typename?: 'ChunkCoordinates', x: string, y: string, z: string } } };

export type UpdateChunkLodsMutationVariables = Exact<{
  input: UpdateChunkLodsInput;
}>;


export type UpdateChunkLodsMutation = { __typename?: 'Mutation', updateChunkLods: { __typename?: 'Chunk', chunkId: string, appId: string, updatedAt: string, coordinates: { __typename?: 'ChunkCoordinates', x: string, y: string, z: string }, lods: Array<{ __typename?: 'LodData', level: number, data: string }> | null } | null };

export type UpdateChunkStateMutationVariables = Exact<{
  input: UpdateChunkStateInput;
}>;


export type UpdateChunkStateMutation = { __typename?: 'Mutation', updateChunkState: { __typename?: 'Chunk', chunkId: string, appId: string, chunkState: string | null, updatedAt: string, coordinates: { __typename?: 'ChunkCoordinates', x: string, y: string, z: string } } | null };

export type CreateGroupMutationVariables = Exact<{
  input: CreateGroupInput;
}>;


export type CreateGroupMutation = { __typename?: 'Mutation', createGroup: { __typename?: 'Group', groupId: string, name: string, createdBy: string, createdAt: string } };

export type GroupQueryVariables = Exact<{
  id: Scalars['BigInt']['input'];
}>;


export type GroupQuery = { __typename?: 'Query', group: { __typename?: 'Group', groupId: string, name: string, createdBy: string, createdAt: string } };

export type GroupMembershipsQueryVariables = Exact<{
  groupId: Scalars['BigInt']['input'];
}>;


export type GroupMembershipsQuery = { __typename?: 'Query', groupMemberships: Array<{ __typename?: 'GroupMembership', groupMembershipId: string, groupId: string, userId: string, memberType: GroupMemberType, createdBy: string, createdAt: string }> };

export type GroupsQueryVariables = Exact<{ [key: string]: never; }>;


export type GroupsQuery = { __typename?: 'Query', groups: Array<{ __typename?: 'Group', groupId: string, name: string, createdBy: string, createdAt: string }> };

export type UpdateGroupMutationVariables = Exact<{
  id: Scalars['BigInt']['input'];
  input: UpdateGroupInput;
}>;


export type UpdateGroupMutation = { __typename?: 'Mutation', updateGroup: { __typename?: 'Group', groupId: string, name: string, createdBy: string, createdAt: string } };

export type UserGroupMembershipsQueryVariables = Exact<{
  userId: Scalars['BigInt']['input'];
}>;


export type UserGroupMembershipsQuery = { __typename?: 'Query', userGroupMemberships: Array<{ __typename?: 'GroupMembership', groupMembershipId: string, groupId: string, userId: string, memberType: GroupMemberType, createdBy: string, createdAt: string }> };

export type CreateOrgTokenMutationVariables = Exact<{
  input: CreateOrgTokenInput;
}>;


export type CreateOrgTokenMutation = { __typename?: 'Mutation', createOrgToken: { __typename?: 'OrgToken', orgTokenId: string, orgId: string, label: string | null, isActive: boolean, expiresAt: string | null, createdAt: string, updatedAt: string } };

export type CreateOrganizationMutationVariables = Exact<{
  input: CreateOrganizationInput;
}>;


export type CreateOrganizationMutation = { __typename?: 'Mutation', createOrganization: { __typename?: 'Organization', orgId: string, name: string, slug: string, ownerUserId: string, status: string, createdAt: string, updatedAt: string } };

export type InviteOrgMemberMutationVariables = Exact<{
  input: InviteOrgMemberInput;
}>;


export type InviteOrgMemberMutation = { __typename?: 'Mutation', inviteOrgMember: { __typename?: 'OrgMember', orgMemberId: string, orgId: string, userId: string, status: string, createdAt: string, updatedAt: string } };

export type OrgMembersQueryVariables = Exact<{
  orgId: Scalars['BigInt']['input'];
}>;


export type OrgMembersQuery = { __typename?: 'Query', orgMembers: Array<{ __typename?: 'OrgMember', orgMemberId: string, orgId: string, userId: string, status: string, createdAt: string, updatedAt: string }> };

export type OrganizationQueryVariables = Exact<{
  id: Scalars['BigInt']['input'];
}>;


export type OrganizationQuery = { __typename?: 'Query', organization: { __typename?: 'Organization', orgId: string, name: string, slug: string, ownerUserId: string, status: string, createdAt: string, updatedAt: string } | null };

export type OrganizationBySlugQueryVariables = Exact<{
  slug: Scalars['String']['input'];
}>;


export type OrganizationBySlugQuery = { __typename?: 'Query', organizationBySlug: { __typename?: 'Organization', orgId: string, name: string, slug: string, ownerUserId: string, status: string, createdAt: string, updatedAt: string } | null };

export type DeleteQuotaMutationVariables = Exact<{
  quotaId: Scalars['BigInt']['input'];
}>;


export type DeleteQuotaMutation = { __typename?: 'Mutation', deleteQuota: boolean };

export type QuotasForAppQueryVariables = Exact<{
  appId: Scalars['BigInt']['input'];
}>;


export type QuotasForAppQuery = { __typename?: 'Query', quotasForApp: Array<{ __typename?: 'ServiceQuota', quotaId: string, orgId: string | null, appId: string | null, tierId: string | null, metric: string, limitValue: string, period: string, actionOnExceed: string, createdAt: string, updatedAt: string }> };

export type QuotasForOrgQueryVariables = Exact<{
  orgId: Scalars['BigInt']['input'];
}>;


export type QuotasForOrgQuery = { __typename?: 'Query', quotasForOrg: Array<{ __typename?: 'ServiceQuota', quotaId: string, orgId: string | null, appId: string | null, tierId: string | null, metric: string, limitValue: string, period: string, actionOnExceed: string, createdAt: string, updatedAt: string }> };

export type SetQuotaMutationVariables = Exact<{
  input: SetQuotaInput;
}>;


export type SetQuotaMutation = { __typename?: 'Mutation', setQuota: { __typename?: 'ServiceQuota', quotaId: string, orgId: string | null, appId: string | null, tierId: string | null, metric: string, limitValue: string, period: string, actionOnExceed: string, createdAt: string, updatedAt: string } };

export type ActiveGraphQlServersQueryVariables = Exact<{ [key: string]: never; }>;


export type ActiveGraphQlServersQuery = { __typename?: 'Query', activeGraphQLServers: Array<{ __typename?: 'GraphQLServer', graphqlServerId: string, ip4: string | null, ip6: string | null, status: ServerState, createdAt: string, updatedAt: string }> };

export type GraphqlServersQueryVariables = Exact<{ [key: string]: never; }>;


export type GraphqlServersQuery = { __typename?: 'Query', graphqlServers: Array<{ __typename?: 'GraphQLServer', graphqlServerId: string, ip4: string | null, ip6: string | null, status: ServerState, createdAt: string, updatedAt: string }> };

export type ServerWithLeastClientsQueryVariables = Exact<{ [key: string]: never; }>;


export type ServerWithLeastClientsQuery = { __typename?: 'Query', serverWithLeastClients: { __typename?: 'ServerStatus', serverId: string, ip4: string, ip6: string, clientPort: number, status: ServerState, peers: number, clients: number, cpuPeakPct: number | null, updatedAt: string, createdAt: string } };

export type VersionInfoQueryVariables = Exact<{ [key: string]: never; }>;


export type VersionInfoQuery = { __typename?: 'Query', versionInfo: { __typename?: 'ServerVersionInfo', serverVersion: { __typename?: 'VersionInfo', major: number, minor: number, patch: number, build: number }, minimumClientVersion: { __typename?: 'VersionInfo', major: number, minor: number, patch: number, build: number } } };

export type DeleteUserAppStateMutationVariables = Exact<{
  appId: Scalars['BigInt']['input'];
}>;


export type DeleteUserAppStateMutation = { __typename?: 'Mutation', deleteUserAppState: { __typename?: 'UserAppState', userId: string, appId: string, state: string | null, createdAt: string, updatedAt: string } };

export type UpdateUserAppStateMutationVariables = Exact<{
  input: CreateUserAppStateInput;
}>;


export type UpdateUserAppStateMutation = { __typename?: 'Mutation', updateUserAppState: { __typename?: 'UserAppState', userId: string, appId: string, state: string | null, createdAt: string, updatedAt: string } };

export type UserAppStateQueryVariables = Exact<{
  appId: Scalars['BigInt']['input'];
}>;


export type UserAppStateQuery = { __typename?: 'Query', userAppState: { __typename?: 'UserAppState', userId: string, appId: string, state: string | null, createdAt: string, updatedAt: string } | null };

export type UserAppStatesQueryVariables = Exact<{ [key: string]: never; }>;


export type UserAppStatesQuery = { __typename?: 'Query', userAppStates: Array<{ __typename?: 'UserAppState', userId: string, appId: string, state: string | null, createdAt: string, updatedAt: string }> };

export type TeleportRequestMutationVariables = Exact<{
  input: TeleportRequestInput;
}>;


export type TeleportRequestMutation = { __typename?: 'Mutation', teleportRequest: { __typename?: 'TeleportResponse', success: boolean, errorCode: UdpErrorCode } };

export type ConnectUdpProxyMutationVariables = Exact<{ [key: string]: never; }>;


export type ConnectUdpProxyMutation = { __typename?: 'Mutation', connectUdpProxy: { __typename?: 'UdpProxyConnectionStatus', connected: boolean, serverIp6: string | null, serverClientPort: number | null, lastMessageTime: string | null } };

export type DisconnectUdpProxyMutationVariables = Exact<{ [key: string]: never; }>;


export type DisconnectUdpProxyMutation = { __typename?: 'Mutation', disconnectUdpProxy: boolean };

export type UdpProxyConnectionStatusQueryVariables = Exact<{ [key: string]: never; }>;


export type UdpProxyConnectionStatusQuery = { __typename?: 'Query', udpProxyConnectionStatus: { __typename?: 'UdpProxyConnectionStatus', connected: boolean, serverIp6: string | null, serverClientPort: number | null, lastMessageTime: string | null } };

export type MeQueryVariables = Exact<{ [key: string]: never; }>;


export type MeQuery = { __typename?: 'Query', me: { __typename?: 'User', userId: string, email: string | null, gamertag: string | null, disambiguation: string | null, state: string | null, isConfirmed: boolean, createdAt: string, grantEarlyAccess: boolean, grantEarlyAccessOverride: boolean, orgId: string | null, externalId: string | null, userType: string } | null };

export type UpdateGamertagMutationVariables = Exact<{
  input: UpdateGamertagInput;
}>;


export type UpdateGamertagMutation = { __typename?: 'Mutation', updateGamertag: { __typename?: 'User', userId: string, gamertag: string | null, disambiguation: string | null, userType: string } };

export type UpdateUserStateMutationVariables = Exact<{
  input: UpdateUserStateInput;
}>;


export type UpdateUserStateMutation = { __typename?: 'Mutation', updateUserState: { __typename?: 'User', userId: string, state: string | null, userType: string } };

export type UserQueryVariables = Exact<{
  id: Scalars['BigInt']['input'];
}>;


export type UserQuery = { __typename?: 'Query', user: { __typename?: 'User', userId: string, email: string | null, gamertag: string | null, disambiguation: string | null, state: string | null, isConfirmed: boolean, createdAt: string, grantEarlyAccess: boolean, grantEarlyAccessOverride: boolean, orgId: string | null, externalId: string | null, userType: string } | null };

export type UsersQueryVariables = Exact<{ [key: string]: never; }>;


export type UsersQuery = { __typename?: 'Query', users: Array<{ __typename?: 'User', userId: string, email: string | null, gamertag: string | null, disambiguation: string | null, isConfirmed: boolean, createdAt: string, grantEarlyAccess: boolean, grantEarlyAccessOverride: boolean, orgId: string | null, externalId: string | null, userType: string }> };

export type UsersByEmailQueryVariables = Exact<{
  email: Scalars['String']['input'];
}>;


export type UsersByEmailQuery = { __typename?: 'Query', usersByEmail: Array<{ __typename?: 'User', userId: string, email: string | null, gamertag: string | null, disambiguation: string | null, isConfirmed: boolean, createdAt: string, grantEarlyAccess: boolean, grantEarlyAccessOverride: boolean, orgId: string | null, externalId: string | null, userType: string }> };

export type UsersByGamertagQueryVariables = Exact<{
  gamertag: Scalars['String']['input'];
}>;


export type UsersByGamertagQuery = { __typename?: 'Query', usersByGamertag: Array<{ __typename?: 'User', userId: string, email: string | null, gamertag: string | null, disambiguation: string | null, isConfirmed: boolean, createdAt: string, grantEarlyAccess: boolean, grantEarlyAccessOverride: boolean, orgId: string | null, externalId: string | null, userType: string }> };

export type ListVoxelUpdatesByDistanceQueryVariables = Exact<{
  input: ListVoxelUpdatesByDistanceInput;
}>;


export type ListVoxelUpdatesByDistanceQuery = { __typename?: 'Query', listVoxelUpdatesByDistance: { __typename?: 'VoxelUpdatesByDistanceResponse', limit: number | null, skip: number | null, centerCoordinate: { __typename?: 'ChunkCoordinates', x: string, y: string, z: string }, chunks: Array<{ __typename?: 'ChunkVoxelUpdatesResponse', coordinates: { __typename?: 'ChunkCoordinates', x: string, y: string, z: string }, voxels: Array<{ __typename?: 'Voxel', voxelUpdateId: string, appId: string, voxelType: number, state: string | null, createdBy: string, createdAt: string, location: { __typename?: 'VoxelCoordinates', x: number, y: number, z: number } }> }> } };

export type ListVoxelsQueryVariables = Exact<{
  input: ListVoxelsInput;
}>;


export type ListVoxelsQuery = { __typename?: 'Query', listVoxels: Array<{ __typename?: 'Voxel', voxelUpdateId: string, appId: string, voxelType: number, state: string | null, createdBy: string, createdAt: string, coordinates: { __typename?: 'ChunkCoordinates', x: string, y: string, z: string }, location: { __typename?: 'VoxelCoordinates', x: number, y: number, z: number } }> };

export type RollbackVoxelUpdatesMutationVariables = Exact<{
  input: RollbackVoxelUpdatesInput;
}>;


export type RollbackVoxelUpdatesMutation = { __typename?: 'Mutation', rollbackVoxelUpdates: Array<{ __typename?: 'RollbackVoxelEventResult', appId: string, fromVoxelType: number | null, toVoxelType: number | null, plannedAction: string, applied: boolean, reason: string | null, coordinates: { __typename?: 'ChunkCoordinates', x: string, y: string, z: string }, location: { __typename?: 'VoxelCoordinates', x: number, y: number, z: number } }> };

export type UpdateVoxelMutationVariables = Exact<{
  input: UpdateVoxelInput;
}>;


export type UpdateVoxelMutation = { __typename?: 'Mutation', updateVoxel: { __typename?: 'Voxel', voxelUpdateId: string, appId: string, voxelType: number, state: string | null, createdBy: string, createdAt: string, coordinates: { __typename?: 'ChunkCoordinates', x: string, y: string, z: string }, location: { __typename?: 'VoxelCoordinates', x: number, y: number, z: number } } };

export type VoxelUpdateHistoryQueryVariables = Exact<{
  appId: Scalars['BigInt']['input'];
  userId?: InputMaybe<Scalars['BigInt']['input']>;
  from?: InputMaybe<Scalars['DateTime']['input']>;
  to?: InputMaybe<Scalars['DateTime']['input']>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
}>;


export type VoxelUpdateHistoryQuery = { __typename?: 'Query', voxelUpdateHistory: Array<{ __typename?: 'VoxelUpdateHistoryEvent', id: string, appId: string, oldVoxelType: number | null, newVoxelType: number | null, changedBy: string | null, changedAt: string, coordinates: { __typename?: 'ChunkCoordinates', x: string, y: string, z: string }, location: { __typename?: 'VoxelCoordinates', x: number, y: number, z: number } }> };


export const ActorDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"Actor"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"uuid"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"actor"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"uuid"},"value":{"kind":"Variable","name":{"kind":"Name","value":"uuid"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"uuid"}},{"kind":"Field","name":{"kind":"Name","value":"appId"}},{"kind":"Field","name":{"kind":"Name","value":"userId"}},{"kind":"Field","name":{"kind":"Name","value":"avatarId"}},{"kind":"Field","name":{"kind":"Name","value":"chunk"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"x"}},{"kind":"Field","name":{"kind":"Name","value":"y"}},{"kind":"Field","name":{"kind":"Name","value":"z"}}]}},{"kind":"Field","name":{"kind":"Name","value":"privateState"}},{"kind":"Field","name":{"kind":"Name","value":"publicState"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}}]}}]}}]} as unknown as DocumentNode<ActorQuery, ActorQueryVariables>;
export const ActorsDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"Actors"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"filter"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"ActorFilterInput"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"actors"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"filter"},"value":{"kind":"Variable","name":{"kind":"Name","value":"filter"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"uuid"}},{"kind":"Field","name":{"kind":"Name","value":"appId"}},{"kind":"Field","name":{"kind":"Name","value":"userId"}},{"kind":"Field","name":{"kind":"Name","value":"avatarId"}},{"kind":"Field","name":{"kind":"Name","value":"chunk"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"x"}},{"kind":"Field","name":{"kind":"Name","value":"y"}},{"kind":"Field","name":{"kind":"Name","value":"z"}}]}},{"kind":"Field","name":{"kind":"Name","value":"privateState"}},{"kind":"Field","name":{"kind":"Name","value":"publicState"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}}]}}]}}]} as unknown as DocumentNode<ActorsQuery, ActorsQueryVariables>;
export const BatchLookupActorsDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"BatchLookupActors"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"input"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"BatchActorLookupInput"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"batchLookupActors"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"input"},"value":{"kind":"Variable","name":{"kind":"Name","value":"input"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"uuid"}},{"kind":"Field","name":{"kind":"Name","value":"appId"}},{"kind":"Field","name":{"kind":"Name","value":"userId"}},{"kind":"Field","name":{"kind":"Name","value":"avatarId"}},{"kind":"Field","name":{"kind":"Name","value":"chunk"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"x"}},{"kind":"Field","name":{"kind":"Name","value":"y"}},{"kind":"Field","name":{"kind":"Name","value":"z"}}]}},{"kind":"Field","name":{"kind":"Name","value":"privateState"}},{"kind":"Field","name":{"kind":"Name","value":"publicState"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}}]}}]}}]} as unknown as DocumentNode<BatchLookupActorsQuery, BatchLookupActorsQueryVariables>;
export const CreateActorDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"CreateActor"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"input"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"CreateActorInput"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"createActor"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"input"},"value":{"kind":"Variable","name":{"kind":"Name","value":"input"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"uuid"}},{"kind":"Field","name":{"kind":"Name","value":"appId"}},{"kind":"Field","name":{"kind":"Name","value":"userId"}},{"kind":"Field","name":{"kind":"Name","value":"avatarId"}},{"kind":"Field","name":{"kind":"Name","value":"chunk"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"x"}},{"kind":"Field","name":{"kind":"Name","value":"y"}},{"kind":"Field","name":{"kind":"Name","value":"z"}}]}},{"kind":"Field","name":{"kind":"Name","value":"privateState"}},{"kind":"Field","name":{"kind":"Name","value":"publicState"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}}]}}]}}]} as unknown as DocumentNode<CreateActorMutation, CreateActorMutationVariables>;
export const DeleteActorDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"DeleteActor"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"uuid"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"deleteActor"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"uuid"},"value":{"kind":"Variable","name":{"kind":"Name","value":"uuid"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"uuid"}},{"kind":"Field","name":{"kind":"Name","value":"appId"}},{"kind":"Field","name":{"kind":"Name","value":"userId"}}]}}]}}]} as unknown as DocumentNode<DeleteActorMutation, DeleteActorMutationVariables>;
export const UpdateActorDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"UpdateActor"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"uuid"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"input"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"UpdateActorInput"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"updateActor"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"uuid"},"value":{"kind":"Variable","name":{"kind":"Name","value":"uuid"}}},{"kind":"Argument","name":{"kind":"Name","value":"input"},"value":{"kind":"Variable","name":{"kind":"Name","value":"input"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"uuid"}},{"kind":"Field","name":{"kind":"Name","value":"appId"}},{"kind":"Field","name":{"kind":"Name","value":"userId"}},{"kind":"Field","name":{"kind":"Name","value":"avatarId"}},{"kind":"Field","name":{"kind":"Name","value":"chunk"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"x"}},{"kind":"Field","name":{"kind":"Name","value":"y"}},{"kind":"Field","name":{"kind":"Name","value":"z"}}]}},{"kind":"Field","name":{"kind":"Name","value":"privateState"}},{"kind":"Field","name":{"kind":"Name","value":"publicState"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}}]}}]}}]} as unknown as DocumentNode<UpdateActorMutation, UpdateActorMutationVariables>;
export const UpdateActorStateDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"UpdateActorState"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"uuid"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"input"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"UpdateActorStateInput"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"updateActorState"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"uuid"},"value":{"kind":"Variable","name":{"kind":"Name","value":"uuid"}}},{"kind":"Argument","name":{"kind":"Name","value":"input"},"value":{"kind":"Variable","name":{"kind":"Name","value":"input"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"uuid"}},{"kind":"Field","name":{"kind":"Name","value":"appId"}},{"kind":"Field","name":{"kind":"Name","value":"userId"}},{"kind":"Field","name":{"kind":"Name","value":"privateState"}},{"kind":"Field","name":{"kind":"Name","value":"publicState"}}]}}]}}]} as unknown as DocumentNode<UpdateActorStateMutation, UpdateActorStateMutationVariables>;
export const AppAccessTiersDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"AppAccessTiers"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"appId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"BigInt"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"appAccessTiers"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"appId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"appId"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"tierId"}},{"kind":"Field","name":{"kind":"Name","value":"appId"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"tierOrder"}},{"kind":"Field","name":{"kind":"Name","value":"isFree"}},{"kind":"Field","name":{"kind":"Name","value":"isDefault"}},{"kind":"Field","name":{"kind":"Name","value":"priceCents"}},{"kind":"Field","name":{"kind":"Name","value":"currency"}},{"kind":"Field","name":{"kind":"Name","value":"billingPeriod"}},{"kind":"Field","name":{"kind":"Name","value":"description"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}}]}}]}}]} as unknown as DocumentNode<AppAccessTiersQuery, AppAccessTiersQueryVariables>;
export const CreateAccessTierDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"CreateAccessTier"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"input"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"CreateAccessTierInput"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"createAccessTier"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"input"},"value":{"kind":"Variable","name":{"kind":"Name","value":"input"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"tierId"}},{"kind":"Field","name":{"kind":"Name","value":"appId"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"tierOrder"}},{"kind":"Field","name":{"kind":"Name","value":"isFree"}},{"kind":"Field","name":{"kind":"Name","value":"isDefault"}},{"kind":"Field","name":{"kind":"Name","value":"priceCents"}},{"kind":"Field","name":{"kind":"Name","value":"currency"}},{"kind":"Field","name":{"kind":"Name","value":"billingPeriod"}},{"kind":"Field","name":{"kind":"Name","value":"description"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}}]}}]}}]} as unknown as DocumentNode<CreateAccessTierMutation, CreateAccessTierMutationVariables>;
export const GrantAppAccessDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"GrantAppAccess"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"input"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"GrantAppAccessInput"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"grantAppAccess"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"input"},"value":{"kind":"Variable","name":{"kind":"Name","value":"input"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"appUserAccessId"}},{"kind":"Field","name":{"kind":"Name","value":"appId"}},{"kind":"Field","name":{"kind":"Name","value":"userId"}},{"kind":"Field","name":{"kind":"Name","value":"tierId"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"grantedBy"}},{"kind":"Field","name":{"kind":"Name","value":"subscriptionId"}},{"kind":"Field","name":{"kind":"Name","value":"expiresAt"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}}]}}]}}]} as unknown as DocumentNode<GrantAppAccessMutation, GrantAppAccessMutationVariables>;
export const MyAppAccessDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"MyAppAccess"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"appId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"BigInt"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"myAppAccess"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"appId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"appId"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"appUserAccessId"}},{"kind":"Field","name":{"kind":"Name","value":"appId"}},{"kind":"Field","name":{"kind":"Name","value":"userId"}},{"kind":"Field","name":{"kind":"Name","value":"tierId"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"grantedBy"}},{"kind":"Field","name":{"kind":"Name","value":"subscriptionId"}},{"kind":"Field","name":{"kind":"Name","value":"expiresAt"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}}]}}]}}]} as unknown as DocumentNode<MyAppAccessQuery, MyAppAccessQueryVariables>;
export const RevokeAppAccessDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"RevokeAppAccess"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"appId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"BigInt"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"userId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"BigInt"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"revokeAppAccess"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"appId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"appId"}}},{"kind":"Argument","name":{"kind":"Name","value":"userId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"userId"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"appUserAccessId"}},{"kind":"Field","name":{"kind":"Name","value":"appId"}},{"kind":"Field","name":{"kind":"Name","value":"userId"}},{"kind":"Field","name":{"kind":"Name","value":"tierId"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"grantedBy"}},{"kind":"Field","name":{"kind":"Name","value":"subscriptionId"}},{"kind":"Field","name":{"kind":"Name","value":"expiresAt"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}}]}}]}}]} as unknown as DocumentNode<RevokeAppAccessMutation, RevokeAppAccessMutationVariables>;
export const ChangePasswordDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"ChangePassword"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"currentPassword"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"newPassword"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"changePassword"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"currentPassword"},"value":{"kind":"Variable","name":{"kind":"Name","value":"currentPassword"}}},{"kind":"Argument","name":{"kind":"Name","value":"newPassword"},"value":{"kind":"Variable","name":{"kind":"Name","value":"newPassword"}}}]}]}}]} as unknown as DocumentNode<ChangePasswordMutation, ChangePasswordMutationVariables>;
export const ConfirmEmailDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"ConfirmEmail"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"token"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"confirmEmail"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"token"},"value":{"kind":"Variable","name":{"kind":"Name","value":"token"}}}]}]}}]} as unknown as DocumentNode<ConfirmEmailMutation, ConfirmEmailMutationVariables>;
export const LoginDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"Login"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"input"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"LoginUserInput"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"login"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"loginUserInput"},"value":{"kind":"Variable","name":{"kind":"Name","value":"input"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"token"}},{"kind":"Field","name":{"kind":"Name","value":"gameTokenId"}},{"kind":"Field","name":{"kind":"Name","value":"user"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"userId"}},{"kind":"Field","name":{"kind":"Name","value":"email"}},{"kind":"Field","name":{"kind":"Name","value":"gamertag"}},{"kind":"Field","name":{"kind":"Name","value":"disambiguation"}},{"kind":"Field","name":{"kind":"Name","value":"isConfirmed"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"grantEarlyAccess"}},{"kind":"Field","name":{"kind":"Name","value":"grantEarlyAccessOverride"}},{"kind":"Field","name":{"kind":"Name","value":"orgId"}},{"kind":"Field","name":{"kind":"Name","value":"externalId"}},{"kind":"Field","name":{"kind":"Name","value":"userType"}}]}}]}}]}}]} as unknown as DocumentNode<LoginMutation, LoginMutationVariables>;
export const LogoutDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"Logout"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"logout"}}]}}]} as unknown as DocumentNode<LogoutMutation, LogoutMutationVariables>;
export const LogoutAllDevicesDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"LogoutAllDevices"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"logoutAllDevices"}}]}}]} as unknown as DocumentNode<LogoutAllDevicesMutation, LogoutAllDevicesMutationVariables>;
export const RegisterDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"Register"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"input"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"RegisterUserInput"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"register"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"registerUserInput"},"value":{"kind":"Variable","name":{"kind":"Name","value":"input"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"token"}},{"kind":"Field","name":{"kind":"Name","value":"gameTokenId"}},{"kind":"Field","name":{"kind":"Name","value":"user"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"userId"}},{"kind":"Field","name":{"kind":"Name","value":"email"}},{"kind":"Field","name":{"kind":"Name","value":"gamertag"}},{"kind":"Field","name":{"kind":"Name","value":"disambiguation"}},{"kind":"Field","name":{"kind":"Name","value":"isConfirmed"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"grantEarlyAccess"}},{"kind":"Field","name":{"kind":"Name","value":"grantEarlyAccessOverride"}},{"kind":"Field","name":{"kind":"Name","value":"orgId"}},{"kind":"Field","name":{"kind":"Name","value":"externalId"}},{"kind":"Field","name":{"kind":"Name","value":"userType"}}]}}]}}]}}]} as unknown as DocumentNode<RegisterMutation, RegisterMutationVariables>;
export const RequestPasswordResetDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"RequestPasswordReset"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"email"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"requestPasswordReset"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"email"},"value":{"kind":"Variable","name":{"kind":"Name","value":"email"}}}]}]}}]} as unknown as DocumentNode<RequestPasswordResetMutation, RequestPasswordResetMutationVariables>;
export const ResendConfirmationEmailDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"ResendConfirmationEmail"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"email"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"resendConfirmationEmail"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"email"},"value":{"kind":"Variable","name":{"kind":"Name","value":"email"}}}]}]}}]} as unknown as DocumentNode<ResendConfirmationEmailMutation, ResendConfirmationEmailMutationVariables>;
export const ResetPasswordDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"ResetPassword"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"input"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ResetPasswordInput"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"resetPassword"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"resetPasswordInput"},"value":{"kind":"Variable","name":{"kind":"Name","value":"input"}}}]}]}}]} as unknown as DocumentNode<ResetPasswordMutation, ResetPasswordMutationVariables>;
export const AppBudgetDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"AppBudget"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"orgId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"BigInt"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"appId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"BigInt"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"appBudget"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"orgId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"orgId"}}},{"kind":"Argument","name":{"kind":"Name","value":"appId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"appId"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"appBudgetId"}},{"kind":"Field","name":{"kind":"Name","value":"orgId"}},{"kind":"Field","name":{"kind":"Name","value":"appId"}},{"kind":"Field","name":{"kind":"Name","value":"monthlyLimitCents"}},{"kind":"Field","name":{"kind":"Name","value":"currentMonthUsageCents"}},{"kind":"Field","name":{"kind":"Name","value":"periodStart"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}}]}}]}}]} as unknown as DocumentNode<AppBudgetQuery, AppBudgetQueryVariables>;
export const SetAppBudgetDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"SetAppBudget"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"orgId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"BigInt"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"appId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"BigInt"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"monthlyLimitCents"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"BigInt"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"setAppBudget"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"orgId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"orgId"}}},{"kind":"Argument","name":{"kind":"Name","value":"appId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"appId"}}},{"kind":"Argument","name":{"kind":"Name","value":"monthlyLimitCents"},"value":{"kind":"Variable","name":{"kind":"Name","value":"monthlyLimitCents"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"appBudgetId"}},{"kind":"Field","name":{"kind":"Name","value":"orgId"}},{"kind":"Field","name":{"kind":"Name","value":"appId"}},{"kind":"Field","name":{"kind":"Name","value":"monthlyLimitCents"}},{"kind":"Field","name":{"kind":"Name","value":"currentMonthUsageCents"}},{"kind":"Field","name":{"kind":"Name","value":"periodStart"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}}]}}]}}]} as unknown as DocumentNode<SetAppBudgetMutation, SetAppBudgetMutationVariables>;
export const WalletBalanceDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"WalletBalance"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"orgId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"BigInt"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"walletBalance"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"orgId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"orgId"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"walletId"}},{"kind":"Field","name":{"kind":"Name","value":"orgId"}},{"kind":"Field","name":{"kind":"Name","value":"balanceCents"}},{"kind":"Field","name":{"kind":"Name","value":"currency"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}}]}}]}}]} as unknown as DocumentNode<WalletBalanceQuery, WalletBalanceQueryVariables>;
export const WalletTransactionsDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"WalletTransactions"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"orgId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"BigInt"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"limit"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"Int"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"offset"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"Int"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"walletTransactions"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"orgId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"orgId"}}},{"kind":"Argument","name":{"kind":"Name","value":"limit"},"value":{"kind":"Variable","name":{"kind":"Name","value":"limit"}}},{"kind":"Argument","name":{"kind":"Name","value":"offset"},"value":{"kind":"Variable","name":{"kind":"Name","value":"offset"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"transactionId"}},{"kind":"Field","name":{"kind":"Name","value":"walletId"}},{"kind":"Field","name":{"kind":"Name","value":"orgId"}},{"kind":"Field","name":{"kind":"Name","value":"amountCents"}},{"kind":"Field","name":{"kind":"Name","value":"balanceAfter"}},{"kind":"Field","name":{"kind":"Name","value":"transactionType"}},{"kind":"Field","name":{"kind":"Name","value":"description"}},{"kind":"Field","name":{"kind":"Name","value":"referenceId"}},{"kind":"Field","name":{"kind":"Name","value":"appId"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}}]}}]}}]} as unknown as DocumentNode<WalletTransactionsQuery, WalletTransactionsQueryVariables>;
export const GetChunkDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"GetChunk"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"input"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"GetChunkInput"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"getChunk"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"input"},"value":{"kind":"Variable","name":{"kind":"Name","value":"input"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"chunkId"}},{"kind":"Field","name":{"kind":"Name","value":"appId"}},{"kind":"Field","name":{"kind":"Name","value":"coordinates"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"x"}},{"kind":"Field","name":{"kind":"Name","value":"y"}},{"kind":"Field","name":{"kind":"Name","value":"z"}}]}},{"kind":"Field","name":{"kind":"Name","value":"voxels"}},{"kind":"Field","name":{"kind":"Name","value":"voxelStates"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"voxelCoord"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"x"}},{"kind":"Field","name":{"kind":"Name","value":"y"}},{"kind":"Field","name":{"kind":"Name","value":"z"}}]}},{"kind":"Field","name":{"kind":"Name","value":"voxelType"}},{"kind":"Field","name":{"kind":"Name","value":"state"}}]}},{"kind":"Field","name":{"kind":"Name","value":"owner"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}},{"kind":"Field","name":{"kind":"Name","value":"chunkState"}},{"kind":"Field","name":{"kind":"Name","value":"cdnUploadedAt"}},{"kind":"Field","name":{"kind":"Name","value":"lods"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"level"}},{"kind":"Field","name":{"kind":"Name","value":"data"}}]}}]}}]}}]} as unknown as DocumentNode<GetChunkQuery, GetChunkQueryVariables>;
export const GetChunkLodsDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"GetChunkLods"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"input"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"GetChunkLodsInput"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"getChunkLods"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"input"},"value":{"kind":"Variable","name":{"kind":"Name","value":"input"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"chunkId"}},{"kind":"Field","name":{"kind":"Name","value":"appId"}},{"kind":"Field","name":{"kind":"Name","value":"coordinates"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"x"}},{"kind":"Field","name":{"kind":"Name","value":"y"}},{"kind":"Field","name":{"kind":"Name","value":"z"}}]}},{"kind":"Field","name":{"kind":"Name","value":"lods"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"level"}},{"kind":"Field","name":{"kind":"Name","value":"data"}}]}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}}]}}]}}]} as unknown as DocumentNode<GetChunkLodsQuery, GetChunkLodsQueryVariables>;
export const GetChunksByDistanceDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"GetChunksByDistance"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"input"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"GetChunksByDistanceInput"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"getChunksByDistance"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"input"},"value":{"kind":"Variable","name":{"kind":"Name","value":"input"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"limit"}},{"kind":"Field","name":{"kind":"Name","value":"skip"}},{"kind":"Field","name":{"kind":"Name","value":"chunks"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"chunkId"}},{"kind":"Field","name":{"kind":"Name","value":"appId"}},{"kind":"Field","name":{"kind":"Name","value":"coordinates"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"x"}},{"kind":"Field","name":{"kind":"Name","value":"y"}},{"kind":"Field","name":{"kind":"Name","value":"z"}}]}},{"kind":"Field","name":{"kind":"Name","value":"voxels"}},{"kind":"Field","name":{"kind":"Name","value":"owner"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}},{"kind":"Field","name":{"kind":"Name","value":"chunkState"}},{"kind":"Field","name":{"kind":"Name","value":"cdnUploadedAt"}},{"kind":"Field","name":{"kind":"Name","value":"lods"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"level"}},{"kind":"Field","name":{"kind":"Name","value":"data"}}]}}]}}]}}]}}]} as unknown as DocumentNode<GetChunksByDistanceQuery, GetChunksByDistanceQueryVariables>;
export const GetVoxelListDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"GetVoxelList"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"input"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"GetVoxelListInput"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"getVoxelList"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"input"},"value":{"kind":"Variable","name":{"kind":"Name","value":"input"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"coordinates"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"x"}},{"kind":"Field","name":{"kind":"Name","value":"y"}},{"kind":"Field","name":{"kind":"Name","value":"z"}}]}},{"kind":"Field","name":{"kind":"Name","value":"voxels"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"voxelUpdateId"}},{"kind":"Field","name":{"kind":"Name","value":"appId"}},{"kind":"Field","name":{"kind":"Name","value":"coordinates"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"x"}},{"kind":"Field","name":{"kind":"Name","value":"y"}},{"kind":"Field","name":{"kind":"Name","value":"z"}}]}},{"kind":"Field","name":{"kind":"Name","value":"location"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"x"}},{"kind":"Field","name":{"kind":"Name","value":"y"}},{"kind":"Field","name":{"kind":"Name","value":"z"}}]}},{"kind":"Field","name":{"kind":"Name","value":"voxelType"}},{"kind":"Field","name":{"kind":"Name","value":"state"}},{"kind":"Field","name":{"kind":"Name","value":"createdBy"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}}]}}]}}]}}]} as unknown as DocumentNode<GetVoxelListQuery, GetVoxelListQueryVariables>;
export const UpdateChunkDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"UpdateChunk"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"input"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ChunkUpdateInput"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"updateChunk"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"input"},"value":{"kind":"Variable","name":{"kind":"Name","value":"input"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"chunkId"}},{"kind":"Field","name":{"kind":"Name","value":"appId"}},{"kind":"Field","name":{"kind":"Name","value":"coordinates"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"x"}},{"kind":"Field","name":{"kind":"Name","value":"y"}},{"kind":"Field","name":{"kind":"Name","value":"z"}}]}},{"kind":"Field","name":{"kind":"Name","value":"voxels"}},{"kind":"Field","name":{"kind":"Name","value":"chunkState"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}}]}}]}}]} as unknown as DocumentNode<UpdateChunkMutation, UpdateChunkMutationVariables>;
export const UpdateChunkLodsDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"UpdateChunkLods"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"input"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"UpdateChunkLodsInput"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"updateChunkLods"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"input"},"value":{"kind":"Variable","name":{"kind":"Name","value":"input"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"chunkId"}},{"kind":"Field","name":{"kind":"Name","value":"appId"}},{"kind":"Field","name":{"kind":"Name","value":"coordinates"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"x"}},{"kind":"Field","name":{"kind":"Name","value":"y"}},{"kind":"Field","name":{"kind":"Name","value":"z"}}]}},{"kind":"Field","name":{"kind":"Name","value":"lods"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"level"}},{"kind":"Field","name":{"kind":"Name","value":"data"}}]}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}}]}}]}}]} as unknown as DocumentNode<UpdateChunkLodsMutation, UpdateChunkLodsMutationVariables>;
export const UpdateChunkStateDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"UpdateChunkState"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"input"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"UpdateChunkStateInput"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"updateChunkState"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"input"},"value":{"kind":"Variable","name":{"kind":"Name","value":"input"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"chunkId"}},{"kind":"Field","name":{"kind":"Name","value":"appId"}},{"kind":"Field","name":{"kind":"Name","value":"coordinates"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"x"}},{"kind":"Field","name":{"kind":"Name","value":"y"}},{"kind":"Field","name":{"kind":"Name","value":"z"}}]}},{"kind":"Field","name":{"kind":"Name","value":"chunkState"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}}]}}]}}]} as unknown as DocumentNode<UpdateChunkStateMutation, UpdateChunkStateMutationVariables>;
export const CreateGroupDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"CreateGroup"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"input"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"CreateGroupInput"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"createGroup"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"createGroupInput"},"value":{"kind":"Variable","name":{"kind":"Name","value":"input"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"groupId"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"createdBy"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}}]}}]}}]} as unknown as DocumentNode<CreateGroupMutation, CreateGroupMutationVariables>;
export const GroupDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"Group"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"id"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"BigInt"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"group"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"id"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"groupId"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"createdBy"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}}]}}]}}]} as unknown as DocumentNode<GroupQuery, GroupQueryVariables>;
export const GroupMembershipsDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"GroupMemberships"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"groupId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"BigInt"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"groupMemberships"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"groupId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"groupId"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"groupMembershipId"}},{"kind":"Field","name":{"kind":"Name","value":"groupId"}},{"kind":"Field","name":{"kind":"Name","value":"userId"}},{"kind":"Field","name":{"kind":"Name","value":"memberType"}},{"kind":"Field","name":{"kind":"Name","value":"createdBy"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}}]}}]}}]} as unknown as DocumentNode<GroupMembershipsQuery, GroupMembershipsQueryVariables>;
export const GroupsDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"Groups"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"groups"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"groupId"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"createdBy"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}}]}}]}}]} as unknown as DocumentNode<GroupsQuery, GroupsQueryVariables>;
export const UpdateGroupDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"UpdateGroup"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"id"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"BigInt"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"input"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"UpdateGroupInput"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"updateGroup"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"id"}}},{"kind":"Argument","name":{"kind":"Name","value":"updateGroupInput"},"value":{"kind":"Variable","name":{"kind":"Name","value":"input"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"groupId"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"createdBy"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}}]}}]}}]} as unknown as DocumentNode<UpdateGroupMutation, UpdateGroupMutationVariables>;
export const UserGroupMembershipsDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"UserGroupMemberships"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"userId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"BigInt"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"userGroupMemberships"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"userId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"userId"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"groupMembershipId"}},{"kind":"Field","name":{"kind":"Name","value":"groupId"}},{"kind":"Field","name":{"kind":"Name","value":"userId"}},{"kind":"Field","name":{"kind":"Name","value":"memberType"}},{"kind":"Field","name":{"kind":"Name","value":"createdBy"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}}]}}]}}]} as unknown as DocumentNode<UserGroupMembershipsQuery, UserGroupMembershipsQueryVariables>;
export const CreateOrgTokenDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"CreateOrgToken"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"input"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"CreateOrgTokenInput"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"createOrgToken"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"input"},"value":{"kind":"Variable","name":{"kind":"Name","value":"input"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"orgTokenId"}},{"kind":"Field","name":{"kind":"Name","value":"orgId"}},{"kind":"Field","name":{"kind":"Name","value":"label"}},{"kind":"Field","name":{"kind":"Name","value":"isActive"}},{"kind":"Field","name":{"kind":"Name","value":"expiresAt"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}}]}}]}}]} as unknown as DocumentNode<CreateOrgTokenMutation, CreateOrgTokenMutationVariables>;
export const CreateOrganizationDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"CreateOrganization"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"input"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"CreateOrganizationInput"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"createOrganization"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"input"},"value":{"kind":"Variable","name":{"kind":"Name","value":"input"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"orgId"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"slug"}},{"kind":"Field","name":{"kind":"Name","value":"ownerUserId"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}}]}}]}}]} as unknown as DocumentNode<CreateOrganizationMutation, CreateOrganizationMutationVariables>;
export const InviteOrgMemberDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"InviteOrgMember"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"input"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"InviteOrgMemberInput"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"inviteOrgMember"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"input"},"value":{"kind":"Variable","name":{"kind":"Name","value":"input"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"orgMemberId"}},{"kind":"Field","name":{"kind":"Name","value":"orgId"}},{"kind":"Field","name":{"kind":"Name","value":"userId"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}}]}}]}}]} as unknown as DocumentNode<InviteOrgMemberMutation, InviteOrgMemberMutationVariables>;
export const OrgMembersDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"OrgMembers"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"orgId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"BigInt"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"orgMembers"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"orgId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"orgId"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"orgMemberId"}},{"kind":"Field","name":{"kind":"Name","value":"orgId"}},{"kind":"Field","name":{"kind":"Name","value":"userId"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}}]}}]}}]} as unknown as DocumentNode<OrgMembersQuery, OrgMembersQueryVariables>;
export const OrganizationDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"Organization"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"id"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"BigInt"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"organization"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"id"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"orgId"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"slug"}},{"kind":"Field","name":{"kind":"Name","value":"ownerUserId"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}}]}}]}}]} as unknown as DocumentNode<OrganizationQuery, OrganizationQueryVariables>;
export const OrganizationBySlugDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"OrganizationBySlug"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"slug"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"organizationBySlug"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"slug"},"value":{"kind":"Variable","name":{"kind":"Name","value":"slug"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"orgId"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"slug"}},{"kind":"Field","name":{"kind":"Name","value":"ownerUserId"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}}]}}]}}]} as unknown as DocumentNode<OrganizationBySlugQuery, OrganizationBySlugQueryVariables>;
export const DeleteQuotaDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"DeleteQuota"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"quotaId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"BigInt"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"deleteQuota"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"quotaId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"quotaId"}}}]}]}}]} as unknown as DocumentNode<DeleteQuotaMutation, DeleteQuotaMutationVariables>;
export const QuotasForAppDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"QuotasForApp"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"appId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"BigInt"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"quotasForApp"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"appId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"appId"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"quotaId"}},{"kind":"Field","name":{"kind":"Name","value":"orgId"}},{"kind":"Field","name":{"kind":"Name","value":"appId"}},{"kind":"Field","name":{"kind":"Name","value":"tierId"}},{"kind":"Field","name":{"kind":"Name","value":"metric"}},{"kind":"Field","name":{"kind":"Name","value":"limitValue"}},{"kind":"Field","name":{"kind":"Name","value":"period"}},{"kind":"Field","name":{"kind":"Name","value":"actionOnExceed"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}}]}}]}}]} as unknown as DocumentNode<QuotasForAppQuery, QuotasForAppQueryVariables>;
export const QuotasForOrgDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"QuotasForOrg"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"orgId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"BigInt"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"quotasForOrg"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"orgId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"orgId"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"quotaId"}},{"kind":"Field","name":{"kind":"Name","value":"orgId"}},{"kind":"Field","name":{"kind":"Name","value":"appId"}},{"kind":"Field","name":{"kind":"Name","value":"tierId"}},{"kind":"Field","name":{"kind":"Name","value":"metric"}},{"kind":"Field","name":{"kind":"Name","value":"limitValue"}},{"kind":"Field","name":{"kind":"Name","value":"period"}},{"kind":"Field","name":{"kind":"Name","value":"actionOnExceed"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}}]}}]}}]} as unknown as DocumentNode<QuotasForOrgQuery, QuotasForOrgQueryVariables>;
export const SetQuotaDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"SetQuota"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"input"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"SetQuotaInput"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"setQuota"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"input"},"value":{"kind":"Variable","name":{"kind":"Name","value":"input"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"quotaId"}},{"kind":"Field","name":{"kind":"Name","value":"orgId"}},{"kind":"Field","name":{"kind":"Name","value":"appId"}},{"kind":"Field","name":{"kind":"Name","value":"tierId"}},{"kind":"Field","name":{"kind":"Name","value":"metric"}},{"kind":"Field","name":{"kind":"Name","value":"limitValue"}},{"kind":"Field","name":{"kind":"Name","value":"period"}},{"kind":"Field","name":{"kind":"Name","value":"actionOnExceed"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}}]}}]}}]} as unknown as DocumentNode<SetQuotaMutation, SetQuotaMutationVariables>;
export const ActiveGraphQlServersDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"ActiveGraphQLServers"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"activeGraphQLServers"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"graphqlServerId"}},{"kind":"Field","name":{"kind":"Name","value":"ip4"}},{"kind":"Field","name":{"kind":"Name","value":"ip6"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}}]}}]}}]} as unknown as DocumentNode<ActiveGraphQlServersQuery, ActiveGraphQlServersQueryVariables>;
export const GraphqlServersDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"GraphqlServers"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"graphqlServers"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"graphqlServerId"}},{"kind":"Field","name":{"kind":"Name","value":"ip4"}},{"kind":"Field","name":{"kind":"Name","value":"ip6"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}}]}}]}}]} as unknown as DocumentNode<GraphqlServersQuery, GraphqlServersQueryVariables>;
export const ServerWithLeastClientsDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"ServerWithLeastClients"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"serverWithLeastClients"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"serverId"}},{"kind":"Field","name":{"kind":"Name","value":"ip4"}},{"kind":"Field","name":{"kind":"Name","value":"ip6"}},{"kind":"Field","name":{"kind":"Name","value":"clientPort"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"peers"}},{"kind":"Field","name":{"kind":"Name","value":"clients"}},{"kind":"Field","name":{"kind":"Name","value":"cpuPeakPct"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}}]}}]}}]} as unknown as DocumentNode<ServerWithLeastClientsQuery, ServerWithLeastClientsQueryVariables>;
export const VersionInfoDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"VersionInfo"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"versionInfo"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"serverVersion"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"major"}},{"kind":"Field","name":{"kind":"Name","value":"minor"}},{"kind":"Field","name":{"kind":"Name","value":"patch"}},{"kind":"Field","name":{"kind":"Name","value":"build"}}]}},{"kind":"Field","name":{"kind":"Name","value":"minimumClientVersion"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"major"}},{"kind":"Field","name":{"kind":"Name","value":"minor"}},{"kind":"Field","name":{"kind":"Name","value":"patch"}},{"kind":"Field","name":{"kind":"Name","value":"build"}}]}}]}}]}}]} as unknown as DocumentNode<VersionInfoQuery, VersionInfoQueryVariables>;
export const DeleteUserAppStateDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"DeleteUserAppState"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"appId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"BigInt"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"deleteUserAppState"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"appId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"appId"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"userId"}},{"kind":"Field","name":{"kind":"Name","value":"appId"}},{"kind":"Field","name":{"kind":"Name","value":"state"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}}]}}]}}]} as unknown as DocumentNode<DeleteUserAppStateMutation, DeleteUserAppStateMutationVariables>;
export const UpdateUserAppStateDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"UpdateUserAppState"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"input"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"CreateUserAppStateInput"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"updateUserAppState"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"input"},"value":{"kind":"Variable","name":{"kind":"Name","value":"input"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"userId"}},{"kind":"Field","name":{"kind":"Name","value":"appId"}},{"kind":"Field","name":{"kind":"Name","value":"state"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}}]}}]}}]} as unknown as DocumentNode<UpdateUserAppStateMutation, UpdateUserAppStateMutationVariables>;
export const UserAppStateDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"UserAppState"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"appId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"BigInt"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"userAppState"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"appId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"appId"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"userId"}},{"kind":"Field","name":{"kind":"Name","value":"appId"}},{"kind":"Field","name":{"kind":"Name","value":"state"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}}]}}]}}]} as unknown as DocumentNode<UserAppStateQuery, UserAppStateQueryVariables>;
export const UserAppStatesDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"UserAppStates"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"userAppStates"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"userId"}},{"kind":"Field","name":{"kind":"Name","value":"appId"}},{"kind":"Field","name":{"kind":"Name","value":"state"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}}]}}]}}]} as unknown as DocumentNode<UserAppStatesQuery, UserAppStatesQueryVariables>;
export const TeleportRequestDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"TeleportRequest"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"input"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"TeleportRequestInput"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"teleportRequest"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"input"},"value":{"kind":"Variable","name":{"kind":"Name","value":"input"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"success"}},{"kind":"Field","name":{"kind":"Name","value":"errorCode"}}]}}]}}]} as unknown as DocumentNode<TeleportRequestMutation, TeleportRequestMutationVariables>;
export const ConnectUdpProxyDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"ConnectUdpProxy"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"connectUdpProxy"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"connected"}},{"kind":"Field","name":{"kind":"Name","value":"serverIp6"}},{"kind":"Field","name":{"kind":"Name","value":"serverClientPort"}},{"kind":"Field","name":{"kind":"Name","value":"lastMessageTime"}}]}}]}}]} as unknown as DocumentNode<ConnectUdpProxyMutation, ConnectUdpProxyMutationVariables>;
export const DisconnectUdpProxyDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"DisconnectUdpProxy"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"disconnectUdpProxy"}}]}}]} as unknown as DocumentNode<DisconnectUdpProxyMutation, DisconnectUdpProxyMutationVariables>;
export const UdpProxyConnectionStatusDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"UdpProxyConnectionStatus"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"udpProxyConnectionStatus"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"connected"}},{"kind":"Field","name":{"kind":"Name","value":"serverIp6"}},{"kind":"Field","name":{"kind":"Name","value":"serverClientPort"}},{"kind":"Field","name":{"kind":"Name","value":"lastMessageTime"}}]}}]}}]} as unknown as DocumentNode<UdpProxyConnectionStatusQuery, UdpProxyConnectionStatusQueryVariables>;
export const MeDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"Me"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"me"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"userId"}},{"kind":"Field","name":{"kind":"Name","value":"email"}},{"kind":"Field","name":{"kind":"Name","value":"gamertag"}},{"kind":"Field","name":{"kind":"Name","value":"disambiguation"}},{"kind":"Field","name":{"kind":"Name","value":"state"}},{"kind":"Field","name":{"kind":"Name","value":"isConfirmed"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"grantEarlyAccess"}},{"kind":"Field","name":{"kind":"Name","value":"grantEarlyAccessOverride"}},{"kind":"Field","name":{"kind":"Name","value":"orgId"}},{"kind":"Field","name":{"kind":"Name","value":"externalId"}},{"kind":"Field","name":{"kind":"Name","value":"userType"}}]}}]}}]} as unknown as DocumentNode<MeQuery, MeQueryVariables>;
export const UpdateGamertagDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"UpdateGamertag"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"input"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"UpdateGamertagInput"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"updateGamertag"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"input"},"value":{"kind":"Variable","name":{"kind":"Name","value":"input"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"userId"}},{"kind":"Field","name":{"kind":"Name","value":"gamertag"}},{"kind":"Field","name":{"kind":"Name","value":"disambiguation"}},{"kind":"Field","name":{"kind":"Name","value":"userType"}}]}}]}}]} as unknown as DocumentNode<UpdateGamertagMutation, UpdateGamertagMutationVariables>;
export const UpdateUserStateDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"UpdateUserState"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"input"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"UpdateUserStateInput"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"updateUserState"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"input"},"value":{"kind":"Variable","name":{"kind":"Name","value":"input"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"userId"}},{"kind":"Field","name":{"kind":"Name","value":"state"}},{"kind":"Field","name":{"kind":"Name","value":"userType"}}]}}]}}]} as unknown as DocumentNode<UpdateUserStateMutation, UpdateUserStateMutationVariables>;
export const UserDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"User"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"id"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"BigInt"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"user"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"id"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"userId"}},{"kind":"Field","name":{"kind":"Name","value":"email"}},{"kind":"Field","name":{"kind":"Name","value":"gamertag"}},{"kind":"Field","name":{"kind":"Name","value":"disambiguation"}},{"kind":"Field","name":{"kind":"Name","value":"state"}},{"kind":"Field","name":{"kind":"Name","value":"isConfirmed"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"grantEarlyAccess"}},{"kind":"Field","name":{"kind":"Name","value":"grantEarlyAccessOverride"}},{"kind":"Field","name":{"kind":"Name","value":"orgId"}},{"kind":"Field","name":{"kind":"Name","value":"externalId"}},{"kind":"Field","name":{"kind":"Name","value":"userType"}}]}}]}}]} as unknown as DocumentNode<UserQuery, UserQueryVariables>;
export const UsersDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"Users"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"users"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"userId"}},{"kind":"Field","name":{"kind":"Name","value":"email"}},{"kind":"Field","name":{"kind":"Name","value":"gamertag"}},{"kind":"Field","name":{"kind":"Name","value":"disambiguation"}},{"kind":"Field","name":{"kind":"Name","value":"isConfirmed"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"grantEarlyAccess"}},{"kind":"Field","name":{"kind":"Name","value":"grantEarlyAccessOverride"}},{"kind":"Field","name":{"kind":"Name","value":"orgId"}},{"kind":"Field","name":{"kind":"Name","value":"externalId"}},{"kind":"Field","name":{"kind":"Name","value":"userType"}}]}}]}}]} as unknown as DocumentNode<UsersQuery, UsersQueryVariables>;
export const UsersByEmailDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"UsersByEmail"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"email"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"usersByEmail"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"email"},"value":{"kind":"Variable","name":{"kind":"Name","value":"email"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"userId"}},{"kind":"Field","name":{"kind":"Name","value":"email"}},{"kind":"Field","name":{"kind":"Name","value":"gamertag"}},{"kind":"Field","name":{"kind":"Name","value":"disambiguation"}},{"kind":"Field","name":{"kind":"Name","value":"isConfirmed"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"grantEarlyAccess"}},{"kind":"Field","name":{"kind":"Name","value":"grantEarlyAccessOverride"}},{"kind":"Field","name":{"kind":"Name","value":"orgId"}},{"kind":"Field","name":{"kind":"Name","value":"externalId"}},{"kind":"Field","name":{"kind":"Name","value":"userType"}}]}}]}}]} as unknown as DocumentNode<UsersByEmailQuery, UsersByEmailQueryVariables>;
export const UsersByGamertagDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"UsersByGamertag"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"gamertag"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"usersByGamertag"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"gamertag"},"value":{"kind":"Variable","name":{"kind":"Name","value":"gamertag"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"userId"}},{"kind":"Field","name":{"kind":"Name","value":"email"}},{"kind":"Field","name":{"kind":"Name","value":"gamertag"}},{"kind":"Field","name":{"kind":"Name","value":"disambiguation"}},{"kind":"Field","name":{"kind":"Name","value":"isConfirmed"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"grantEarlyAccess"}},{"kind":"Field","name":{"kind":"Name","value":"grantEarlyAccessOverride"}},{"kind":"Field","name":{"kind":"Name","value":"orgId"}},{"kind":"Field","name":{"kind":"Name","value":"externalId"}},{"kind":"Field","name":{"kind":"Name","value":"userType"}}]}}]}}]} as unknown as DocumentNode<UsersByGamertagQuery, UsersByGamertagQueryVariables>;
export const ListVoxelUpdatesByDistanceDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"ListVoxelUpdatesByDistance"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"input"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ListVoxelUpdatesByDistanceInput"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"listVoxelUpdatesByDistance"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"input"},"value":{"kind":"Variable","name":{"kind":"Name","value":"input"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"centerCoordinate"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"x"}},{"kind":"Field","name":{"kind":"Name","value":"y"}},{"kind":"Field","name":{"kind":"Name","value":"z"}}]}},{"kind":"Field","name":{"kind":"Name","value":"limit"}},{"kind":"Field","name":{"kind":"Name","value":"skip"}},{"kind":"Field","name":{"kind":"Name","value":"chunks"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"coordinates"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"x"}},{"kind":"Field","name":{"kind":"Name","value":"y"}},{"kind":"Field","name":{"kind":"Name","value":"z"}}]}},{"kind":"Field","name":{"kind":"Name","value":"voxels"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"voxelUpdateId"}},{"kind":"Field","name":{"kind":"Name","value":"appId"}},{"kind":"Field","name":{"kind":"Name","value":"location"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"x"}},{"kind":"Field","name":{"kind":"Name","value":"y"}},{"kind":"Field","name":{"kind":"Name","value":"z"}}]}},{"kind":"Field","name":{"kind":"Name","value":"voxelType"}},{"kind":"Field","name":{"kind":"Name","value":"state"}},{"kind":"Field","name":{"kind":"Name","value":"createdBy"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}}]}}]}}]}}]}}]} as unknown as DocumentNode<ListVoxelUpdatesByDistanceQuery, ListVoxelUpdatesByDistanceQueryVariables>;
export const ListVoxelsDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"ListVoxels"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"input"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ListVoxelsInput"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"listVoxels"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"input"},"value":{"kind":"Variable","name":{"kind":"Name","value":"input"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"voxelUpdateId"}},{"kind":"Field","name":{"kind":"Name","value":"appId"}},{"kind":"Field","name":{"kind":"Name","value":"coordinates"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"x"}},{"kind":"Field","name":{"kind":"Name","value":"y"}},{"kind":"Field","name":{"kind":"Name","value":"z"}}]}},{"kind":"Field","name":{"kind":"Name","value":"location"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"x"}},{"kind":"Field","name":{"kind":"Name","value":"y"}},{"kind":"Field","name":{"kind":"Name","value":"z"}}]}},{"kind":"Field","name":{"kind":"Name","value":"voxelType"}},{"kind":"Field","name":{"kind":"Name","value":"state"}},{"kind":"Field","name":{"kind":"Name","value":"createdBy"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}}]}}]}}]} as unknown as DocumentNode<ListVoxelsQuery, ListVoxelsQueryVariables>;
export const RollbackVoxelUpdatesDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"RollbackVoxelUpdates"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"input"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"RollbackVoxelUpdatesInput"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"rollbackVoxelUpdates"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"input"},"value":{"kind":"Variable","name":{"kind":"Name","value":"input"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"appId"}},{"kind":"Field","name":{"kind":"Name","value":"coordinates"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"x"}},{"kind":"Field","name":{"kind":"Name","value":"y"}},{"kind":"Field","name":{"kind":"Name","value":"z"}}]}},{"kind":"Field","name":{"kind":"Name","value":"location"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"x"}},{"kind":"Field","name":{"kind":"Name","value":"y"}},{"kind":"Field","name":{"kind":"Name","value":"z"}}]}},{"kind":"Field","name":{"kind":"Name","value":"fromVoxelType"}},{"kind":"Field","name":{"kind":"Name","value":"toVoxelType"}},{"kind":"Field","name":{"kind":"Name","value":"plannedAction"}},{"kind":"Field","name":{"kind":"Name","value":"applied"}},{"kind":"Field","name":{"kind":"Name","value":"reason"}}]}}]}}]} as unknown as DocumentNode<RollbackVoxelUpdatesMutation, RollbackVoxelUpdatesMutationVariables>;
export const UpdateVoxelDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"UpdateVoxel"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"input"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"UpdateVoxelInput"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"updateVoxel"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"input"},"value":{"kind":"Variable","name":{"kind":"Name","value":"input"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"voxelUpdateId"}},{"kind":"Field","name":{"kind":"Name","value":"appId"}},{"kind":"Field","name":{"kind":"Name","value":"coordinates"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"x"}},{"kind":"Field","name":{"kind":"Name","value":"y"}},{"kind":"Field","name":{"kind":"Name","value":"z"}}]}},{"kind":"Field","name":{"kind":"Name","value":"location"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"x"}},{"kind":"Field","name":{"kind":"Name","value":"y"}},{"kind":"Field","name":{"kind":"Name","value":"z"}}]}},{"kind":"Field","name":{"kind":"Name","value":"voxelType"}},{"kind":"Field","name":{"kind":"Name","value":"state"}},{"kind":"Field","name":{"kind":"Name","value":"createdBy"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}}]}}]}}]} as unknown as DocumentNode<UpdateVoxelMutation, UpdateVoxelMutationVariables>;
export const VoxelUpdateHistoryDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"VoxelUpdateHistory"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"appId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"BigInt"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"userId"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"BigInt"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"from"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"DateTime"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"to"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"DateTime"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"limit"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"Int"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"offset"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"Int"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"voxelUpdateHistory"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"appId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"appId"}}},{"kind":"Argument","name":{"kind":"Name","value":"userId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"userId"}}},{"kind":"Argument","name":{"kind":"Name","value":"from"},"value":{"kind":"Variable","name":{"kind":"Name","value":"from"}}},{"kind":"Argument","name":{"kind":"Name","value":"to"},"value":{"kind":"Variable","name":{"kind":"Name","value":"to"}}},{"kind":"Argument","name":{"kind":"Name","value":"limit"},"value":{"kind":"Variable","name":{"kind":"Name","value":"limit"}}},{"kind":"Argument","name":{"kind":"Name","value":"offset"},"value":{"kind":"Variable","name":{"kind":"Name","value":"offset"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"appId"}},{"kind":"Field","name":{"kind":"Name","value":"coordinates"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"x"}},{"kind":"Field","name":{"kind":"Name","value":"y"}},{"kind":"Field","name":{"kind":"Name","value":"z"}}]}},{"kind":"Field","name":{"kind":"Name","value":"location"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"x"}},{"kind":"Field","name":{"kind":"Name","value":"y"}},{"kind":"Field","name":{"kind":"Name","value":"z"}}]}},{"kind":"Field","name":{"kind":"Name","value":"oldVoxelType"}},{"kind":"Field","name":{"kind":"Name","value":"newVoxelType"}},{"kind":"Field","name":{"kind":"Name","value":"changedBy"}},{"kind":"Field","name":{"kind":"Name","value":"changedAt"}}]}}]}}]} as unknown as DocumentNode<VoxelUpdateHistoryQuery, VoxelUpdateHistoryQueryVariables>;