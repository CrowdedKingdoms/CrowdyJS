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
  updatedAt: Scalars['DateTime']['output'];
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

export type App = {
  __typename?: 'App';
  appId: Scalars['BigInt']['output'];
  createdAt: Scalars['DateTime']['output'];
  createdBy: Scalars['BigInt']['output'];
  description: Maybe<Scalars['String']['output']>;
  gameApiUrl: Maybe<Scalars['String']['output']>;
  metadata: Maybe<Scalars['String']['output']>;
  name: Scalars['String']['output'];
  org: Maybe<Organization>;
  orgId: Scalars['BigInt']['output'];
  slug: Maybe<Scalars['String']['output']>;
  splitMode: Scalars['Boolean']['output'];
  state: Maybe<Scalars['String']['output']>;
  status: AppStatus;
  updatedAt: Scalars['DateTime']['output'];
  visibility: AppVisibility;
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
  permissionKeys: Array<Scalars['String']['output']>;
  priceCents: Maybe<Scalars['BigInt']['output']>;
  status: Scalars['String']['output'];
  tierId: Scalars['BigInt']['output'];
  tierOrder: Scalars['Float']['output'];
  updatedAt: Scalars['DateTime']['output'];
};

export type AppAvatarState = {
  __typename?: 'AppAvatarState';
  appId: Scalars['BigInt']['output'];
  avatarId: Scalars['BigInt']['output'];
  createdAt: Scalars['DateTime']['output'];
  state: Maybe<Scalars['String']['output']>;
  updatedAt: Scalars['DateTime']['output'];
};

export type AppBudget = {
  __typename?: 'AppBudget';
  appBudgetId: Scalars['BigInt']['output'];
  appId: Scalars['BigInt']['output'];
  createdAt: Scalars['DateTime']['output'];
  currentMonthUsageCents: Scalars['BigInt']['output'];
  monthlyLimitCents: Maybe<Scalars['BigInt']['output']>;
  orgId: Scalars['BigInt']['output'];
  periodStart: Scalars['DateTime']['output'];
  updatedAt: Scalars['DateTime']['output'];
};

export type AppGroupPolicy = {
  __typename?: 'AppGroupPolicy';
  appId: Scalars['BigInt']['output'];
  /** admin | member | anyone */
  creationPolicy: Scalars['String']['output'];
  /** open | request | invite | admin */
  defaultMembershipPolicy: Scalars['String']['output'];
  groupType: Scalars['String']['output'];
  maxGroupsPerUser: Maybe<Scalars['Int']['output']>;
  maxMembers: Maybe<Scalars['Int']['output']>;
};

export type AppMarketplaceFilterInput = {
  orgSlug?: InputMaybe<Scalars['String']['input']>;
  query?: InputMaybe<Scalars['String']['input']>;
};

/** DRAFT = invisible to non-members, LIVE = purchasable/playable, ARCHIVED = read-only */
export enum AppStatus {
  Archived = 'ARCHIVED',
  Draft = 'DRAFT',
  Live = 'LIVE'
}

export type AppUsageRollupRow = {
  __typename?: 'AppUsageRollupRow';
  appId: Scalars['String']['output'];
  appName: Scalars['String']['output'];
  appSlug: Scalars['String']['output'];
  graphqlRecvBytes: Scalars['String']['output'];
  graphqlSendBytes: Scalars['String']['output'];
  replicationRecvBytes: Scalars['String']['output'];
  replicationSendBytes: Scalars['String']['output'];
};

export type AppUsageSummary = {
  __typename?: 'AppUsageSummary';
  appId: Scalars['String']['output'];
  graphqlRecvBytes: Scalars['String']['output'];
  graphqlSendBytes: Scalars['String']['output'];
  replicationRecvBytes: Scalars['String']['output'];
  replicationSendBytes: Scalars['String']['output'];
  topGraphqlOperations: Array<GraphqlOperationUsageRow>;
};

export type AppUserAccess = {
  __typename?: 'AppUserAccess';
  appId: Scalars['BigInt']['output'];
  appUserAccessId: Scalars['BigInt']['output'];
  createdAt: Scalars['DateTime']['output'];
  expiresAt: Maybe<Scalars['DateTime']['output']>;
  grantedBy: Scalars['String']['output'];
  status: Scalars['String']['output'];
  subscriptionId: Maybe<Scalars['String']['output']>;
  tierId: Maybe<Scalars['BigInt']['output']>;
  updatedAt: Scalars['DateTime']['output'];
  userId: Scalars['BigInt']['output'];
};

/** PUBLIC = listed in marketplace, UNLISTED = direct link only, PRIVATE = members only */
export enum AppVisibility {
  Private = 'PRIVATE',
  Public = 'PUBLIC',
  Unlisted = 'UNLISTED'
}

export type AppsPage = {
  __typename?: 'AppsPage';
  items: Array<App>;
  pageInfo: PageInfo;
};

export type AssignGroupToGridInput = {
  appId: Scalars['BigInt']['input'];
  expiresAt?: InputMaybe<Scalars['DateTime']['input']>;
  gridId: Scalars['BigInt']['input'];
  groupId: Scalars['BigInt']['input'];
  /** Optional: scope the grant to members holding this group role. Omit to grant to all members of the group. */
  groupRoleId?: InputMaybe<Scalars['BigInt']['input']>;
  permissionKeys: Array<Scalars['String']['input']>;
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

export type BuddyLiveRates = {
  __typename?: 'BuddyLiveRates';
  clientRecvMbitPerSec: Scalars['Float']['output'];
  clientRecvMsgsPerSec: Scalars['Float']['output'];
  clientSendMbitPerSec: Scalars['Float']['output'];
  clientSendMsgsPerSec: Scalars['Float']['output'];
  clients: Scalars['Float']['output'];
  serverId: Scalars['String']['output'];
  updatedAt: Scalars['DateTime']['output'];
};

/** Input for publishing a message to a channel. Delivered to every active member of the channel (regardless of location), not chunk-routed. The sender must have the channel send_messages permission. */
export type ChannelMessageInput = {
  /** The channel id (groups.group_id) to publish to. */
  channelId: Scalars['BigInt']['input'];
  /** The message payload, base64-encoded. Opaque to the server; decode per your application protocol. Max 1024 bytes. */
  payload: Scalars['String']['input'];
  /** Client's sequence number for this message (0-255, wraps). Used to match error responses. */
  sequenceNumber?: InputMaybe<Scalars['Int']['input']>;
  /** The sender's actor UUID (your own actor's UUID). Must be exactly 32 bytes when encoded as UTF-8. */
  uuid: Scalars['String']['input'];
};

/** Notification received when a message is published to a channel you are a member of. Delivered over the udpNotifications subscription to every active channel member. */
export type ChannelMessageNotification = {
  __typename?: 'ChannelMessageNotification';
  /** The channel id (groups.group_id) the message was sent to. */
  channelId: Scalars['BigInt']['output'];
  /** Server-generated epoch milliseconds timestamp. */
  epochMillis: Scalars['BigInt']['output'];
  /** The message payload, base64-encoded. Opaque to the server; decode per your application protocol. */
  payload: Scalars['String']['output'];
  /** The sender's sequence number for this message (0-255). */
  sequenceNumber: Scalars['Int']['output'];
  /** The sending actor's UUID. */
  uuid: Scalars['String']['output'];
};

export type Checkout = {
  __typename?: 'Checkout';
  amountCents: Maybe<Scalars['BigInt']['output']>;
  appId: Maybe<Scalars['BigInt']['output']>;
  checkoutId: Scalars['BigInt']['output'];
  completedAt: Maybe<Scalars['DateTime']['output']>;
  createdAt: Scalars['DateTime']['output'];
  currency: Maybe<Scalars['String']['output']>;
  error: Maybe<Scalars['String']['output']>;
  expiresAt: Maybe<Scalars['DateTime']['output']>;
  /** Stripe Checkout Session id, PayPal Order id, etc. */
  externalId: Scalars['String']['output'];
  /** URL to redirect the user to. */
  externalUrl: Scalars['String']['output'];
  orgId: Maybe<Scalars['BigInt']['output']>;
  provider: PaymentProvider;
  purpose: CheckoutPurpose;
  status: CheckoutStatus;
  tierId: Maybe<Scalars['BigInt']['output']>;
  userId: Scalars['BigInt']['output'];
};

export type CheckoutFilterInput = {
  appId?: InputMaybe<Scalars['BigInt']['input']>;
  orgId?: InputMaybe<Scalars['BigInt']['input']>;
  provider?: InputMaybe<PaymentProvider>;
  purpose?: InputMaybe<CheckoutPurpose>;
  status?: InputMaybe<CheckoutStatus>;
  userId?: InputMaybe<Scalars['BigInt']['input']>;
};

/** Why the checkout exists. Drives which side effect runs on webhook completion: ORG_WALLET_TOPUP credits an org_wallet; APP_ACCESS_PURCHASE upserts app_user_access; DONATION inserts donations; PROPERTY_TOKENS credits property_tokens. */
export enum CheckoutPurpose {
  AppAccessPurchase = 'APP_ACCESS_PURCHASE',
  Donation = 'DONATION',
  OrgWalletTopup = 'ORG_WALLET_TOPUP',
  PropertyTokens = 'PROPERTY_TOKENS'
}

/** Lifecycle state of a Checkout. Updated by webhook reconciliation, not by the redirect URL. */
export enum CheckoutStatus {
  Canceled = 'CANCELED',
  Completed = 'COMPLETED',
  Expired = 'EXPIRED',
  Failed = 'FAILED',
  Pending = 'PENDING'
}

export type CheckoutsPage = {
  __typename?: 'CheckoutsPage';
  items: Array<Checkout>;
  pageInfo: PageInfo;
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

export type CksBuddyHealth = {
  __typename?: 'CksBuddyHealth';
  clientPort: Maybe<Scalars['Int']['output']>;
  clients: Maybe<Scalars['Int']['output']>;
  /** Seconds since server_status.updated_at (game DB heartbeat). */
  heartbeatAgeSec: Maybe<Scalars['Float']['output']>;
  ip4: Maybe<Scalars['String']['output']>;
  /** True when heartbeat is missing or older than the staleness threshold (~30s). Game-api rejects assignment when age > ~11s. */
  isStale: Scalars['Boolean']['output'];
  /** False when no server_status row exists for this environment. */
  registered: Scalars['Boolean']['output'];
  status: Maybe<Scalars['String']['output']>;
  /** Operator-facing hint when multiplayer assignment may fail. */
  troubleshootingHint: Scalars['String']['output'];
  updatedAt: Maybe<Scalars['DateTime']['output']>;
};

export type CksDeployProgress = {
  __typename?: 'CksDeployProgress';
  /** Redeploy is allowed (failed deploy or stuck order cleared) */
  canRetry: Scalars['Boolean']['output'];
  changeOrderId: Scalars['String']['output'];
  changeOrderStatus: Scalars['String']['output'];
  currentStepKind: Maybe<Scalars['String']['output']>;
  currentTaskKind: Maybe<Scalars['String']['output']>;
  error: Maybe<Scalars['String']['output']>;
  /** True when the deploy failed but the change order was left in_progress */
  isStuck: Scalars['Boolean']['output'];
  targetVersion: Maybe<Scalars['String']['output']>;
  tasks: Array<CksDeployProgressTask>;
  tasksFailed: Scalars['Int']['output'];
  tasksInProgress: Scalars['Int']['output'];
  tasksPending: Scalars['Int']['output'];
  tasksSucceeded: Scalars['Int']['output'];
  tasksTotal: Scalars['Int']['output'];
};

export type CksDeployProgressStep = {
  __typename?: 'CksDeployProgressStep';
  attempt: Scalars['Int']['output'];
  error: Maybe<Scalars['String']['output']>;
  id: Scalars['String']['output'];
  kind: Scalars['String']['output'];
  /** Human-readable step label for the org UI */
  label: Scalars['String']['output'];
  status: Scalars['String']['output'];
};

export type CksDeployProgressTask = {
  __typename?: 'CksDeployProgressTask';
  error: Maybe<Scalars['String']['output']>;
  id: Scalars['String']['output'];
  kind: Scalars['String']['output'];
  label: Scalars['String']['output'];
  status: Scalars['String']['output'];
  steps: Array<CksDeployProgressStep>;
};

export type CksEnvironment = {
  __typename?: 'CksEnvironment';
  billingGraceDeadline: Maybe<Scalars['DateTime']['output']>;
  billingStatus: Scalars['String']['output'];
  caddyFlavor: Maybe<Scalars['String']['output']>;
  createdAt: Scalars['DateTime']['output'];
  databaseFlavor: Maybe<Scalars['String']['output']>;
  desiredEnvironmentVersion: Maybe<Scalars['String']['output']>;
  displayName: Scalars['String']['output'];
  gameApiFlavor: Maybe<Scalars['String']['output']>;
  gameApiMaxServers: Scalars['Int']['output'];
  gameApiMinServers: Scalars['Int']['output'];
  id: Scalars['String']['output'];
  loadBalancerCount: Scalars['Int']['output'];
  observedEnvironmentVersion: Maybe<Scalars['String']['output']>;
  orgId: Scalars['BigInt']['output'];
  primaryCloud: Scalars['String']['output'];
  primaryRegion: Scalars['String']['output'];
  slug: Scalars['String']['output'];
  status: Scalars['String']['output'];
  subdomainHandle: Maybe<Scalars['String']['output']>;
  suspendedAt: Maybe<Scalars['DateTime']['output']>;
  udpBuddyFlavor: Maybe<Scalars['String']['output']>;
  udpBuddyMaxServers: Scalars['Int']['output'];
  udpBuddyMinServers: Scalars['Int']['output'];
  updatedAt: Scalars['DateTime']['output'];
};

export type CksEnvironmentAudit = {
  __typename?: 'CksEnvironmentAudit';
  action: Scalars['String']['output'];
  createdAt: Scalars['DateTime']['output'];
  environmentId: Scalars['String']['output'];
  id: Scalars['String']['output'];
  payloadJson: Maybe<Scalars['String']['output']>;
};

export type CksEnvironmentBillingResource = {
  __typename?: 'CksEnvironmentBillingResource';
  componentKind: Scalars['String']['output'];
  currency: Scalars['String']['output'];
  customerHourlyPriceCents: Maybe<Scalars['BigInt']['output']>;
  environmentId: Scalars['String']['output'];
  flavorName: Maybe<Scalars['String']['output']>;
  id: Scalars['String']['output'];
  observedAt: Scalars['DateTime']['output'];
  provider: Scalars['String']['output'];
  region: Scalars['String']['output'];
  resourceId: Scalars['String']['output'];
  resourceName: Maybe<Scalars['String']['output']>;
  status: Scalars['String']['output'];
};

export type CksEnvironmentChangeOrder = {
  __typename?: 'CksEnvironmentChangeOrder';
  claimedAt: Maybe<Scalars['DateTime']['output']>;
  claimedBy: Maybe<Scalars['String']['output']>;
  createdAt: Scalars['DateTime']['output'];
  environmentId: Scalars['String']['output'];
  error: Maybe<Scalars['String']['output']>;
  finishedAt: Maybe<Scalars['DateTime']['output']>;
  id: Scalars['String']['output'];
  kind: Scalars['String']['output'];
  payloadJson: Scalars['String']['output'];
  requestedBy: Maybe<Scalars['BigInt']['output']>;
  status: Scalars['String']['output'];
  updatedAt: Scalars['DateTime']['output'];
};

export type CksEnvironmentComponent = {
  __typename?: 'CksEnvironmentComponent';
  desiredSpecJson: Maybe<Scalars['String']['output']>;
  desiredVersion: Maybe<Scalars['String']['output']>;
  environmentId: Scalars['String']['output'];
  id: Scalars['String']['output'];
  kind: Scalars['String']['output'];
  lastObservedAt: Maybe<Scalars['DateTime']['output']>;
  observedSpecJson: Maybe<Scalars['String']['output']>;
  observedVersion: Maybe<Scalars['String']['output']>;
  status: Maybe<Scalars['String']['output']>;
};

export type CksEnvironmentDetail = {
  __typename?: 'CksEnvironmentDetail';
  audit: Array<CksEnvironmentAudit>;
  billingResources: Array<CksEnvironmentBillingResource>;
  /** Buddy UDP server heartbeat from mirrored server_status. Null when env is destroyed or management DB has no row. */
  buddyHealth: Maybe<CksBuddyHealth>;
  changeOrders: Array<CksEnvironmentChangeOrder>;
  components: Array<CksEnvironmentComponent>;
  /** Live deploy task/step progress for the active or most recent failed deploy */
  deployProgress: Maybe<CksDeployProgress>;
  environment: CksEnvironment;
  outputs: Array<CksEnvironmentOutput>;
  secrets: Array<CksEnvironmentSecretValue>;
};

export type CksEnvironmentOutput = {
  __typename?: 'CksEnvironmentOutput';
  componentKind: Scalars['String']['output'];
  environmentId: Scalars['String']['output'];
  id: Scalars['String']['output'];
  label: Scalars['String']['output'];
  name: Scalars['String']['output'];
  value: Scalars['String']['output'];
  valueKind: Scalars['String']['output'];
};

export type CksEnvironmentQuote = {
  __typename?: 'CksEnvironmentQuote';
  availableBalanceCents: Scalars['BigInt']['output'];
  caddyFlavor: Scalars['String']['output'];
  canCreate: Scalars['Boolean']['output'];
  currency: Scalars['String']['output'];
  databaseFlavor: Scalars['String']['output'];
  datacenter: Scalars['String']['output'];
  firstDayReserveCents: Scalars['BigInt']['output'];
  gameApiFlavor: Scalars['String']['output'];
  gameApiMaxServers: Scalars['Int']['output'];
  gameApiMinServers: Scalars['Int']['output'];
  hourlyCostCents: Scalars['BigInt']['output'];
  loadBalancerCount: Scalars['Int']['output'];
  udpBuddyFlavor: Scalars['String']['output'];
  udpBuddyMaxServers: Scalars['Int']['output'];
  udpBuddyMinServers: Scalars['Int']['output'];
  walletBalanceCents: Scalars['BigInt']['output'];
};

export type CksEnvironmentSecretValue = {
  __typename?: 'CksEnvironmentSecretValue';
  createdAt: Scalars['DateTime']['output'];
  environmentId: Scalars['String']['output'];
  id: Scalars['String']['output'];
  kind: Maybe<Scalars['String']['output']>;
  name: Scalars['String']['output'];
  sealedCiphertextBase64: Scalars['String']['output'];
  updatedAt: Scalars['DateTime']['output'];
};

export type CksEnvironmentVersion = {
  __typename?: 'CksEnvironmentVersion';
  /** Pinned cks-game-api git tag from the ingested manifest. */
  gameApiGitTag: Maybe<Scalars['String']['output']>;
  notes: Maybe<Scalars['String']['output']>;
  releasedAt: Scalars['DateTime']['output'];
  status: Scalars['String']['output'];
  version: Scalars['String']['output'];
};

export type CksOvhDatacenter = {
  __typename?: 'CksOvhDatacenter';
  city: Maybe<Scalars['String']['output']>;
  continent: Maybe<Scalars['String']['output']>;
  isAvailable: Scalars['Boolean']['output'];
  name: Maybe<Scalars['String']['output']>;
  region: Scalars['String']['output'];
  /** Number of customer-selectable instances in this datacenter after availability, pricing, and admin visibility filters. */
  selectableInstanceCount: Scalars['Int']['output'];
  status: Scalars['String']['output'];
  syncedAt: Scalars['DateTime']['output'];
};

/** Customer-selectable catalog instance flavor. Hidden, unavailable, or unpriced rows are omitted from environmentFlavors. */
export type CksOvhFlavor = {
  __typename?: 'CksOvhFlavor';
  availabilityStatus: Scalars['String']['output'];
  currency: Scalars['String']['output'];
  /** Customer hourly price in cents. Non-null for every flavor returned from environmentFlavors. */
  customerHourlyPriceCents: Scalars['BigInt']['output'];
  /** Customer monthly reference price in cents. Display-only until monthly billing is implemented. */
  customerMonthlyPriceCents: Maybe<Scalars['BigInt']['output']>;
  diskGb: Maybe<Scalars['Int']['output']>;
  flavorName: Scalars['String']['output'];
  flavorType: Maybe<Scalars['String']['output']>;
  pricingMode: Scalars['String']['output'];
  pricingSource: Maybe<Scalars['String']['output']>;
  quotaAvailable: Maybe<Scalars['Int']['output']>;
  ramMb: Maybe<Scalars['Int']['output']>;
  rawHourlyCostCents: Maybe<Scalars['BigInt']['output']>;
  syncedAt: Scalars['DateTime']['output'];
  vcpus: Maybe<Scalars['Int']['output']>;
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

/** Operator-facing view of cks_environments. */
export type CpAdminEnvironment = {
  __typename?: 'CpAdminEnvironment';
  createdAt: Scalars['DateTime']['output'];
  deletionProtectionEnabled: Scalars['Boolean']['output'];
  deletionProtectionSetAt: Maybe<Scalars['DateTime']['output']>;
  deletionProtectionSetByEmail: Maybe<Scalars['String']['output']>;
  displayName: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  orgId: Maybe<Scalars['String']['output']>;
  primaryCloud: Scalars['String']['output'];
  primaryRegion: Scalars['String']['output'];
  slug: Scalars['String']['output'];
  status: Scalars['String']['output'];
  subdomainHandle: Maybe<Scalars['String']['output']>;
  updatedAt: Scalars['DateTime']['output'];
};

export type CpAdminEnvironmentsPage = {
  __typename?: 'CpAdminEnvironmentsPage';
  page: Scalars['Int']['output'];
  pageSize: Scalars['Int']['output'];
  rows: Array<CpAdminEnvironment>;
  total: Scalars['Int']['output'];
};

export type CpAuditEntry = {
  __typename?: 'CpAuditEntry';
  action: Scalars['String']['output'];
  actorKind: Scalars['String']['output'];
  actorUserId: Maybe<Scalars['String']['output']>;
  createdAt: Scalars['DateTime']['output'];
  entityId: Maybe<Scalars['String']['output']>;
  entityKind: Maybe<Scalars['String']['output']>;
  environmentId: Maybe<Scalars['String']['output']>;
  id: Scalars['ID']['output'];
  payloadJson: Maybe<Scalars['String']['output']>;
};

export type CpBuddyLiveRates = {
  __typename?: 'CpBuddyLiveRates';
  clientRecvMbitPerSec: Scalars['Float']['output'];
  clientRecvMsgsPerSec: Scalars['Float']['output'];
  clientSendMbitPerSec: Scalars['Float']['output'];
  clientSendMsgsPerSec: Scalars['Float']['output'];
  clients: Scalars['Float']['output'];
  serverId: Scalars['String']['output'];
  updatedAt: Scalars['DateTime']['output'];
};

export type CpChangeOrder = {
  __typename?: 'CpChangeOrder';
  claimedAt: Maybe<Scalars['DateTime']['output']>;
  claimedBy: Maybe<Scalars['String']['output']>;
  createdAt: Scalars['DateTime']['output'];
  environmentId: Scalars['String']['output'];
  error: Maybe<Scalars['String']['output']>;
  finishedAt: Maybe<Scalars['DateTime']['output']>;
  id: Scalars['ID']['output'];
  kind: Scalars['String']['output'];
  /** JSON-encoded payload */
  payloadJson: Maybe<Scalars['String']['output']>;
  status: Scalars['String']['output'];
  updatedAt: Scalars['DateTime']['output'];
};

export type CpChangeOrderDetail = {
  __typename?: 'CpChangeOrderDetail';
  order: CpChangeOrder;
  steps: Array<CpStepRow>;
  tasks: Array<CpTaskRow>;
};

export type CpChangeOrdersPage = {
  __typename?: 'CpChangeOrdersPage';
  page: Scalars['Int']['output'];
  pageSize: Scalars['Int']['output'];
  rows: Array<CpChangeOrder>;
  total: Scalars['Int']['output'];
};

export type CpEnvSecretRow = {
  __typename?: 'CpEnvSecretRow';
  createdAt: Scalars['DateTime']['output'];
  environmentId: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  kind: Maybe<Scalars['String']['output']>;
  name: Scalars['String']['output'];
  rotatedAt: Maybe<Scalars['DateTime']['output']>;
};

/** Operator-facing view of one ingested (or git-only pending) environment release manifest. */
export type CpEnvironmentVersionRow = {
  __typename?: 'CpEnvironmentVersionRow';
  buddyVersion: Maybe<Scalars['String']['output']>;
  gameApiGitTag: Maybe<Scalars['String']['output']>;
  /** True when a row exists in cks_environment_versions. */
  inDb: Scalars['Boolean']['output'];
  /** True when releases/<version>.yaml exists on the configured git ref. */
  inGit: Scalars['Boolean']['output'];
  ingestedAt: Scalars['DateTime']['output'];
  /** True when this ingested available release is what org redeploy targets (newest available, or ENVIRONMENT_DEFAULT_VERSION). */
  isLatestAvailable: Scalars['Boolean']['output'];
  notes: Maybe<Scalars['String']['output']>;
  releasedAt: Scalars['DateTime']['output'];
  sourceCommit: Maybe<Scalars['String']['output']>;
  status: Scalars['String']['output'];
  updatedAt: Scalars['DateTime']['output'];
  version: Scalars['String']['output'];
};

/** Operator release manifest list merged from git and cks_environment_versions. */
export type CpEnvironmentVersionsPage = {
  __typename?: 'CpEnvironmentVersionsPage';
  /** False when GitHub manifest listing failed (e.g. invalid GITHUB_PAT). Rows may still come from the database. */
  gitSourceAvailable: Scalars['Boolean']['output'];
  /** Version org redeploy resolves to when no explicit version is passed. */
  latestAvailableVersion: Maybe<Scalars['String']['output']>;
  rows: Array<CpEnvironmentVersionRow>;
};

export type CpOperatorUser = {
  __typename?: 'CpOperatorUser';
  createdAt: Scalars['DateTime']['output'];
  email: Maybe<Scalars['String']['output']>;
  gamertag: Maybe<Scalars['String']['output']>;
  isOperator: Scalars['Boolean']['output'];
  isSuperAdmin: Scalars['Boolean']['output'];
  userId: Scalars['ID']['output'];
};

export type CpOvhCatalogRow = {
  __typename?: 'CpOvhCatalogRow';
  customerHourlyPriceCents: Maybe<Scalars['String']['output']>;
  customerPricingMode: Scalars['String']['output'];
  diskGb: Maybe<Scalars['Int']['output']>;
  flavorName: Scalars['String']['output'];
  inboundBandwidth: Maybe<Scalars['Int']['output']>;
  outboundBandwidth: Maybe<Scalars['Int']['output']>;
  ovhHourlyPriceCents: Maybe<Scalars['String']['output']>;
  quotaAvailable: Maybe<Scalars['Int']['output']>;
  ramMb: Maybe<Scalars['Int']['output']>;
  region: Scalars['String']['output'];
  vcpus: Maybe<Scalars['Int']['output']>;
};

/** Result of publishing an environment release from a game-api tag. */
export type CpPublishEnvironmentReleaseResult = {
  __typename?: 'CpPublishEnvironmentReleaseResult';
  /** True when releases/vX.Y.Z.yaml was committed to the manifest git ref. */
  committedToGit: Scalars['Boolean']['output'];
  /** Set when ingest succeeded but the GitHub manifest commit failed. */
  gitCommitError: Maybe<Scalars['String']['output']>;
  schemaChanged: Scalars['Boolean']['output'];
  version: CpEnvironmentVersionRow;
};

export type CpSecretRow = {
  __typename?: 'CpSecretRow';
  createdAt: Scalars['DateTime']['output'];
  environmentId: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  kind: Maybe<Scalars['String']['output']>;
  name: Scalars['String']['output'];
  rotatedAt: Maybe<Scalars['DateTime']['output']>;
};

export type CpStepRow = {
  __typename?: 'CpStepRow';
  attempt: Scalars['Int']['output'];
  claimedBy: Maybe<Scalars['String']['output']>;
  createdAt: Scalars['DateTime']['output'];
  error: Maybe<Scalars['String']['output']>;
  finishedAt: Maybe<Scalars['DateTime']['output']>;
  handleJson: Maybe<Scalars['String']['output']>;
  id: Scalars['ID']['output'];
  idempotencyKey: Maybe<Scalars['String']['output']>;
  intentJson: Maybe<Scalars['String']['output']>;
  kind: Scalars['String']['output'];
  ordinal: Scalars['Int']['output'];
  outputJson: Maybe<Scalars['String']['output']>;
  payloadJson: Maybe<Scalars['String']['output']>;
  recheckAt: Maybe<Scalars['DateTime']['output']>;
  startedAt: Maybe<Scalars['DateTime']['output']>;
  status: Scalars['String']['output'];
  taskId: Scalars['String']['output'];
  updatedAt: Scalars['DateTime']['output'];
};

export type CpTaskRow = {
  __typename?: 'CpTaskRow';
  changeOrderId: Scalars['String']['output'];
  /** JSON-encoded context */
  contextJson: Maybe<Scalars['String']['output']>;
  createdAt: Scalars['DateTime']['output'];
  dependsOn: Array<Scalars['String']['output']>;
  environmentId: Maybe<Scalars['String']['output']>;
  error: Maybe<Scalars['String']['output']>;
  finishedAt: Maybe<Scalars['DateTime']['output']>;
  id: Scalars['ID']['output'];
  kind: Scalars['String']['output'];
  ordinal: Scalars['Int']['output'];
  startedAt: Maybe<Scalars['DateTime']['output']>;
  status: Scalars['String']['output'];
  updatedAt: Scalars['DateTime']['output'];
};

/** cks-game-api tag on GitHub that is not yet pinned by any available environment release. */
export type CpUnreleasedGameApiTag = {
  __typename?: 'CpUnreleasedGameApiTag';
  /** Environment version that Publish & ingest would create (v0.1.N+1). */
  proposedEnvironmentVersion: Scalars['String']['output'];
  /** True when create-schema.sql differs between this tag and the current deploy-target game-api pin. */
  schemaChanged: Scalars['Boolean']['output'];
  tag: Scalars['String']['output'];
  /** ISO timestamp when the tag was created on GitHub. */
  taggedAt: Maybe<Scalars['String']['output']>;
};

/** Game-api tags eligible for one-click environment release publish. */
export type CpUnreleasedGameApiTagsPage = {
  __typename?: 'CpUnreleasedGameApiTagsPage';
  /** gameApiGitTag on the current org deploy target, if any. */
  currentDeployTargetGameApiTag: Maybe<Scalars['String']['output']>;
  /** False when GitHub tag listing failed (e.g. invalid GITHUB_PAT). */
  gitSourceAvailable: Scalars['Boolean']['output'];
  tags: Array<CpUnreleasedGameApiTag>;
};

export type CpUsageMinuteRow = {
  __typename?: 'CpUsageMinuteRow';
  minute: Scalars['DateTime']['output'];
  recvBytes: Scalars['String']['output'];
  recvMsgs: Maybe<Scalars['String']['output']>;
  sendBytes: Scalars['String']['output'];
  sendMsgs: Maybe<Scalars['String']['output']>;
};

export type CpUsageRatePeaks = {
  __typename?: 'CpUsageRatePeaks';
  avgSendMbitPerSec: Scalars['Float']['output'];
  avgSendMsgsPerSec: Scalars['Float']['output'];
  peakSendMbitPerSec: Scalars['Float']['output'];
  peakSendMsgsPerSec: Scalars['Float']['output'];
  sampleMinutes: Scalars['Float']['output'];
};

export type CpUsageSummary = {
  __typename?: 'CpUsageSummary';
  buddyLive: Maybe<CpBuddyLiveRates>;
  environmentSlug: Scalars['String']['output'];
  graphql: Array<CpUsageMinuteRow>;
  orgId: Maybe<Scalars['String']['output']>;
  replication: Array<CpUsageMinuteRow>;
  replicationRates: CpUsageRatePeaks;
};

export type CreateAccessTierInput = {
  appId: Scalars['BigInt']['input'];
  description?: InputMaybe<Scalars['String']['input']>;
  isDefault?: InputMaybe<Scalars['Boolean']['input']>;
  isFree?: InputMaybe<Scalars['Boolean']['input']>;
  name: Scalars['String']['input'];
  permissionKeys?: InputMaybe<Array<Scalars['String']['input']>>;
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

export type CreateAppInput = {
  description?: InputMaybe<Scalars['String']['input']>;
  metadata?: InputMaybe<Scalars['String']['input']>;
  name: Scalars['String']['input'];
  orgId: Scalars['BigInt']['input'];
  slug: Scalars['String']['input'];
  status?: InputMaybe<AppStatus>;
  visibility?: InputMaybe<AppVisibility>;
};

export type CreateAvatarInput = {
  name?: InputMaybe<Scalars['String']['input']>;
};

export type CreateChannelInput = {
  appId: Scalars['BigInt']['input'];
  description?: InputMaybe<Scalars['String']['input']>;
  /** When true (default), new members are auto-granted send_messages so they can post (open chat channel). When false, only roles you grant may post (announce/read-only channel). */
  membersCanSend?: InputMaybe<Scalars['Boolean']['input']>;
  /** open | request | invite | admin. Defaults to the app policy. */
  membershipPolicy?: InputMaybe<Scalars['String']['input']>;
  name: Scalars['String']['input'];
};

export type CreateCheckoutInput = {
  amountCents?: InputMaybe<Scalars['BigInt']['input']>;
  appId?: InputMaybe<Scalars['BigInt']['input']>;
  cancelUrl?: InputMaybe<Scalars['String']['input']>;
  currency?: InputMaybe<Scalars['String']['input']>;
  orgId?: InputMaybe<Scalars['BigInt']['input']>;
  provider: PaymentProvider;
  purpose: CheckoutPurpose;
  successUrl?: InputMaybe<Scalars['String']['input']>;
  tierId?: InputMaybe<Scalars['BigInt']['input']>;
};

export type CreateEnvironmentInput = {
  appIds?: InputMaybe<Array<Scalars['String']['input']>>;
  /** Flavor name from environmentFlavors(datacenter) for the Caddy LB VMs in front of the game-api fleet; must have a published hourly price. */
  caddyFlavor: Scalars['String']['input'];
  /** Flavor name from environmentFlavors(datacenter); must have a published hourly price. */
  databaseFlavor: Scalars['String']['input'];
  datacenter: Scalars['String']['input'];
  displayName: Scalars['String']['input'];
  /** Flavor name from environmentFlavors(datacenter) for per-tenant game-api VMs; must have a published hourly price. */
  gameApiFlavor: Scalars['String']['input'];
  gameApiMaxServers: Scalars['Int']['input'];
  gameApiMinServers: Scalars['Int']['input'];
  loadBalancerCount: Scalars['Int']['input'];
  orgId: Scalars['BigInt']['input'];
  /** Optional explicit slug for scripts/E2E. When omitted, the API generates an opaque e-{12} slug. */
  slug?: InputMaybe<Scalars['String']['input']>;
  /** Flavor name from environmentFlavors(datacenter); must have a published hourly price. */
  udpBuddyFlavor: Scalars['String']['input'];
  udpBuddyMaxServers: Scalars['Int']['input'];
  udpBuddyMinServers: Scalars['Int']['input'];
  x25519PublicKeyBase64: Scalars['String']['input'];
};

export type CreateGridInput = {
  appId: Scalars['BigInt']['input'];
  corner1: ChunkCoordinatesInput;
  corner2: ChunkCoordinatesInput;
};

export type CreateGridResponse = {
  __typename?: 'CreateGridResponse';
  error: UdpErrorCode;
  grid: Maybe<Grid>;
};

export type CreateGroupRoleInput = {
  groupId: Scalars['BigInt']['input'];
  permissions?: InputMaybe<Array<Scalars['String']['input']>>;
  rank?: InputMaybe<Scalars['Int']['input']>;
  roleName: Scalars['String']['input'];
};

export type CreateOrgRoleInput = {
  description?: InputMaybe<Scalars['String']['input']>;
  orgId: Scalars['BigInt']['input'];
  permissions: Array<Scalars['String']['input']>;
  roleName: Scalars['String']['input'];
};

export type CreateOrgTokenInput = {
  expiresAt?: InputMaybe<Scalars['DateTime']['input']>;
  label?: InputMaybe<Scalars['String']['input']>;
  orgId: Scalars['BigInt']['input'];
};

export type CreateOrganizationInput = {
  name: Scalars['String']['input'];
  slug: Scalars['String']['input'];
};

export type CreateTeamInput = {
  appId: Scalars['BigInt']['input'];
  description?: InputMaybe<Scalars['String']['input']>;
  /** open | request | invite | admin. Defaults to the app policy. */
  membershipPolicy?: InputMaybe<Scalars['String']['input']>;
  name: Scalars['String']['input'];
};

export type CreateUserAppStateInput = {
  appId: Scalars['BigInt']['input'];
  state?: InputMaybe<Scalars['String']['input']>;
};

export type DestroyEnvironmentInput = {
  orgId: Scalars['BigInt']['input'];
  slug: Scalars['String']['input'];
};

export type EnvironmentQuoteInput = {
  /** Flavor name from environmentFlavors(datacenter) for the Caddy LB VMs in front of the game-api fleet; must have a published hourly price. */
  caddyFlavor: Scalars['String']['input'];
  /** Flavor name from environmentFlavors(datacenter); must have a published hourly price. */
  databaseFlavor: Scalars['String']['input'];
  datacenter: Scalars['String']['input'];
  /** Flavor name from environmentFlavors(datacenter) for per-tenant game-api VMs; must have a published hourly price. */
  gameApiFlavor: Scalars['String']['input'];
  gameApiMaxServers: Scalars['Int']['input'];
  gameApiMinServers: Scalars['Int']['input'];
  loadBalancerCount: Scalars['Int']['input'];
  orgId: Scalars['BigInt']['input'];
  /** Flavor name from environmentFlavors(datacenter); must have a published hourly price. */
  udpBuddyFlavor: Scalars['String']['input'];
  udpBuddyMaxServers: Scalars['Int']['input'];
  udpBuddyMinServers: Scalars['Int']['input'];
};

export type EnvironmentUsageRollupRow = {
  __typename?: 'EnvironmentUsageRollupRow';
  displayName: Scalars['String']['output'];
  environmentId: Scalars['String']['output'];
  environmentSlug: Scalars['String']['output'];
  graphqlRecvBytes: Scalars['String']['output'];
  graphqlSendBytes: Scalars['String']['output'];
  replicationRecvBytes: Scalars['String']['output'];
  replicationSendBytes: Scalars['String']['output'];
};

export type EnvironmentUsageSummary = {
  __typename?: 'EnvironmentUsageSummary';
  buddyLive: Maybe<BuddyLiveRates>;
  environmentId: Scalars['String']['output'];
  environmentSlug: Scalars['String']['output'];
  graphql: Array<UsageMinuteRow>;
  orgId: Scalars['String']['output'];
  replication: Array<UsageMinuteRow>;
  replicationRates: UsageRatePeaks;
};

export type FreePlayWindowInfo = {
  __typename?: 'FreePlayWindowInfo';
  description: Scalars['String']['output'];
  isCurrentlyActive: Scalars['Boolean']['output'];
  nextWindowStart: Maybe<Scalars['String']['output']>;
};

/** Startup contract for browser game clients. Fetch this after login to initialize protocol/version checks and UDP proxy state in one round trip. */
export type GameClientBootstrap = {
  __typename?: 'GameClientBootstrap';
  appId: Scalars['BigInt']['output'];
  maxDecayRate: Scalars['Int']['output'];
  maxReplicationDistance: Scalars['Int']['output'];
  me: User;
  /** GraphQL WebSocket subprotocol expected by udpNotifications. */
  realtimeProtocol: Scalars['String']['output'];
  sequenceNumberModulo: Scalars['Int']['output'];
  /** GraphQL subscription field that carries UDP proxy notifications. */
  subscriptionName: Scalars['String']['output'];
  udpProxyConnectionStatus: UdpProxyConnectionStatus;
  versionInfo: ServerVersionInfo;
};

/** The elected host user of a game (app). Election is deterministic across all cks-game-api replicas: among actors that are still fresh (recently heartbeated), the user whose earliest actor was created first wins, with a uuid tiebreaker. Row lifecycle is owned by Buddy (cks-udp-api); liveness (updated_at) is owned by game-api's actorHeartbeat mutation. */
export type GameHost = {
  __typename?: 'GameHost';
  /** How many actors the host user currently owns in this app (always >= 1 when this object is returned). */
  actorCount: Scalars['Int']['output'];
  /** Timestamp of the host's earliest still-connected actor (`MIN(actors.created_at)` for the host's group). Used as the primary election ordering key. */
  earliestActorJoinedAt: Scalars['DateTime']['output'];
  /** The user_id of the elected host. Stable while this user has at least one fresh row in `actors` for the app; the next-oldest user takes over automatically once the current host stops heartbeating (its rows age past HOST_ACTOR_FRESHNESS_SECONDS) or Buddy idle-evicts its last row. */
  hostUserId: Scalars['BigInt']['output'];
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

export type GrantGridPermissionsInput = {
  appId: Scalars['BigInt']['input'];
  expiresAt?: InputMaybe<Scalars['DateTime']['input']>;
  gridId: Scalars['BigInt']['input'];
  permissionKeys: Array<Scalars['String']['input']>;
  userId: Scalars['BigInt']['input'];
};

export type GraphQlServer = {
  __typename?: 'GraphQLServer';
  apiPort: Scalars['Int']['output'];
  cpuUsagePct: Maybe<Scalars['Float']['output']>;
  createdAt: Scalars['DateTime']['output'];
  graphqlServerId: Scalars['ID']['output'];
  ip4: Maybe<Scalars['String']['output']>;
  ip6: Maybe<Scalars['String']['output']>;
  /** Logical kind of GraphQL service: 'management-api' or 'game-api'. */
  kind: Maybe<Scalars['String']['output']>;
  loadAverage1m: Maybe<Scalars['Float']['output']>;
  memoryUsagePct: Maybe<Scalars['Float']['output']>;
  providerInstanceId: Maybe<Scalars['String']['output']>;
  publicIp4: Maybe<Scalars['String']['output']>;
  publicIp6: Maybe<Scalars['String']['output']>;
  runtimeServerId: Maybe<Scalars['String']['output']>;
  status: ServerState;
  updatedAt: Scalars['DateTime']['output'];
};

export type GraphqlOperationUsageRow = {
  __typename?: 'GraphqlOperationUsageRow';
  operationName: Scalars['String']['output'];
  recvBytes: Scalars['String']['output'];
  sendBytes: Scalars['String']['output'];
  totalOps: Scalars['String']['output'];
};

export type Grid = {
  __typename?: 'Grid';
  app_id: Scalars['BigInt']['output'];
  created_at: Scalars['DateTime']['output'];
  grid_id: Scalars['BigInt']['output'];
  high_chunk: ChunkCoordinates;
  low_chunk: ChunkCoordinates;
};

export type GridGroupGrant = {
  __typename?: 'GridGroupGrant';
  appId: Scalars['BigInt']['output'];
  expiresAt: Maybe<Scalars['DateTime']['output']>;
  gridId: Scalars['BigInt']['output'];
  groupId: Scalars['BigInt']['output'];
  /** Null means the grant applies to all members of the group. */
  groupRoleId: Maybe<Scalars['BigInt']['output']>;
  permissionKey: Scalars['String']['output'];
};

export type GridPermissionLimits = {
  __typename?: 'GridPermissionLimits';
  appId: Scalars['BigInt']['output'];
  gridId: Scalars['BigInt']['output'];
  /** The permission keys this grid is limited to. Empty means no limit (every active grid permission is allowed). */
  permissionKeys: Array<Scalars['String']['output']>;
};

export type GridUserPermissions = {
  __typename?: 'GridUserPermissions';
  appId: Scalars['BigInt']['output'];
  gridId: Scalars['BigInt']['output'];
  permissionKeys: Array<Scalars['String']['output']>;
  userId: Scalars['BigInt']['output'];
};

export type Group = {
  __typename?: 'Group';
  appId: Scalars['BigInt']['output'];
  createdAt: Scalars['DateTime']['output'];
  /** Optional role auto-assigned to every new member (e.g. a channel "member" role granting send_messages). Null means new members get no role by default. */
  defaultRoleId: Maybe<Scalars['BigInt']['output']>;
  description: Maybe<Scalars['String']['output']>;
  groupId: Scalars['BigInt']['output'];
  groupType: Scalars['String']['output'];
  membershipPolicy: Scalars['String']['output'];
  name: Scalars['String']['output'];
  ownerUserId: Maybe<Scalars['BigInt']['output']>;
  status: Scalars['String']['output'];
};

export type GroupMember = {
  __typename?: 'GroupMember';
  createdAt: Scalars['DateTime']['output'];
  groupId: Scalars['BigInt']['output'];
  groupMemberId: Scalars['BigInt']['output'];
  roles: Array<GroupRole>;
  status: Scalars['String']['output'];
  userId: Scalars['BigInt']['output'];
};

export type GroupMembership = {
  __typename?: 'GroupMembership';
  group: Group;
  joinedAt: Scalars['DateTime']['output'];
  permissions: Array<Scalars['String']['output']>;
  roles: Array<GroupRole>;
};

export type GroupRole = {
  __typename?: 'GroupRole';
  createdAt: Scalars['DateTime']['output'];
  groupId: Scalars['BigInt']['output'];
  groupRoleId: Scalars['BigInt']['output'];
  isSystem: Scalars['Boolean']['output'];
  permissions: Array<Scalars['String']['output']>;
  rank: Scalars['Int']['output'];
  roleName: Scalars['String']['output'];
};

export type IngestEnvironmentVersionInput = {
  force?: Scalars['Boolean']['input'];
  notes?: InputMaybe<Scalars['String']['input']>;
  status?: InputMaybe<Scalars['String']['input']>;
  version: Scalars['String']['input'];
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
  /** Liveness heartbeat for the authenticated user's actors in an app. Refreshes actors.updated_at for every actor row the user owns so the user stays host-eligible, then returns the freshly-elected host (same shape as the gameHost query) so a client can fold its poll and heartbeat into one round-trip. Call on an interval shorter than HOST_ACTOR_FRESHNESS_SECONDS. Only refreshes rows that already exist (created by Buddy on chunk entry); returns null when no fresh actors exist for the app. */
  actorHeartbeat: Maybe<GameHost>;
  /** Add a user to a channel or approve a pending request (manage_members). */
  addChannelMember: GroupMember;
  /** Add a user to a team or approve a pending request (manage_members). */
  addTeamMember: GroupMember;
  archiveAccessTier: AppAccessTier;
  archiveApp: App;
  assignGroupToGrid: Array<GridGroupGrant>;
  /** Captures an approved PayPal order after the hosted checkout redirects back. Wallet credit still reconciles through PayPal webhooks. */
  capturePaypalCheckout: Checkout;
  changePassword: Scalars['Boolean']['output'];
  confirmEmail: Scalars['Boolean']['output'];
  /** Open the UDP proxy session for this game token (idempotent: returns the existing status if one is already open). Binds a socket and selects the game server with the fewest clients on first open. Optional: send mutations and udpNotifications also create a session lazily when none exists. To force a fresh socket, call disconnectUdpProxy first. */
  connectUdpProxy: UdpProxyConnectionStatus;
  createAccessTier: AppAccessTier;
  createActor: Actor;
  createApp: App;
  createAvatar: Avatar;
  /** Create a channel. Allowed per the app channel policy (admin | member | anyone). The creator becomes the owner with a system leader role. When membersCanSend is true (default), a default member role granting send_messages is created and auto-assigned to joiners. */
  createChannel: Group;
  /** Create a channel role (manage_roles). */
  createChannelRole: GroupRole;
  /** Creates a Checkout row, opens the provider session, and returns the row with externalUrl set. Redirect the user to externalUrl. Status starts PENDING and updates via webhook. */
  createCheckout: Checkout;
  /** Creates an environment only if each selected instance flavor is available and customer-priced in the catalog (same rule as environmentQuote). Use environmentFlavors / environmentDatacenters for valid options. */
  createEnvironment: CksEnvironmentDetail;
  createGrid: CreateGridResponse;
  createOrgRole: OrgRole;
  /** Returns the plaintext token exactly once. Save it; subsequent queries only show metadata. */
  createOrgToken: OrgTokenWithSecret;
  createOrganization: Organization;
  /** Create a team. Allowed per the app team policy (admin | member | anyone). The creator becomes the owner with a system leader role. */
  createTeam: Group;
  /** Create a team role (manage_roles). */
  createTeamRole: GroupRole;
  deleteActor: Actor;
  deleteAvatar: Avatar;
  /** Delete a channel (manage_group). */
  deleteChannel: Scalars['Boolean']['output'];
  /** Delete a non-system channel role (manage_roles). */
  deleteChannelRole: Scalars['Boolean']['output'];
  deleteCpSecret: Scalars['Boolean']['output'];
  /** Soft-deletes the caller's account: anonymizes PII, revokes sessions. Wallet, voxel, and donation history stays intact via FK. */
  deleteMyAccount: Scalars['Boolean']['output'];
  deleteOrgRole: Scalars['Boolean']['output'];
  deleteQuota: Scalars['Boolean']['output'];
  /** Delete a team (manage_group). */
  deleteTeam: Scalars['Boolean']['output'];
  /** Delete a non-system team role (manage_roles). */
  deleteTeamRole: Scalars['Boolean']['output'];
  deleteUserAppState: UserAppState;
  destroyEnvironment: CksEnvironmentChangeOrder;
  /** Close the UDP proxy session and socket for this game token. Unsubscribing from udpNotifications does not disconnect; use this mutation (or rely on server inactivity timeout). */
  disconnectUdpProxy: Scalars['Boolean']['output'];
  forceLogoutUser: Scalars['Boolean']['output'];
  grantAppAccess: AppUserAccess;
  grantGridPermissions: GridUserPermissions;
  ingestEnvironmentVersion: CpEnvironmentVersionRow;
  inviteOrgMember: OrgMember;
  /** Join a channel. Honors the channel membership policy (open -> active, request -> pending, otherwise rejected). */
  joinChannel: GroupMember;
  /** Join a team. Honors the team membership policy (open -> active, request -> pending, otherwise rejected). */
  joinTeam: GroupMember;
  /** Leave a channel. */
  leaveChannel: Scalars['Boolean']['output'];
  /** Leave a team. */
  leaveTeam: Scalars['Boolean']['output'];
  login: AuthResponse;
  logout: Scalars['Boolean']['output'];
  logoutAllDevices: Scalars['Boolean']['output'];
  publishEnvironmentReleaseFromGameApiTag: CpPublishEnvironmentReleaseResult;
  /** Permanently deletes a destroyed environment record from the platform. Cloud resources must already be torn down via destroyEnvironment. */
  purgeEnvironment: Scalars['Boolean']['output'];
  putCpEnvSecret: CpEnvSecretRow;
  putCpSecret: CpSecretRow;
  /** Redeploys the environment to the latest available release version (or the configured default), reusing its current flavors/scaling and linked apps. Preserves the environment URLs. No-op-safe: re-running when already at latest still redeploys. If a prior deploy failed but stayed in_progress, it is abandoned first so the redeploy can proceed. */
  redeployEnvironment: CksEnvironmentChangeOrder;
  register: AuthResponse;
  /** Remove a member from a channel (manage_members; members may remove themselves). */
  removeChannelMember: Scalars['Boolean']['output'];
  removeOrgMember: Scalars['Boolean']['output'];
  /** Remove a member from a team (manage_members; members may remove themselves). */
  removeTeamMember: Scalars['Boolean']['output'];
  requestPasswordReset: Scalars['Boolean']['output'];
  /** Request to join a request-only channel (creates a pending membership a manager can approve). */
  requestToJoinChannel: GroupMember;
  /** Request to join a request-only team (creates a pending membership a manager can approve). */
  requestToJoinTeam: GroupMember;
  resendConfirmationEmail: Scalars['Boolean']['output'];
  resetPassword: Scalars['Boolean']['output'];
  /** SSH-restarts the Buddy systemd service on the active UDP runtime VM. Symptom relief when server_status heartbeat is stale; does not replace cks-udp-api pool fixes. */
  restartEnvironmentServices: CksEnvironmentChangeOrder;
  resumeEnvironment: CksEnvironmentChangeOrder;
  revokeAppAccess: AppUserAccess;
  revokeGridPermissions: GridUserPermissions;
  revokeGroupFromGrid: Array<GridGroupGrant>;
  revokeOrgToken: Scalars['Boolean']['output'];
  /** Reverts every voxel edit by `userId` in `appId` between `from` and `to`. Gated by the org permission `manage_apps`. Defaults to dryRun=true; pass dryRun=false to apply. */
  rollbackVoxelUpdates: Array<RollbackVoxelEventResult>;
  /** Send an actor update to the game server. Opens a UDP proxy session automatically if none exists. Responses and GenericErrorResponse are delivered on udpNotifications. */
  sendActorUpdate: Scalars['Boolean']['output'];
  /** Send a voice audio packet to the game server. Opens a UDP proxy session automatically if none exists; notifications arrive on udpNotifications. */
  sendAudioPacket: Scalars['Boolean']['output'];
  /** Publish a message to a channel. Delivered to every active member of the channel via udpNotifications (ChannelMessageNotification). Requires the channel send_messages permission; the server drops the message otherwise. Opens a UDP proxy session automatically if none exists. The sender receives no echo. */
  sendChannelMessage: Scalars['Boolean']['output'];
  /** Send a client event to the game server. Opens a UDP proxy session automatically if none exists; related notifications arrive on udpNotifications. */
  sendClientEvent: Scalars['Boolean']['output'];
  /** Send a direct actor-to-actor message, delivered only to the actor identified by targetUuid (not broadcast to nearby actors). The sender must know the destination actor’s chunk. Opens a UDP proxy session automatically if none exists; the target receives a SingleActorMessageNotification on udpNotifications. The sender receives no echo. */
  sendSingleActorMessage: Scalars['Boolean']['output'];
  /** Send a text (chat) packet to the game server. Opens a UDP proxy session automatically if none exists; notifications arrive on udpNotifications. */
  sendTextPacket: Scalars['Boolean']['output'];
  /** Send a voxel update to the game server. Opens a UDP proxy session automatically if none exists; responses arrive on udpNotifications. */
  sendVoxelUpdate: Scalars['Boolean']['output'];
  setAppBudget: AppBudget;
  /** Super admin only. Used to take down or relist apps platform-wide. */
  setAppVisibility: App;
  /** Replace a member's channel roles (manage_roles). Re-pushes the member's effective send permission to Buddy. */
  setChannelMemberRoles: GroupMember;
  /** Set who may create channels in an app and the default membership policy for new channels (requires manage_apps). */
  setChannelPolicy: AppGroupPolicy;
  setEarlyAccessOverride: User;
  setEnvironmentDeletionProtection: Scalars['Boolean']['output'];
  setGridPermissionLimits: GridPermissionLimits;
  /** Super-admin only. Flip users.is_operator to grant or revoke control-plane / operator access. */
  setOperator: User;
  /** Super admin only. Used to freeze/unfreeze orgs platform-wide. */
  setOrgStatus: Organization;
  setQuota: ServiceQuota;
  setSuperAdmin: User;
  /** Replace a member's roles (manage_roles). */
  setTeamMemberRoles: GroupMember;
  /** Set who may create teams in an app and the default membership policy for new teams (requires manage_apps). */
  setTeamPolicy: AppGroupPolicy;
  teleportRequest: TeleportResponse;
  updateAccessTier: AppAccessTier;
  updateActor: Actor;
  updateActorState: Actor;
  updateApp: App;
  updateAvatar: Avatar;
  /** Set an avatar's per-app state. Only the avatar's owner may write; all players can read it. */
  updateAvatarAppState: AppAvatarState;
  updateAvatarState: Avatar;
  /** Update channel name/description/membership policy (manage_group). */
  updateChannel: Group;
  /** Update a channel role (manage_roles). */
  updateChannelRole: GroupRole;
  updateChunk: Chunk;
  updateChunkLods: Maybe<Chunk>;
  updateChunkState: Maybe<Chunk>;
  updateEnvironmentScaling: CksEnvironmentChangeOrder;
  updateGamertag: User;
  updateOrgMemberRoles: OrgMember;
  updateOrgRole: OrgRole;
  updateOrgToken: OrgToken;
  /** Update team name/description/membership policy (manage_group). */
  updateTeam: Group;
  /** Update a team role (manage_roles). */
  updateTeamRole: GroupRole;
  updateUserAppState: UserAppState;
  updateUserState: User;
  updateUserType: User;
  updateVoxel: Voxel;
  yankEnvironmentVersion: Scalars['Boolean']['output'];
};


export type MutationActorHeartbeatArgs = {
  appId: Scalars['BigInt']['input'];
};


export type MutationAddChannelMemberArgs = {
  groupId: Scalars['BigInt']['input'];
  userId: Scalars['BigInt']['input'];
};


export type MutationAddTeamMemberArgs = {
  groupId: Scalars['BigInt']['input'];
  userId: Scalars['BigInt']['input'];
};


export type MutationArchiveAccessTierArgs = {
  tierId: Scalars['BigInt']['input'];
};


export type MutationArchiveAppArgs = {
  appId: Scalars['BigInt']['input'];
};


export type MutationAssignGroupToGridArgs = {
  input: AssignGroupToGridInput;
};


export type MutationCapturePaypalCheckoutArgs = {
  orderId: Scalars['String']['input'];
};


export type MutationChangePasswordArgs = {
  currentPassword: Scalars['String']['input'];
  newPassword: Scalars['String']['input'];
};


export type MutationConfirmEmailArgs = {
  token: Scalars['String']['input'];
};


export type MutationCreateAccessTierArgs = {
  input: CreateAccessTierInput;
};


export type MutationCreateActorArgs = {
  input: CreateActorInput;
};


export type MutationCreateAppArgs = {
  input: CreateAppInput;
};


export type MutationCreateAvatarArgs = {
  input: CreateAvatarInput;
};


export type MutationCreateChannelArgs = {
  input: CreateChannelInput;
};


export type MutationCreateChannelRoleArgs = {
  input: CreateGroupRoleInput;
};


export type MutationCreateCheckoutArgs = {
  input: CreateCheckoutInput;
};


export type MutationCreateEnvironmentArgs = {
  input: CreateEnvironmentInput;
};


export type MutationCreateGridArgs = {
  input: CreateGridInput;
};


export type MutationCreateOrgRoleArgs = {
  input: CreateOrgRoleInput;
};


export type MutationCreateOrgTokenArgs = {
  input: CreateOrgTokenInput;
};


export type MutationCreateOrganizationArgs = {
  input: CreateOrganizationInput;
};


export type MutationCreateTeamArgs = {
  input: CreateTeamInput;
};


export type MutationCreateTeamRoleArgs = {
  input: CreateGroupRoleInput;
};


export type MutationDeleteActorArgs = {
  uuid: Scalars['String']['input'];
};


export type MutationDeleteAvatarArgs = {
  id: Scalars['BigInt']['input'];
};


export type MutationDeleteChannelArgs = {
  groupId: Scalars['BigInt']['input'];
};


export type MutationDeleteChannelRoleArgs = {
  groupRoleId: Scalars['BigInt']['input'];
};


export type MutationDeleteCpSecretArgs = {
  environmentId: Scalars['String']['input'];
  name: Scalars['String']['input'];
};


export type MutationDeleteOrgRoleArgs = {
  orgRoleId: Scalars['BigInt']['input'];
};


export type MutationDeleteQuotaArgs = {
  quotaId: Scalars['BigInt']['input'];
};


export type MutationDeleteTeamArgs = {
  groupId: Scalars['BigInt']['input'];
};


export type MutationDeleteTeamRoleArgs = {
  groupRoleId: Scalars['BigInt']['input'];
};


export type MutationDeleteUserAppStateArgs = {
  appId: Scalars['BigInt']['input'];
};


export type MutationDestroyEnvironmentArgs = {
  input: DestroyEnvironmentInput;
};


export type MutationForceLogoutUserArgs = {
  userId: Scalars['BigInt']['input'];
};


export type MutationGrantAppAccessArgs = {
  input: GrantAppAccessInput;
};


export type MutationGrantGridPermissionsArgs = {
  input: GrantGridPermissionsInput;
};


export type MutationIngestEnvironmentVersionArgs = {
  input: IngestEnvironmentVersionInput;
};


export type MutationInviteOrgMemberArgs = {
  input: InviteOrgMemberInput;
};


export type MutationJoinChannelArgs = {
  groupId: Scalars['BigInt']['input'];
};


export type MutationJoinTeamArgs = {
  groupId: Scalars['BigInt']['input'];
};


export type MutationLeaveChannelArgs = {
  groupId: Scalars['BigInt']['input'];
};


export type MutationLeaveTeamArgs = {
  groupId: Scalars['BigInt']['input'];
};


export type MutationLoginArgs = {
  loginUserInput: LoginUserInput;
};


export type MutationPublishEnvironmentReleaseFromGameApiTagArgs = {
  input: PublishEnvironmentReleaseFromGameApiTagInput;
};


export type MutationPurgeEnvironmentArgs = {
  input: PurgeEnvironmentInput;
};


export type MutationPutCpEnvSecretArgs = {
  environmentId: Scalars['String']['input'];
  kind?: InputMaybe<Scalars['String']['input']>;
  name: Scalars['String']['input'];
  plaintext: Scalars['String']['input'];
};


export type MutationPutCpSecretArgs = {
  environmentId: Scalars['String']['input'];
  kind?: InputMaybe<Scalars['String']['input']>;
  name: Scalars['String']['input'];
  plaintext: Scalars['String']['input'];
};


export type MutationRedeployEnvironmentArgs = {
  input: RedeployEnvironmentInput;
};


export type MutationRegisterArgs = {
  registerUserInput: RegisterUserInput;
};


export type MutationRemoveChannelMemberArgs = {
  groupId: Scalars['BigInt']['input'];
  userId: Scalars['BigInt']['input'];
};


export type MutationRemoveOrgMemberArgs = {
  orgId: Scalars['BigInt']['input'];
  userId: Scalars['BigInt']['input'];
};


export type MutationRemoveTeamMemberArgs = {
  groupId: Scalars['BigInt']['input'];
  userId: Scalars['BigInt']['input'];
};


export type MutationRequestPasswordResetArgs = {
  email: Scalars['String']['input'];
};


export type MutationRequestToJoinChannelArgs = {
  groupId: Scalars['BigInt']['input'];
};


export type MutationRequestToJoinTeamArgs = {
  groupId: Scalars['BigInt']['input'];
};


export type MutationResendConfirmationEmailArgs = {
  email: Scalars['String']['input'];
};


export type MutationResetPasswordArgs = {
  resetPasswordInput: ResetPasswordInput;
};


export type MutationRestartEnvironmentServicesArgs = {
  input: RestartEnvironmentServicesInput;
};


export type MutationResumeEnvironmentArgs = {
  input: ResumeEnvironmentInput;
};


export type MutationRevokeAppAccessArgs = {
  appId: Scalars['BigInt']['input'];
  userId: Scalars['BigInt']['input'];
};


export type MutationRevokeGridPermissionsArgs = {
  input: RevokeGridPermissionsInput;
};


export type MutationRevokeGroupFromGridArgs = {
  input: RevokeGroupFromGridInput;
};


export type MutationRevokeOrgTokenArgs = {
  orgTokenId: Scalars['BigInt']['input'];
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


export type MutationSendChannelMessageArgs = {
  input: ChannelMessageInput;
};


export type MutationSendClientEventArgs = {
  input: ClientEventNotificationInput;
};


export type MutationSendSingleActorMessageArgs = {
  input: SingleActorMessageInput;
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


export type MutationSetAppVisibilityArgs = {
  appId: Scalars['BigInt']['input'];
  visibility: AppVisibility;
};


export type MutationSetChannelMemberRolesArgs = {
  input: SetMemberRolesInput;
};


export type MutationSetChannelPolicyArgs = {
  input: SetChannelPolicyInput;
};


export type MutationSetEarlyAccessOverrideArgs = {
  userId: Scalars['BigInt']['input'];
  value: Scalars['Boolean']['input'];
};


export type MutationSetEnvironmentDeletionProtectionArgs = {
  enabled: Scalars['Boolean']['input'];
  environmentId: Scalars['String']['input'];
};


export type MutationSetGridPermissionLimitsArgs = {
  input: SetGridPermissionLimitsInput;
};


export type MutationSetOperatorArgs = {
  userId: Scalars['BigInt']['input'];
  value: Scalars['Boolean']['input'];
};


export type MutationSetOrgStatusArgs = {
  orgId: Scalars['BigInt']['input'];
  status: Scalars['String']['input'];
};


export type MutationSetQuotaArgs = {
  input: SetQuotaInput;
};


export type MutationSetSuperAdminArgs = {
  userId: Scalars['BigInt']['input'];
  value: Scalars['Boolean']['input'];
};


export type MutationSetTeamMemberRolesArgs = {
  input: SetMemberRolesInput;
};


export type MutationSetTeamPolicyArgs = {
  input: SetTeamPolicyInput;
};


export type MutationTeleportRequestArgs = {
  input: TeleportRequestInput;
};


export type MutationUpdateAccessTierArgs = {
  input: UpdateAccessTierInput;
  tierId: Scalars['BigInt']['input'];
};


export type MutationUpdateActorArgs = {
  input: UpdateActorInput;
  uuid: Scalars['String']['input'];
};


export type MutationUpdateActorStateArgs = {
  input: UpdateActorStateInput;
  uuid: Scalars['String']['input'];
};


export type MutationUpdateAppArgs = {
  appId: Scalars['BigInt']['input'];
  input: UpdateAppInput;
};


export type MutationUpdateAvatarArgs = {
  id: Scalars['BigInt']['input'];
  input: UpdateAvatarInput;
};


export type MutationUpdateAvatarAppStateArgs = {
  input: UpdateAvatarAppStateInput;
};


export type MutationUpdateAvatarStateArgs = {
  id: Scalars['BigInt']['input'];
  input: UpdateAvatarStateInput;
};


export type MutationUpdateChannelArgs = {
  input: UpdateChannelInput;
};


export type MutationUpdateChannelRoleArgs = {
  input: UpdateGroupRoleInput;
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


export type MutationUpdateEnvironmentScalingArgs = {
  input: UpdateEnvironmentScalingInput;
};


export type MutationUpdateGamertagArgs = {
  input: UpdateGamertagInput;
};


export type MutationUpdateOrgMemberRolesArgs = {
  orgId: Scalars['BigInt']['input'];
  roleIds: Array<Scalars['BigInt']['input']>;
  userId: Scalars['BigInt']['input'];
};


export type MutationUpdateOrgRoleArgs = {
  input: UpdateOrgRoleInput;
  orgRoleId: Scalars['BigInt']['input'];
};


export type MutationUpdateOrgTokenArgs = {
  input: UpdateOrgTokenInput;
  orgTokenId: Scalars['BigInt']['input'];
};


export type MutationUpdateTeamArgs = {
  input: UpdateTeamInput;
};


export type MutationUpdateTeamRoleArgs = {
  input: UpdateGroupRoleInput;
};


export type MutationUpdateUserAppStateArgs = {
  input: CreateUserAppStateInput;
};


export type MutationUpdateUserStateArgs = {
  input: UpdateUserStateInput;
};


export type MutationUpdateUserTypeArgs = {
  userId: Scalars['BigInt']['input'];
  value: Scalars['String']['input'];
};


export type MutationUpdateVoxelArgs = {
  input: UpdateVoxelInput;
};


export type MutationYankEnvironmentVersionArgs = {
  version: Scalars['String']['input'];
};

export type NearbyGridPermissions = {
  __typename?: 'NearbyGridPermissions';
  appId: Scalars['BigInt']['output'];
  gridId: Scalars['BigInt']['output'];
  highChunk: ChunkCoordinates;
  lowChunk: ChunkCoordinates;
  permissionKeys: Array<Scalars['String']['output']>;
  userId: Scalars['BigInt']['output'];
};

export type NearbyGridPermissionsInput = {
  appId: Scalars['BigInt']['input'];
  highChunk: ChunkCoordinatesInput;
  lowChunk: ChunkCoordinatesInput;
  userId: Scalars['BigInt']['input'];
};

export type OrgMember = {
  __typename?: 'OrgMember';
  createdAt: Scalars['DateTime']['output'];
  orgId: Scalars['BigInt']['output'];
  orgMemberId: Scalars['BigInt']['output'];
  status: Scalars['String']['output'];
  updatedAt: Scalars['DateTime']['output'];
  userId: Scalars['BigInt']['output'];
};

/** Represents one user's membership in one organization. Bundles the org, the union of permissions across the user's assigned roles, and the role list itself - so the UI can render an org dashboard without a follow-up round trip. */
export type OrgMembership = {
  __typename?: 'OrgMembership';
  joinedAt: Scalars['DateTime']['output'];
  org: Organization;
  permissions: Array<Scalars['String']['output']>;
  roles: Array<OrgRole>;
};

export type OrgPermission = {
  __typename?: 'OrgPermission';
  category: Maybe<Scalars['String']['output']>;
  description: Maybe<Scalars['String']['output']>;
  permissionKey: Scalars['ID']['output'];
};

export type OrgRole = {
  __typename?: 'OrgRole';
  createdAt: Scalars['DateTime']['output'];
  description: Maybe<Scalars['String']['output']>;
  isSystem: Scalars['Boolean']['output'];
  orgId: Scalars['BigInt']['output'];
  orgRoleId: Scalars['BigInt']['output'];
  permissions: Array<Scalars['String']['output']>;
  roleName: Scalars['String']['output'];
};

export type OrgToken = {
  __typename?: 'OrgToken';
  createdAt: Scalars['DateTime']['output'];
  environmentId: Maybe<Scalars['String']['output']>;
  expiresAt: Maybe<Scalars['DateTime']['output']>;
  isActive: Scalars['Boolean']['output'];
  kind: Scalars['String']['output'];
  label: Maybe<Scalars['String']['output']>;
  lastUsedAt: Maybe<Scalars['DateTime']['output']>;
  orgId: Scalars['BigInt']['output'];
  orgTokenId: Scalars['BigInt']['output'];
  revokedAt: Maybe<Scalars['DateTime']['output']>;
  updatedAt: Scalars['DateTime']['output'];
};

/** Returned exactly once - on org token creation. The plaintext `token` field is never re-emitted. Future listings show metadata only via the `OrgToken` type. */
export type OrgTokenWithSecret = {
  __typename?: 'OrgTokenWithSecret';
  createdAt: Scalars['DateTime']['output'];
  expiresAt: Maybe<Scalars['DateTime']['output']>;
  isActive: Scalars['Boolean']['output'];
  label: Maybe<Scalars['String']['output']>;
  orgId: Scalars['BigInt']['output'];
  orgTokenId: Scalars['BigInt']['output'];
  /** The plaintext token. Save it now; it is not stored. */
  token: Scalars['String']['output'];
};

export type OrgWallet = {
  __typename?: 'OrgWallet';
  balanceCents: Scalars['BigInt']['output'];
  createdAt: Scalars['DateTime']['output'];
  currency: Scalars['String']['output'];
  orgId: Scalars['BigInt']['output'];
  updatedAt: Scalars['DateTime']['output'];
  walletId: Scalars['BigInt']['output'];
};

export type Organization = {
  __typename?: 'Organization';
  createdAt: Scalars['DateTime']['output'];
  name: Scalars['String']['output'];
  orgId: Scalars['BigInt']['output'];
  ownerUserId: Scalars['BigInt']['output'];
  slug: Scalars['String']['output'];
  status: Scalars['String']['output'];
  updatedAt: Scalars['DateTime']['output'];
};

export type PageInfo = {
  __typename?: 'PageInfo';
  limit: Scalars['Int']['output'];
  offset: Scalars['Int']['output'];
  totalCount: Scalars['Int']['output'];
};

export type PaymentEventRecord = {
  __typename?: 'PaymentEventRecord';
  checkoutId: Maybe<Scalars['BigInt']['output']>;
  createdAt: Scalars['DateTime']['output'];
  error: Maybe<Scalars['String']['output']>;
  eventId: Scalars['BigInt']['output'];
  eventType: Scalars['String']['output'];
  externalEventId: Scalars['String']['output'];
  processedAt: Maybe<Scalars['DateTime']['output']>;
  provider: PaymentProvider;
};

export type PaymentEventsPage = {
  __typename?: 'PaymentEventsPage';
  items: Array<PaymentEventRecord>;
  pageInfo: PageInfo;
};

/** External payment processor for a checkout. */
export enum PaymentProvider {
  Paypal = 'PAYPAL',
  Stripe = 'STRIPE'
}

export type PublishEnvironmentReleaseFromGameApiTagInput = {
  /** Overwrite an existing environment version row if it already exists. */
  force?: Scalars['Boolean']['input'];
  /** cks-game-api semver tag (e.g. v0.6.20). */
  gameApiTag: Scalars['String']['input'];
};

export type PurgeEnvironmentInput = {
  orgId: Scalars['BigInt']['input'];
  slug: Scalars['String']['input'];
};

export type Query = {
  __typename?: 'Query';
  /** Returns only active (ReadyForClients) GraphQL servers */
  activeGraphQLServers: Array<GraphQlServer>;
  actor: Actor;
  actors: Array<Actor>;
  app: Maybe<App>;
  /** Public listing of access tiers for an app. Used by the marketplace app detail page. */
  appAccessTiers: Array<AppAccessTier>;
  appBudget: Maybe<AppBudget>;
  appBudgets: Array<AppBudget>;
  appBySlug: Maybe<App>;
  /** Top GraphQL operations by bytes for an app in the time range. */
  appGraphqlOperations: Array<GraphqlOperationUsageRow>;
  /** Replication and GraphQL totals plus top operations for one app. */
  appUsageSummary: AppUsageSummary;
  appUserAccessByApp: Array<AppUserAccess>;
  /** Public marketplace listing. Returns visibility=PUBLIC + status=LIVE only. No auth required. */
  apps: AppsPage;
  appsForOrg: Array<App>;
  avatar: Avatar;
  /** Read one avatar's per-app state (public to all players). */
  avatarAppState: Maybe<AppAvatarState>;
  /** Batch-read per-app state for many avatars (public to all players). */
  avatarAppStates: Array<AppAvatarState>;
  batchLookupActors: Array<Actor>;
  /** Fetch one channel by id. */
  channel: Group;
  /** List the members of a channel. */
  channelMembers: Array<GroupMember>;
  /** The current channel creation/membership policy for an app. */
  channelPolicy: AppGroupPolicy;
  /** List the roles of a channel. */
  channelRoles: Array<GroupRole>;
  /** List active channels in an app. */
  channels: Array<Group>;
  /** Super admin only. Cross-tenant payments audit. */
  checkouts: CheckoutsPage;
  cpAudit: Array<CpAuditEntry>;
  cpChangeOrder: Maybe<CpChangeOrderDetail>;
  cpChangeOrders: CpChangeOrdersPage;
  cpEnvSecrets: Array<CpEnvSecretRow>;
  cpEnvironment: Maybe<CpAdminEnvironment>;
  cpEnvironmentVersions: CpEnvironmentVersionsPage;
  cpEnvironments: CpAdminEnvironmentsPage;
  cpOvhCatalogSummary: Array<CpOvhCatalogRow>;
  cpSecrets: Array<CpSecretRow>;
  cpUnreleasedGameApiTags: CpUnreleasedGameApiTagsPage;
  cpUsageSummary: CpUsageSummary;
  /** The most-specific quota that applies to (orgId, appId, tierId, metric). Walks tier -> app -> org -> free_tier_defaults. Returns null if nothing matches. */
  effectiveQuota: Maybe<ServiceQuota>;
  /** OVH datacenters that have at least one customer-priced instance flavor available for customer selection. */
  environmentDatacenters: Array<CksOvhDatacenter>;
  /** Customer-selectable instance flavors in the datacenter with current availability and customer pricing. */
  environmentFlavors: Array<CksOvhFlavor>;
  /** Pricing quote for the selected flavors. Fails if any flavor is unavailable, hidden, or lacks customer pricing. */
  environmentQuote: CksEnvironmentQuote;
  /** Per-app usage totals for apps linked to an environment. */
  environmentUsageByApp: Array<AppUsageRollupRow>;
  /** Per-minute replication and GraphQL usage for apps linked to an environment. Observability only. */
  environmentUsageSummary: EnvironmentUsageSummary;
  environmentVersions: Array<CksEnvironmentVersion>;
  freePlayWindowInfo: FreePlayWindowInfo;
  /** Single startup payload for browser game clients: current user, version requirements, UDP proxy status, realtime protocol details, and spatial send limits. */
  gameClientBootstrap: GameClientBootstrap;
  /** Returns the single elected host user for an app (game). Deterministic across all cks-game-api replicas behind the LB: the user whose earliest still-connected actor row was created first wins, with a uuid tiebreaker. Returns null when no actors exist for the app. Stale actors (no recent actorHeartbeat) are excluded once HOST_ACTOR_FRESHNESS_SECONDS is enabled. Clients should poll; there is no host-change subscription in v1. */
  gameHost: Maybe<GameHost>;
  getChunk: Maybe<Chunk>;
  getChunkLods: Maybe<ChunkLodsResponse>;
  getChunksByDistance: ChunksByDistanceResponse;
  getVoxelList: ChunkVoxelResponse;
  /** Returns all registered GraphQL servers */
  graphqlServers: Array<GraphQlServer>;
  gridGroupGrants: Array<GridGroupGrant>;
  gridPermissionLimits: GridPermissionLimits;
  gridUserPermissions: GridUserPermissions;
  listVoxelUpdatesByDistance: VoxelUpdatesByDistanceResponse;
  listVoxels: Array<Voxel>;
  me: Maybe<User>;
  memberRoles: Array<OrgRole>;
  myAppAccess: Maybe<AppUserAccess>;
  /** Apps the caller can see: org member OR active app_user_access. */
  myApps: Array<App>;
  myAvatars: Array<AvatarDto>;
  /** The caller's channels in an app, with their roles and effective channel permissions. */
  myChannels: Array<GroupMembership>;
  myCheckouts: CheckoutsPage;
  myDonationData: UserDonationData;
  myOrganizations: Array<OrgMembership>;
  myPropertyTokens: UserPropertyTokenData;
  /** The caller's teams in an app, with their roles and effective team permissions. */
  myTeams: Array<GroupMembership>;
  nearbyGridPermissions: Array<NearbyGridPermissions>;
  operatorUsers: Array<CpOperatorUser>;
  orgEnvironment: Maybe<CksEnvironmentDetail>;
  orgEnvironments: Array<CksEnvironment>;
  orgMembers: Array<OrgMember>;
  /** The full seed list of permission keys. Used by the UI to render role editors. */
  orgPermissions: Array<OrgPermission>;
  orgRoles: Array<OrgRole>;
  orgTokens: Array<OrgToken>;
  /** Aggregate usage totals per environment in an organization. */
  orgUsageByEnvironment: Array<EnvironmentUsageRollupRow>;
  organization: Maybe<Organization>;
  organizationBySlug: Maybe<Organization>;
  /** Super admin only. Inbound payment webhook audit log. */
  paymentEvents: PaymentEventsPage;
  quotasForApp: Array<ServiceQuota>;
  quotasForOrg: Array<ServiceQuota>;
  /** Runtime permission keys that can be granted through app tiers or grid permissions. */
  runtimePermissions: Array<Scalars['String']['output']>;
  /** Returns a random server from the lowest 20% of servers by client count to distribute load evenly */
  serverWithLeastClients: ServerStatus;
  /** Fetch one team by id. */
  team: Group;
  /** List the members of a team. */
  teamMembers: Array<GroupMember>;
  /** The current team creation/membership policy for an app. */
  teamPolicy: AppGroupPolicy;
  /** List the roles of a team. */
  teamRoles: Array<GroupRole>;
  /** List active teams in an app. */
  teams: Array<Group>;
  /** UDP proxy session status for the game token on this request. Without a game token, returns connected: false. Does not open a session—use udpNotifications or connectUdpProxy. */
  udpProxyConnectionStatus: UdpProxyConnectionStatus;
  user: Maybe<User>;
  userAppState: Maybe<UserAppState>;
  userAppStates: Array<UserAppState>;
  /** Avatars owned by a user. Non-owners receive public state only (private_state is stripped). */
  userAvatars: Array<Avatar>;
  /** Super admin only. Paginated user search; replaces the old `users`/`usersByGamertag`/`usersByEmail` triple. `query` is matched ILIKE-prefix against email, gamertag, disambiguation, and exact user_id. */
  usersPaginated: UsersPage;
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


export type QueryAppArgs = {
  appId: Scalars['BigInt']['input'];
};


export type QueryAppAccessTiersArgs = {
  appId: Scalars['BigInt']['input'];
};


export type QueryAppBudgetArgs = {
  appId: Scalars['BigInt']['input'];
  orgId: Scalars['BigInt']['input'];
};


export type QueryAppBudgetsArgs = {
  orgId: Scalars['BigInt']['input'];
};


export type QueryAppBySlugArgs = {
  appSlug: Scalars['String']['input'];
  orgSlug: Scalars['String']['input'];
};


export type QueryAppGraphqlOperationsArgs = {
  appId: Scalars['BigInt']['input'];
  limit?: InputMaybe<Scalars['Int']['input']>;
  orgId: Scalars['BigInt']['input'];
  since: Scalars['DateTime']['input'];
};


export type QueryAppUsageSummaryArgs = {
  appId: Scalars['BigInt']['input'];
  operationLimit?: InputMaybe<Scalars['Int']['input']>;
  orgId: Scalars['BigInt']['input'];
  since: Scalars['DateTime']['input'];
};


export type QueryAppUserAccessByAppArgs = {
  appId: Scalars['BigInt']['input'];
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  status?: InputMaybe<Scalars['String']['input']>;
};


export type QueryAppsArgs = {
  filter?: InputMaybe<AppMarketplaceFilterInput>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
};


export type QueryAppsForOrgArgs = {
  orgSlug: Scalars['String']['input'];
};


export type QueryAvatarArgs = {
  id: Scalars['BigInt']['input'];
};


export type QueryAvatarAppStateArgs = {
  appId: Scalars['BigInt']['input'];
  avatarId: Scalars['BigInt']['input'];
};


export type QueryAvatarAppStatesArgs = {
  appId: Scalars['BigInt']['input'];
  avatarIds: Array<Scalars['BigInt']['input']>;
};


export type QueryBatchLookupActorsArgs = {
  input: BatchActorLookupInput;
};


export type QueryChannelArgs = {
  groupId: Scalars['BigInt']['input'];
};


export type QueryChannelMembersArgs = {
  groupId: Scalars['BigInt']['input'];
};


export type QueryChannelPolicyArgs = {
  appId: Scalars['BigInt']['input'];
};


export type QueryChannelRolesArgs = {
  groupId: Scalars['BigInt']['input'];
};


export type QueryChannelsArgs = {
  appId: Scalars['BigInt']['input'];
};


export type QueryCheckoutsArgs = {
  filter?: InputMaybe<CheckoutFilterInput>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
};


export type QueryCpAuditArgs = {
  environmentId?: InputMaybe<Scalars['String']['input']>;
  limit?: Scalars['Int']['input'];
};


export type QueryCpChangeOrderArgs = {
  id: Scalars['String']['input'];
};


export type QueryCpChangeOrdersArgs = {
  environmentId?: InputMaybe<Scalars['String']['input']>;
  page?: Scalars['Int']['input'];
  pageSize?: Scalars['Int']['input'];
};


export type QueryCpEnvSecretsArgs = {
  environmentId?: InputMaybe<Scalars['String']['input']>;
};


export type QueryCpEnvironmentArgs = {
  slug: Scalars['String']['input'];
};


export type QueryCpEnvironmentsArgs = {
  page?: Scalars['Int']['input'];
  pageSize?: Scalars['Int']['input'];
};


export type QueryCpOvhCatalogSummaryArgs = {
  region?: InputMaybe<Scalars['String']['input']>;
};


export type QueryCpSecretsArgs = {
  environmentId?: InputMaybe<Scalars['String']['input']>;
};


export type QueryCpUsageSummaryArgs = {
  environmentSlug: Scalars['String']['input'];
  since: Scalars['DateTime']['input'];
};


export type QueryEffectiveQuotaArgs = {
  appId?: InputMaybe<Scalars['BigInt']['input']>;
  metric: Scalars['String']['input'];
  orgId?: InputMaybe<Scalars['BigInt']['input']>;
  tierId?: InputMaybe<Scalars['BigInt']['input']>;
};


export type QueryEnvironmentFlavorsArgs = {
  datacenter: Scalars['String']['input'];
};


export type QueryEnvironmentQuoteArgs = {
  input: EnvironmentQuoteInput;
};


export type QueryEnvironmentUsageByAppArgs = {
  environmentSlug: Scalars['String']['input'];
  orgId: Scalars['BigInt']['input'];
  since: Scalars['DateTime']['input'];
};


export type QueryEnvironmentUsageSummaryArgs = {
  environmentSlug: Scalars['String']['input'];
  orgId: Scalars['BigInt']['input'];
  since: Scalars['DateTime']['input'];
};


export type QueryGameClientBootstrapArgs = {
  appId: Scalars['BigInt']['input'];
};


export type QueryGameHostArgs = {
  appId: Scalars['BigInt']['input'];
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


export type QueryGridGroupGrantsArgs = {
  appId: Scalars['BigInt']['input'];
  gridId: Scalars['BigInt']['input'];
  groupId: Scalars['BigInt']['input'];
};


export type QueryGridPermissionLimitsArgs = {
  appId: Scalars['BigInt']['input'];
  gridId: Scalars['BigInt']['input'];
};


export type QueryGridUserPermissionsArgs = {
  appId: Scalars['BigInt']['input'];
  gridId: Scalars['BigInt']['input'];
  userId: Scalars['BigInt']['input'];
};


export type QueryListVoxelUpdatesByDistanceArgs = {
  input: ListVoxelUpdatesByDistanceInput;
};


export type QueryListVoxelsArgs = {
  input: ListVoxelsInput;
};


export type QueryMemberRolesArgs = {
  orgMemberId: Scalars['BigInt']['input'];
};


export type QueryMyAppAccessArgs = {
  appId: Scalars['BigInt']['input'];
};


export type QueryMyChannelsArgs = {
  appId: Scalars['BigInt']['input'];
};


export type QueryMyCheckoutsArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
};


export type QueryMyTeamsArgs = {
  appId: Scalars['BigInt']['input'];
};


export type QueryNearbyGridPermissionsArgs = {
  input: NearbyGridPermissionsInput;
};


export type QueryOrgEnvironmentArgs = {
  orgId: Scalars['BigInt']['input'];
  slug: Scalars['String']['input'];
};


export type QueryOrgEnvironmentsArgs = {
  orgId: Scalars['BigInt']['input'];
};


export type QueryOrgMembersArgs = {
  orgId: Scalars['BigInt']['input'];
};


export type QueryOrgRolesArgs = {
  orgId: Scalars['BigInt']['input'];
};


export type QueryOrgTokensArgs = {
  orgId: Scalars['BigInt']['input'];
};


export type QueryOrgUsageByEnvironmentArgs = {
  orgId: Scalars['BigInt']['input'];
  since: Scalars['DateTime']['input'];
};


export type QueryOrganizationArgs = {
  id: Scalars['BigInt']['input'];
};


export type QueryOrganizationBySlugArgs = {
  slug: Scalars['String']['input'];
};


export type QueryPaymentEventsArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
};


export type QueryQuotasForAppArgs = {
  appId: Scalars['BigInt']['input'];
};


export type QueryQuotasForOrgArgs = {
  orgId: Scalars['BigInt']['input'];
};


export type QueryTeamArgs = {
  groupId: Scalars['BigInt']['input'];
};


export type QueryTeamMembersArgs = {
  groupId: Scalars['BigInt']['input'];
};


export type QueryTeamPolicyArgs = {
  appId: Scalars['BigInt']['input'];
};


export type QueryTeamRolesArgs = {
  groupId: Scalars['BigInt']['input'];
};


export type QueryTeamsArgs = {
  appId: Scalars['BigInt']['input'];
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


export type QueryUsersPaginatedArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  query?: InputMaybe<Scalars['String']['input']>;
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

/** SDK-facing realtime lifecycle event emitted on udpNotifications when the subscription cannot open a UDP proxy session. */
export type RealtimeConnectionEvent = {
  __typename?: 'RealtimeConnectionEvent';
  code: Scalars['String']['output'];
  message: Scalars['String']['output'];
  retryable: Scalars['Boolean']['output'];
  status: Scalars['String']['output'];
};

/** full = replace VMs. services = update in place on existing runtime servers. Omit for automatic routing. */
export enum RedeployDeployMode {
  Full = 'FULL',
  Services = 'SERVICES'
}

export type RedeployEnvironmentInput = {
  deployMode?: InputMaybe<RedeployDeployMode>;
  orgId: Scalars['BigInt']['input'];
  slug: Scalars['String']['input'];
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

export type RestartEnvironmentServicesInput = {
  orgId: Scalars['BigInt']['input'];
  slug: Scalars['String']['input'];
};

export type ResumeEnvironmentInput = {
  orgId: Scalars['BigInt']['input'];
  slug: Scalars['String']['input'];
};

export type RevokeGridPermissionsInput = {
  appId: Scalars['BigInt']['input'];
  gridId: Scalars['BigInt']['input'];
  permissionKeys?: InputMaybe<Array<Scalars['String']['input']>>;
  userId: Scalars['BigInt']['input'];
};

export type RevokeGroupFromGridInput = {
  appId: Scalars['BigInt']['input'];
  gridId: Scalars['BigInt']['input'];
  groupId: Scalars['BigInt']['input'];
  groupRoleId?: InputMaybe<Scalars['BigInt']['input']>;
  /** Optional subset of keys to revoke. Omit to revoke all of the group/role grants on this grid. */
  permissionKeys?: InputMaybe<Array<Scalars['String']['input']>>;
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
  appId: Maybe<Scalars['BigInt']['output']>;
  createdAt: Scalars['DateTime']['output'];
  limitValue: Scalars['BigInt']['output'];
  metric: Scalars['String']['output'];
  orgId: Maybe<Scalars['BigInt']['output']>;
  period: Scalars['String']['output'];
  quotaId: Scalars['BigInt']['output'];
  tierId: Maybe<Scalars['BigInt']['output']>;
  updatedAt: Scalars['DateTime']['output'];
};

export type SetChannelPolicyInput = {
  appId: Scalars['BigInt']['input'];
  /** admin | member | anyone. Who may create channels in this app. */
  creationPolicy?: InputMaybe<Scalars['String']['input']>;
  /** open | request | invite | admin. Default membership policy for new channels. */
  defaultMembershipPolicy?: InputMaybe<Scalars['String']['input']>;
  maxGroupsPerUser?: InputMaybe<Scalars['Int']['input']>;
  maxMembers?: InputMaybe<Scalars['Int']['input']>;
};

export type SetGridPermissionLimitsInput = {
  appId: Scalars['BigInt']['input'];
  gridId: Scalars['BigInt']['input'];
  /** The whitelist of permission keys allowed on this grid. Empty array removes all limits (every active grid permission becomes grantable again). */
  permissionKeys: Array<Scalars['String']['input']>;
};

export type SetMemberRolesInput = {
  groupId: Scalars['BigInt']['input'];
  roleIds: Array<Scalars['BigInt']['input']>;
  userId: Scalars['BigInt']['input'];
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

export type SetTeamPolicyInput = {
  appId: Scalars['BigInt']['input'];
  /** admin | member | anyone. Who may create teams in this app. */
  creationPolicy?: InputMaybe<Scalars['String']['input']>;
  /** open | request | invite | admin. Default membership policy for new teams. */
  defaultMembershipPolicy?: InputMaybe<Scalars['String']['input']>;
  maxGroupsPerUser?: InputMaybe<Scalars['Int']['input']>;
  maxMembers?: InputMaybe<Scalars['Int']['input']>;
};

/** Input for sending an actor-to-actor message: a message delivered only to the single actor identified by targetUuid. It is spatially routed (the sender must know the destination actor’s chunk), but unlike normal spatial messages it is NOT broadcast to other nearby actors and has no distance/decay. */
export type SingleActorMessageInput = {
  /** The ID of the app the destination actor belongs to. */
  appId: Scalars['BigInt']['input'];
  /** The chunk coordinates of the DESTINATION actor (where the target currently is). The sender must know this. */
  chunk: ChunkCoordinatesInput;
  /** The message payload, base64-encoded. Opaque to the server; the sender’s identity (if needed) must be embedded here by the application. */
  payload: Scalars['String']['input'];
  /** Client's sequence number for this message (0-255, wraps). Used to match error responses. */
  sequenceNumber?: InputMaybe<Scalars['Int']['input']>;
  /** The DESTINATION actor’s UUID. The message is delivered only to the client that owns this actor. Must be exactly 32 bytes when encoded as UTF-8. */
  targetUuid: Scalars['String']['input'];
};

/** Notification received when another actor sends you a direct actor-to-actor message (SINGLE_ACTOR_MESSAGE). Delivered only to the targeted actor via the udpNotifications subscription. */
export type SingleActorMessageNotification = {
  __typename?: 'SingleActorMessageNotification';
  /** The ID of the app the message was sent within. */
  appId: Scalars['BigInt']['output'];
  /** The X coordinate of the destination chunk. */
  chunkX: Scalars['BigInt']['output'];
  /** The Y coordinate of the destination chunk. */
  chunkY: Scalars['BigInt']['output'];
  /** The Z coordinate of the destination chunk. */
  chunkZ: Scalars['BigInt']['output'];
  /** Server-generated epoch milliseconds timestamp. */
  epochMillis: Scalars['BigInt']['output'];
  /** The message payload, base64-encoded. Opaque to the server; decode per your application protocol. */
  payload: Scalars['String']['output'];
  /** The sender's sequence number for this message (0-255). */
  sequenceNumber: Scalars['Int']['output'];
  /** The destination actor’s UUID (your own actor’s UUID, echoed from the message). */
  uuid: Scalars['String']['output'];
};

export type Subscription = {
  __typename?: 'Subscription';
  /** Downlink from the game server (responses, notifications, GenericErrorResponse, and RealtimeConnectionEvent). On subscribe, opens a UDP proxy session if none exists (least-loaded server). Connection failures are delivered as RealtimeConnectionEvent. Unsubscribing stops delivery only; call disconnectUdpProxy to release the session. */
  udpNotifications: Maybe<UdpNotification>;
};

export type TeleportRequestInput = {
  appId: Scalars['BigInt']['input'];
  chunkAddress: ChunkCoordinatesInput;
  uuid: Scalars['String']['input'];
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
export type UdpNotification = ActorUpdateNotification | ActorUpdateResponse | ChannelMessageNotification | ClientAudioNotification | ClientEventNotification | ClientTextNotification | GenericErrorResponse | RealtimeConnectionEvent | ServerEventNotification | SingleActorMessageNotification | VoxelUpdateNotification | VoxelUpdateResponse;

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

export type UpdateAccessTierInput = {
  billingPeriod?: InputMaybe<Scalars['String']['input']>;
  currency?: InputMaybe<Scalars['String']['input']>;
  description?: InputMaybe<Scalars['String']['input']>;
  isDefault?: InputMaybe<Scalars['Boolean']['input']>;
  isFree?: InputMaybe<Scalars['Boolean']['input']>;
  name?: InputMaybe<Scalars['String']['input']>;
  paypalPlanId?: InputMaybe<Scalars['String']['input']>;
  permissionKeys?: InputMaybe<Array<Scalars['String']['input']>>;
  priceCents?: InputMaybe<Scalars['BigInt']['input']>;
  stripePriceId?: InputMaybe<Scalars['String']['input']>;
  tierOrder?: InputMaybe<Scalars['Int']['input']>;
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

export type UpdateAppInput = {
  description?: InputMaybe<Scalars['String']['input']>;
  metadata?: InputMaybe<Scalars['String']['input']>;
  name?: InputMaybe<Scalars['String']['input']>;
  status?: InputMaybe<AppStatus>;
  visibility?: InputMaybe<AppVisibility>;
};

export type UpdateAvatarAppStateInput = {
  appId: Scalars['BigInt']['input'];
  avatarId: Scalars['BigInt']['input'];
  /** Base64-encoded binary state. Null clears it. */
  state?: InputMaybe<Scalars['String']['input']>;
};

export type UpdateAvatarInput = {
  name?: InputMaybe<Scalars['String']['input']>;
};

export type UpdateAvatarStateInput = {
  privateState?: InputMaybe<Scalars['String']['input']>;
  publicState?: InputMaybe<Scalars['String']['input']>;
};

export type UpdateChannelInput = {
  description?: InputMaybe<Scalars['String']['input']>;
  groupId: Scalars['BigInt']['input'];
  membershipPolicy?: InputMaybe<Scalars['String']['input']>;
  name?: InputMaybe<Scalars['String']['input']>;
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

export type UpdateEnvironmentScalingInput = {
  /** Caddy LB flavor (in front of the game-api fleet). When omitted the existing value is preserved. */
  caddyFlavor?: InputMaybe<Scalars['String']['input']>;
  gameApiMaxServers: Scalars['Int']['input'];
  gameApiMinServers: Scalars['Int']['input'];
  loadBalancerCount: Scalars['Int']['input'];
  orgId: Scalars['BigInt']['input'];
  slug: Scalars['String']['input'];
  udpBuddyMaxServers: Scalars['Int']['input'];
  udpBuddyMinServers: Scalars['Int']['input'];
};

export type UpdateGamertagInput = {
  disambiguation: Scalars['String']['input'];
  gamertag: Scalars['String']['input'];
};

export type UpdateGroupRoleInput = {
  groupRoleId: Scalars['BigInt']['input'];
  permissions?: InputMaybe<Array<Scalars['String']['input']>>;
  rank?: InputMaybe<Scalars['Int']['input']>;
  roleName?: InputMaybe<Scalars['String']['input']>;
};

export type UpdateOrgRoleInput = {
  description?: InputMaybe<Scalars['String']['input']>;
  permissions?: InputMaybe<Array<Scalars['String']['input']>>;
  roleName?: InputMaybe<Scalars['String']['input']>;
};

export type UpdateOrgTokenInput = {
  expiresAt?: InputMaybe<Scalars['DateTime']['input']>;
  isActive?: InputMaybe<Scalars['Boolean']['input']>;
  label?: InputMaybe<Scalars['String']['input']>;
};

export type UpdateTeamInput = {
  description?: InputMaybe<Scalars['String']['input']>;
  groupId: Scalars['BigInt']['input'];
  membershipPolicy?: InputMaybe<Scalars['String']['input']>;
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

export type UsageMinuteRow = {
  __typename?: 'UsageMinuteRow';
  minute: Scalars['DateTime']['output'];
  recvBytes: Scalars['String']['output'];
  recvMsgs: Maybe<Scalars['String']['output']>;
  sendBytes: Scalars['String']['output'];
  sendMsgs: Maybe<Scalars['String']['output']>;
};

export type UsageRatePeaks = {
  __typename?: 'UsageRatePeaks';
  avgSendMbitPerSec: Scalars['Float']['output'];
  avgSendMsgsPerSec: Scalars['Float']['output'];
  peakSendMbitPerSec: Scalars['Float']['output'];
  peakSendMsgsPerSec: Scalars['Float']['output'];
  sampleMinutes: Scalars['Float']['output'];
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
  /** Company-employee flag that grants access to control-plane / operator features. Independent from is_super_admin. */
  isOperator: Scalars['Boolean']['output'];
  isSuperAdmin: Scalars['Boolean']['output'];
  orgId: Maybe<Scalars['BigInt']['output']>;
  /** The current user's effective permission keys on the given org. Empty if not a member. Always full set if super admin. */
  permissionsForOrg: Array<Scalars['String']['output']>;
  state: Maybe<Scalars['String']['output']>;
  userId: Scalars['BigInt']['output'];
  userType: Scalars['String']['output'];
};


export type UserPermissionsForOrgArgs = {
  orgId: Scalars['BigInt']['input'];
};

export type UserAppState = {
  __typename?: 'UserAppState';
  appId: Scalars['BigInt']['output'];
  createdAt: Scalars['DateTime']['output'];
  state: Maybe<Scalars['String']['output']>;
  updatedAt: Scalars['DateTime']['output'];
  userId: Scalars['BigInt']['output'];
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

export type UsersPage = {
  __typename?: 'UsersPage';
  items: Array<User>;
  pageInfo: PageInfo;
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
  amountCents: Scalars['BigInt']['output'];
  appId: Maybe<Scalars['BigInt']['output']>;
  balanceAfter: Scalars['BigInt']['output'];
  createdAt: Scalars['DateTime']['output'];
  description: Maybe<Scalars['String']['output']>;
  orgId: Scalars['BigInt']['output'];
  referenceId: Maybe<Scalars['String']['output']>;
  transactionId: Scalars['BigInt']['output'];
  transactionType: Scalars['String']['output'];
  walletId: Scalars['BigInt']['output'];
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


export type AppAccessTiersQuery = { __typename?: 'Query', appAccessTiers: Array<{ __typename?: 'AppAccessTier', tierId: string, appId: string, name: string, tierOrder: number, isFree: boolean, isDefault: boolean, priceCents: string | null, currency: string | null, billingPeriod: string | null, description: string | null, permissionKeys: Array<string>, status: string, createdAt: string, updatedAt: string }> };

export type AppUserAccessByAppQueryVariables = Exact<{
  appId: Scalars['BigInt']['input'];
  status?: InputMaybe<Scalars['String']['input']>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
}>;


export type AppUserAccessByAppQuery = { __typename?: 'Query', appUserAccessByApp: Array<{ __typename?: 'AppUserAccess', appUserAccessId: string, appId: string, userId: string, tierId: string | null, status: string, grantedBy: string, subscriptionId: string | null, expiresAt: string | null, createdAt: string, updatedAt: string }> };

export type ArchiveAccessTierMutationVariables = Exact<{
  tierId: Scalars['BigInt']['input'];
}>;


export type ArchiveAccessTierMutation = { __typename?: 'Mutation', archiveAccessTier: { __typename?: 'AppAccessTier', tierId: string, status: string, updatedAt: string } };

export type CreateAccessTierMutationVariables = Exact<{
  input: CreateAccessTierInput;
}>;


export type CreateAccessTierMutation = { __typename?: 'Mutation', createAccessTier: { __typename?: 'AppAccessTier', tierId: string, appId: string, name: string, tierOrder: number, isFree: boolean, isDefault: boolean, priceCents: string | null, currency: string | null, billingPeriod: string | null, description: string | null, permissionKeys: Array<string>, status: string, createdAt: string, updatedAt: string } };

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

export type UpdateAccessTierMutationVariables = Exact<{
  tierId: Scalars['BigInt']['input'];
  input: UpdateAccessTierInput;
}>;


export type UpdateAccessTierMutation = { __typename?: 'Mutation', updateAccessTier: { __typename?: 'AppAccessTier', tierId: string, appId: string, name: string, tierOrder: number, isFree: boolean, isDefault: boolean, priceCents: string | null, currency: string | null, billingPeriod: string | null, description: string | null, permissionKeys: Array<string>, status: string, updatedAt: string } };

export type AppQueryVariables = Exact<{
  appId: Scalars['BigInt']['input'];
}>;


export type AppQuery = { __typename?: 'Query', app: { __typename?: 'App', appId: string, orgId: string, name: string, slug: string | null, description: string | null, visibility: AppVisibility, status: AppStatus, metadata: string | null, splitMode: boolean, gameApiUrl: string | null, createdAt: string, updatedAt: string, org: { __typename?: 'Organization', orgId: string, slug: string, name: string } | null } | null };

export type AppBySlugQueryVariables = Exact<{
  orgSlug: Scalars['String']['input'];
  appSlug: Scalars['String']['input'];
}>;


export type AppBySlugQuery = { __typename?: 'Query', appBySlug: { __typename?: 'App', appId: string, orgId: string, name: string, slug: string | null, description: string | null, visibility: AppVisibility, status: AppStatus, metadata: string | null, splitMode: boolean, gameApiUrl: string | null, createdAt: string, updatedAt: string, org: { __typename?: 'Organization', orgId: string, slug: string, name: string } | null } | null };

export type AppsForOrgQueryVariables = Exact<{
  orgSlug: Scalars['String']['input'];
}>;


export type AppsForOrgQuery = { __typename?: 'Query', appsForOrg: Array<{ __typename?: 'App', appId: string, orgId: string, name: string, slug: string | null, description: string | null, visibility: AppVisibility, status: AppStatus, metadata: string | null, splitMode: boolean, gameApiUrl: string | null, createdAt: string, updatedAt: string }> };

export type ArchiveAppMutationVariables = Exact<{
  appId: Scalars['BigInt']['input'];
}>;


export type ArchiveAppMutation = { __typename?: 'Mutation', archiveApp: { __typename?: 'App', appId: string, status: AppStatus, updatedAt: string } };

export type CreateAppMutationVariables = Exact<{
  input: CreateAppInput;
}>;


export type CreateAppMutation = { __typename?: 'Mutation', createApp: { __typename?: 'App', appId: string, orgId: string, name: string, slug: string | null, description: string | null, visibility: AppVisibility, status: AppStatus, metadata: string | null, createdAt: string } };

export type MarketplaceAppsQueryVariables = Exact<{
  filter?: InputMaybe<AppMarketplaceFilterInput>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
}>;


export type MarketplaceAppsQuery = { __typename?: 'Query', apps: { __typename?: 'AppsPage', items: Array<{ __typename?: 'App', appId: string, orgId: string, name: string, slug: string | null, description: string | null, visibility: AppVisibility, status: AppStatus, metadata: string | null, splitMode: boolean, gameApiUrl: string | null, createdAt: string, updatedAt: string, org: { __typename?: 'Organization', orgId: string, slug: string, name: string } | null }>, pageInfo: { __typename?: 'PageInfo', totalCount: number, limit: number, offset: number } } };

export type MyAppsQueryVariables = Exact<{ [key: string]: never; }>;


export type MyAppsQuery = { __typename?: 'Query', myApps: Array<{ __typename?: 'App', appId: string, orgId: string, name: string, slug: string | null, description: string | null, visibility: AppVisibility, status: AppStatus, metadata: string | null, splitMode: boolean, gameApiUrl: string | null, createdAt: string, updatedAt: string, org: { __typename?: 'Organization', orgId: string, slug: string, name: string } | null }> };

export type SetAppVisibilityMutationVariables = Exact<{
  appId: Scalars['BigInt']['input'];
  visibility: AppVisibility;
}>;


export type SetAppVisibilityMutation = { __typename?: 'Mutation', setAppVisibility: { __typename?: 'App', appId: string, visibility: AppVisibility, updatedAt: string } };

export type UpdateAppMutationVariables = Exact<{
  appId: Scalars['BigInt']['input'];
  input: UpdateAppInput;
}>;


export type UpdateAppMutation = { __typename?: 'Mutation', updateApp: { __typename?: 'App', appId: string, orgId: string, name: string, slug: string | null, description: string | null, visibility: AppVisibility, status: AppStatus, metadata: string | null, updatedAt: string } };

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


export type LoginMutation = { __typename?: 'Mutation', login: { __typename?: 'AuthResponse', token: string, gameTokenId: string, user: { __typename?: 'User', userId: string, email: string | null, gamertag: string | null, disambiguation: string | null, isConfirmed: boolean, createdAt: string, grantEarlyAccess: boolean, grantEarlyAccessOverride: boolean, orgId: string | null, externalId: string | null, userType: string, isSuperAdmin: boolean } } };

export type LogoutMutationVariables = Exact<{ [key: string]: never; }>;


export type LogoutMutation = { __typename?: 'Mutation', logout: boolean };

export type LogoutAllDevicesMutationVariables = Exact<{ [key: string]: never; }>;


export type LogoutAllDevicesMutation = { __typename?: 'Mutation', logoutAllDevices: boolean };

export type RegisterMutationVariables = Exact<{
  input: RegisterUserInput;
}>;


export type RegisterMutation = { __typename?: 'Mutation', register: { __typename?: 'AuthResponse', token: string, gameTokenId: string, user: { __typename?: 'User', userId: string, email: string | null, gamertag: string | null, disambiguation: string | null, isConfirmed: boolean, createdAt: string, grantEarlyAccess: boolean, grantEarlyAccessOverride: boolean, orgId: string | null, externalId: string | null, userType: string, isSuperAdmin: boolean } } };

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

export type AppBudgetsQueryVariables = Exact<{
  orgId: Scalars['BigInt']['input'];
}>;


export type AppBudgetsQuery = { __typename?: 'Query', appBudgets: Array<{ __typename?: 'AppBudget', appBudgetId: string, orgId: string, appId: string, monthlyLimitCents: string | null, currentMonthUsageCents: string, periodStart: string, createdAt: string, updatedAt: string }> };

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

export type AddChannelMemberMutationVariables = Exact<{
  groupId: Scalars['BigInt']['input'];
  userId: Scalars['BigInt']['input'];
}>;


export type AddChannelMemberMutation = { __typename?: 'Mutation', addChannelMember: { __typename?: 'GroupMember', groupMemberId: string, groupId: string, userId: string, status: string, createdAt: string, roles: Array<{ __typename?: 'GroupRole', groupRoleId: string, roleName: string, rank: number, isSystem: boolean, permissions: Array<string> }> } };

export type ChannelQueryVariables = Exact<{
  groupId: Scalars['BigInt']['input'];
}>;


export type ChannelQuery = { __typename?: 'Query', channel: { __typename?: 'Group', groupId: string, appId: string, groupType: string, name: string, description: string | null, ownerUserId: string | null, membershipPolicy: string, status: string, defaultRoleId: string | null, createdAt: string } };

export type ChannelMembersQueryVariables = Exact<{
  groupId: Scalars['BigInt']['input'];
}>;


export type ChannelMembersQuery = { __typename?: 'Query', channelMembers: Array<{ __typename?: 'GroupMember', groupMemberId: string, groupId: string, userId: string, status: string, createdAt: string, roles: Array<{ __typename?: 'GroupRole', groupRoleId: string, roleName: string, rank: number, isSystem: boolean, permissions: Array<string> }> }> };

export type ChannelPolicyQueryVariables = Exact<{
  appId: Scalars['BigInt']['input'];
}>;


export type ChannelPolicyQuery = { __typename?: 'Query', channelPolicy: { __typename?: 'AppGroupPolicy', appId: string, groupType: string, creationPolicy: string, defaultMembershipPolicy: string, maxMembers: number | null, maxGroupsPerUser: number | null } };

export type ChannelRolesQueryVariables = Exact<{
  groupId: Scalars['BigInt']['input'];
}>;


export type ChannelRolesQuery = { __typename?: 'Query', channelRoles: Array<{ __typename?: 'GroupRole', groupRoleId: string, groupId: string, roleName: string, rank: number, isSystem: boolean, permissions: Array<string>, createdAt: string }> };

export type ChannelsQueryVariables = Exact<{
  appId: Scalars['BigInt']['input'];
}>;


export type ChannelsQuery = { __typename?: 'Query', channels: Array<{ __typename?: 'Group', groupId: string, appId: string, groupType: string, name: string, description: string | null, ownerUserId: string | null, membershipPolicy: string, status: string, defaultRoleId: string | null, createdAt: string }> };

export type CreateChannelMutationVariables = Exact<{
  input: CreateChannelInput;
}>;


export type CreateChannelMutation = { __typename?: 'Mutation', createChannel: { __typename?: 'Group', groupId: string, appId: string, groupType: string, name: string, description: string | null, ownerUserId: string | null, membershipPolicy: string, status: string, defaultRoleId: string | null, createdAt: string } };

export type CreateChannelRoleMutationVariables = Exact<{
  input: CreateGroupRoleInput;
}>;


export type CreateChannelRoleMutation = { __typename?: 'Mutation', createChannelRole: { __typename?: 'GroupRole', groupRoleId: string, groupId: string, roleName: string, rank: number, isSystem: boolean, permissions: Array<string>, createdAt: string } };

export type DeleteChannelMutationVariables = Exact<{
  groupId: Scalars['BigInt']['input'];
}>;


export type DeleteChannelMutation = { __typename?: 'Mutation', deleteChannel: boolean };

export type DeleteChannelRoleMutationVariables = Exact<{
  groupRoleId: Scalars['BigInt']['input'];
}>;


export type DeleteChannelRoleMutation = { __typename?: 'Mutation', deleteChannelRole: boolean };

export type JoinChannelMutationVariables = Exact<{
  groupId: Scalars['BigInt']['input'];
}>;


export type JoinChannelMutation = { __typename?: 'Mutation', joinChannel: { __typename?: 'GroupMember', groupMemberId: string, groupId: string, userId: string, status: string, createdAt: string, roles: Array<{ __typename?: 'GroupRole', groupRoleId: string, roleName: string, rank: number, isSystem: boolean, permissions: Array<string> }> } };

export type LeaveChannelMutationVariables = Exact<{
  groupId: Scalars['BigInt']['input'];
}>;


export type LeaveChannelMutation = { __typename?: 'Mutation', leaveChannel: boolean };

export type MyChannelsQueryVariables = Exact<{
  appId: Scalars['BigInt']['input'];
}>;


export type MyChannelsQuery = { __typename?: 'Query', myChannels: Array<{ __typename?: 'GroupMembership', permissions: Array<string>, joinedAt: string, group: { __typename?: 'Group', groupId: string, appId: string, groupType: string, name: string, description: string | null, ownerUserId: string | null, membershipPolicy: string, status: string, defaultRoleId: string | null, createdAt: string }, roles: Array<{ __typename?: 'GroupRole', groupRoleId: string, roleName: string, rank: number, isSystem: boolean, permissions: Array<string> }> }> };

export type RemoveChannelMemberMutationVariables = Exact<{
  groupId: Scalars['BigInt']['input'];
  userId: Scalars['BigInt']['input'];
}>;


export type RemoveChannelMemberMutation = { __typename?: 'Mutation', removeChannelMember: boolean };

export type RequestToJoinChannelMutationVariables = Exact<{
  groupId: Scalars['BigInt']['input'];
}>;


export type RequestToJoinChannelMutation = { __typename?: 'Mutation', requestToJoinChannel: { __typename?: 'GroupMember', groupMemberId: string, groupId: string, userId: string, status: string, createdAt: string, roles: Array<{ __typename?: 'GroupRole', groupRoleId: string, roleName: string, rank: number, isSystem: boolean, permissions: Array<string> }> } };

export type SetChannelMemberRolesMutationVariables = Exact<{
  input: SetMemberRolesInput;
}>;


export type SetChannelMemberRolesMutation = { __typename?: 'Mutation', setChannelMemberRoles: { __typename?: 'GroupMember', groupMemberId: string, groupId: string, userId: string, status: string, createdAt: string, roles: Array<{ __typename?: 'GroupRole', groupRoleId: string, roleName: string, rank: number, isSystem: boolean, permissions: Array<string> }> } };

export type SetChannelPolicyMutationVariables = Exact<{
  input: SetChannelPolicyInput;
}>;


export type SetChannelPolicyMutation = { __typename?: 'Mutation', setChannelPolicy: { __typename?: 'AppGroupPolicy', appId: string, groupType: string, creationPolicy: string, defaultMembershipPolicy: string, maxMembers: number | null, maxGroupsPerUser: number | null } };

export type UpdateChannelMutationVariables = Exact<{
  input: UpdateChannelInput;
}>;


export type UpdateChannelMutation = { __typename?: 'Mutation', updateChannel: { __typename?: 'Group', groupId: string, appId: string, groupType: string, name: string, description: string | null, ownerUserId: string | null, membershipPolicy: string, status: string, defaultRoleId: string | null, createdAt: string } };

export type UpdateChannelRoleMutationVariables = Exact<{
  input: UpdateGroupRoleInput;
}>;


export type UpdateChannelRoleMutation = { __typename?: 'Mutation', updateChannelRole: { __typename?: 'GroupRole', groupRoleId: string, groupId: string, roleName: string, rank: number, isSystem: boolean, permissions: Array<string>, createdAt: string } };

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

export type CreateOrgRoleMutationVariables = Exact<{
  input: CreateOrgRoleInput;
}>;


export type CreateOrgRoleMutation = { __typename?: 'Mutation', createOrgRole: { __typename?: 'OrgRole', orgRoleId: string, orgId: string, roleName: string, isSystem: boolean, permissions: Array<string>, description: string | null } };

export type CreateOrgTokenMutationVariables = Exact<{
  input: CreateOrgTokenInput;
}>;


export type CreateOrgTokenMutation = { __typename?: 'Mutation', createOrgToken: { __typename?: 'OrgTokenWithSecret', orgTokenId: string, orgId: string, token: string, label: string | null, isActive: boolean, expiresAt: string | null, createdAt: string } };

export type CreateOrganizationMutationVariables = Exact<{
  input: CreateOrganizationInput;
}>;


export type CreateOrganizationMutation = { __typename?: 'Mutation', createOrganization: { __typename?: 'Organization', orgId: string, name: string, slug: string, ownerUserId: string, status: string, createdAt: string, updatedAt: string } };

export type DeleteOrgRoleMutationVariables = Exact<{
  orgRoleId: Scalars['BigInt']['input'];
}>;


export type DeleteOrgRoleMutation = { __typename?: 'Mutation', deleteOrgRole: boolean };

export type InviteOrgMemberMutationVariables = Exact<{
  input: InviteOrgMemberInput;
}>;


export type InviteOrgMemberMutation = { __typename?: 'Mutation', inviteOrgMember: { __typename?: 'OrgMember', orgMemberId: string, orgId: string, userId: string, status: string, createdAt: string, updatedAt: string } };

export type MyOrganizationsQueryVariables = Exact<{ [key: string]: never; }>;


export type MyOrganizationsQuery = { __typename?: 'Query', myOrganizations: Array<{ __typename?: 'OrgMembership', permissions: Array<string>, joinedAt: string, org: { __typename?: 'Organization', orgId: string, slug: string, name: string, ownerUserId: string, status: string, createdAt: string, updatedAt: string }, roles: Array<{ __typename?: 'OrgRole', orgRoleId: string, orgId: string, roleName: string, isSystem: boolean, permissions: Array<string> }> }> };

export type OrgMembersQueryVariables = Exact<{
  orgId: Scalars['BigInt']['input'];
}>;


export type OrgMembersQuery = { __typename?: 'Query', orgMembers: Array<{ __typename?: 'OrgMember', orgMemberId: string, orgId: string, userId: string, status: string, createdAt: string, updatedAt: string }> };

export type OrgPermissionsQueryVariables = Exact<{ [key: string]: never; }>;


export type OrgPermissionsQuery = { __typename?: 'Query', orgPermissions: Array<{ __typename?: 'OrgPermission', permissionKey: string, description: string | null, category: string | null }> };

export type OrgRolesQueryVariables = Exact<{
  orgId: Scalars['BigInt']['input'];
}>;


export type OrgRolesQuery = { __typename?: 'Query', orgRoles: Array<{ __typename?: 'OrgRole', orgRoleId: string, orgId: string, roleName: string, isSystem: boolean, permissions: Array<string>, description: string | null }> };

export type OrgTokensQueryVariables = Exact<{
  orgId: Scalars['BigInt']['input'];
}>;


export type OrgTokensQuery = { __typename?: 'Query', orgTokens: Array<{ __typename?: 'OrgToken', orgTokenId: string, orgId: string, label: string | null, isActive: boolean, lastUsedAt: string | null, revokedAt: string | null, expiresAt: string | null, createdAt: string, updatedAt: string }> };

export type OrganizationQueryVariables = Exact<{
  id: Scalars['BigInt']['input'];
}>;


export type OrganizationQuery = { __typename?: 'Query', organization: { __typename?: 'Organization', orgId: string, name: string, slug: string, ownerUserId: string, status: string, createdAt: string, updatedAt: string } | null };

export type OrganizationBySlugQueryVariables = Exact<{
  slug: Scalars['String']['input'];
}>;


export type OrganizationBySlugQuery = { __typename?: 'Query', organizationBySlug: { __typename?: 'Organization', orgId: string, name: string, slug: string, ownerUserId: string, status: string, createdAt: string, updatedAt: string } | null };

export type RemoveOrgMemberMutationVariables = Exact<{
  orgId: Scalars['BigInt']['input'];
  userId: Scalars['BigInt']['input'];
}>;


export type RemoveOrgMemberMutation = { __typename?: 'Mutation', removeOrgMember: boolean };

export type RevokeOrgTokenMutationVariables = Exact<{
  orgTokenId: Scalars['BigInt']['input'];
}>;


export type RevokeOrgTokenMutation = { __typename?: 'Mutation', revokeOrgToken: boolean };

export type SetOrgStatusMutationVariables = Exact<{
  orgId: Scalars['BigInt']['input'];
  status: Scalars['String']['input'];
}>;


export type SetOrgStatusMutation = { __typename?: 'Mutation', setOrgStatus: { __typename?: 'Organization', orgId: string, status: string, updatedAt: string } };

export type UpdateOrgMemberRolesMutationVariables = Exact<{
  orgId: Scalars['BigInt']['input'];
  userId: Scalars['BigInt']['input'];
  roleIds: Array<Scalars['BigInt']['input']> | Scalars['BigInt']['input'];
}>;


export type UpdateOrgMemberRolesMutation = { __typename?: 'Mutation', updateOrgMemberRoles: { __typename?: 'OrgMember', orgMemberId: string, orgId: string, userId: string, status: string } };

export type UpdateOrgRoleMutationVariables = Exact<{
  orgRoleId: Scalars['BigInt']['input'];
  input: UpdateOrgRoleInput;
}>;


export type UpdateOrgRoleMutation = { __typename?: 'Mutation', updateOrgRole: { __typename?: 'OrgRole', orgRoleId: string, orgId: string, roleName: string, isSystem: boolean, permissions: Array<string>, description: string | null } };

export type UpdateOrgTokenMutationVariables = Exact<{
  orgTokenId: Scalars['BigInt']['input'];
  input: UpdateOrgTokenInput;
}>;


export type UpdateOrgTokenMutation = { __typename?: 'Mutation', updateOrgToken: { __typename?: 'OrgToken', orgTokenId: string, label: string | null, isActive: boolean, expiresAt: string | null, revokedAt: string | null, updatedAt: string } };

export type CheckoutsQueryVariables = Exact<{
  filter?: InputMaybe<CheckoutFilterInput>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
}>;


export type CheckoutsQuery = { __typename?: 'Query', checkouts: { __typename?: 'CheckoutsPage', items: Array<{ __typename?: 'Checkout', checkoutId: string, userId: string, provider: PaymentProvider, purpose: CheckoutPurpose, status: CheckoutStatus, amountCents: string | null, currency: string | null, externalId: string, externalUrl: string, orgId: string | null, appId: string | null, tierId: string | null, createdAt: string, completedAt: string | null, expiresAt: string | null }>, pageInfo: { __typename?: 'PageInfo', totalCount: number, limit: number, offset: number } } };

export type CreateCheckoutMutationVariables = Exact<{
  input: CreateCheckoutInput;
}>;


export type CreateCheckoutMutation = { __typename?: 'Mutation', createCheckout: { __typename?: 'Checkout', checkoutId: string, userId: string, provider: PaymentProvider, purpose: CheckoutPurpose, status: CheckoutStatus, amountCents: string | null, currency: string | null, externalId: string, externalUrl: string, orgId: string | null, appId: string | null, tierId: string | null, error: string | null, createdAt: string, completedAt: string | null, expiresAt: string | null } };

export type MyCheckoutsQueryVariables = Exact<{
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
}>;


export type MyCheckoutsQuery = { __typename?: 'Query', myCheckouts: { __typename?: 'CheckoutsPage', items: Array<{ __typename?: 'Checkout', checkoutId: string, userId: string, provider: PaymentProvider, purpose: CheckoutPurpose, status: CheckoutStatus, amountCents: string | null, currency: string | null, externalId: string, externalUrl: string, orgId: string | null, appId: string | null, tierId: string | null, error: string | null, createdAt: string, completedAt: string | null, expiresAt: string | null }>, pageInfo: { __typename?: 'PageInfo', totalCount: number, limit: number, offset: number } } };

export type DeleteQuotaMutationVariables = Exact<{
  quotaId: Scalars['BigInt']['input'];
}>;


export type DeleteQuotaMutation = { __typename?: 'Mutation', deleteQuota: boolean };

export type EffectiveQuotaQueryVariables = Exact<{
  metric: Scalars['String']['input'];
  orgId?: InputMaybe<Scalars['BigInt']['input']>;
  appId?: InputMaybe<Scalars['BigInt']['input']>;
  tierId?: InputMaybe<Scalars['BigInt']['input']>;
}>;


export type EffectiveQuotaQuery = { __typename?: 'Query', effectiveQuota: { __typename?: 'ServiceQuota', quotaId: string, orgId: string | null, appId: string | null, tierId: string | null, metric: string, limitValue: string, period: string, actionOnExceed: string } | null };

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

export type GameClientBootstrapQueryVariables = Exact<{
  appId: Scalars['BigInt']['input'];
}>;


export type GameClientBootstrapQuery = { __typename?: 'Query', gameClientBootstrap: { __typename?: 'GameClientBootstrap', appId: string, realtimeProtocol: string, subscriptionName: string, maxReplicationDistance: number, maxDecayRate: number, sequenceNumberModulo: number, udpProxyConnectionStatus: { __typename?: 'UdpProxyConnectionStatus', connected: boolean, serverIp6: string | null, serverClientPort: number | null, lastMessageTime: string | null }, versionInfo: { __typename?: 'ServerVersionInfo', serverVersion: { __typename?: 'VersionInfo', major: number, minor: number, patch: number, build: number }, minimumClientVersion: { __typename?: 'VersionInfo', major: number, minor: number, patch: number, build: number } }, me: { __typename?: 'User', userId: string, email: string | null, gamertag: string | null, disambiguation: string | null, state: string | null, isConfirmed: boolean, createdAt: string, grantEarlyAccess: boolean, grantEarlyAccessOverride: boolean, orgId: string | null, externalId: string | null, userType: string, isSuperAdmin: boolean } } };

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

export type SendActorUpdateMutationVariables = Exact<{
  input: ActorUpdateRequestInput;
}>;


export type SendActorUpdateMutation = { __typename?: 'Mutation', sendActorUpdate: boolean };

export type SendAudioPacketMutationVariables = Exact<{
  input: ClientAudioPacketInput;
}>;


export type SendAudioPacketMutation = { __typename?: 'Mutation', sendAudioPacket: boolean };

export type SendChannelMessageMutationVariables = Exact<{
  input: ChannelMessageInput;
}>;


export type SendChannelMessageMutation = { __typename?: 'Mutation', sendChannelMessage: boolean };

export type SendClientEventMutationVariables = Exact<{
  input: ClientEventNotificationInput;
}>;


export type SendClientEventMutation = { __typename?: 'Mutation', sendClientEvent: boolean };

export type SendSingleActorMessageMutationVariables = Exact<{
  input: SingleActorMessageInput;
}>;


export type SendSingleActorMessageMutation = { __typename?: 'Mutation', sendSingleActorMessage: boolean };

export type SendTextPacketMutationVariables = Exact<{
  input: ClientTextPacketInput;
}>;


export type SendTextPacketMutation = { __typename?: 'Mutation', sendTextPacket: boolean };

export type SendVoxelUpdateMutationVariables = Exact<{
  input: VoxelUpdateRequestInput;
}>;


export type SendVoxelUpdateMutation = { __typename?: 'Mutation', sendVoxelUpdate: boolean };

export type UdpNotificationsSubscriptionVariables = Exact<{ [key: string]: never; }>;


export type UdpNotificationsSubscription = { __typename?: 'Subscription', udpNotifications:
    | { __typename: 'ActorUpdateNotification', appId: string, chunkX: string, chunkY: string, chunkZ: string, distance: number, decayRate: number, uuid: string, state: string, sequenceNumber: number, epochMillis: string }
    | { __typename: 'ActorUpdateResponse', appId: string, chunkX: string, chunkY: string, chunkZ: string, distance: number, decayRate: number, uuid: string, sequenceNumber: number, epochMillis: string }
    | { __typename: 'ChannelMessageNotification', channelId: string, uuid: string, payload: string, sequenceNumber: number, epochMillis: string }
    | { __typename: 'ClientAudioNotification', appId: string, chunkX: string, chunkY: string, chunkZ: string, distance: number, decayRate: number, uuid: string, audioData: string, sequenceNumber: number, epochMillis: string }
    | { __typename: 'ClientEventNotification', appId: string, chunkX: string, chunkY: string, chunkZ: string, distance: number, decayRate: number, uuid: string, eventType: number, state: string, sequenceNumber: number, epochMillis: string }
    | { __typename: 'ClientTextNotification', appId: string, chunkX: string, chunkY: string, chunkZ: string, distance: number, decayRate: number, uuid: string, text: string, sequenceNumber: number, epochMillis: string }
    | { __typename: 'GenericErrorResponse', sequenceNumber: number, errorCode: UdpErrorCode }
    | { __typename: 'RealtimeConnectionEvent', status: string, code: string, message: string, retryable: boolean }
    | { __typename: 'ServerEventNotification', appId: string, chunkX: string, chunkY: string, chunkZ: string, distance: number, decayRate: number, uuid: string, eventType: number, state: string, sequenceNumber: number, epochMillis: string }
    | { __typename: 'SingleActorMessageNotification', appId: string, chunkX: string, chunkY: string, chunkZ: string, uuid: string, payload: string, sequenceNumber: number, epochMillis: string }
    | { __typename: 'VoxelUpdateNotification', appId: string, chunkX: string, chunkY: string, chunkZ: string, distance: number, decayRate: number, uuid: string, voxelX: number, voxelY: number, voxelZ: number, voxelType: number, voxelState: string, sequenceNumber: number, epochMillis: string }
    | { __typename: 'VoxelUpdateResponse', appId: string, chunkX: string, chunkY: string, chunkZ: string, distance: number, decayRate: number, uuid: string, sequenceNumber: number, epochMillis: string }
   | null };

export type UdpProxyConnectionStatusQueryVariables = Exact<{ [key: string]: never; }>;


export type UdpProxyConnectionStatusQuery = { __typename?: 'Query', udpProxyConnectionStatus: { __typename?: 'UdpProxyConnectionStatus', connected: boolean, serverIp6: string | null, serverClientPort: number | null, lastMessageTime: string | null } };

export type DeleteMyAccountMutationVariables = Exact<{ [key: string]: never; }>;


export type DeleteMyAccountMutation = { __typename?: 'Mutation', deleteMyAccount: boolean };

export type ForceLogoutUserMutationVariables = Exact<{
  userId: Scalars['BigInt']['input'];
}>;


export type ForceLogoutUserMutation = { __typename?: 'Mutation', forceLogoutUser: boolean };

export type MeQueryVariables = Exact<{ [key: string]: never; }>;


export type MeQuery = { __typename?: 'Query', me: { __typename?: 'User', userId: string, email: string | null, gamertag: string | null, disambiguation: string | null, state: string | null, isConfirmed: boolean, createdAt: string, grantEarlyAccess: boolean, grantEarlyAccessOverride: boolean, orgId: string | null, externalId: string | null, userType: string, isSuperAdmin: boolean } | null };

export type SetEarlyAccessOverrideMutationVariables = Exact<{
  userId: Scalars['BigInt']['input'];
  value: Scalars['Boolean']['input'];
}>;


export type SetEarlyAccessOverrideMutation = { __typename?: 'Mutation', setEarlyAccessOverride: { __typename?: 'User', userId: string, grantEarlyAccessOverride: boolean } };

export type SetSuperAdminMutationVariables = Exact<{
  userId: Scalars['BigInt']['input'];
  value: Scalars['Boolean']['input'];
}>;


export type SetSuperAdminMutation = { __typename?: 'Mutation', setSuperAdmin: { __typename?: 'User', userId: string, isSuperAdmin: boolean } };

export type UpdateGamertagMutationVariables = Exact<{
  input: UpdateGamertagInput;
}>;


export type UpdateGamertagMutation = { __typename?: 'Mutation', updateGamertag: { __typename?: 'User', userId: string, gamertag: string | null, disambiguation: string | null, userType: string } };

export type UpdateUserStateMutationVariables = Exact<{
  input: UpdateUserStateInput;
}>;


export type UpdateUserStateMutation = { __typename?: 'Mutation', updateUserState: { __typename?: 'User', userId: string, state: string | null, userType: string } };

export type UpdateUserTypeMutationVariables = Exact<{
  userId: Scalars['BigInt']['input'];
  value: Scalars['String']['input'];
}>;


export type UpdateUserTypeMutation = { __typename?: 'Mutation', updateUserType: { __typename?: 'User', userId: string, userType: string } };

export type UserQueryVariables = Exact<{
  id: Scalars['BigInt']['input'];
}>;


export type UserQuery = { __typename?: 'Query', user: { __typename?: 'User', userId: string, email: string | null, gamertag: string | null, disambiguation: string | null, state: string | null, isConfirmed: boolean, createdAt: string, grantEarlyAccess: boolean, grantEarlyAccessOverride: boolean, orgId: string | null, externalId: string | null, userType: string, isSuperAdmin: boolean } | null };

export type UsersPaginatedQueryVariables = Exact<{
  query?: InputMaybe<Scalars['String']['input']>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
}>;


export type UsersPaginatedQuery = { __typename?: 'Query', usersPaginated: { __typename?: 'UsersPage', items: Array<{ __typename?: 'User', userId: string, email: string | null, gamertag: string | null, disambiguation: string | null, isConfirmed: boolean, createdAt: string, grantEarlyAccess: boolean, grantEarlyAccessOverride: boolean, orgId: string | null, externalId: string | null, userType: string, isSuperAdmin: boolean }>, pageInfo: { __typename?: 'PageInfo', totalCount: number, limit: number, offset: number } } };

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
export const AppAccessTiersDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"AppAccessTiers"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"appId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"BigInt"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"appAccessTiers"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"appId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"appId"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"tierId"}},{"kind":"Field","name":{"kind":"Name","value":"appId"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"tierOrder"}},{"kind":"Field","name":{"kind":"Name","value":"isFree"}},{"kind":"Field","name":{"kind":"Name","value":"isDefault"}},{"kind":"Field","name":{"kind":"Name","value":"priceCents"}},{"kind":"Field","name":{"kind":"Name","value":"currency"}},{"kind":"Field","name":{"kind":"Name","value":"billingPeriod"}},{"kind":"Field","name":{"kind":"Name","value":"description"}},{"kind":"Field","name":{"kind":"Name","value":"permissionKeys"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}}]}}]}}]} as unknown as DocumentNode<AppAccessTiersQuery, AppAccessTiersQueryVariables>;
export const AppUserAccessByAppDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"AppUserAccessByApp"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"appId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"BigInt"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"status"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"limit"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"Int"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"offset"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"Int"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"appUserAccessByApp"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"appId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"appId"}}},{"kind":"Argument","name":{"kind":"Name","value":"status"},"value":{"kind":"Variable","name":{"kind":"Name","value":"status"}}},{"kind":"Argument","name":{"kind":"Name","value":"limit"},"value":{"kind":"Variable","name":{"kind":"Name","value":"limit"}}},{"kind":"Argument","name":{"kind":"Name","value":"offset"},"value":{"kind":"Variable","name":{"kind":"Name","value":"offset"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"appUserAccessId"}},{"kind":"Field","name":{"kind":"Name","value":"appId"}},{"kind":"Field","name":{"kind":"Name","value":"userId"}},{"kind":"Field","name":{"kind":"Name","value":"tierId"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"grantedBy"}},{"kind":"Field","name":{"kind":"Name","value":"subscriptionId"}},{"kind":"Field","name":{"kind":"Name","value":"expiresAt"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}}]}}]}}]} as unknown as DocumentNode<AppUserAccessByAppQuery, AppUserAccessByAppQueryVariables>;
export const ArchiveAccessTierDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"ArchiveAccessTier"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"tierId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"BigInt"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"archiveAccessTier"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"tierId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"tierId"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"tierId"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}}]}}]}}]} as unknown as DocumentNode<ArchiveAccessTierMutation, ArchiveAccessTierMutationVariables>;
export const CreateAccessTierDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"CreateAccessTier"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"input"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"CreateAccessTierInput"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"createAccessTier"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"input"},"value":{"kind":"Variable","name":{"kind":"Name","value":"input"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"tierId"}},{"kind":"Field","name":{"kind":"Name","value":"appId"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"tierOrder"}},{"kind":"Field","name":{"kind":"Name","value":"isFree"}},{"kind":"Field","name":{"kind":"Name","value":"isDefault"}},{"kind":"Field","name":{"kind":"Name","value":"priceCents"}},{"kind":"Field","name":{"kind":"Name","value":"currency"}},{"kind":"Field","name":{"kind":"Name","value":"billingPeriod"}},{"kind":"Field","name":{"kind":"Name","value":"description"}},{"kind":"Field","name":{"kind":"Name","value":"permissionKeys"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}}]}}]}}]} as unknown as DocumentNode<CreateAccessTierMutation, CreateAccessTierMutationVariables>;
export const GrantAppAccessDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"GrantAppAccess"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"input"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"GrantAppAccessInput"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"grantAppAccess"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"input"},"value":{"kind":"Variable","name":{"kind":"Name","value":"input"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"appUserAccessId"}},{"kind":"Field","name":{"kind":"Name","value":"appId"}},{"kind":"Field","name":{"kind":"Name","value":"userId"}},{"kind":"Field","name":{"kind":"Name","value":"tierId"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"grantedBy"}},{"kind":"Field","name":{"kind":"Name","value":"subscriptionId"}},{"kind":"Field","name":{"kind":"Name","value":"expiresAt"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}}]}}]}}]} as unknown as DocumentNode<GrantAppAccessMutation, GrantAppAccessMutationVariables>;
export const MyAppAccessDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"MyAppAccess"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"appId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"BigInt"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"myAppAccess"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"appId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"appId"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"appUserAccessId"}},{"kind":"Field","name":{"kind":"Name","value":"appId"}},{"kind":"Field","name":{"kind":"Name","value":"userId"}},{"kind":"Field","name":{"kind":"Name","value":"tierId"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"grantedBy"}},{"kind":"Field","name":{"kind":"Name","value":"subscriptionId"}},{"kind":"Field","name":{"kind":"Name","value":"expiresAt"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}}]}}]}}]} as unknown as DocumentNode<MyAppAccessQuery, MyAppAccessQueryVariables>;
export const RevokeAppAccessDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"RevokeAppAccess"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"appId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"BigInt"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"userId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"BigInt"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"revokeAppAccess"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"appId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"appId"}}},{"kind":"Argument","name":{"kind":"Name","value":"userId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"userId"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"appUserAccessId"}},{"kind":"Field","name":{"kind":"Name","value":"appId"}},{"kind":"Field","name":{"kind":"Name","value":"userId"}},{"kind":"Field","name":{"kind":"Name","value":"tierId"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"grantedBy"}},{"kind":"Field","name":{"kind":"Name","value":"subscriptionId"}},{"kind":"Field","name":{"kind":"Name","value":"expiresAt"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}}]}}]}}]} as unknown as DocumentNode<RevokeAppAccessMutation, RevokeAppAccessMutationVariables>;
export const UpdateAccessTierDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"UpdateAccessTier"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"tierId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"BigInt"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"input"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"UpdateAccessTierInput"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"updateAccessTier"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"tierId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"tierId"}}},{"kind":"Argument","name":{"kind":"Name","value":"input"},"value":{"kind":"Variable","name":{"kind":"Name","value":"input"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"tierId"}},{"kind":"Field","name":{"kind":"Name","value":"appId"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"tierOrder"}},{"kind":"Field","name":{"kind":"Name","value":"isFree"}},{"kind":"Field","name":{"kind":"Name","value":"isDefault"}},{"kind":"Field","name":{"kind":"Name","value":"priceCents"}},{"kind":"Field","name":{"kind":"Name","value":"currency"}},{"kind":"Field","name":{"kind":"Name","value":"billingPeriod"}},{"kind":"Field","name":{"kind":"Name","value":"description"}},{"kind":"Field","name":{"kind":"Name","value":"permissionKeys"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}}]}}]}}]} as unknown as DocumentNode<UpdateAccessTierMutation, UpdateAccessTierMutationVariables>;
export const AppDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"App"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"appId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"BigInt"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"app"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"appId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"appId"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"appId"}},{"kind":"Field","name":{"kind":"Name","value":"orgId"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"slug"}},{"kind":"Field","name":{"kind":"Name","value":"description"}},{"kind":"Field","name":{"kind":"Name","value":"visibility"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"metadata"}},{"kind":"Field","name":{"kind":"Name","value":"splitMode"}},{"kind":"Field","name":{"kind":"Name","value":"gameApiUrl"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}},{"kind":"Field","name":{"kind":"Name","value":"org"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"orgId"}},{"kind":"Field","name":{"kind":"Name","value":"slug"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}}]}}]}}]} as unknown as DocumentNode<AppQuery, AppQueryVariables>;
export const AppBySlugDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"AppBySlug"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"orgSlug"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"appSlug"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"appBySlug"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"orgSlug"},"value":{"kind":"Variable","name":{"kind":"Name","value":"orgSlug"}}},{"kind":"Argument","name":{"kind":"Name","value":"appSlug"},"value":{"kind":"Variable","name":{"kind":"Name","value":"appSlug"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"appId"}},{"kind":"Field","name":{"kind":"Name","value":"orgId"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"slug"}},{"kind":"Field","name":{"kind":"Name","value":"description"}},{"kind":"Field","name":{"kind":"Name","value":"visibility"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"metadata"}},{"kind":"Field","name":{"kind":"Name","value":"splitMode"}},{"kind":"Field","name":{"kind":"Name","value":"gameApiUrl"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}},{"kind":"Field","name":{"kind":"Name","value":"org"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"orgId"}},{"kind":"Field","name":{"kind":"Name","value":"slug"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}}]}}]}}]} as unknown as DocumentNode<AppBySlugQuery, AppBySlugQueryVariables>;
export const AppsForOrgDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"AppsForOrg"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"orgSlug"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"appsForOrg"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"orgSlug"},"value":{"kind":"Variable","name":{"kind":"Name","value":"orgSlug"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"appId"}},{"kind":"Field","name":{"kind":"Name","value":"orgId"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"slug"}},{"kind":"Field","name":{"kind":"Name","value":"description"}},{"kind":"Field","name":{"kind":"Name","value":"visibility"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"metadata"}},{"kind":"Field","name":{"kind":"Name","value":"splitMode"}},{"kind":"Field","name":{"kind":"Name","value":"gameApiUrl"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}}]}}]}}]} as unknown as DocumentNode<AppsForOrgQuery, AppsForOrgQueryVariables>;
export const ArchiveAppDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"ArchiveApp"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"appId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"BigInt"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"archiveApp"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"appId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"appId"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"appId"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}}]}}]}}]} as unknown as DocumentNode<ArchiveAppMutation, ArchiveAppMutationVariables>;
export const CreateAppDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"CreateApp"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"input"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"CreateAppInput"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"createApp"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"input"},"value":{"kind":"Variable","name":{"kind":"Name","value":"input"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"appId"}},{"kind":"Field","name":{"kind":"Name","value":"orgId"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"slug"}},{"kind":"Field","name":{"kind":"Name","value":"description"}},{"kind":"Field","name":{"kind":"Name","value":"visibility"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"metadata"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}}]}}]}}]} as unknown as DocumentNode<CreateAppMutation, CreateAppMutationVariables>;
export const MarketplaceAppsDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"MarketplaceApps"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"filter"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"AppMarketplaceFilterInput"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"limit"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"Int"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"offset"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"Int"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"apps"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"filter"},"value":{"kind":"Variable","name":{"kind":"Name","value":"filter"}}},{"kind":"Argument","name":{"kind":"Name","value":"limit"},"value":{"kind":"Variable","name":{"kind":"Name","value":"limit"}}},{"kind":"Argument","name":{"kind":"Name","value":"offset"},"value":{"kind":"Variable","name":{"kind":"Name","value":"offset"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"items"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"appId"}},{"kind":"Field","name":{"kind":"Name","value":"orgId"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"slug"}},{"kind":"Field","name":{"kind":"Name","value":"description"}},{"kind":"Field","name":{"kind":"Name","value":"visibility"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"metadata"}},{"kind":"Field","name":{"kind":"Name","value":"splitMode"}},{"kind":"Field","name":{"kind":"Name","value":"gameApiUrl"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}},{"kind":"Field","name":{"kind":"Name","value":"org"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"orgId"}},{"kind":"Field","name":{"kind":"Name","value":"slug"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}}]}},{"kind":"Field","name":{"kind":"Name","value":"pageInfo"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"totalCount"}},{"kind":"Field","name":{"kind":"Name","value":"limit"}},{"kind":"Field","name":{"kind":"Name","value":"offset"}}]}}]}}]}}]} as unknown as DocumentNode<MarketplaceAppsQuery, MarketplaceAppsQueryVariables>;
export const MyAppsDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"MyApps"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"myApps"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"appId"}},{"kind":"Field","name":{"kind":"Name","value":"orgId"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"slug"}},{"kind":"Field","name":{"kind":"Name","value":"description"}},{"kind":"Field","name":{"kind":"Name","value":"visibility"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"metadata"}},{"kind":"Field","name":{"kind":"Name","value":"splitMode"}},{"kind":"Field","name":{"kind":"Name","value":"gameApiUrl"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}},{"kind":"Field","name":{"kind":"Name","value":"org"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"orgId"}},{"kind":"Field","name":{"kind":"Name","value":"slug"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}}]}}]}}]} as unknown as DocumentNode<MyAppsQuery, MyAppsQueryVariables>;
export const SetAppVisibilityDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"SetAppVisibility"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"appId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"BigInt"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"visibility"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"AppVisibility"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"setAppVisibility"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"appId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"appId"}}},{"kind":"Argument","name":{"kind":"Name","value":"visibility"},"value":{"kind":"Variable","name":{"kind":"Name","value":"visibility"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"appId"}},{"kind":"Field","name":{"kind":"Name","value":"visibility"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}}]}}]}}]} as unknown as DocumentNode<SetAppVisibilityMutation, SetAppVisibilityMutationVariables>;
export const UpdateAppDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"UpdateApp"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"appId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"BigInt"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"input"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"UpdateAppInput"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"updateApp"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"appId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"appId"}}},{"kind":"Argument","name":{"kind":"Name","value":"input"},"value":{"kind":"Variable","name":{"kind":"Name","value":"input"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"appId"}},{"kind":"Field","name":{"kind":"Name","value":"orgId"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"slug"}},{"kind":"Field","name":{"kind":"Name","value":"description"}},{"kind":"Field","name":{"kind":"Name","value":"visibility"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"metadata"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}}]}}]}}]} as unknown as DocumentNode<UpdateAppMutation, UpdateAppMutationVariables>;
export const ChangePasswordDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"ChangePassword"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"currentPassword"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"newPassword"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"changePassword"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"currentPassword"},"value":{"kind":"Variable","name":{"kind":"Name","value":"currentPassword"}}},{"kind":"Argument","name":{"kind":"Name","value":"newPassword"},"value":{"kind":"Variable","name":{"kind":"Name","value":"newPassword"}}}]}]}}]} as unknown as DocumentNode<ChangePasswordMutation, ChangePasswordMutationVariables>;
export const ConfirmEmailDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"ConfirmEmail"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"token"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"confirmEmail"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"token"},"value":{"kind":"Variable","name":{"kind":"Name","value":"token"}}}]}]}}]} as unknown as DocumentNode<ConfirmEmailMutation, ConfirmEmailMutationVariables>;
export const LoginDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"Login"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"input"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"LoginUserInput"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"login"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"loginUserInput"},"value":{"kind":"Variable","name":{"kind":"Name","value":"input"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"token"}},{"kind":"Field","name":{"kind":"Name","value":"gameTokenId"}},{"kind":"Field","name":{"kind":"Name","value":"user"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"userId"}},{"kind":"Field","name":{"kind":"Name","value":"email"}},{"kind":"Field","name":{"kind":"Name","value":"gamertag"}},{"kind":"Field","name":{"kind":"Name","value":"disambiguation"}},{"kind":"Field","name":{"kind":"Name","value":"isConfirmed"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"grantEarlyAccess"}},{"kind":"Field","name":{"kind":"Name","value":"grantEarlyAccessOverride"}},{"kind":"Field","name":{"kind":"Name","value":"orgId"}},{"kind":"Field","name":{"kind":"Name","value":"externalId"}},{"kind":"Field","name":{"kind":"Name","value":"userType"}},{"kind":"Field","name":{"kind":"Name","value":"isSuperAdmin"}}]}}]}}]}}]} as unknown as DocumentNode<LoginMutation, LoginMutationVariables>;
export const LogoutDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"Logout"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"logout"}}]}}]} as unknown as DocumentNode<LogoutMutation, LogoutMutationVariables>;
export const LogoutAllDevicesDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"LogoutAllDevices"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"logoutAllDevices"}}]}}]} as unknown as DocumentNode<LogoutAllDevicesMutation, LogoutAllDevicesMutationVariables>;
export const RegisterDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"Register"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"input"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"RegisterUserInput"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"register"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"registerUserInput"},"value":{"kind":"Variable","name":{"kind":"Name","value":"input"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"token"}},{"kind":"Field","name":{"kind":"Name","value":"gameTokenId"}},{"kind":"Field","name":{"kind":"Name","value":"user"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"userId"}},{"kind":"Field","name":{"kind":"Name","value":"email"}},{"kind":"Field","name":{"kind":"Name","value":"gamertag"}},{"kind":"Field","name":{"kind":"Name","value":"disambiguation"}},{"kind":"Field","name":{"kind":"Name","value":"isConfirmed"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"grantEarlyAccess"}},{"kind":"Field","name":{"kind":"Name","value":"grantEarlyAccessOverride"}},{"kind":"Field","name":{"kind":"Name","value":"orgId"}},{"kind":"Field","name":{"kind":"Name","value":"externalId"}},{"kind":"Field","name":{"kind":"Name","value":"userType"}},{"kind":"Field","name":{"kind":"Name","value":"isSuperAdmin"}}]}}]}}]}}]} as unknown as DocumentNode<RegisterMutation, RegisterMutationVariables>;
export const RequestPasswordResetDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"RequestPasswordReset"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"email"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"requestPasswordReset"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"email"},"value":{"kind":"Variable","name":{"kind":"Name","value":"email"}}}]}]}}]} as unknown as DocumentNode<RequestPasswordResetMutation, RequestPasswordResetMutationVariables>;
export const ResendConfirmationEmailDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"ResendConfirmationEmail"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"email"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"resendConfirmationEmail"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"email"},"value":{"kind":"Variable","name":{"kind":"Name","value":"email"}}}]}]}}]} as unknown as DocumentNode<ResendConfirmationEmailMutation, ResendConfirmationEmailMutationVariables>;
export const ResetPasswordDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"ResetPassword"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"input"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ResetPasswordInput"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"resetPassword"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"resetPasswordInput"},"value":{"kind":"Variable","name":{"kind":"Name","value":"input"}}}]}]}}]} as unknown as DocumentNode<ResetPasswordMutation, ResetPasswordMutationVariables>;
export const AppBudgetDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"AppBudget"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"orgId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"BigInt"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"appId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"BigInt"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"appBudget"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"orgId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"orgId"}}},{"kind":"Argument","name":{"kind":"Name","value":"appId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"appId"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"appBudgetId"}},{"kind":"Field","name":{"kind":"Name","value":"orgId"}},{"kind":"Field","name":{"kind":"Name","value":"appId"}},{"kind":"Field","name":{"kind":"Name","value":"monthlyLimitCents"}},{"kind":"Field","name":{"kind":"Name","value":"currentMonthUsageCents"}},{"kind":"Field","name":{"kind":"Name","value":"periodStart"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}}]}}]}}]} as unknown as DocumentNode<AppBudgetQuery, AppBudgetQueryVariables>;
export const AppBudgetsDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"AppBudgets"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"orgId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"BigInt"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"appBudgets"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"orgId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"orgId"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"appBudgetId"}},{"kind":"Field","name":{"kind":"Name","value":"orgId"}},{"kind":"Field","name":{"kind":"Name","value":"appId"}},{"kind":"Field","name":{"kind":"Name","value":"monthlyLimitCents"}},{"kind":"Field","name":{"kind":"Name","value":"currentMonthUsageCents"}},{"kind":"Field","name":{"kind":"Name","value":"periodStart"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}}]}}]}}]} as unknown as DocumentNode<AppBudgetsQuery, AppBudgetsQueryVariables>;
export const SetAppBudgetDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"SetAppBudget"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"orgId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"BigInt"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"appId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"BigInt"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"monthlyLimitCents"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"BigInt"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"setAppBudget"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"orgId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"orgId"}}},{"kind":"Argument","name":{"kind":"Name","value":"appId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"appId"}}},{"kind":"Argument","name":{"kind":"Name","value":"monthlyLimitCents"},"value":{"kind":"Variable","name":{"kind":"Name","value":"monthlyLimitCents"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"appBudgetId"}},{"kind":"Field","name":{"kind":"Name","value":"orgId"}},{"kind":"Field","name":{"kind":"Name","value":"appId"}},{"kind":"Field","name":{"kind":"Name","value":"monthlyLimitCents"}},{"kind":"Field","name":{"kind":"Name","value":"currentMonthUsageCents"}},{"kind":"Field","name":{"kind":"Name","value":"periodStart"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}}]}}]}}]} as unknown as DocumentNode<SetAppBudgetMutation, SetAppBudgetMutationVariables>;
export const WalletBalanceDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"WalletBalance"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"orgId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"BigInt"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"walletBalance"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"orgId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"orgId"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"walletId"}},{"kind":"Field","name":{"kind":"Name","value":"orgId"}},{"kind":"Field","name":{"kind":"Name","value":"balanceCents"}},{"kind":"Field","name":{"kind":"Name","value":"currency"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}}]}}]}}]} as unknown as DocumentNode<WalletBalanceQuery, WalletBalanceQueryVariables>;
export const WalletTransactionsDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"WalletTransactions"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"orgId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"BigInt"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"limit"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"Int"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"offset"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"Int"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"walletTransactions"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"orgId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"orgId"}}},{"kind":"Argument","name":{"kind":"Name","value":"limit"},"value":{"kind":"Variable","name":{"kind":"Name","value":"limit"}}},{"kind":"Argument","name":{"kind":"Name","value":"offset"},"value":{"kind":"Variable","name":{"kind":"Name","value":"offset"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"transactionId"}},{"kind":"Field","name":{"kind":"Name","value":"walletId"}},{"kind":"Field","name":{"kind":"Name","value":"orgId"}},{"kind":"Field","name":{"kind":"Name","value":"amountCents"}},{"kind":"Field","name":{"kind":"Name","value":"balanceAfter"}},{"kind":"Field","name":{"kind":"Name","value":"transactionType"}},{"kind":"Field","name":{"kind":"Name","value":"description"}},{"kind":"Field","name":{"kind":"Name","value":"referenceId"}},{"kind":"Field","name":{"kind":"Name","value":"appId"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}}]}}]}}]} as unknown as DocumentNode<WalletTransactionsQuery, WalletTransactionsQueryVariables>;
export const AddChannelMemberDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"AddChannelMember"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"groupId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"BigInt"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"userId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"BigInt"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"addChannelMember"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"groupId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"groupId"}}},{"kind":"Argument","name":{"kind":"Name","value":"userId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"userId"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"groupMemberId"}},{"kind":"Field","name":{"kind":"Name","value":"groupId"}},{"kind":"Field","name":{"kind":"Name","value":"userId"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"roles"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"groupRoleId"}},{"kind":"Field","name":{"kind":"Name","value":"roleName"}},{"kind":"Field","name":{"kind":"Name","value":"rank"}},{"kind":"Field","name":{"kind":"Name","value":"isSystem"}},{"kind":"Field","name":{"kind":"Name","value":"permissions"}}]}}]}}]}}]} as unknown as DocumentNode<AddChannelMemberMutation, AddChannelMemberMutationVariables>;
export const ChannelDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"Channel"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"groupId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"BigInt"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"channel"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"groupId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"groupId"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"groupId"}},{"kind":"Field","name":{"kind":"Name","value":"appId"}},{"kind":"Field","name":{"kind":"Name","value":"groupType"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"description"}},{"kind":"Field","name":{"kind":"Name","value":"ownerUserId"}},{"kind":"Field","name":{"kind":"Name","value":"membershipPolicy"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"defaultRoleId"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}}]}}]}}]} as unknown as DocumentNode<ChannelQuery, ChannelQueryVariables>;
export const ChannelMembersDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"ChannelMembers"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"groupId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"BigInt"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"channelMembers"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"groupId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"groupId"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"groupMemberId"}},{"kind":"Field","name":{"kind":"Name","value":"groupId"}},{"kind":"Field","name":{"kind":"Name","value":"userId"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"roles"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"groupRoleId"}},{"kind":"Field","name":{"kind":"Name","value":"roleName"}},{"kind":"Field","name":{"kind":"Name","value":"rank"}},{"kind":"Field","name":{"kind":"Name","value":"isSystem"}},{"kind":"Field","name":{"kind":"Name","value":"permissions"}}]}}]}}]}}]} as unknown as DocumentNode<ChannelMembersQuery, ChannelMembersQueryVariables>;
export const ChannelPolicyDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"ChannelPolicy"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"appId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"BigInt"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"channelPolicy"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"appId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"appId"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"appId"}},{"kind":"Field","name":{"kind":"Name","value":"groupType"}},{"kind":"Field","name":{"kind":"Name","value":"creationPolicy"}},{"kind":"Field","name":{"kind":"Name","value":"defaultMembershipPolicy"}},{"kind":"Field","name":{"kind":"Name","value":"maxMembers"}},{"kind":"Field","name":{"kind":"Name","value":"maxGroupsPerUser"}}]}}]}}]} as unknown as DocumentNode<ChannelPolicyQuery, ChannelPolicyQueryVariables>;
export const ChannelRolesDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"ChannelRoles"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"groupId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"BigInt"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"channelRoles"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"groupId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"groupId"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"groupRoleId"}},{"kind":"Field","name":{"kind":"Name","value":"groupId"}},{"kind":"Field","name":{"kind":"Name","value":"roleName"}},{"kind":"Field","name":{"kind":"Name","value":"rank"}},{"kind":"Field","name":{"kind":"Name","value":"isSystem"}},{"kind":"Field","name":{"kind":"Name","value":"permissions"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}}]}}]}}]} as unknown as DocumentNode<ChannelRolesQuery, ChannelRolesQueryVariables>;
export const ChannelsDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"Channels"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"appId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"BigInt"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"channels"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"appId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"appId"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"groupId"}},{"kind":"Field","name":{"kind":"Name","value":"appId"}},{"kind":"Field","name":{"kind":"Name","value":"groupType"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"description"}},{"kind":"Field","name":{"kind":"Name","value":"ownerUserId"}},{"kind":"Field","name":{"kind":"Name","value":"membershipPolicy"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"defaultRoleId"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}}]}}]}}]} as unknown as DocumentNode<ChannelsQuery, ChannelsQueryVariables>;
export const CreateChannelDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"CreateChannel"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"input"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"CreateChannelInput"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"createChannel"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"input"},"value":{"kind":"Variable","name":{"kind":"Name","value":"input"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"groupId"}},{"kind":"Field","name":{"kind":"Name","value":"appId"}},{"kind":"Field","name":{"kind":"Name","value":"groupType"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"description"}},{"kind":"Field","name":{"kind":"Name","value":"ownerUserId"}},{"kind":"Field","name":{"kind":"Name","value":"membershipPolicy"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"defaultRoleId"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}}]}}]}}]} as unknown as DocumentNode<CreateChannelMutation, CreateChannelMutationVariables>;
export const CreateChannelRoleDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"CreateChannelRole"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"input"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"CreateGroupRoleInput"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"createChannelRole"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"input"},"value":{"kind":"Variable","name":{"kind":"Name","value":"input"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"groupRoleId"}},{"kind":"Field","name":{"kind":"Name","value":"groupId"}},{"kind":"Field","name":{"kind":"Name","value":"roleName"}},{"kind":"Field","name":{"kind":"Name","value":"rank"}},{"kind":"Field","name":{"kind":"Name","value":"isSystem"}},{"kind":"Field","name":{"kind":"Name","value":"permissions"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}}]}}]}}]} as unknown as DocumentNode<CreateChannelRoleMutation, CreateChannelRoleMutationVariables>;
export const DeleteChannelDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"DeleteChannel"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"groupId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"BigInt"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"deleteChannel"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"groupId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"groupId"}}}]}]}}]} as unknown as DocumentNode<DeleteChannelMutation, DeleteChannelMutationVariables>;
export const DeleteChannelRoleDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"DeleteChannelRole"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"groupRoleId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"BigInt"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"deleteChannelRole"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"groupRoleId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"groupRoleId"}}}]}]}}]} as unknown as DocumentNode<DeleteChannelRoleMutation, DeleteChannelRoleMutationVariables>;
export const JoinChannelDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"JoinChannel"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"groupId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"BigInt"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"joinChannel"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"groupId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"groupId"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"groupMemberId"}},{"kind":"Field","name":{"kind":"Name","value":"groupId"}},{"kind":"Field","name":{"kind":"Name","value":"userId"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"roles"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"groupRoleId"}},{"kind":"Field","name":{"kind":"Name","value":"roleName"}},{"kind":"Field","name":{"kind":"Name","value":"rank"}},{"kind":"Field","name":{"kind":"Name","value":"isSystem"}},{"kind":"Field","name":{"kind":"Name","value":"permissions"}}]}}]}}]}}]} as unknown as DocumentNode<JoinChannelMutation, JoinChannelMutationVariables>;
export const LeaveChannelDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"LeaveChannel"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"groupId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"BigInt"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"leaveChannel"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"groupId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"groupId"}}}]}]}}]} as unknown as DocumentNode<LeaveChannelMutation, LeaveChannelMutationVariables>;
export const MyChannelsDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"MyChannels"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"appId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"BigInt"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"myChannels"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"appId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"appId"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"group"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"groupId"}},{"kind":"Field","name":{"kind":"Name","value":"appId"}},{"kind":"Field","name":{"kind":"Name","value":"groupType"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"description"}},{"kind":"Field","name":{"kind":"Name","value":"ownerUserId"}},{"kind":"Field","name":{"kind":"Name","value":"membershipPolicy"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"defaultRoleId"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}}]}},{"kind":"Field","name":{"kind":"Name","value":"roles"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"groupRoleId"}},{"kind":"Field","name":{"kind":"Name","value":"roleName"}},{"kind":"Field","name":{"kind":"Name","value":"rank"}},{"kind":"Field","name":{"kind":"Name","value":"isSystem"}},{"kind":"Field","name":{"kind":"Name","value":"permissions"}}]}},{"kind":"Field","name":{"kind":"Name","value":"permissions"}},{"kind":"Field","name":{"kind":"Name","value":"joinedAt"}}]}}]}}]} as unknown as DocumentNode<MyChannelsQuery, MyChannelsQueryVariables>;
export const RemoveChannelMemberDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"RemoveChannelMember"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"groupId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"BigInt"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"userId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"BigInt"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"removeChannelMember"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"groupId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"groupId"}}},{"kind":"Argument","name":{"kind":"Name","value":"userId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"userId"}}}]}]}}]} as unknown as DocumentNode<RemoveChannelMemberMutation, RemoveChannelMemberMutationVariables>;
export const RequestToJoinChannelDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"RequestToJoinChannel"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"groupId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"BigInt"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"requestToJoinChannel"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"groupId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"groupId"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"groupMemberId"}},{"kind":"Field","name":{"kind":"Name","value":"groupId"}},{"kind":"Field","name":{"kind":"Name","value":"userId"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"roles"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"groupRoleId"}},{"kind":"Field","name":{"kind":"Name","value":"roleName"}},{"kind":"Field","name":{"kind":"Name","value":"rank"}},{"kind":"Field","name":{"kind":"Name","value":"isSystem"}},{"kind":"Field","name":{"kind":"Name","value":"permissions"}}]}}]}}]}}]} as unknown as DocumentNode<RequestToJoinChannelMutation, RequestToJoinChannelMutationVariables>;
export const SetChannelMemberRolesDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"SetChannelMemberRoles"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"input"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"SetMemberRolesInput"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"setChannelMemberRoles"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"input"},"value":{"kind":"Variable","name":{"kind":"Name","value":"input"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"groupMemberId"}},{"kind":"Field","name":{"kind":"Name","value":"groupId"}},{"kind":"Field","name":{"kind":"Name","value":"userId"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"roles"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"groupRoleId"}},{"kind":"Field","name":{"kind":"Name","value":"roleName"}},{"kind":"Field","name":{"kind":"Name","value":"rank"}},{"kind":"Field","name":{"kind":"Name","value":"isSystem"}},{"kind":"Field","name":{"kind":"Name","value":"permissions"}}]}}]}}]}}]} as unknown as DocumentNode<SetChannelMemberRolesMutation, SetChannelMemberRolesMutationVariables>;
export const SetChannelPolicyDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"SetChannelPolicy"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"input"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"SetChannelPolicyInput"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"setChannelPolicy"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"input"},"value":{"kind":"Variable","name":{"kind":"Name","value":"input"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"appId"}},{"kind":"Field","name":{"kind":"Name","value":"groupType"}},{"kind":"Field","name":{"kind":"Name","value":"creationPolicy"}},{"kind":"Field","name":{"kind":"Name","value":"defaultMembershipPolicy"}},{"kind":"Field","name":{"kind":"Name","value":"maxMembers"}},{"kind":"Field","name":{"kind":"Name","value":"maxGroupsPerUser"}}]}}]}}]} as unknown as DocumentNode<SetChannelPolicyMutation, SetChannelPolicyMutationVariables>;
export const UpdateChannelDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"UpdateChannel"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"input"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"UpdateChannelInput"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"updateChannel"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"input"},"value":{"kind":"Variable","name":{"kind":"Name","value":"input"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"groupId"}},{"kind":"Field","name":{"kind":"Name","value":"appId"}},{"kind":"Field","name":{"kind":"Name","value":"groupType"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"description"}},{"kind":"Field","name":{"kind":"Name","value":"ownerUserId"}},{"kind":"Field","name":{"kind":"Name","value":"membershipPolicy"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"defaultRoleId"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}}]}}]}}]} as unknown as DocumentNode<UpdateChannelMutation, UpdateChannelMutationVariables>;
export const UpdateChannelRoleDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"UpdateChannelRole"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"input"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"UpdateGroupRoleInput"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"updateChannelRole"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"input"},"value":{"kind":"Variable","name":{"kind":"Name","value":"input"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"groupRoleId"}},{"kind":"Field","name":{"kind":"Name","value":"groupId"}},{"kind":"Field","name":{"kind":"Name","value":"roleName"}},{"kind":"Field","name":{"kind":"Name","value":"rank"}},{"kind":"Field","name":{"kind":"Name","value":"isSystem"}},{"kind":"Field","name":{"kind":"Name","value":"permissions"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}}]}}]}}]} as unknown as DocumentNode<UpdateChannelRoleMutation, UpdateChannelRoleMutationVariables>;
export const GetChunkDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"GetChunk"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"input"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"GetChunkInput"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"getChunk"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"input"},"value":{"kind":"Variable","name":{"kind":"Name","value":"input"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"chunkId"}},{"kind":"Field","name":{"kind":"Name","value":"appId"}},{"kind":"Field","name":{"kind":"Name","value":"coordinates"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"x"}},{"kind":"Field","name":{"kind":"Name","value":"y"}},{"kind":"Field","name":{"kind":"Name","value":"z"}}]}},{"kind":"Field","name":{"kind":"Name","value":"voxels"}},{"kind":"Field","name":{"kind":"Name","value":"voxelStates"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"voxelCoord"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"x"}},{"kind":"Field","name":{"kind":"Name","value":"y"}},{"kind":"Field","name":{"kind":"Name","value":"z"}}]}},{"kind":"Field","name":{"kind":"Name","value":"voxelType"}},{"kind":"Field","name":{"kind":"Name","value":"state"}}]}},{"kind":"Field","name":{"kind":"Name","value":"owner"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}},{"kind":"Field","name":{"kind":"Name","value":"chunkState"}},{"kind":"Field","name":{"kind":"Name","value":"cdnUploadedAt"}},{"kind":"Field","name":{"kind":"Name","value":"lods"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"level"}},{"kind":"Field","name":{"kind":"Name","value":"data"}}]}}]}}]}}]} as unknown as DocumentNode<GetChunkQuery, GetChunkQueryVariables>;
export const GetChunkLodsDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"GetChunkLods"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"input"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"GetChunkLodsInput"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"getChunkLods"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"input"},"value":{"kind":"Variable","name":{"kind":"Name","value":"input"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"chunkId"}},{"kind":"Field","name":{"kind":"Name","value":"appId"}},{"kind":"Field","name":{"kind":"Name","value":"coordinates"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"x"}},{"kind":"Field","name":{"kind":"Name","value":"y"}},{"kind":"Field","name":{"kind":"Name","value":"z"}}]}},{"kind":"Field","name":{"kind":"Name","value":"lods"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"level"}},{"kind":"Field","name":{"kind":"Name","value":"data"}}]}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}}]}}]}}]} as unknown as DocumentNode<GetChunkLodsQuery, GetChunkLodsQueryVariables>;
export const GetChunksByDistanceDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"GetChunksByDistance"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"input"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"GetChunksByDistanceInput"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"getChunksByDistance"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"input"},"value":{"kind":"Variable","name":{"kind":"Name","value":"input"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"limit"}},{"kind":"Field","name":{"kind":"Name","value":"skip"}},{"kind":"Field","name":{"kind":"Name","value":"chunks"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"chunkId"}},{"kind":"Field","name":{"kind":"Name","value":"appId"}},{"kind":"Field","name":{"kind":"Name","value":"coordinates"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"x"}},{"kind":"Field","name":{"kind":"Name","value":"y"}},{"kind":"Field","name":{"kind":"Name","value":"z"}}]}},{"kind":"Field","name":{"kind":"Name","value":"voxels"}},{"kind":"Field","name":{"kind":"Name","value":"owner"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}},{"kind":"Field","name":{"kind":"Name","value":"chunkState"}},{"kind":"Field","name":{"kind":"Name","value":"cdnUploadedAt"}},{"kind":"Field","name":{"kind":"Name","value":"lods"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"level"}},{"kind":"Field","name":{"kind":"Name","value":"data"}}]}}]}}]}}]}}]} as unknown as DocumentNode<GetChunksByDistanceQuery, GetChunksByDistanceQueryVariables>;
export const GetVoxelListDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"GetVoxelList"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"input"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"GetVoxelListInput"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"getVoxelList"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"input"},"value":{"kind":"Variable","name":{"kind":"Name","value":"input"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"coordinates"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"x"}},{"kind":"Field","name":{"kind":"Name","value":"y"}},{"kind":"Field","name":{"kind":"Name","value":"z"}}]}},{"kind":"Field","name":{"kind":"Name","value":"voxels"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"voxelUpdateId"}},{"kind":"Field","name":{"kind":"Name","value":"appId"}},{"kind":"Field","name":{"kind":"Name","value":"coordinates"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"x"}},{"kind":"Field","name":{"kind":"Name","value":"y"}},{"kind":"Field","name":{"kind":"Name","value":"z"}}]}},{"kind":"Field","name":{"kind":"Name","value":"location"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"x"}},{"kind":"Field","name":{"kind":"Name","value":"y"}},{"kind":"Field","name":{"kind":"Name","value":"z"}}]}},{"kind":"Field","name":{"kind":"Name","value":"voxelType"}},{"kind":"Field","name":{"kind":"Name","value":"state"}},{"kind":"Field","name":{"kind":"Name","value":"createdBy"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}}]}}]}}]}}]} as unknown as DocumentNode<GetVoxelListQuery, GetVoxelListQueryVariables>;
export const UpdateChunkDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"UpdateChunk"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"input"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ChunkUpdateInput"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"updateChunk"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"input"},"value":{"kind":"Variable","name":{"kind":"Name","value":"input"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"chunkId"}},{"kind":"Field","name":{"kind":"Name","value":"appId"}},{"kind":"Field","name":{"kind":"Name","value":"coordinates"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"x"}},{"kind":"Field","name":{"kind":"Name","value":"y"}},{"kind":"Field","name":{"kind":"Name","value":"z"}}]}},{"kind":"Field","name":{"kind":"Name","value":"voxels"}},{"kind":"Field","name":{"kind":"Name","value":"chunkState"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}}]}}]}}]} as unknown as DocumentNode<UpdateChunkMutation, UpdateChunkMutationVariables>;
export const UpdateChunkLodsDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"UpdateChunkLods"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"input"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"UpdateChunkLodsInput"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"updateChunkLods"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"input"},"value":{"kind":"Variable","name":{"kind":"Name","value":"input"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"chunkId"}},{"kind":"Field","name":{"kind":"Name","value":"appId"}},{"kind":"Field","name":{"kind":"Name","value":"coordinates"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"x"}},{"kind":"Field","name":{"kind":"Name","value":"y"}},{"kind":"Field","name":{"kind":"Name","value":"z"}}]}},{"kind":"Field","name":{"kind":"Name","value":"lods"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"level"}},{"kind":"Field","name":{"kind":"Name","value":"data"}}]}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}}]}}]}}]} as unknown as DocumentNode<UpdateChunkLodsMutation, UpdateChunkLodsMutationVariables>;
export const UpdateChunkStateDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"UpdateChunkState"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"input"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"UpdateChunkStateInput"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"updateChunkState"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"input"},"value":{"kind":"Variable","name":{"kind":"Name","value":"input"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"chunkId"}},{"kind":"Field","name":{"kind":"Name","value":"appId"}},{"kind":"Field","name":{"kind":"Name","value":"coordinates"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"x"}},{"kind":"Field","name":{"kind":"Name","value":"y"}},{"kind":"Field","name":{"kind":"Name","value":"z"}}]}},{"kind":"Field","name":{"kind":"Name","value":"chunkState"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}}]}}]}}]} as unknown as DocumentNode<UpdateChunkStateMutation, UpdateChunkStateMutationVariables>;
export const CreateOrgRoleDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"CreateOrgRole"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"input"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"CreateOrgRoleInput"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"createOrgRole"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"input"},"value":{"kind":"Variable","name":{"kind":"Name","value":"input"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"orgRoleId"}},{"kind":"Field","name":{"kind":"Name","value":"orgId"}},{"kind":"Field","name":{"kind":"Name","value":"roleName"}},{"kind":"Field","name":{"kind":"Name","value":"isSystem"}},{"kind":"Field","name":{"kind":"Name","value":"permissions"}},{"kind":"Field","name":{"kind":"Name","value":"description"}}]}}]}}]} as unknown as DocumentNode<CreateOrgRoleMutation, CreateOrgRoleMutationVariables>;
export const CreateOrgTokenDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"CreateOrgToken"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"input"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"CreateOrgTokenInput"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"createOrgToken"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"input"},"value":{"kind":"Variable","name":{"kind":"Name","value":"input"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"orgTokenId"}},{"kind":"Field","name":{"kind":"Name","value":"orgId"}},{"kind":"Field","name":{"kind":"Name","value":"token"}},{"kind":"Field","name":{"kind":"Name","value":"label"}},{"kind":"Field","name":{"kind":"Name","value":"isActive"}},{"kind":"Field","name":{"kind":"Name","value":"expiresAt"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}}]}}]}}]} as unknown as DocumentNode<CreateOrgTokenMutation, CreateOrgTokenMutationVariables>;
export const CreateOrganizationDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"CreateOrganization"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"input"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"CreateOrganizationInput"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"createOrganization"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"input"},"value":{"kind":"Variable","name":{"kind":"Name","value":"input"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"orgId"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"slug"}},{"kind":"Field","name":{"kind":"Name","value":"ownerUserId"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}}]}}]}}]} as unknown as DocumentNode<CreateOrganizationMutation, CreateOrganizationMutationVariables>;
export const DeleteOrgRoleDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"DeleteOrgRole"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"orgRoleId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"BigInt"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"deleteOrgRole"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"orgRoleId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"orgRoleId"}}}]}]}}]} as unknown as DocumentNode<DeleteOrgRoleMutation, DeleteOrgRoleMutationVariables>;
export const InviteOrgMemberDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"InviteOrgMember"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"input"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"InviteOrgMemberInput"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"inviteOrgMember"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"input"},"value":{"kind":"Variable","name":{"kind":"Name","value":"input"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"orgMemberId"}},{"kind":"Field","name":{"kind":"Name","value":"orgId"}},{"kind":"Field","name":{"kind":"Name","value":"userId"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}}]}}]}}]} as unknown as DocumentNode<InviteOrgMemberMutation, InviteOrgMemberMutationVariables>;
export const MyOrganizationsDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"MyOrganizations"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"myOrganizations"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"org"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"orgId"}},{"kind":"Field","name":{"kind":"Name","value":"slug"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"ownerUserId"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}}]}},{"kind":"Field","name":{"kind":"Name","value":"permissions"}},{"kind":"Field","name":{"kind":"Name","value":"roles"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"orgRoleId"}},{"kind":"Field","name":{"kind":"Name","value":"orgId"}},{"kind":"Field","name":{"kind":"Name","value":"roleName"}},{"kind":"Field","name":{"kind":"Name","value":"isSystem"}},{"kind":"Field","name":{"kind":"Name","value":"permissions"}}]}},{"kind":"Field","name":{"kind":"Name","value":"joinedAt"}}]}}]}}]} as unknown as DocumentNode<MyOrganizationsQuery, MyOrganizationsQueryVariables>;
export const OrgMembersDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"OrgMembers"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"orgId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"BigInt"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"orgMembers"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"orgId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"orgId"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"orgMemberId"}},{"kind":"Field","name":{"kind":"Name","value":"orgId"}},{"kind":"Field","name":{"kind":"Name","value":"userId"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}}]}}]}}]} as unknown as DocumentNode<OrgMembersQuery, OrgMembersQueryVariables>;
export const OrgPermissionsDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"OrgPermissions"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"orgPermissions"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"permissionKey"}},{"kind":"Field","name":{"kind":"Name","value":"description"}},{"kind":"Field","name":{"kind":"Name","value":"category"}}]}}]}}]} as unknown as DocumentNode<OrgPermissionsQuery, OrgPermissionsQueryVariables>;
export const OrgRolesDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"OrgRoles"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"orgId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"BigInt"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"orgRoles"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"orgId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"orgId"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"orgRoleId"}},{"kind":"Field","name":{"kind":"Name","value":"orgId"}},{"kind":"Field","name":{"kind":"Name","value":"roleName"}},{"kind":"Field","name":{"kind":"Name","value":"isSystem"}},{"kind":"Field","name":{"kind":"Name","value":"permissions"}},{"kind":"Field","name":{"kind":"Name","value":"description"}}]}}]}}]} as unknown as DocumentNode<OrgRolesQuery, OrgRolesQueryVariables>;
export const OrgTokensDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"OrgTokens"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"orgId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"BigInt"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"orgTokens"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"orgId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"orgId"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"orgTokenId"}},{"kind":"Field","name":{"kind":"Name","value":"orgId"}},{"kind":"Field","name":{"kind":"Name","value":"label"}},{"kind":"Field","name":{"kind":"Name","value":"isActive"}},{"kind":"Field","name":{"kind":"Name","value":"lastUsedAt"}},{"kind":"Field","name":{"kind":"Name","value":"revokedAt"}},{"kind":"Field","name":{"kind":"Name","value":"expiresAt"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}}]}}]}}]} as unknown as DocumentNode<OrgTokensQuery, OrgTokensQueryVariables>;
export const OrganizationDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"Organization"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"id"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"BigInt"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"organization"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"id"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"orgId"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"slug"}},{"kind":"Field","name":{"kind":"Name","value":"ownerUserId"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}}]}}]}}]} as unknown as DocumentNode<OrganizationQuery, OrganizationQueryVariables>;
export const OrganizationBySlugDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"OrganizationBySlug"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"slug"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"organizationBySlug"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"slug"},"value":{"kind":"Variable","name":{"kind":"Name","value":"slug"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"orgId"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"slug"}},{"kind":"Field","name":{"kind":"Name","value":"ownerUserId"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}}]}}]}}]} as unknown as DocumentNode<OrganizationBySlugQuery, OrganizationBySlugQueryVariables>;
export const RemoveOrgMemberDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"RemoveOrgMember"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"orgId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"BigInt"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"userId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"BigInt"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"removeOrgMember"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"orgId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"orgId"}}},{"kind":"Argument","name":{"kind":"Name","value":"userId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"userId"}}}]}]}}]} as unknown as DocumentNode<RemoveOrgMemberMutation, RemoveOrgMemberMutationVariables>;
export const RevokeOrgTokenDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"RevokeOrgToken"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"orgTokenId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"BigInt"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"revokeOrgToken"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"orgTokenId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"orgTokenId"}}}]}]}}]} as unknown as DocumentNode<RevokeOrgTokenMutation, RevokeOrgTokenMutationVariables>;
export const SetOrgStatusDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"SetOrgStatus"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"orgId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"BigInt"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"status"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"setOrgStatus"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"orgId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"orgId"}}},{"kind":"Argument","name":{"kind":"Name","value":"status"},"value":{"kind":"Variable","name":{"kind":"Name","value":"status"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"orgId"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}}]}}]}}]} as unknown as DocumentNode<SetOrgStatusMutation, SetOrgStatusMutationVariables>;
export const UpdateOrgMemberRolesDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"UpdateOrgMemberRoles"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"orgId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"BigInt"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"userId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"BigInt"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"roleIds"}},"type":{"kind":"NonNullType","type":{"kind":"ListType","type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"BigInt"}}}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"updateOrgMemberRoles"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"orgId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"orgId"}}},{"kind":"Argument","name":{"kind":"Name","value":"userId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"userId"}}},{"kind":"Argument","name":{"kind":"Name","value":"roleIds"},"value":{"kind":"Variable","name":{"kind":"Name","value":"roleIds"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"orgMemberId"}},{"kind":"Field","name":{"kind":"Name","value":"orgId"}},{"kind":"Field","name":{"kind":"Name","value":"userId"}},{"kind":"Field","name":{"kind":"Name","value":"status"}}]}}]}}]} as unknown as DocumentNode<UpdateOrgMemberRolesMutation, UpdateOrgMemberRolesMutationVariables>;
export const UpdateOrgRoleDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"UpdateOrgRole"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"orgRoleId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"BigInt"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"input"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"UpdateOrgRoleInput"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"updateOrgRole"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"orgRoleId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"orgRoleId"}}},{"kind":"Argument","name":{"kind":"Name","value":"input"},"value":{"kind":"Variable","name":{"kind":"Name","value":"input"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"orgRoleId"}},{"kind":"Field","name":{"kind":"Name","value":"orgId"}},{"kind":"Field","name":{"kind":"Name","value":"roleName"}},{"kind":"Field","name":{"kind":"Name","value":"isSystem"}},{"kind":"Field","name":{"kind":"Name","value":"permissions"}},{"kind":"Field","name":{"kind":"Name","value":"description"}}]}}]}}]} as unknown as DocumentNode<UpdateOrgRoleMutation, UpdateOrgRoleMutationVariables>;
export const UpdateOrgTokenDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"UpdateOrgToken"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"orgTokenId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"BigInt"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"input"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"UpdateOrgTokenInput"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"updateOrgToken"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"orgTokenId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"orgTokenId"}}},{"kind":"Argument","name":{"kind":"Name","value":"input"},"value":{"kind":"Variable","name":{"kind":"Name","value":"input"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"orgTokenId"}},{"kind":"Field","name":{"kind":"Name","value":"label"}},{"kind":"Field","name":{"kind":"Name","value":"isActive"}},{"kind":"Field","name":{"kind":"Name","value":"expiresAt"}},{"kind":"Field","name":{"kind":"Name","value":"revokedAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}}]}}]}}]} as unknown as DocumentNode<UpdateOrgTokenMutation, UpdateOrgTokenMutationVariables>;
export const CheckoutsDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"Checkouts"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"filter"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"CheckoutFilterInput"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"limit"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"Int"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"offset"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"Int"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"checkouts"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"filter"},"value":{"kind":"Variable","name":{"kind":"Name","value":"filter"}}},{"kind":"Argument","name":{"kind":"Name","value":"limit"},"value":{"kind":"Variable","name":{"kind":"Name","value":"limit"}}},{"kind":"Argument","name":{"kind":"Name","value":"offset"},"value":{"kind":"Variable","name":{"kind":"Name","value":"offset"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"items"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"checkoutId"}},{"kind":"Field","name":{"kind":"Name","value":"userId"}},{"kind":"Field","name":{"kind":"Name","value":"provider"}},{"kind":"Field","name":{"kind":"Name","value":"purpose"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"amountCents"}},{"kind":"Field","name":{"kind":"Name","value":"currency"}},{"kind":"Field","name":{"kind":"Name","value":"externalId"}},{"kind":"Field","name":{"kind":"Name","value":"externalUrl"}},{"kind":"Field","name":{"kind":"Name","value":"orgId"}},{"kind":"Field","name":{"kind":"Name","value":"appId"}},{"kind":"Field","name":{"kind":"Name","value":"tierId"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"completedAt"}},{"kind":"Field","name":{"kind":"Name","value":"expiresAt"}}]}},{"kind":"Field","name":{"kind":"Name","value":"pageInfo"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"totalCount"}},{"kind":"Field","name":{"kind":"Name","value":"limit"}},{"kind":"Field","name":{"kind":"Name","value":"offset"}}]}}]}}]}}]} as unknown as DocumentNode<CheckoutsQuery, CheckoutsQueryVariables>;
export const CreateCheckoutDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"CreateCheckout"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"input"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"CreateCheckoutInput"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"createCheckout"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"input"},"value":{"kind":"Variable","name":{"kind":"Name","value":"input"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"checkoutId"}},{"kind":"Field","name":{"kind":"Name","value":"userId"}},{"kind":"Field","name":{"kind":"Name","value":"provider"}},{"kind":"Field","name":{"kind":"Name","value":"purpose"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"amountCents"}},{"kind":"Field","name":{"kind":"Name","value":"currency"}},{"kind":"Field","name":{"kind":"Name","value":"externalId"}},{"kind":"Field","name":{"kind":"Name","value":"externalUrl"}},{"kind":"Field","name":{"kind":"Name","value":"orgId"}},{"kind":"Field","name":{"kind":"Name","value":"appId"}},{"kind":"Field","name":{"kind":"Name","value":"tierId"}},{"kind":"Field","name":{"kind":"Name","value":"error"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"completedAt"}},{"kind":"Field","name":{"kind":"Name","value":"expiresAt"}}]}}]}}]} as unknown as DocumentNode<CreateCheckoutMutation, CreateCheckoutMutationVariables>;
export const MyCheckoutsDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"MyCheckouts"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"limit"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"Int"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"offset"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"Int"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"myCheckouts"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"limit"},"value":{"kind":"Variable","name":{"kind":"Name","value":"limit"}}},{"kind":"Argument","name":{"kind":"Name","value":"offset"},"value":{"kind":"Variable","name":{"kind":"Name","value":"offset"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"items"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"checkoutId"}},{"kind":"Field","name":{"kind":"Name","value":"userId"}},{"kind":"Field","name":{"kind":"Name","value":"provider"}},{"kind":"Field","name":{"kind":"Name","value":"purpose"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"amountCents"}},{"kind":"Field","name":{"kind":"Name","value":"currency"}},{"kind":"Field","name":{"kind":"Name","value":"externalId"}},{"kind":"Field","name":{"kind":"Name","value":"externalUrl"}},{"kind":"Field","name":{"kind":"Name","value":"orgId"}},{"kind":"Field","name":{"kind":"Name","value":"appId"}},{"kind":"Field","name":{"kind":"Name","value":"tierId"}},{"kind":"Field","name":{"kind":"Name","value":"error"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"completedAt"}},{"kind":"Field","name":{"kind":"Name","value":"expiresAt"}}]}},{"kind":"Field","name":{"kind":"Name","value":"pageInfo"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"totalCount"}},{"kind":"Field","name":{"kind":"Name","value":"limit"}},{"kind":"Field","name":{"kind":"Name","value":"offset"}}]}}]}}]}}]} as unknown as DocumentNode<MyCheckoutsQuery, MyCheckoutsQueryVariables>;
export const DeleteQuotaDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"DeleteQuota"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"quotaId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"BigInt"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"deleteQuota"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"quotaId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"quotaId"}}}]}]}}]} as unknown as DocumentNode<DeleteQuotaMutation, DeleteQuotaMutationVariables>;
export const EffectiveQuotaDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"EffectiveQuota"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"metric"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"orgId"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"BigInt"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"appId"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"BigInt"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"tierId"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"BigInt"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"effectiveQuota"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"metric"},"value":{"kind":"Variable","name":{"kind":"Name","value":"metric"}}},{"kind":"Argument","name":{"kind":"Name","value":"orgId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"orgId"}}},{"kind":"Argument","name":{"kind":"Name","value":"appId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"appId"}}},{"kind":"Argument","name":{"kind":"Name","value":"tierId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"tierId"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"quotaId"}},{"kind":"Field","name":{"kind":"Name","value":"orgId"}},{"kind":"Field","name":{"kind":"Name","value":"appId"}},{"kind":"Field","name":{"kind":"Name","value":"tierId"}},{"kind":"Field","name":{"kind":"Name","value":"metric"}},{"kind":"Field","name":{"kind":"Name","value":"limitValue"}},{"kind":"Field","name":{"kind":"Name","value":"period"}},{"kind":"Field","name":{"kind":"Name","value":"actionOnExceed"}}]}}]}}]} as unknown as DocumentNode<EffectiveQuotaQuery, EffectiveQuotaQueryVariables>;
export const QuotasForAppDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"QuotasForApp"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"appId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"BigInt"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"quotasForApp"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"appId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"appId"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"quotaId"}},{"kind":"Field","name":{"kind":"Name","value":"orgId"}},{"kind":"Field","name":{"kind":"Name","value":"appId"}},{"kind":"Field","name":{"kind":"Name","value":"tierId"}},{"kind":"Field","name":{"kind":"Name","value":"metric"}},{"kind":"Field","name":{"kind":"Name","value":"limitValue"}},{"kind":"Field","name":{"kind":"Name","value":"period"}},{"kind":"Field","name":{"kind":"Name","value":"actionOnExceed"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}}]}}]}}]} as unknown as DocumentNode<QuotasForAppQuery, QuotasForAppQueryVariables>;
export const QuotasForOrgDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"QuotasForOrg"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"orgId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"BigInt"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"quotasForOrg"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"orgId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"orgId"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"quotaId"}},{"kind":"Field","name":{"kind":"Name","value":"orgId"}},{"kind":"Field","name":{"kind":"Name","value":"appId"}},{"kind":"Field","name":{"kind":"Name","value":"tierId"}},{"kind":"Field","name":{"kind":"Name","value":"metric"}},{"kind":"Field","name":{"kind":"Name","value":"limitValue"}},{"kind":"Field","name":{"kind":"Name","value":"period"}},{"kind":"Field","name":{"kind":"Name","value":"actionOnExceed"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}}]}}]}}]} as unknown as DocumentNode<QuotasForOrgQuery, QuotasForOrgQueryVariables>;
export const SetQuotaDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"SetQuota"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"input"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"SetQuotaInput"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"setQuota"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"input"},"value":{"kind":"Variable","name":{"kind":"Name","value":"input"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"quotaId"}},{"kind":"Field","name":{"kind":"Name","value":"orgId"}},{"kind":"Field","name":{"kind":"Name","value":"appId"}},{"kind":"Field","name":{"kind":"Name","value":"tierId"}},{"kind":"Field","name":{"kind":"Name","value":"metric"}},{"kind":"Field","name":{"kind":"Name","value":"limitValue"}},{"kind":"Field","name":{"kind":"Name","value":"period"}},{"kind":"Field","name":{"kind":"Name","value":"actionOnExceed"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}}]}}]}}]} as unknown as DocumentNode<SetQuotaMutation, SetQuotaMutationVariables>;
export const ActiveGraphQlServersDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"ActiveGraphQLServers"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"activeGraphQLServers"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"graphqlServerId"}},{"kind":"Field","name":{"kind":"Name","value":"ip4"}},{"kind":"Field","name":{"kind":"Name","value":"ip6"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}}]}}]}}]} as unknown as DocumentNode<ActiveGraphQlServersQuery, ActiveGraphQlServersQueryVariables>;
export const GameClientBootstrapDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"GameClientBootstrap"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"appId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"BigInt"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"gameClientBootstrap"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"appId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"appId"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"appId"}},{"kind":"Field","name":{"kind":"Name","value":"realtimeProtocol"}},{"kind":"Field","name":{"kind":"Name","value":"subscriptionName"}},{"kind":"Field","name":{"kind":"Name","value":"maxReplicationDistance"}},{"kind":"Field","name":{"kind":"Name","value":"maxDecayRate"}},{"kind":"Field","name":{"kind":"Name","value":"sequenceNumberModulo"}},{"kind":"Field","name":{"kind":"Name","value":"udpProxyConnectionStatus"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"connected"}},{"kind":"Field","name":{"kind":"Name","value":"serverIp6"}},{"kind":"Field","name":{"kind":"Name","value":"serverClientPort"}},{"kind":"Field","name":{"kind":"Name","value":"lastMessageTime"}}]}},{"kind":"Field","name":{"kind":"Name","value":"versionInfo"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"serverVersion"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"major"}},{"kind":"Field","name":{"kind":"Name","value":"minor"}},{"kind":"Field","name":{"kind":"Name","value":"patch"}},{"kind":"Field","name":{"kind":"Name","value":"build"}}]}},{"kind":"Field","name":{"kind":"Name","value":"minimumClientVersion"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"major"}},{"kind":"Field","name":{"kind":"Name","value":"minor"}},{"kind":"Field","name":{"kind":"Name","value":"patch"}},{"kind":"Field","name":{"kind":"Name","value":"build"}}]}}]}},{"kind":"Field","name":{"kind":"Name","value":"me"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"userId"}},{"kind":"Field","name":{"kind":"Name","value":"email"}},{"kind":"Field","name":{"kind":"Name","value":"gamertag"}},{"kind":"Field","name":{"kind":"Name","value":"disambiguation"}},{"kind":"Field","name":{"kind":"Name","value":"state"}},{"kind":"Field","name":{"kind":"Name","value":"isConfirmed"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"grantEarlyAccess"}},{"kind":"Field","name":{"kind":"Name","value":"grantEarlyAccessOverride"}},{"kind":"Field","name":{"kind":"Name","value":"orgId"}},{"kind":"Field","name":{"kind":"Name","value":"externalId"}},{"kind":"Field","name":{"kind":"Name","value":"userType"}},{"kind":"Field","name":{"kind":"Name","value":"isSuperAdmin"}}]}}]}}]}}]} as unknown as DocumentNode<GameClientBootstrapQuery, GameClientBootstrapQueryVariables>;
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
export const SendActorUpdateDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"SendActorUpdate"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"input"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ActorUpdateRequestInput"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"sendActorUpdate"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"input"},"value":{"kind":"Variable","name":{"kind":"Name","value":"input"}}}]}]}}]} as unknown as DocumentNode<SendActorUpdateMutation, SendActorUpdateMutationVariables>;
export const SendAudioPacketDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"SendAudioPacket"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"input"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ClientAudioPacketInput"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"sendAudioPacket"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"input"},"value":{"kind":"Variable","name":{"kind":"Name","value":"input"}}}]}]}}]} as unknown as DocumentNode<SendAudioPacketMutation, SendAudioPacketMutationVariables>;
export const SendChannelMessageDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"SendChannelMessage"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"input"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ChannelMessageInput"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"sendChannelMessage"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"input"},"value":{"kind":"Variable","name":{"kind":"Name","value":"input"}}}]}]}}]} as unknown as DocumentNode<SendChannelMessageMutation, SendChannelMessageMutationVariables>;
export const SendClientEventDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"SendClientEvent"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"input"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ClientEventNotificationInput"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"sendClientEvent"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"input"},"value":{"kind":"Variable","name":{"kind":"Name","value":"input"}}}]}]}}]} as unknown as DocumentNode<SendClientEventMutation, SendClientEventMutationVariables>;
export const SendSingleActorMessageDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"SendSingleActorMessage"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"input"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"SingleActorMessageInput"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"sendSingleActorMessage"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"input"},"value":{"kind":"Variable","name":{"kind":"Name","value":"input"}}}]}]}}]} as unknown as DocumentNode<SendSingleActorMessageMutation, SendSingleActorMessageMutationVariables>;
export const SendTextPacketDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"SendTextPacket"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"input"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ClientTextPacketInput"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"sendTextPacket"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"input"},"value":{"kind":"Variable","name":{"kind":"Name","value":"input"}}}]}]}}]} as unknown as DocumentNode<SendTextPacketMutation, SendTextPacketMutationVariables>;
export const SendVoxelUpdateDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"SendVoxelUpdate"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"input"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"VoxelUpdateRequestInput"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"sendVoxelUpdate"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"input"},"value":{"kind":"Variable","name":{"kind":"Name","value":"input"}}}]}]}}]} as unknown as DocumentNode<SendVoxelUpdateMutation, SendVoxelUpdateMutationVariables>;
export const UdpNotificationsDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"subscription","name":{"kind":"Name","value":"UdpNotifications"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"udpNotifications"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"__typename"}},{"kind":"InlineFragment","typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"ActorUpdateNotification"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"appId"}},{"kind":"Field","name":{"kind":"Name","value":"chunkX"}},{"kind":"Field","name":{"kind":"Name","value":"chunkY"}},{"kind":"Field","name":{"kind":"Name","value":"chunkZ"}},{"kind":"Field","name":{"kind":"Name","value":"distance"}},{"kind":"Field","name":{"kind":"Name","value":"decayRate"}},{"kind":"Field","name":{"kind":"Name","value":"uuid"}},{"kind":"Field","name":{"kind":"Name","value":"state"}},{"kind":"Field","name":{"kind":"Name","value":"sequenceNumber"}},{"kind":"Field","name":{"kind":"Name","value":"epochMillis"}}]}},{"kind":"InlineFragment","typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"ActorUpdateResponse"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"appId"}},{"kind":"Field","name":{"kind":"Name","value":"chunkX"}},{"kind":"Field","name":{"kind":"Name","value":"chunkY"}},{"kind":"Field","name":{"kind":"Name","value":"chunkZ"}},{"kind":"Field","name":{"kind":"Name","value":"distance"}},{"kind":"Field","name":{"kind":"Name","value":"decayRate"}},{"kind":"Field","name":{"kind":"Name","value":"uuid"}},{"kind":"Field","name":{"kind":"Name","value":"sequenceNumber"}},{"kind":"Field","name":{"kind":"Name","value":"epochMillis"}}]}},{"kind":"InlineFragment","typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"VoxelUpdateNotification"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"appId"}},{"kind":"Field","name":{"kind":"Name","value":"chunkX"}},{"kind":"Field","name":{"kind":"Name","value":"chunkY"}},{"kind":"Field","name":{"kind":"Name","value":"chunkZ"}},{"kind":"Field","name":{"kind":"Name","value":"distance"}},{"kind":"Field","name":{"kind":"Name","value":"decayRate"}},{"kind":"Field","name":{"kind":"Name","value":"uuid"}},{"kind":"Field","name":{"kind":"Name","value":"voxelX"}},{"kind":"Field","name":{"kind":"Name","value":"voxelY"}},{"kind":"Field","name":{"kind":"Name","value":"voxelZ"}},{"kind":"Field","name":{"kind":"Name","value":"voxelType"}},{"kind":"Field","name":{"kind":"Name","value":"voxelState"}},{"kind":"Field","name":{"kind":"Name","value":"sequenceNumber"}},{"kind":"Field","name":{"kind":"Name","value":"epochMillis"}}]}},{"kind":"InlineFragment","typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"VoxelUpdateResponse"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"appId"}},{"kind":"Field","name":{"kind":"Name","value":"chunkX"}},{"kind":"Field","name":{"kind":"Name","value":"chunkY"}},{"kind":"Field","name":{"kind":"Name","value":"chunkZ"}},{"kind":"Field","name":{"kind":"Name","value":"distance"}},{"kind":"Field","name":{"kind":"Name","value":"decayRate"}},{"kind":"Field","name":{"kind":"Name","value":"uuid"}},{"kind":"Field","name":{"kind":"Name","value":"sequenceNumber"}},{"kind":"Field","name":{"kind":"Name","value":"epochMillis"}}]}},{"kind":"InlineFragment","typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"ClientAudioNotification"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"appId"}},{"kind":"Field","name":{"kind":"Name","value":"chunkX"}},{"kind":"Field","name":{"kind":"Name","value":"chunkY"}},{"kind":"Field","name":{"kind":"Name","value":"chunkZ"}},{"kind":"Field","name":{"kind":"Name","value":"distance"}},{"kind":"Field","name":{"kind":"Name","value":"decayRate"}},{"kind":"Field","name":{"kind":"Name","value":"uuid"}},{"kind":"Field","name":{"kind":"Name","value":"audioData"}},{"kind":"Field","name":{"kind":"Name","value":"sequenceNumber"}},{"kind":"Field","name":{"kind":"Name","value":"epochMillis"}}]}},{"kind":"InlineFragment","typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"ClientTextNotification"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"appId"}},{"kind":"Field","name":{"kind":"Name","value":"chunkX"}},{"kind":"Field","name":{"kind":"Name","value":"chunkY"}},{"kind":"Field","name":{"kind":"Name","value":"chunkZ"}},{"kind":"Field","name":{"kind":"Name","value":"distance"}},{"kind":"Field","name":{"kind":"Name","value":"decayRate"}},{"kind":"Field","name":{"kind":"Name","value":"uuid"}},{"kind":"Field","name":{"kind":"Name","value":"text"}},{"kind":"Field","name":{"kind":"Name","value":"sequenceNumber"}},{"kind":"Field","name":{"kind":"Name","value":"epochMillis"}}]}},{"kind":"InlineFragment","typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"ClientEventNotification"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"appId"}},{"kind":"Field","name":{"kind":"Name","value":"chunkX"}},{"kind":"Field","name":{"kind":"Name","value":"chunkY"}},{"kind":"Field","name":{"kind":"Name","value":"chunkZ"}},{"kind":"Field","name":{"kind":"Name","value":"distance"}},{"kind":"Field","name":{"kind":"Name","value":"decayRate"}},{"kind":"Field","name":{"kind":"Name","value":"uuid"}},{"kind":"Field","name":{"kind":"Name","value":"eventType"}},{"kind":"Field","name":{"kind":"Name","value":"state"}},{"kind":"Field","name":{"kind":"Name","value":"sequenceNumber"}},{"kind":"Field","name":{"kind":"Name","value":"epochMillis"}}]}},{"kind":"InlineFragment","typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"ServerEventNotification"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"appId"}},{"kind":"Field","name":{"kind":"Name","value":"chunkX"}},{"kind":"Field","name":{"kind":"Name","value":"chunkY"}},{"kind":"Field","name":{"kind":"Name","value":"chunkZ"}},{"kind":"Field","name":{"kind":"Name","value":"distance"}},{"kind":"Field","name":{"kind":"Name","value":"decayRate"}},{"kind":"Field","name":{"kind":"Name","value":"uuid"}},{"kind":"Field","name":{"kind":"Name","value":"eventType"}},{"kind":"Field","name":{"kind":"Name","value":"state"}},{"kind":"Field","name":{"kind":"Name","value":"sequenceNumber"}},{"kind":"Field","name":{"kind":"Name","value":"epochMillis"}}]}},{"kind":"InlineFragment","typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"SingleActorMessageNotification"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"appId"}},{"kind":"Field","name":{"kind":"Name","value":"chunkX"}},{"kind":"Field","name":{"kind":"Name","value":"chunkY"}},{"kind":"Field","name":{"kind":"Name","value":"chunkZ"}},{"kind":"Field","name":{"kind":"Name","value":"uuid"}},{"kind":"Field","name":{"kind":"Name","value":"payload"}},{"kind":"Field","name":{"kind":"Name","value":"sequenceNumber"}},{"kind":"Field","name":{"kind":"Name","value":"epochMillis"}}]}},{"kind":"InlineFragment","typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"ChannelMessageNotification"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"channelId"}},{"kind":"Field","name":{"kind":"Name","value":"uuid"}},{"kind":"Field","name":{"kind":"Name","value":"payload"}},{"kind":"Field","name":{"kind":"Name","value":"sequenceNumber"}},{"kind":"Field","name":{"kind":"Name","value":"epochMillis"}}]}},{"kind":"InlineFragment","typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"GenericErrorResponse"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"sequenceNumber"}},{"kind":"Field","name":{"kind":"Name","value":"errorCode"}}]}},{"kind":"InlineFragment","typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"RealtimeConnectionEvent"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"code"}},{"kind":"Field","name":{"kind":"Name","value":"message"}},{"kind":"Field","name":{"kind":"Name","value":"retryable"}}]}}]}}]}}]} as unknown as DocumentNode<UdpNotificationsSubscription, UdpNotificationsSubscriptionVariables>;
export const UdpProxyConnectionStatusDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"UdpProxyConnectionStatus"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"udpProxyConnectionStatus"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"connected"}},{"kind":"Field","name":{"kind":"Name","value":"serverIp6"}},{"kind":"Field","name":{"kind":"Name","value":"serverClientPort"}},{"kind":"Field","name":{"kind":"Name","value":"lastMessageTime"}}]}}]}}]} as unknown as DocumentNode<UdpProxyConnectionStatusQuery, UdpProxyConnectionStatusQueryVariables>;
export const DeleteMyAccountDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"DeleteMyAccount"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"deleteMyAccount"}}]}}]} as unknown as DocumentNode<DeleteMyAccountMutation, DeleteMyAccountMutationVariables>;
export const ForceLogoutUserDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"ForceLogoutUser"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"userId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"BigInt"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"forceLogoutUser"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"userId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"userId"}}}]}]}}]} as unknown as DocumentNode<ForceLogoutUserMutation, ForceLogoutUserMutationVariables>;
export const MeDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"Me"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"me"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"userId"}},{"kind":"Field","name":{"kind":"Name","value":"email"}},{"kind":"Field","name":{"kind":"Name","value":"gamertag"}},{"kind":"Field","name":{"kind":"Name","value":"disambiguation"}},{"kind":"Field","name":{"kind":"Name","value":"state"}},{"kind":"Field","name":{"kind":"Name","value":"isConfirmed"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"grantEarlyAccess"}},{"kind":"Field","name":{"kind":"Name","value":"grantEarlyAccessOverride"}},{"kind":"Field","name":{"kind":"Name","value":"orgId"}},{"kind":"Field","name":{"kind":"Name","value":"externalId"}},{"kind":"Field","name":{"kind":"Name","value":"userType"}},{"kind":"Field","name":{"kind":"Name","value":"isSuperAdmin"}}]}}]}}]} as unknown as DocumentNode<MeQuery, MeQueryVariables>;
export const SetEarlyAccessOverrideDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"SetEarlyAccessOverride"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"userId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"BigInt"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"value"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"Boolean"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"setEarlyAccessOverride"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"userId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"userId"}}},{"kind":"Argument","name":{"kind":"Name","value":"value"},"value":{"kind":"Variable","name":{"kind":"Name","value":"value"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"userId"}},{"kind":"Field","name":{"kind":"Name","value":"grantEarlyAccessOverride"}}]}}]}}]} as unknown as DocumentNode<SetEarlyAccessOverrideMutation, SetEarlyAccessOverrideMutationVariables>;
export const SetSuperAdminDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"SetSuperAdmin"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"userId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"BigInt"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"value"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"Boolean"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"setSuperAdmin"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"userId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"userId"}}},{"kind":"Argument","name":{"kind":"Name","value":"value"},"value":{"kind":"Variable","name":{"kind":"Name","value":"value"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"userId"}},{"kind":"Field","name":{"kind":"Name","value":"isSuperAdmin"}}]}}]}}]} as unknown as DocumentNode<SetSuperAdminMutation, SetSuperAdminMutationVariables>;
export const UpdateGamertagDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"UpdateGamertag"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"input"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"UpdateGamertagInput"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"updateGamertag"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"input"},"value":{"kind":"Variable","name":{"kind":"Name","value":"input"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"userId"}},{"kind":"Field","name":{"kind":"Name","value":"gamertag"}},{"kind":"Field","name":{"kind":"Name","value":"disambiguation"}},{"kind":"Field","name":{"kind":"Name","value":"userType"}}]}}]}}]} as unknown as DocumentNode<UpdateGamertagMutation, UpdateGamertagMutationVariables>;
export const UpdateUserStateDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"UpdateUserState"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"input"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"UpdateUserStateInput"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"updateUserState"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"input"},"value":{"kind":"Variable","name":{"kind":"Name","value":"input"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"userId"}},{"kind":"Field","name":{"kind":"Name","value":"state"}},{"kind":"Field","name":{"kind":"Name","value":"userType"}}]}}]}}]} as unknown as DocumentNode<UpdateUserStateMutation, UpdateUserStateMutationVariables>;
export const UpdateUserTypeDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"UpdateUserType"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"userId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"BigInt"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"value"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"updateUserType"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"userId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"userId"}}},{"kind":"Argument","name":{"kind":"Name","value":"value"},"value":{"kind":"Variable","name":{"kind":"Name","value":"value"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"userId"}},{"kind":"Field","name":{"kind":"Name","value":"userType"}}]}}]}}]} as unknown as DocumentNode<UpdateUserTypeMutation, UpdateUserTypeMutationVariables>;
export const UserDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"User"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"id"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"BigInt"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"user"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"id"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"userId"}},{"kind":"Field","name":{"kind":"Name","value":"email"}},{"kind":"Field","name":{"kind":"Name","value":"gamertag"}},{"kind":"Field","name":{"kind":"Name","value":"disambiguation"}},{"kind":"Field","name":{"kind":"Name","value":"state"}},{"kind":"Field","name":{"kind":"Name","value":"isConfirmed"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"grantEarlyAccess"}},{"kind":"Field","name":{"kind":"Name","value":"grantEarlyAccessOverride"}},{"kind":"Field","name":{"kind":"Name","value":"orgId"}},{"kind":"Field","name":{"kind":"Name","value":"externalId"}},{"kind":"Field","name":{"kind":"Name","value":"userType"}},{"kind":"Field","name":{"kind":"Name","value":"isSuperAdmin"}}]}}]}}]} as unknown as DocumentNode<UserQuery, UserQueryVariables>;
export const UsersPaginatedDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"UsersPaginated"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"query"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"limit"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"Int"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"offset"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"Int"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"usersPaginated"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"query"},"value":{"kind":"Variable","name":{"kind":"Name","value":"query"}}},{"kind":"Argument","name":{"kind":"Name","value":"limit"},"value":{"kind":"Variable","name":{"kind":"Name","value":"limit"}}},{"kind":"Argument","name":{"kind":"Name","value":"offset"},"value":{"kind":"Variable","name":{"kind":"Name","value":"offset"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"items"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"userId"}},{"kind":"Field","name":{"kind":"Name","value":"email"}},{"kind":"Field","name":{"kind":"Name","value":"gamertag"}},{"kind":"Field","name":{"kind":"Name","value":"disambiguation"}},{"kind":"Field","name":{"kind":"Name","value":"isConfirmed"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"grantEarlyAccess"}},{"kind":"Field","name":{"kind":"Name","value":"grantEarlyAccessOverride"}},{"kind":"Field","name":{"kind":"Name","value":"orgId"}},{"kind":"Field","name":{"kind":"Name","value":"externalId"}},{"kind":"Field","name":{"kind":"Name","value":"userType"}},{"kind":"Field","name":{"kind":"Name","value":"isSuperAdmin"}}]}},{"kind":"Field","name":{"kind":"Name","value":"pageInfo"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"totalCount"}},{"kind":"Field","name":{"kind":"Name","value":"limit"}},{"kind":"Field","name":{"kind":"Name","value":"offset"}}]}}]}}]}}]} as unknown as DocumentNode<UsersPaginatedQuery, UsersPaginatedQueryVariables>;
export const ListVoxelUpdatesByDistanceDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"ListVoxelUpdatesByDistance"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"input"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ListVoxelUpdatesByDistanceInput"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"listVoxelUpdatesByDistance"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"input"},"value":{"kind":"Variable","name":{"kind":"Name","value":"input"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"centerCoordinate"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"x"}},{"kind":"Field","name":{"kind":"Name","value":"y"}},{"kind":"Field","name":{"kind":"Name","value":"z"}}]}},{"kind":"Field","name":{"kind":"Name","value":"limit"}},{"kind":"Field","name":{"kind":"Name","value":"skip"}},{"kind":"Field","name":{"kind":"Name","value":"chunks"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"coordinates"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"x"}},{"kind":"Field","name":{"kind":"Name","value":"y"}},{"kind":"Field","name":{"kind":"Name","value":"z"}}]}},{"kind":"Field","name":{"kind":"Name","value":"voxels"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"voxelUpdateId"}},{"kind":"Field","name":{"kind":"Name","value":"appId"}},{"kind":"Field","name":{"kind":"Name","value":"location"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"x"}},{"kind":"Field","name":{"kind":"Name","value":"y"}},{"kind":"Field","name":{"kind":"Name","value":"z"}}]}},{"kind":"Field","name":{"kind":"Name","value":"voxelType"}},{"kind":"Field","name":{"kind":"Name","value":"state"}},{"kind":"Field","name":{"kind":"Name","value":"createdBy"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}}]}}]}}]}}]}}]} as unknown as DocumentNode<ListVoxelUpdatesByDistanceQuery, ListVoxelUpdatesByDistanceQueryVariables>;
export const ListVoxelsDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"ListVoxels"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"input"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ListVoxelsInput"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"listVoxels"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"input"},"value":{"kind":"Variable","name":{"kind":"Name","value":"input"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"voxelUpdateId"}},{"kind":"Field","name":{"kind":"Name","value":"appId"}},{"kind":"Field","name":{"kind":"Name","value":"coordinates"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"x"}},{"kind":"Field","name":{"kind":"Name","value":"y"}},{"kind":"Field","name":{"kind":"Name","value":"z"}}]}},{"kind":"Field","name":{"kind":"Name","value":"location"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"x"}},{"kind":"Field","name":{"kind":"Name","value":"y"}},{"kind":"Field","name":{"kind":"Name","value":"z"}}]}},{"kind":"Field","name":{"kind":"Name","value":"voxelType"}},{"kind":"Field","name":{"kind":"Name","value":"state"}},{"kind":"Field","name":{"kind":"Name","value":"createdBy"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}}]}}]}}]} as unknown as DocumentNode<ListVoxelsQuery, ListVoxelsQueryVariables>;
export const RollbackVoxelUpdatesDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"RollbackVoxelUpdates"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"input"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"RollbackVoxelUpdatesInput"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"rollbackVoxelUpdates"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"input"},"value":{"kind":"Variable","name":{"kind":"Name","value":"input"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"appId"}},{"kind":"Field","name":{"kind":"Name","value":"coordinates"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"x"}},{"kind":"Field","name":{"kind":"Name","value":"y"}},{"kind":"Field","name":{"kind":"Name","value":"z"}}]}},{"kind":"Field","name":{"kind":"Name","value":"location"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"x"}},{"kind":"Field","name":{"kind":"Name","value":"y"}},{"kind":"Field","name":{"kind":"Name","value":"z"}}]}},{"kind":"Field","name":{"kind":"Name","value":"fromVoxelType"}},{"kind":"Field","name":{"kind":"Name","value":"toVoxelType"}},{"kind":"Field","name":{"kind":"Name","value":"plannedAction"}},{"kind":"Field","name":{"kind":"Name","value":"applied"}},{"kind":"Field","name":{"kind":"Name","value":"reason"}}]}}]}}]} as unknown as DocumentNode<RollbackVoxelUpdatesMutation, RollbackVoxelUpdatesMutationVariables>;
export const UpdateVoxelDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"UpdateVoxel"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"input"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"UpdateVoxelInput"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"updateVoxel"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"input"},"value":{"kind":"Variable","name":{"kind":"Name","value":"input"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"voxelUpdateId"}},{"kind":"Field","name":{"kind":"Name","value":"appId"}},{"kind":"Field","name":{"kind":"Name","value":"coordinates"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"x"}},{"kind":"Field","name":{"kind":"Name","value":"y"}},{"kind":"Field","name":{"kind":"Name","value":"z"}}]}},{"kind":"Field","name":{"kind":"Name","value":"location"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"x"}},{"kind":"Field","name":{"kind":"Name","value":"y"}},{"kind":"Field","name":{"kind":"Name","value":"z"}}]}},{"kind":"Field","name":{"kind":"Name","value":"voxelType"}},{"kind":"Field","name":{"kind":"Name","value":"state"}},{"kind":"Field","name":{"kind":"Name","value":"createdBy"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}}]}}]}}]} as unknown as DocumentNode<UpdateVoxelMutation, UpdateVoxelMutationVariables>;
export const VoxelUpdateHistoryDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"VoxelUpdateHistory"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"appId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"BigInt"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"userId"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"BigInt"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"from"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"DateTime"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"to"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"DateTime"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"limit"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"Int"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"offset"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"Int"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"voxelUpdateHistory"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"appId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"appId"}}},{"kind":"Argument","name":{"kind":"Name","value":"userId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"userId"}}},{"kind":"Argument","name":{"kind":"Name","value":"from"},"value":{"kind":"Variable","name":{"kind":"Name","value":"from"}}},{"kind":"Argument","name":{"kind":"Name","value":"to"},"value":{"kind":"Variable","name":{"kind":"Name","value":"to"}}},{"kind":"Argument","name":{"kind":"Name","value":"limit"},"value":{"kind":"Variable","name":{"kind":"Name","value":"limit"}}},{"kind":"Argument","name":{"kind":"Name","value":"offset"},"value":{"kind":"Variable","name":{"kind":"Name","value":"offset"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"appId"}},{"kind":"Field","name":{"kind":"Name","value":"coordinates"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"x"}},{"kind":"Field","name":{"kind":"Name","value":"y"}},{"kind":"Field","name":{"kind":"Name","value":"z"}}]}},{"kind":"Field","name":{"kind":"Name","value":"location"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"x"}},{"kind":"Field","name":{"kind":"Name","value":"y"}},{"kind":"Field","name":{"kind":"Name","value":"z"}}]}},{"kind":"Field","name":{"kind":"Name","value":"oldVoxelType"}},{"kind":"Field","name":{"kind":"Name","value":"newVoxelType"}},{"kind":"Field","name":{"kind":"Name","value":"changedBy"}},{"kind":"Field","name":{"kind":"Name","value":"changedAt"}}]}}]}}]} as unknown as DocumentNode<VoxelUpdateHistoryQuery, VoxelUpdateHistoryQueryVariables>;