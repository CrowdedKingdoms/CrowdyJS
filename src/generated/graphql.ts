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
  /** Arbitrary-precision signed integer (used for 64-bit ids and chunk coordinates such as appId, userId and chunk x/y/z). ALWAYS transmitted as a base-10 decimal STRING in BOTH directions — send it quoted (e.g. "1024", "-5") and read it back as a string; never use a raw JSON number, because large values overflow IEEE-754 doubles. The server rejects any value that is not a valid integer string. */
  BigInt: { input: string; output: string; }
  /** A date-time string at UTC, such as 2019-12-03T09:54:33Z, compliant with the date-time format. */
  DateTime: { input: string; output: string; }
};

export type Actor = {
  __typename?: 'Actor';
  /** App (game) this actor belongs to. BigInt serialized as a decimal string. */
  appId: Scalars['BigInt']['output'];
  /** Avatar this actor is using, or null. BigInt serialized as a decimal string. */
  avatarId: Maybe<Scalars['BigInt']['output']>;
  /** Chunk-grid coordinates (x, y, z as int64 BigInt decimal strings) locating the actor in the world. */
  chunk: ChunkCoordinates;
  /** Server timestamp (ISO-8601) when the actor row was created. Used as the primary ordering key for host election (oldest fresh actor wins). */
  createdAt: Scalars['DateTime']['output'];
  /** Owner-only private state blob, base64-encoded binary. Stripped (returned null) for non-owners and in public/batch reads such as `batchLookupActors`. */
  privateState: Maybe<Scalars['String']['output']>;
  /** Public state blob, base64-encoded binary; visible to all viewers. */
  publicState: Maybe<Scalars['String']['output']>;
  /** Liveness timestamp (ISO-8601), refreshed by the `actorHeartbeat` mutation. Host election treats actors with a recent `updatedAt` as fresh; stale rows age out of eligibility. */
  updatedAt: Scalars['DateTime']['output'];
  /** Owner user id. BigInt serialized as a decimal string. Ownership gates writes and access to `privateState`. */
  userId: Scalars['BigInt']['output'];
  /** Actor id and primary key: a 32-character ASCII identifier (exactly 32 ASCII characters / 32 raw octets on the UDP wire). This is NOT a hyphenated RFC-4122 UUID. This is the value accepted by all actor `uuid` arguments. */
  uuid: Scalars['ID']['output'];
};

/** An edge in a Actor connection. */
export type ActorEdge = {
  __typename?: 'ActorEdge';
  /** Opaque cursor for this edge. */
  cursor: Scalars['String']['output'];
  /** The node at the end of this edge. */
  node: Actor;
};

export type ActorFilterInput = {
  /** Restrict to actors in this app. BigInt sent as a decimal string. */
  appId?: InputMaybe<Scalars['BigInt']['input']>;
  /** Restrict to actors using this avatar. BigInt sent as a decimal string. */
  avatarId?: InputMaybe<Scalars['BigInt']['input']>;
  /** Restrict to actors in this chunk (x, y, z as int64 BigInt decimal strings). */
  chunk?: InputMaybe<ChunkCoordinatesInput>;
  /** Restrict to a single actor by its 32-character ASCII actor id (the UDP-wire id, not a hyphenated UUID). */
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
  /** Client-assigned correlation id for this datagram: a uint8 (0-255) that wraps at gameClientBootstrap.sequenceNumberModulo (256); defaults to 0 if omitted. For CORRELATION ONLY — it is NOT an idempotency key and the server does not dedupe replays. Echoed on the matching response and on any GenericErrorResponse for this send, both delivered on the udpNotifications subscription. */
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
  /** The sequenceNumber echoed back from the originating sendActorUpdate request (a uint8, 0-255, wrapping at modulo 256). Use it to correlate this response with that send. Correlation only — not an idempotency key. */
  sequenceNumber: Scalars['Int']['output'];
  /** The unique identifier of the actor that was updated. */
  uuid: Scalars['String']['output'];
};

/** Relay-style cursor-paginated connection over the caller’s actors (Actor). Page with `first`/`after`; cursors are opaque. */
export type ActorsConnection = {
  __typename?: 'ActorsConnection';
  /** Edges on this page. */
  edges: Array<ActorEdge>;
  /** Pagination metadata. */
  pageInfo: ConnectionPageInfo;
  /** Total matching records across all pages, when known (null for sources that do not compute a total). */
  totalCount: Maybe<Scalars['Int']['output']>;
};

/** Create a directed edge between two containers. */
export type AddEdgeInput = {
  /** The app (tenant) that owns the containers. */
  appId: Scalars['BigInt']['input'];
  /** Source container id. */
  fromContainerId: Scalars['String']['input'];
  /** JSON object of edge metadata. */
  metadataJson?: InputMaybe<Scalars['String']['input']>;
  /** The relationship type label. */
  relationshipType: Scalars['String']['input'];
  /** Target container id. */
  toContainerId: Scalars['String']['input'];
  /** Optional edge weight. */
  weight?: InputMaybe<Scalars['Float']['input']>;
};

/** A publishable application (game/experience) owned by an organization. Its discoverability is controlled by visibility and its lifecycle by status. */
export type App = {
  __typename?: 'App';
  /** Unique numeric identifier of the app (primary key). */
  appId: Scalars['BigInt']['output'];
  /** Timestamp when the app was created. */
  createdAt: Scalars['DateTime']['output'];
  /** Numeric user id of the account that created the app. */
  createdBy: Scalars['BigInt']['output'];
  /** Where the app runs: "none" (draft / not deployed), "shared" (the shared game-api), or "dedicated" (a provisioned per-tenant environment). */
  deploymentTarget: Scalars['String']['output'];
  /** Short plain-text description shown in listings; also matched by the marketplace free-text filter. */
  description: Maybe<Scalars['String']['output']>;
  /** Resolved game-api base URL for SDK/runtime calls: the per-tenant URL for dedicated apps, or the shared platform URL for shared apps. Null for legacy or not-yet-deployed apps. */
  gameApiUrl: Maybe<Scalars['String']['output']>;
  /** Opaque JSON-encoded string of marketplace media (cover image URL, screenshots, long description, etc.). Stored internally as JSONB; clients must JSON.parse on read and JSON.stringify on write. Null/"{}" when unset. */
  metadata: Maybe<Scalars['String']['output']>;
  /** Human-readable display name of the app. */
  name: Scalars['String']['output'];
  /** The organization that owns this app. Null if the owning org cannot be found. */
  org: Maybe<Organization>;
  /** Numeric id of the organization that owns this app. */
  orgId: Scalars['BigInt']['output'];
  /** When runtimeStatus is not "active", why the runtime is gated: "free_allowance", "insufficient_funds", "spend_cap", or "subscription_lapsed". Null when active. */
  runtimeDenialReason: Maybe<Scalars['String']['output']>;
  /** Shared-environment runtime gate, mirrored to the game DB and enforced by game-api + Buddy: "active", "grace", "denied", or "suspended". */
  runtimeStatus: Scalars['String']['output'];
  /** URL-safe slug, unique within the org; combined with the org slug to form the marketplace path. May be null for legacy rows. */
  slug: Maybe<Scalars['String']['output']>;
  /** True when this app's runtime data lives in a dedicated per-tenant game-api database (rather than the shared game-api). Used together with gameApiUrl to route gameplay calls. */
  splitMode: Scalars['Boolean']['output'];
  /** Base64-encoded binary blob of the app's persisted runtime/world state; opaque to clients and potentially large. Null when no state has been saved. */
  state: Maybe<Scalars['String']['output']>;
  /** Lifecycle state (DRAFT/LIVE/ARCHIVED). See AppStatus. */
  status: AppStatus;
  /** Timestamp when the app was last updated. */
  updatedAt: Scalars['DateTime']['output'];
  /** Marketplace discoverability (PUBLIC/UNLISTED/PRIVATE). See AppVisibility. */
  visibility: AppVisibility;
};

/** A free or purchasable access tier for an app, bundling a price and the set of runtime permission keys that granted users receive. */
export type AppAccessTier = {
  __typename?: 'AppAccessTier';
  /** Numeric id of the app this tier belongs to. */
  appId: Scalars['BigInt']['output'];
  /** Billing cadence for recurring tiers (e.g. "month", "year"); null for one-time or free tiers. */
  billingPeriod: Maybe<Scalars['String']['output']>;
  /** Timestamp when the tier was created. */
  createdAt: Scalars['DateTime']['output'];
  /** ISO 4217 currency code for priceCents (e.g. "usd"); defaults to "usd". */
  currency: Maybe<Scalars['String']['output']>;
  /** Optional marketing description of what the tier includes. */
  description: Maybe<Scalars['String']['output']>;
  /** True if this is the app default tier (used for open-by-default / self-service grants). At most one default per app is expected. */
  isDefault: Scalars['Boolean']['output'];
  /** True if the tier has no purchase cost. */
  isFree: Scalars['Boolean']['output'];
  /** Display name of the tier (e.g. "Free", "Pro"). */
  name: Scalars['String']['output'];
  /** Runtime permission keys granted to users on this tier (a subset of runtimePermissions), e.g. "access", "teleport", "update_voxel_data", "use_voice_chat". */
  permissionKeys: Array<Scalars['String']['output']>;
  /** Price in the smallest currency unit (cents) for paid tiers; null for free tiers. */
  priceCents: Maybe<Scalars['BigInt']['output']>;
  /** Tier lifecycle: "active" or "archived" (soft-deleted via archiveAccessTier). Defaults to "active". */
  status: Scalars['String']['output'];
  /** Unique numeric id of the tier (primary key). */
  tierId: Scalars['BigInt']['output'];
  /** Sort order for displaying tiers (ascending); lower values appear first. */
  tierOrder: Scalars['Float']['output'];
  /** Timestamp when the tier was last updated. */
  updatedAt: Scalars['DateTime']['output'];
};

export type AppAvatarState = {
  __typename?: 'AppAvatarState';
  /** App (game) id this state is scoped to. BigInt serialized as a decimal string. */
  appId: Scalars['BigInt']['output'];
  /** Avatar id this state belongs to. BigInt serialized as a decimal string. */
  avatarId: Scalars['BigInt']['output'];
  /** Row creation timestamp (ISO-8601). */
  createdAt: Scalars['DateTime']['output'];
  /** Per-app avatar state blob, base64-encoded binary; null when cleared. Owner-exclusive write, public read. */
  state: Maybe<Scalars['String']['output']>;
  /** Last-update timestamp (ISO-8601). */
  updatedAt: Scalars['DateTime']['output'];
};

export type AppBudget = {
  __typename?: 'AppBudget';
  /** Unique app-budget id (BigInt as a decimal string). */
  appBudgetId: Scalars['BigInt']['output'];
  /** App this budget applies to (BigInt as a decimal string). */
  appId: Scalars['BigInt']['output'];
  /** When the budget was first created (ISO-8601 UTC timestamp). */
  createdAt: Scalars['DateTime']['output'];
  /** Spend so far in the current monthly period, in minor currency units (cents) as a BigInt decimal string. Resets when `periodStart` rolls over to a new month. */
  currentMonthUsageCents: Scalars['BigInt']['output'];
  /** Monthly spend cap in minor currency units (cents) as a BigInt decimal string; null means no cap is configured (unlimited). */
  monthlyLimitCents: Maybe<Scalars['BigInt']['output']>;
  /** Organization that owns the app (BigInt as a decimal string). */
  orgId: Scalars['BigInt']['output'];
  /** Start of the current monthly budget period (ISO-8601 UTC timestamp), truncated to the first day of the month. */
  periodStart: Scalars['DateTime']['output'];
  /** When the budget was last updated (ISO-8601 UTC timestamp). */
  updatedAt: Scalars['DateTime']['output'];
};

/** Where an app runs: none (draft), shared (the shared game-api), or dedicated (a provisioned environment). */
export enum AppDeploymentTarget {
  /** Runs on a dedicated, org-provisioned environment. */
  Dedicated = 'DEDICATED',
  /** Draft / unpublished: the app is not deployed to any runtime. */
  None = 'NONE',
  /** Runs on the multi-tenant shared game-api (publishAppToShared). */
  Shared = 'SHARED'
}

/** An edge in a App connection. */
export type AppEdge = {
  __typename?: 'AppEdge';
  /** Opaque cursor for this edge. */
  cursor: Scalars['String']['output'];
  /** The node at the end of this edge. */
  node: App;
};

/** Org member eligible for app access grants. Scoped to the app org; requires manage_access_tiers. */
export type AppGrantMemberCandidate = {
  __typename?: 'AppGrantMemberCandidate';
  /** Email of the candidate, if known. */
  email: Maybe<Scalars['String']['output']>;
  /** Gamertag / display handle of the candidate, if set. */
  gamertag: Maybe<Scalars['String']['output']>;
  /** Numeric id of the candidate user (use with grantAppAccess). */
  userId: Scalars['BigInt']['output'];
};

/** Per-app, per-type policy controlling who may create groups of a type and the default membership policy of new groups. */
export type AppGroupPolicy = {
  __typename?: 'AppGroupPolicy';
  /** The app (tenant) the policy applies to. */
  appId: Scalars['BigInt']['output'];
  /** admin | member | anyone */
  creationPolicy: Scalars['String']['output'];
  /** open | request | invite | admin */
  defaultMembershipPolicy: Scalars['String']['output'];
  /** The group type the policy governs: 'team' | 'channel' | 'grid'. */
  groupType: Scalars['String']['output'];
  /** Optional cap on groups of this type a user may belong to (null = unlimited). */
  maxGroupsPerUser: Maybe<Scalars['Int']['output']>;
  /** Optional cap on members per group (null = unlimited). */
  maxMembers: Maybe<Scalars['Int']['output']>;
};

/** Optional filters for the public marketplace apps listing. */
export type AppMarketplaceFilterInput = {
  /** Restrict results to a single organization by its slug (storefront view). Omit to search across all orgs. */
  orgSlug?: InputMaybe<Scalars['String']['input']>;
  /** Free-text search applied to app name and description (case-insensitive substring match). Omit for no text filter. */
  query?: InputMaybe<Scalars['String']['input']>;
};

/** The shared-environment runtime gate + current billing-window usage for an app. */
export type AppRuntimeState = {
  __typename?: 'AppRuntimeState';
  /** App id (BigInt). */
  appId: Scalars['BigInt']['output'];
  /** Spend so far in the current day window, in cents. */
  currentDayUsageCents: Scalars['BigInt']['output'];
  /** Spend so far in the current hour window, in cents. */
  currentHourUsageCents: Scalars['BigInt']['output'];
  /** Per-app daily spend cap in cents (set via setAppSpendCaps). Null = no cap. */
  dailyLimitCents: Maybe<Scalars['BigInt']['output']>;
  /** Where the app runs (none / shared / dedicated). */
  deploymentTarget: AppDeploymentTarget;
  /** Per-app hourly spend cap in cents (set via setAppSpendCaps). Null = no cap. */
  hourlyLimitCents: Maybe<Scalars['BigInt']['output']>;
  /** free_allowance | insufficient_funds | spend_cap | subscription_lapsed when not active. */
  runtimeDenialReason: Maybe<Scalars['String']['output']>;
  /** Current runtime gate decision (active / grace / denied / suspended). */
  runtimeStatus: AppRuntimeStatus;
  /** Owning org wallet balance, in cents. */
  walletBalanceCents: Scalars['BigInt']['output'];
};

/** The per-app runtime gate game-api + Buddy enforce. See runtimeDenialReason when not active. */
export enum AppRuntimeStatus {
  /** Allowed to run; clients may connect. */
  Active = 'ACTIVE',
  /** Blocked from running now (e.g. insufficient funds, spend cap hit, or free allowance exhausted); recoverable once the cause clears. */
  Denied = 'DENIED',
  /** Still running on a temporary allowance (e.g. low funds) but at risk of being denied soon. */
  Grace = 'GRACE',
  /** Hard-stopped (e.g. lapsed subscription); requires action to restore. */
  Suspended = 'SUSPENDED'
}

/** An app's paid shared-environment subscription. Null (from appSharedSubscription) when the app has none / is on the free quota. */
export type AppSharedSubscription = {
  __typename?: 'AppSharedSubscription';
  /** App id (BigInt). */
  appId: Scalars['BigInt']['output'];
  /** End of the current paid period (when access lapses if not renewed). */
  currentPeriodEnd: Maybe<Scalars['DateTime']['output']>;
  /** Owning organization id (BigInt). */
  orgId: Scalars['BigInt']['output'];
  /** Subscribed plan id (BigInt). Null when not on a paid plan. */
  planId: Maybe<Scalars['BigInt']['output']>;
  /** Payment provider backing the subscription, e.g. 'stripe'. */
  provider: Maybe<Scalars['String']['output']>;
  /** Subscription status, e.g. 'active', 'past_due', or 'canceled'. */
  status: Scalars['String']['output'];
};

/** Lifecycle state of an app. Independent of AppVisibility; the public marketplace requires status=LIVE. */
export enum AppStatus {
  /** Soft-deleted via archiveApp: retained but read-only and excluded from the marketplace. Reversible by setting status back to DRAFT or LIVE. */
  Archived = 'ARCHIVED',
  /** Work-in-progress: invisible to non-members and never listed in the marketplace. Default for newly created apps. */
  Draft = 'DRAFT',
  /** Published and purchasable/playable; eligible for the public marketplace when visibility=PUBLIC. */
  Live = 'LIVE'
}

/** Aggregate byte totals for one app over the requested window. All *Bytes fields are string counters (may exceed Int range). */
export type AppUsageRollupRow = {
  __typename?: 'AppUsageRollupRow';
  /** App id (as a string). */
  appId: Scalars['String']['output'];
  /** App display name. */
  appName: Scalars['String']['output'];
  /** App slug. */
  appSlug: Scalars['String']['output'];
  /** Total GraphQL bytes received (string counter). */
  graphqlRecvBytes: Scalars['String']['output'];
  /** Total GraphQL bytes sent (string counter). */
  graphqlSendBytes: Scalars['String']['output'];
  /** Total replication bytes received (string counter). */
  replicationRecvBytes: Scalars['String']['output'];
  /** Total replication bytes sent (string counter). */
  replicationSendBytes: Scalars['String']['output'];
};

/** Aggregate byte totals plus the top GraphQL operations for one app over the window. */
export type AppUsageSummary = {
  __typename?: 'AppUsageSummary';
  /** App id (as a string). */
  appId: Scalars['String']['output'];
  /** Total GraphQL bytes received (string counter). */
  graphqlRecvBytes: Scalars['String']['output'];
  /** Total GraphQL bytes sent (string counter). */
  graphqlSendBytes: Scalars['String']['output'];
  /** Total replication bytes received (string counter). */
  replicationRecvBytes: Scalars['String']['output'];
  /** Total replication bytes sent (string counter). */
  replicationSendBytes: Scalars['String']['output'];
  /** Top GraphQL operations by bytes (capped by operationLimit). */
  topGraphqlOperations: Array<GraphqlOperationUsageRow>;
};

/** A user's entitlement to a specific app: whether (and via which tier) they may access it. At most one row per (app, user). */
export type AppUserAccess = {
  __typename?: 'AppUserAccess';
  /** Numeric id of the app this access applies to. */
  appId: Scalars['BigInt']['output'];
  /** Unique numeric id of this access record (primary key). */
  appUserAccessId: Scalars['BigInt']['output'];
  /** Timestamp when the access record was first created. */
  createdAt: Scalars['DateTime']['output'];
  /** Optional expiry timestamp; access is treated as inactive once it has passed. Null means the grant does not expire. */
  expiresAt: Maybe<Scalars['DateTime']['output']>;
  /** Who granted this access: the granting admin's numeric user id (as a string), or "system" for automatic/free-tier grants. */
  grantedBy: Scalars['String']['output'];
  /** Entitlement lifecycle: "active" (currently entitled) or "revoked" (access removed). Only active, non-expired rows grant runtime access. Defaults to "active". */
  status: Scalars['String']['output'];
  /** External billing subscription id (e.g. Stripe/PayPal) backing a paid grant; null for free or manual grants. */
  subscriptionId: Maybe<Scalars['String']['output']>;
  /** The access tier granted by this record. Null if no tier is associated (tierId is null) or the tier could not be loaded. */
  tier: Maybe<AppAccessTier>;
  /** Numeric id of the access tier granting this access; null if access was granted without a specific tier. */
  tierId: Maybe<Scalars['BigInt']['output']>;
  /** Timestamp when the access record was last updated (e.g. re-granted or revoked). */
  updatedAt: Scalars['DateTime']['output'];
  /** The user this access record belongs to. Null if the user could not be loaded. */
  user: Maybe<User>;
  /** Numeric id of the user this access belongs to. */
  userId: Scalars['BigInt']['output'];
};

/** A Relay cursor connection over AppUserAccess records. Page with first/after; pass pageInfo.endCursor back as after for the next page. */
export type AppUserAccessConnection = {
  __typename?: 'AppUserAccessConnection';
  /** Edges on this page. */
  edges: Array<AppUserAccessEdge>;
  /** Pagination metadata. */
  pageInfo: ConnectionPageInfo;
  /** Total matching records across all pages, when known (null for sources that do not compute a total). */
  totalCount: Maybe<Scalars['Int']['output']>;
};

/** An edge in a AppUserAccess connection. */
export type AppUserAccessEdge = {
  __typename?: 'AppUserAccessEdge';
  /** Opaque cursor for this edge. */
  cursor: Scalars['String']['output'];
  /** The node at the end of this edge. */
  node: AppUserAccess;
};

/** Controls where an app can be discovered. Independent of AppStatus (the marketplace additionally requires status=LIVE). */
export enum AppVisibility {
  /** Hidden from the marketplace; visible only to org members and users with an access grant. */
  Private = 'PRIVATE',
  /** Listed in the public marketplace (when status=LIVE) and resolvable by slug. */
  Public = 'PUBLIC',
  /** Hidden from marketplace listings but accessible to anyone who knows the direct org/app slug link. */
  Unlisted = 'UNLISTED'
}

/** A Relay cursor connection over App records. Page with first/after; pass pageInfo.endCursor back as after for the next page. */
export type AppsConnection = {
  __typename?: 'AppsConnection';
  /** Edges on this page. */
  edges: Array<AppEdge>;
  /** Pagination metadata. */
  pageInfo: ConnectionPageInfo;
  /** Total matching records across all pages, when known (null for sources that do not compute a total). */
  totalCount: Maybe<Scalars['Int']['output']>;
};

/** A paginated page of apps returned by the marketplace listing. */
export type AppsPage = {
  __typename?: 'AppsPage';
  /** The apps on this page, ordered newest-first. */
  items: Array<App>;
  /** Pagination metadata: totalCount (total matches ignoring limit/offset) plus the applied limit and offset. */
  pageInfo: PageInfo;
};

/** Grant runtime permission keys to a group (optionally one role) on a grid (writes the grid_group_grants input table). */
export type AssignGroupToGridInput = {
  /** The app (tenant) that owns the grid. */
  appId: Scalars['BigInt']['input'];
  /** Optional expiry; after this time the grant stops contributing to the effective ACL. Null/omitted means it never expires. */
  expiresAt?: InputMaybe<Scalars['DateTime']['input']>;
  /** The grid to grant on. */
  gridId: Scalars['BigInt']['input'];
  /** The group whose members receive the grant. Must belong to the same app. */
  groupId: Scalars['BigInt']['input'];
  /** Optional: scope the grant to members holding this group role. Omit to grant to all members of the group. */
  groupRoleId?: InputMaybe<Scalars['BigInt']['input']>;
  /** Runtime permission key strings to grant to the group/role. Each must be a known key in runtime_permissions, unique, and at most 64 chars. */
  permissionKeys: Array<Scalars['String']['input']>;
};

/** Result of a successful login or registration: a session token plus the authenticated user. */
export type AuthResponse = {
  __typename?: 'AuthResponse';
  /** Identifier of the underlying session (game_token) row, as a String. */
  gameTokenId: Scalars['String']['output'];
  /** Opaque session token. Send it on subsequent requests as the `Authorization: Bearer <token>` header. */
  token: Scalars['String']['output'];
  /** The authenticated user. */
  user: User;
};

export type Avatar = {
  __typename?: 'Avatar';
  /** Avatar id and primary key (auto-increment). Serialized as a GraphQL ID (a numeric string). */
  avatarId: Scalars['ID']['output'];
  /** Server timestamp (ISO-8601) when the avatar was created. */
  createdAt: Scalars['DateTime']['output'];
  /** Human-readable avatar name. */
  name: Scalars['String']['output'];
  /** Owner-only private state blob, base64-encoded binary. Stripped (returned null) for non-owners (e.g. via `userAvatars`/`avatar` when the caller is not the owner). */
  privateState: Maybe<Scalars['String']['output']>;
  /** Public state blob, base64-encoded binary; visible to all viewers. */
  publicState: Maybe<Scalars['String']['output']>;
  /** Owner user id. BigInt serialized as a decimal string. NOTE: the AvatarDTO returned by `myAvatars` exposes this same value typed as a GraphQL ID instead of BigInt. */
  userId: Scalars['BigInt']['output'];
};

export type AvatarDto = {
  __typename?: 'AvatarDTO';
  /** Avatar id, serialized as a GraphQL ID (a numeric string). */
  avatarId: Scalars['ID']['output'];
  /** Server timestamp (ISO-8601) when the avatar was created. */
  createdAt: Scalars['DateTime']['output'];
  /** Human-readable avatar name. */
  name: Scalars['String']['output'];
  /** Owner-only private state blob, base64-encoded binary. Returned by `myAvatars` (caller is the owner); stripped to null for non-owners on other queries. */
  privateState: Maybe<Scalars['String']['output']>;
  /** Public state blob, base64-encoded binary; visible to all viewers. */
  publicState: Maybe<Scalars['String']['output']>;
  /** Owner user id, serialized as a GraphQL ID (a numeric string). Same underlying value as Avatar.userId, which is typed as BigInt. */
  userId: Scalars['ID']['output'];
};

export type BatchActorLookupInput = {
  /** Actor ids to look up. Each is exactly 32 ASCII characters (the UDP-wire actor id), NOT a hyphenated RFC-4122 UUID. Must be non-empty; unknown ids are silently omitted from the result. */
  uuids: Array<Scalars['String']['input']>;
};

/** Live (most recent heartbeat) Buddy UDP throughput rates. */
export type BuddyLiveRates = {
  __typename?: 'BuddyLiveRates';
  /** Megabits per second received from clients. */
  clientRecvMbitPerSec: Scalars['Float']['output'];
  /** Messages per second received from clients. */
  clientRecvMsgsPerSec: Scalars['Float']['output'];
  /** Megabits per second sent to clients. */
  clientSendMbitPerSec: Scalars['Float']['output'];
  /** Messages per second sent to clients. */
  clientSendMsgsPerSec: Scalars['Float']['output'];
  /** Currently connected client count. */
  clients: Scalars['Float']['output'];
  /** Buddy/runtime server id reporting these rates. */
  serverId: Scalars['String']['output'];
  /** Timestamp of the heartbeat these rates came from. */
  updatedAt: Scalars['DateTime']['output'];
};

/** Input for publishing a message to a channel. Delivered to every active member of the channel (regardless of location), not chunk-routed. The sender must have the channel send_messages permission. */
export type ChannelMessageInput = {
  /** The channel id (groups.group_id) to publish to. */
  channelId: Scalars['BigInt']['input'];
  /** The message payload, base64-encoded. Opaque to the server; decode per your application protocol. Max 1024 bytes. */
  payload: Scalars['String']['input'];
  /** Client-assigned correlation id for this datagram: a uint8 (0-255) that wraps at gameClientBootstrap.sequenceNumberModulo (256); defaults to 0 if omitted. For CORRELATION ONLY — it is NOT an idempotency key and the server does not dedupe replays. Echoed on any GenericErrorResponse for this send, delivered on the udpNotifications subscription. */
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
  /** Charge amount in minor currency units (cents) of `currency`, as a BigInt decimal string; null when the purpose carries no amount. */
  amountCents: Maybe<Scalars['BigInt']['output']>;
  /** Target app for the purpose (BigInt as a decimal string); null when not applicable. */
  appId: Maybe<Scalars['BigInt']['output']>;
  /** Unique checkout id (BigInt as a decimal string). */
  checkoutId: Scalars['BigInt']['output'];
  /** When the checkout reached COMPLETED (ISO-8601 UTC timestamp); null until then. */
  completedAt: Maybe<Scalars['DateTime']['output']>;
  /** When the checkout was created (ISO-8601 UTC timestamp). */
  createdAt: Scalars['DateTime']['output'];
  /** ISO-4217 currency code for `amountCents`, lowercase (e.g. "usd"); null when no amount applies. */
  currency: Maybe<Scalars['String']['output']>;
  /** Failure reason when `status` is FAILED; null otherwise. */
  error: Maybe<Scalars['String']['output']>;
  /** When the provider session expires if still unpaid (ISO-8601 UTC timestamp); null if there is no expiry. */
  expiresAt: Maybe<Scalars['DateTime']['output']>;
  /** Identifier of the session/order in the provider (e.g. Stripe Checkout Session id, PayPal Order id). */
  externalId: Scalars['String']['output'];
  /** Provider-hosted URL to redirect the user to in order to complete payment. */
  externalUrl: Scalars['String']['output'];
  /** Target organization for the purpose (BigInt as a decimal string); null when not applicable. */
  orgId: Maybe<Scalars['BigInt']['output']>;
  /** Payment processor handling this checkout. */
  provider: PaymentProvider;
  /** Why the checkout was created; determines the side effect applied on completion. */
  purpose: CheckoutPurpose;
  /** Current lifecycle state, updated by webhook reconciliation (not by the redirect). */
  status: CheckoutStatus;
  /** Access tier being purchased (BigInt as a decimal string); set for APP_ACCESS_PURCHASE, otherwise null. */
  tierId: Maybe<Scalars['BigInt']['output']>;
  /** User who initiated the checkout (BigInt as a decimal string). */
  userId: Scalars['BigInt']['output'];
};

/** An edge in a Checkout connection. */
export type CheckoutEdge = {
  __typename?: 'CheckoutEdge';
  /** Opaque cursor for this edge. */
  cursor: Scalars['String']['output'];
  /** The node at the end of this edge. */
  node: Checkout;
};

export type CheckoutFilterInput = {
  /** Only return checkouts targeting this app (BigInt as a decimal string). */
  appId?: InputMaybe<Scalars['BigInt']['input']>;
  /** Only return checkouts targeting this organization (BigInt as a decimal string). */
  orgId?: InputMaybe<Scalars['BigInt']['input']>;
  /** Only return checkouts using this payment provider. */
  provider?: InputMaybe<PaymentProvider>;
  /** Only return checkouts created for this purpose. */
  purpose?: InputMaybe<CheckoutPurpose>;
  /** Only return checkouts in this lifecycle status. */
  status?: InputMaybe<CheckoutStatus>;
  /** Only return checkouts created by this user (BigInt as a decimal string). */
  userId?: InputMaybe<Scalars['BigInt']['input']>;
};

/** Why the checkout exists. Drives which side effect runs on webhook completion: ORG_WALLET_TOPUP credits an org_wallet; APP_ACCESS_PURCHASE upserts app_user_access; DONATION inserts donations; PROPERTY_TOKENS credits property_tokens; SHARED_APP_SUBSCRIPTION activates a paid shared-environment app slot. */
export enum CheckoutPurpose {
  /** Purchase a user's access to an app at a given tier. Requires appId and tierId. Upserts app_user_access on completion. */
  AppAccessPurchase = 'APP_ACCESS_PURCHASE',
  /**
   * Deprecated. Historically a one-off donation to an app. No longer purchasable and rejected at runtime by createCheckout.
   * @deprecated No longer purchasable; use ORG_WALLET_TOPUP or APP_ACCESS_PURCHASE. Retained for historical checkouts.
   */
  Donation = 'DONATION',
  /** Add funds to an organization wallet. Requires orgId and amountCents, and the caller must hold the org "manage_billing" permission. Credits the org wallet on completion. */
  OrgWalletTopup = 'ORG_WALLET_TOPUP',
  /**
   * Deprecated. Historically a purchase of in-world property tokens. No longer purchasable and rejected at runtime by createCheckout.
   * @deprecated No longer purchasable; use ORG_WALLET_TOPUP or APP_ACCESS_PURCHASE. Retained for historical checkouts.
   */
  PropertyTokens = 'PROPERTY_TOKENS',
  /** Recurring subscription for a paid app slot on the shared environment, beyond the org's free app quota. Requires appId and planId (a shared_env_plans.plan_id). Activates the paid slot on completion. */
  SharedAppSubscription = 'SHARED_APP_SUBSCRIPTION'
}

/** Lifecycle state of a Checkout. Updated by webhook reconciliation, not by the redirect URL. */
export enum CheckoutStatus {
  /** The user abandoned or canceled the checkout before completion. Terminal state. */
  Canceled = 'CANCELED',
  /** Payment succeeded and the purpose side effect was applied (e.g. wallet credited). Terminal success state. */
  Completed = 'COMPLETED',
  /** The provider session expired before payment completed (see `expiresAt`). Terminal state. */
  Expired = 'EXPIRED',
  /** Payment attempt failed or was declined; see the checkout `error` field for details. Terminal failure state. */
  Failed = 'FAILED',
  /** Created and awaiting payment. Initial state right after createCheckout; the user has not finished paying yet. */
  Pending = 'PENDING'
}

/** A Relay cursor connection over Checkout records. Page with first/after; pass pageInfo.endCursor back as after for the next page. */
export type CheckoutsConnection = {
  __typename?: 'CheckoutsConnection';
  /** Edges on this page. */
  edges: Array<CheckoutEdge>;
  /** Pagination metadata. */
  pageInfo: ConnectionPageInfo;
  /** Total matching records across all pages, when known (null for sources that do not compute a total). */
  totalCount: Maybe<Scalars['Int']['output']>;
};

/** A page of checkouts with offset/limit pagination metadata. */
export type CheckoutsPage = {
  __typename?: 'CheckoutsPage';
  /** The checkouts on this page, ordered newest first. */
  items: Array<Checkout>;
  /** Offset/limit pagination metadata (totalCount, limit, offset) for this result set. */
  pageInfo: PageInfo;
};

/** A persisted 16x16x16-voxel chunk (4096 voxels) of an app's voxel world. Holds the packed voxel-type grid (`voxels`), sparse per-voxel state overrides (`voxelStates`), an optional opaque chunk-level state blob (`chunkState`), and level-of-detail meshes (`lods`). Returned by getChunk/getChunksByDistance and written by updateChunk/updateChunkState/updateChunkLods. */
export type Chunk = {
  __typename?: 'Chunk';
  /** Id of the app that owns this chunk (decimal string). */
  appId: Scalars['ID']['output'];
  /** Timestamp the chunk's binary (d2.bin) was last synced to the CDN/S3, or null if it has never been uploaded. */
  cdnUploadedAt: Maybe<Scalars['DateTime']['output']>;
  /** Server-assigned unique chunk id (decimal string). */
  chunkId: Scalars['ID']['output'];
  /** BASE64-encoded opaque binary blob holding chunk-LEVEL state (distinct from per-voxel state). Decode from base64; null when unset. Written only via updateChunkState and preserved by updateChunk/updateChunkLods. */
  chunkState: Maybe<Scalars['String']['output']>;
  /** This chunk's address in the app's world grid. */
  coordinates: ChunkCoordinates;
  /** Timestamp when this chunk row was first created. */
  createdAt: Scalars['DateTime']['output'];
  /** Level-of-detail (LOD) entries for this chunk (coarser sampled representations), or null if none. Each entry is keyed by integer level (0 = finest) and carries a base64-encoded binary blob. */
  lods: Maybe<Array<LodData>>;
  /** User id (decimal string) of the last writer of this chunk, or null if unknown. */
  owner: Maybe<Scalars['ID']['output']>;
  /** Timestamp of the most recent write to this chunk. */
  updatedAt: Scalars['DateTime']['output'];
  /** Sparse list of per-voxel state overrides (e.g. rotation, atlas, flags) for voxels that need more than a plain type byte. Empty when no voxel carries extra state. */
  voxelStates: Array<VoxelState>;
  /** BASE64-encoded binary blob of the dense voxel-type grid. When present, the DECODED buffer is exactly 4096 bytes: one unsigned byte (voxel type 0-255) per voxel, indexed as x + y*16 + z*256 with x,y,z in 0-15. Null when the chunk has no voxel grid yet. Decode from base64 before reading. */
  voxels: Maybe<Scalars['String']['output']>;
};

/** Integer (x, y, z) address of a 16x16x16-voxel chunk within an app's world grid. Each unit step moves one whole chunk (16 voxels) along that axis. Components are signed 64-bit integers serialized as decimal strings (see the BigInt scalar). */
export type ChunkCoordinates = {
  __typename?: 'ChunkCoordinates';
  /** Chunk index along X as a decimal string; +1 = one chunk (16 voxels) further along X. */
  x: Scalars['BigInt']['output'];
  /** Chunk index along Y as a decimal string; +1 = one chunk (16 voxels) further along Y. */
  y: Scalars['BigInt']['output'];
  /** Chunk index along Z as a decimal string; +1 = one chunk (16 voxels) further along Z. */
  z: Scalars['BigInt']['output'];
};

/** Input form of a chunk address (see ChunkCoordinates). Each component is a signed 64-bit integer passed as a decimal string (see the BigInt scalar); all three are required. */
export type ChunkCoordinatesInput = {
  /** Chunk index along X as a decimal string (required). */
  x: Scalars['BigInt']['input'];
  /** Chunk index along Y as a decimal string (required). */
  y: Scalars['BigInt']['input'];
  /** Chunk index along Z as a decimal string (required). */
  z: Scalars['BigInt']['input'];
};

/** Result of getChunkLods: identifying info for a chunk plus the LOD levels that were requested. */
export type ChunkLodsResponse = {
  __typename?: 'ChunkLodsResponse';
  /** Owning app id (decimal string). */
  appId: Scalars['ID']['output'];
  /** Chunk id (decimal string). */
  chunkId: Scalars['ID']['output'];
  /** Address of the chunk. */
  coordinates: ChunkCoordinates;
  /** The requested LOD levels for the chunk. */
  lods: Array<LodData>;
  /** Timestamp when the chunk was last updated. */
  updatedAt: Scalars['DateTime']['output'];
};

/** Payload for updateChunk: upserts a chunk's dense voxel grid and/or per-voxel states and logs each provided state as an individual voxel update. Does NOT modify chunkState or LODs. */
export type ChunkUpdateInput = {
  /** Id of the app that owns the chunk (decimal string). */
  appId: Scalars['BigInt']['input'];
  /** Address of the chunk to create or update. */
  coordinates: ChunkCoordinatesInput;
  /** Optional per-voxel state overrides to write; each entry is also recorded as an individual voxel update. Omit to leave existing states unchanged. */
  voxelStates?: InputMaybe<Array<VoxelStateInput>>;
  /** Optional BASE64-encoded dense voxel grid. The DECODED buffer must be exactly 4096 bytes: one voxel-type byte (0-255) per voxel, indexed x + y*16 + z*256 (x,y,z in 0-15). Omit to leave the existing grid unchanged. */
  voxels?: InputMaybe<Scalars['String']['input']>;
};

/** Result of getVoxelList: the queried chunk address together with its recorded voxel edits. */
export type ChunkVoxelResponse = {
  __typename?: 'ChunkVoxelResponse';
  /** Address of the chunk the voxel edits belong to. */
  coordinates: ChunkCoordinates;
  /** Recorded voxel edits for the chunk, newest first. */
  voxels: Array<Voxel>;
};

/** Recorded voxel edits for a single chunk within a distance query, newest first. */
export type ChunkVoxelUpdatesResponse = {
  __typename?: 'ChunkVoxelUpdatesResponse';
  /** Address of the chunk these voxel edits belong to. */
  coordinates: ChunkCoordinates;
  /** Voxel edits for this chunk, newest first. */
  voxels: Array<Voxel>;
};

/** Paginated result of getChunksByDistance: the chunks found within the search cube plus an echo of the pagination applied. */
export type ChunksByDistanceResponse = {
  __typename?: 'ChunksByDistanceResponse';
  /** Chunks found within the search cube. */
  chunks: Array<Chunk>;
  /** Echo of the `limit` applied to this page, or null if none was supplied. */
  limit: Maybe<Scalars['Int']['output']>;
  /** Echo of the `skip` applied to this page, or null if none was supplied. */
  skip: Maybe<Scalars['Int']['output']>;
};

export type CksBuddyHealth = {
  __typename?: 'CksBuddyHealth';
  /** UDP port clients connect to on the Buddy server. */
  clientPort: Maybe<Scalars['Int']['output']>;
  /** Currently connected client count reported by Buddy. */
  clients: Maybe<Scalars['Int']['output']>;
  /** Seconds since server_status.updated_at (game DB heartbeat). */
  heartbeatAgeSec: Maybe<Scalars['Float']['output']>;
  /** Public IPv4 of the Buddy UDP runtime VM, if registered. */
  ip4: Maybe<Scalars['String']['output']>;
  /** True when heartbeat is missing or older than the staleness threshold (~30s). Game-api rejects assignment when age > ~11s. */
  isStale: Scalars['Boolean']['output'];
  /** False when no server_status row exists for this environment. */
  registered: Scalars['Boolean']['output'];
  /** Buddy-reported server state from server_status (e.g. 'ReadyForClients'). */
  status: Maybe<Scalars['String']['output']>;
  /** Operator-facing hint when multiplayer assignment may fail. */
  troubleshootingHint: Scalars['String']['output'];
  /** Timestamp of the last server_status heartbeat (game DB). */
  updatedAt: Maybe<Scalars['DateTime']['output']>;
};

/** Live progress for the active (or most recent failed) deploy/destroy change order, with per-task counts and a retry hint. */
export type CksDeployProgress = {
  __typename?: 'CksDeployProgress';
  /** Redeploy is allowed (failed deploy or stuck order cleared) */
  canRetry: Scalars['Boolean']['output'];
  changeOrderId: Scalars['String']['output'];
  /** Change order kind (deploy or destroy pipeline identifier) */
  changeOrderKind: Scalars['String']['output'];
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

/** A single step within a deploy/destroy task, with its retry attempt and any error. */
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

/** A task in a deploy/destroy pipeline, containing ordered steps. */
export type CksDeployProgressTask = {
  __typename?: 'CksDeployProgressTask';
  error: Maybe<Scalars['String']['output']>;
  id: Scalars['String']['output'];
  kind: Scalars['String']['output'];
  label: Scalars['String']['output'];
  status: Scalars['String']['output'];
  steps: Array<CksDeployProgressStep>;
};

/** A provisioned (or provisioning/destroyed) tenant environment. status tracks provisioning lifecycle; billingStatus tracks payment lifecycle — they are independent. */
export type CksEnvironment = {
  __typename?: 'CksEnvironment';
  /** When billingStatus = grace, the deadline to add funds before suspension (~24h after the failed charge). Null otherwise. */
  billingGraceDeadline: Maybe<Scalars['DateTime']['output']>;
  /** Payment lifecycle (NOT provisioning): active; grace (a charge failed — funds must be added before billingGraceDeadline); suspension_queued -> suspended (runtime stopped for non-payment); resume_queued -> active after payment (resume_failed on error). Recover with resumeEnvironment. */
  billingStatus: Scalars['String']['output'];
  caddyFlavor: Maybe<Scalars['String']['output']>;
  createdAt: Scalars['DateTime']['output'];
  databaseFlavor: Maybe<Scalars['String']['output']>;
  /** Environment release version the platform is driving toward (target/desired state). */
  desiredEnvironmentVersion: Maybe<Scalars['String']['output']>;
  displayName: Scalars['String']['output'];
  /** 'dedicated' (multi-VM) or 'dev_single' (one dev-only VM). */
  environmentClass: Scalars['String']['output'];
  gameApiFlavor: Maybe<Scalars['String']['output']>;
  gameApiMaxServers: Scalars['Int']['output'];
  gameApiMinServers: Scalars['Int']['output'];
  /** Opaque environment UUID (cks_environments.id). */
  id: Scalars['String']['output'];
  loadBalancerCount: Scalars['Int']['output'];
  /** Release version actually observed running. Lags desiredEnvironmentVersion while a deploy is in progress. */
  observedEnvironmentVersion: Maybe<Scalars['String']['output']>;
  /** Owning organization id (BigInt). */
  orgId: Scalars['BigInt']['output'];
  /** Cloud provider, e.g. 'ovh'. */
  primaryCloud: Scalars['String']['output'];
  /** Primary datacenter/region code, e.g. 'GRA11'. */
  primaryRegion: Scalars['String']['output'];
  /** Single VM flavor when environmentClass = 'dev_single'. */
  singleBoxFlavor: Maybe<Scalars['String']['output']>;
  /** URL-safe environment identifier, stable for the environment's lifetime. Auto-generated as 'e-<12 chars>' unless a custom slug was supplied at creation. */
  slug: Scalars['String']['output'];
  /** Provisioning lifecycle (NOT billing): deploy_requested -> provisioning -> active; deploy_failed on error; destroy_requested -> destroyed (destroy_failed on error). See billingStatus for payment state. */
  status: Scalars['String']['output'];
  /** Subdomain handle used to build the environment public URLs. Null until assigned. */
  subdomainHandle: Maybe<Scalars['String']['output']>;
  /** When the environment was suspended for non-payment. Null unless suspended. */
  suspendedAt: Maybe<Scalars['DateTime']['output']>;
  udpBuddyFlavor: Maybe<Scalars['String']['output']>;
  udpBuddyMaxServers: Scalars['Int']['output'];
  udpBuddyMinServers: Scalars['Int']['output'];
  updatedAt: Scalars['DateTime']['output'];
};

/** Audit-log entry recording an environment lifecycle action. */
export type CksEnvironmentAudit = {
  __typename?: 'CksEnvironmentAudit';
  action: Scalars['String']['output'];
  createdAt: Scalars['DateTime']['output'];
  environmentId: Scalars['String']['output'];
  id: Scalars['String']['output'];
  payloadJson: Maybe<Scalars['String']['output']>;
};

/** A billable cloud resource attributed to the environment, with its customer hourly price. */
export type CksEnvironmentBillingResource = {
  __typename?: 'CksEnvironmentBillingResource';
  componentKind: Scalars['String']['output'];
  currency: Scalars['String']['output'];
  /** Customer hourly price billed for this resource, in cents. */
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

/** An asynchronous change order tracking a deploy / destroy / scaling pipeline for an environment. Returned by mutations so callers can poll completion. */
export type CksEnvironmentChangeOrder = {
  __typename?: 'CksEnvironmentChangeOrder';
  claimedAt: Maybe<Scalars['DateTime']['output']>;
  claimedBy: Maybe<Scalars['String']['output']>;
  createdAt: Scalars['DateTime']['output'];
  environmentId: Scalars['String']['output'];
  error: Maybe<Scalars['String']['output']>;
  finishedAt: Maybe<Scalars['DateTime']['output']>;
  /** Change order UUID. */
  id: Scalars['String']['output'];
  /** Pipeline kind, e.g. 'deploy_environment_version', 'game_api_environment_destroy', or 'postgres_citus_destroy'. */
  kind: Scalars['String']['output'];
  /** JSON-encoded change order payload. */
  payloadJson: Scalars['String']['output'];
  /** User id (BigInt) that requested the change order. */
  requestedBy: Maybe<Scalars['BigInt']['output']>;
  /** Execution status: pending, claimed/in_progress, succeeded, failed, or cancelled. */
  status: Scalars['String']['output'];
  updatedAt: Scalars['DateTime']['output'];
};

/** One provisioned component of an environment (DNS, database VM, game-api, Buddy, load balancer, etc.) with its desired vs. observed version and spec. */
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

/** Full environment detail returned by orgEnvironment: the environment plus its components, change orders, audit, secrets, outputs, billing resources, live deploy/destroy progress, and Buddy health. */
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
  /** Destroy tear-down progress for game-api and platform change orders */
  destroyProgress: Array<CksDeployProgress>;
  environment: CksEnvironment;
  outputs: Array<CksEnvironmentOutput>;
  secrets: Array<CksEnvironmentSecretValue>;
};

/** A published output value from a provisioned component (e.g. URLs, handles, connection details). */
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

/** Pricing quote for a proposed environment selection plus the org wallet balance, used to gate createEnvironment. All *Cents fields are in minor currency units (cents). */
export type CksEnvironmentQuote = {
  __typename?: 'CksEnvironmentQuote';
  /** Wallet balance still available after existing reservations, in cents. Compared against firstDayReserveCents. */
  availableBalanceCents: Scalars['BigInt']['output'];
  caddyFlavor: Scalars['String']['output'];
  /** True when availableBalanceCents ≥ firstDayReserveCents. createEnvironment fails when false. */
  canCreate: Scalars['Boolean']['output'];
  /** ISO-4217 currency of the *Cents fields, e.g. 'USD'. */
  currency: Scalars['String']['output'];
  databaseFlavor: Scalars['String']['output'];
  datacenter: Scalars['String']['output'];
  /** Up-front wallet reserve required to create (≈ first day of runtime), in cents. */
  firstDayReserveCents: Scalars['BigInt']['output'];
  gameApiFlavor: Scalars['String']['output'];
  gameApiMaxServers: Scalars['Int']['output'];
  gameApiMinServers: Scalars['Int']['output'];
  /** Total hourly price of the full selection, in cents. */
  hourlyCostCents: Scalars['BigInt']['output'];
  loadBalancerCount: Scalars['Int']['output'];
  udpBuddyFlavor: Scalars['String']['output'];
  udpBuddyMaxServers: Scalars['Int']['output'];
  udpBuddyMinServers: Scalars['Int']['output'];
  /** Org wallet balance, in cents. */
  walletBalanceCents: Scalars['BigInt']['output'];
};

/** A sealed environment secret. Exposes ciphertext only (sealedCiphertextBase64) — never the plaintext. */
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

/** An environment release version in the deployable catalog. */
export type CksEnvironmentVersion = {
  __typename?: 'CksEnvironmentVersion';
  /** Pinned cks-game-api git tag from the ingested manifest. */
  gameApiGitTag: Maybe<Scalars['String']['output']>;
  notes: Maybe<Scalars['String']['output']>;
  releasedAt: Scalars['DateTime']['output'];
  /** Release status, e.g. 'available' (deployable) or 'yanked' (withdrawn). */
  status: Scalars['String']['output'];
  /** Semantic version, e.g. 'v0.1.4'. */
  version: Scalars['String']['output'];
};

/** An OVH datacenter offered for environment placement. Only datacenters with at least one customer-selectable flavor are returned by environmentDatacenters. */
export type CksOvhDatacenter = {
  __typename?: 'CksOvhDatacenter';
  city: Maybe<Scalars['String']['output']>;
  continent: Maybe<Scalars['String']['output']>;
  /** True when the datacenter is currently accepting new instances. */
  isAvailable: Scalars['Boolean']['output'];
  name: Maybe<Scalars['String']['output']>;
  /** Region/datacenter code used as the datacenter arg, e.g. 'GRA11'. */
  region: Scalars['String']['output'];
  /** Number of customer-selectable instances in this datacenter after availability, pricing, and admin visibility filters. */
  selectableInstanceCount: Scalars['Int']['output'];
  /** Provider availability status string, e.g. 'UP'. */
  status: Scalars['String']['output'];
  syncedAt: Scalars['DateTime']['output'];
};

/** Customer-selectable catalog instance flavor. Hidden, unavailable, or unpriced rows are omitted from environmentFlavors. */
export type CksOvhFlavor = {
  __typename?: 'CksOvhFlavor';
  /** Catalog availability for this flavor, e.g. 'available'. */
  availabilityStatus: Scalars['String']['output'];
  /** ISO-4217 currency for the price fields, e.g. 'USD'. */
  currency: Scalars['String']['output'];
  /** Customer hourly price in cents. Non-null for every flavor returned from environmentFlavors. */
  customerHourlyPriceCents: Scalars['BigInt']['output'];
  /** Customer monthly reference price in cents. Display-only until monthly billing is implemented. */
  customerMonthlyPriceCents: Maybe<Scalars['BigInt']['output']>;
  /** Local disk in gigabytes. */
  diskGb: Maybe<Scalars['Int']['output']>;
  flavorName: Scalars['String']['output'];
  flavorType: Maybe<Scalars['String']['output']>;
  /** How the customer price was derived (e.g. fixed vs. markup mode). */
  pricingMode: Scalars['String']['output'];
  /** Where the customer price came from (pricing pipeline source). */
  pricingSource: Maybe<Scalars['String']['output']>;
  /** Remaining instances of this flavor the project may launch in the datacenter (OVH quota headroom). */
  quotaAvailable: Maybe<Scalars['Int']['output']>;
  /** RAM in megabytes. */
  ramMb: Maybe<Scalars['Int']['output']>;
  /** Raw OVH provider hourly cost in cents (pre-markup). Internal reference; bill against customerHourlyPriceCents. */
  rawHourlyCostCents: Maybe<Scalars['BigInt']['output']>;
  syncedAt: Scalars['DateTime']['output'];
  /** Virtual CPU count. */
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
  /** Client-assigned correlation id for this datagram: a uint8 (0-255) that wraps at gameClientBootstrap.sequenceNumberModulo (256); defaults to 0 if omitted. For CORRELATION ONLY — it is NOT an idempotency key and the server does not dedupe replays. Echoed on any GenericErrorResponse for this send, delivered on the udpNotifications subscription. */
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
  /** Client-assigned correlation id for this datagram: a uint8 (0-255) that wraps at gameClientBootstrap.sequenceNumberModulo (256); defaults to 0 if omitted. For CORRELATION ONLY — it is NOT an idempotency key and the server does not dedupe replays. Echoed on any GenericErrorResponse for this send, delivered on the udpNotifications subscription. */
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
  /** Client-assigned correlation id for this datagram: a uint8 (0-255) that wraps at gameClientBootstrap.sequenceNumberModulo (256); defaults to 0 if omitted. For CORRELATION ONLY — it is NOT an idempotency key and the server does not dedupe replays. Echoed on any GenericErrorResponse for this send, delivered on the udpNotifications subscription. */
  sequenceNumber?: InputMaybe<Scalars['Int']['input']>;
  /** The text message content, encoded as UTF-8. This will be displayed to nearby players. */
  text: Scalars['String']['input'];
  /** A unique identifier for the text source (typically the player UUID). Must be exactly 32 bytes when encoded as UTF-8. */
  uuid: Scalars['String']['input'];
};

/** Relay-style pagination metadata for a connection. */
export type ConnectionPageInfo = {
  __typename?: 'ConnectionPageInfo';
  /** Opaque cursor of the last edge in this page; pass as `after`. */
  endCursor: Maybe<Scalars['String']['output']>;
  /** True if more edges exist after `endCursor`. */
  hasNextPage: Scalars['Boolean']['output'];
  /** True if edges exist before `startCursor`. */
  hasPreviousPage: Scalars['Boolean']['output'];
  /** Opaque cursor of the first edge in this page. */
  startCursor: Maybe<Scalars['String']['output']>;
};

/** Operator-facing view of cks_environments. */
export type CpAdminEnvironment = {
  __typename?: 'CpAdminEnvironment';
  createdAt: Scalars['DateTime']['output'];
  /** When true, purgeEnvironment is blocked. Toggle via setEnvironmentDeletionProtection. */
  deletionProtectionEnabled: Scalars['Boolean']['output'];
  deletionProtectionSetAt: Maybe<Scalars['DateTime']['output']>;
  deletionProtectionSetByEmail: Maybe<Scalars['String']['output']>;
  displayName: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  orgId: Maybe<Scalars['String']['output']>;
  primaryCloud: Scalars['String']['output'];
  primaryRegion: Scalars['String']['output'];
  slug: Scalars['String']['output'];
  /** Provisioning lifecycle: deploy_requested -> provisioning -> active; deploy_failed; destroy_requested -> destroyed (destroy_failed on error). */
  status: Scalars['String']['output'];
  subdomainHandle: Maybe<Scalars['String']['output']>;
  updatedAt: Scalars['DateTime']['output'];
};

/** One page of operator environment rows. Paging is 1-based: page 1 is the first page. */
export type CpAdminEnvironmentsPage = {
  __typename?: 'CpAdminEnvironmentsPage';
  /** Current 1-based page number. */
  page: Scalars['Int']['output'];
  /** Requested page size (max rows per page). */
  pageSize: Scalars['Int']['output'];
  /** Environment rows on this page. */
  rows: Array<CpAdminEnvironment>;
  /** Total rows across all pages (not just this page). */
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
  /** Pipeline kind (e.g. deploy_environment_version, *_destroy). */
  kind: Scalars['String']['output'];
  /** JSON-encoded payload */
  payloadJson: Maybe<Scalars['String']['output']>;
  /** Execution status: pending, claimed/in_progress, succeeded, failed, or cancelled. */
  status: Scalars['String']['output'];
  updatedAt: Scalars['DateTime']['output'];
};

export type CpChangeOrderDetail = {
  __typename?: 'CpChangeOrderDetail';
  order: CpChangeOrder;
  steps: Array<CpStepRow>;
  tasks: Array<CpTaskRow>;
};

/** One page of operator change-order rows. Paging is 1-based: page 1 is the first page. */
export type CpChangeOrdersPage = {
  __typename?: 'CpChangeOrdersPage';
  /** Current 1-based page number. */
  page: Scalars['Int']['output'];
  /** Requested page size (max rows per page). */
  pageSize: Scalars['Int']['output'];
  /** Change-order rows on this page. */
  rows: Array<CpChangeOrder>;
  /** Total rows across all pages (not just this page). */
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

/** A user with operator and/or super-admin privileges. */
export type CpOperatorUser = {
  __typename?: 'CpOperatorUser';
  createdAt: Scalars['DateTime']['output'];
  email: Maybe<Scalars['String']['output']>;
  gamertag: Maybe<Scalars['String']['output']>;
  /** True when users.is_operator is set (operator surface access). */
  isOperator: Scalars['Boolean']['output'];
  /** True when users.is_super_admin is set (implies operator access). */
  isSuperAdmin: Scalars['Boolean']['output'];
  userId: Scalars['ID']['output'];
};

export type CpOvhCatalogRow = {
  __typename?: 'CpOvhCatalogRow';
  /** Customer-facing hourly price in cents, as a string. */
  customerHourlyPriceCents: Maybe<Scalars['String']['output']>;
  /** How the customer price was derived (e.g. fixed vs. markup). */
  customerPricingMode: Scalars['String']['output'];
  diskGb: Maybe<Scalars['Int']['output']>;
  flavorName: Scalars['String']['output'];
  inboundBandwidth: Maybe<Scalars['Int']['output']>;
  outboundBandwidth: Maybe<Scalars['Int']['output']>;
  /** Raw OVH provider hourly cost in cents, as a string. Internal reference. */
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

/** Input for creating a new app access tier. */
export type CreateAccessTierInput = {
  /** Numeric id of the app the tier belongs to. The caller must hold manage_access_tiers on this app. */
  appId: Scalars['BigInt']['input'];
  /** Optional marketing description of the tier. */
  description?: InputMaybe<Scalars['String']['input']>;
  /** Optional; whether this is the app's default tier. Defaults to false. */
  isDefault?: InputMaybe<Scalars['Boolean']['input']>;
  /** Optional; whether the tier is free. Defaults to false. */
  isFree?: InputMaybe<Scalars['Boolean']['input']>;
  /** Tier display name (max 128 chars). */
  name: Scalars['String']['input'];
  /** Optional runtime permission keys to grant on this tier (must be valid runtimePermissions). Defaults to ["access"] when omitted. */
  permissionKeys?: InputMaybe<Array<Scalars['String']['input']>>;
  /** Optional sort order (ascending). Defaults to 0. */
  tierOrder?: InputMaybe<Scalars['Int']['input']>;
};

export type CreateActorInput = {
  /** App (game) the actor belongs to. Required. BigInt sent as a decimal string. */
  appId: Scalars['BigInt']['input'];
  /** Optional avatar to attach; if provided it must be owned by the caller. BigInt sent as a decimal string. */
  avatarId?: InputMaybe<Scalars['BigInt']['input']>;
  /** Initial chunk-grid coordinates (x, y, z as int64 BigInt decimal strings). Required. */
  chunk: ChunkCoordinatesInput;
  /** Optional owner-only private state blob, base64-encoded binary. */
  privateState?: InputMaybe<Scalars['String']['input']>;
  /** Optional public state blob, base64-encoded binary. */
  publicState?: InputMaybe<Scalars['String']['input']>;
  /** Actor id: exactly 32 ASCII characters (the UDP-wire actor id), NOT a hyphenated RFC-4122 UUID. Required and must be unique. */
  uuid: Scalars['String']['input'];
};

/** Input payload for creating a new app. */
export type CreateAppInput = {
  /** Optional short plain-text description for listings. */
  description?: InputMaybe<Scalars['String']['input']>;
  /** Optional JSON-encoded marketplace metadata string (see App.metadata). Defaults to an empty object when omitted. */
  metadata?: InputMaybe<Scalars['String']['input']>;
  /** Display name of the app (1-256 characters). */
  name: Scalars['String']['input'];
  /** Numeric id of the organization that will own the app. The caller must hold the manage_apps permission on this org. */
  orgId: Scalars['BigInt']['input'];
  /** URL-safe slug (1-128 chars, lowercase letters, numbers and dashes only). Must be unique within the org. */
  slug: Scalars['String']['input'];
  /** Optional initial lifecycle status. Defaults to DRAFT when omitted. */
  status?: InputMaybe<AppStatus>;
  /** Optional initial visibility. Defaults to PUBLIC when omitted. */
  visibility?: InputMaybe<AppVisibility>;
};

export type CreateAvatarInput = {
  /** Optional avatar name; defaults to "Default Avatar" when omitted. */
  name?: InputMaybe<Scalars['String']['input']>;
};

/** Create a channel in an app. */
export type CreateChannelInput = {
  /** The app (tenant) the channel belongs to. */
  appId: Scalars['BigInt']['input'];
  /** Optional free-text description of the channel. */
  description?: InputMaybe<Scalars['String']['input']>;
  /** When true (default), new members are auto-granted send_messages so they can post (open chat channel). When false, only roles you grant may post (announce/read-only channel). */
  membersCanSend?: InputMaybe<Scalars['Boolean']['input']>;
  /** open | request | invite | admin. Defaults to the app policy. */
  membershipPolicy?: InputMaybe<Scalars['String']['input']>;
  /** Display name for the channel (max 128 chars; unique per app+type). */
  name: Scalars['String']['input'];
};

export type CreateCheckoutInput = {
  /** Charge amount in minor currency units (cents) of `currency`, as a BigInt decimal string. Required for ORG_WALLET_TOPUP. */
  amountCents?: InputMaybe<Scalars['BigInt']['input']>;
  /** Target app (BigInt as a decimal string). Required for APP_ACCESS_PURCHASE and SHARED_APP_SUBSCRIPTION. */
  appId?: InputMaybe<Scalars['BigInt']['input']>;
  /** Absolute URL the provider redirects to if the user cancels. Optional; a server default is used if omitted. */
  cancelUrl?: InputMaybe<Scalars['String']['input']>;
  /** ISO-4217 currency code, lowercase (e.g. "usd"). Defaults to "usd". */
  currency?: InputMaybe<Scalars['String']['input']>;
  /** Optional idempotency key. Recommended for retries: replaying with the same key and identical input returns the first checkout instead of opening a second provider session; the same key with different input returns IDEMPOTENCY_CONFLICT. Keys expire after 24h. */
  idempotencyKey?: InputMaybe<Scalars['String']['input']>;
  /** Target organization (BigInt as a decimal string). Required for ORG_WALLET_TOPUP; ignored for other purposes. */
  orgId?: InputMaybe<Scalars['BigInt']['input']>;
  /** Shared-environment plan id (a shared_env_plans.plan_id, BigInt as a decimal string). Required for SHARED_APP_SUBSCRIPTION. */
  planId?: InputMaybe<Scalars['BigInt']['input']>;
  /** Payment processor to use for this checkout (STRIPE or PAYPAL). */
  provider: PaymentProvider;
  /** What the checkout is for; determines which other fields are required and the side effect applied on completion. DONATION and PROPERTY_TOKENS are rejected. */
  purpose: CheckoutPurpose;
  /** Absolute URL the provider redirects to after a successful payment. Optional; a server default is used if omitted. */
  successUrl?: InputMaybe<Scalars['String']['input']>;
  /** Access tier to purchase (BigInt as a decimal string). Required for APP_ACCESS_PURCHASE. */
  tierId?: InputMaybe<Scalars['BigInt']['input']>;
};

/** Instantiate a container (runtime entity). */
export type CreateContainerInput = {
  /** The app (tenant) the container belongs to. */
  appId: Scalars['BigInt']['input'];
  /** Optional description. */
  description?: InputMaybe<Scalars['String']['input']>;
  /** Human-friendly display name. */
  displayName: Scalars['String']['input'];
  /** JSON object of metadata. */
  metadataJson?: InputMaybe<Scalars['String']['input']>;
  /** Owner user id; defaults to the caller for member/owner instantiation. */
  ownerUserId?: InputMaybe<Scalars['BigInt']['input']>;
  /** Initial property values for the container. */
  properties?: InputMaybe<Array<SeedPropertyInput>>;
  /** Optional session to create the container in (omit for app-global). */
  sessionId?: InputMaybe<Scalars['String']['input']>;
  /** The container type to instantiate. */
  typeName: Scalars['String']['input'];
};

/** Input for createEnvironment. For dedicated (default) supply the four per-role flavors plus scaling counts; for dev_single supply a single flavor and the per-role/count fields are ignored. */
export type CreateEnvironmentInput = {
  /** Optional app ids to link to the new environment at creation. Each must be unique; omit or pass an empty list to link none. */
  appIds?: InputMaybe<Array<Scalars['String']['input']>>;
  /** Flavor name from environmentFlavors(datacenter) for the Caddy LB VMs in front of the game-api fleet; must have a published hourly price. Required for dedicated. */
  caddyFlavor?: InputMaybe<Scalars['String']['input']>;
  /** Flavor name from environmentFlavors(datacenter); must have a published hourly price. Required for dedicated. */
  databaseFlavor?: InputMaybe<Scalars['String']['input']>;
  /** OVH datacenter/region code from environmentDatacenters (e.g. 'GRA11'). */
  datacenter: Scalars['String']['input'];
  /** Human-readable environment name (max 80 chars). */
  displayName: Scalars['String']['input'];
  /** Deployment class: 'dedicated' (default, multi-VM) or 'dev_single' (one cheap dev-only VM running Postgres + management-api + game-api + Buddy). dev_single is not for production. */
  environmentClass?: InputMaybe<Scalars['String']['input']>;
  /** Single VM flavor for environmentClass='dev_single' (e.g. b3-8); must have a published hourly price. Ignored for dedicated. */
  flavor?: InputMaybe<Scalars['String']['input']>;
  /** Flavor name from environmentFlavors(datacenter) for per-tenant game-api VMs; must have a published hourly price. Required for dedicated. */
  gameApiFlavor?: InputMaybe<Scalars['String']['input']>;
  /** Autoscaling ceiling for game-api servers (min 1, ≥ gameApiMinServers). Required for dedicated; ignored for dev_single. */
  gameApiMaxServers?: InputMaybe<Scalars['Int']['input']>;
  /** Autoscaling floor for game-api servers (min 1). Required for dedicated; ignored for dev_single. */
  gameApiMinServers?: InputMaybe<Scalars['Int']['input']>;
  /** Number of Caddy load-balancer VMs in front of the game-api fleet (min 1). Required for dedicated; ignored for dev_single. */
  loadBalancerCount?: InputMaybe<Scalars['Int']['input']>;
  /** Organization id (BigInt) that will own and be billed for the environment. */
  orgId: Scalars['BigInt']['input'];
  /** Optional explicit slug for scripts/E2E. When omitted, the API generates an opaque e-{12} slug. */
  slug?: InputMaybe<Scalars['String']['input']>;
  /** Flavor name from environmentFlavors(datacenter); must have a published hourly price. Required for dedicated. */
  udpBuddyFlavor?: InputMaybe<Scalars['String']['input']>;
  /** Autoscaling ceiling for Buddy UDP servers (min 1, ≥ udpBuddyMinServers). Required for dedicated; ignored for dev_single. */
  udpBuddyMaxServers?: InputMaybe<Scalars['Int']['input']>;
  /** Autoscaling floor for Buddy UDP servers (min 1). Required for dedicated; ignored for dev_single. */
  udpBuddyMinServers?: InputMaybe<Scalars['Int']['input']>;
  /** Base64-encoded 32-byte X25519 public key used to seal this environment’s secrets. Must decode to exactly 32 bytes. */
  x25519PublicKeyBase64: Scalars['String']['input'];
};

/** Defines a new grid by its app and two opposite corner chunks. The corners are normalized server-side into a low/high chunk box, so corner order is irrelevant and a single chunk (corner1 == corner2) is allowed. */
export type CreateGridInput = {
  /** The app (tenant) the grid belongs to. */
  appId: Scalars['BigInt']['input'];
  /** One corner of the grid box, in chunk coordinates. */
  corner1: ChunkCoordinatesInput;
  /** The opposite corner of the grid box, in chunk coordinates. May equal corner1 for a single-chunk grid. */
  corner2: ChunkCoordinatesInput;
};

/** Result of createGrid. This is a hybrid result rather than a thrown error: inspect `error` first. When `error` is NO_ERROR the call succeeded and `grid` is populated; otherwise `grid` is null and `error` explains why. */
export type CreateGridResponse = {
  __typename?: 'CreateGridResponse';
  /** A UDP-style error code (the same ErrorType enum the realtime/UDP servers use). NO_ERROR (0) means success; non-zero values describe the failure, e.g. NO_MATCHING_GRID_ASSIGNMENT, GRID_OUTSIDE_ASSIGNMENT, GRID_OVERLAPS_EXISTING, GRID_ALREADY_EXISTS, or UNKNOWN_ERROR. */
  error: UdpErrorCode;
  /** The created grid on success; null when `error` is non-zero. */
  grid: Maybe<Grid>;
};

/** Create a custom role within a group (team or channel), granting group permission keys. */
export type CreateGroupRoleInput = {
  /** The group (team/channel) the role belongs to. */
  groupId: Scalars['BigInt']['input'];
  /** Group permission key strings this role grants (e.g. manage_members, manage_roles, manage_group, send_messages). Must be valid keys for the group type; each max 64 chars, unique. Defaults to none. */
  permissions?: InputMaybe<Array<Scalars['String']['input']>>;
  /** Sort/precedence rank (higher = more senior). Defaults to 0. */
  rank?: InputMaybe<Scalars['Int']['input']>;
  /** Role display name (max 128 chars; unique within the group). */
  roleName: Scalars['String']['input'];
};

export type CreateOrgRoleInput = {
  /** Optional human-readable description. */
  description?: InputMaybe<Scalars['String']['input']>;
  /** Organization to create the role in (BigInt as string). */
  orgId: Scalars['BigInt']['input'];
  /** Permission keys (from orgPermissions) to grant. Unknown keys are silently dropped. */
  permissions: Array<Scalars['String']['input']>;
  /** Role name (max 128 characters). */
  roleName: Scalars['String']['input'];
};

export type CreateOrgTokenInput = {
  /** Optional expiry timestamp; omit for a non-expiring token. */
  expiresAt?: InputMaybe<Scalars['DateTime']['input']>;
  /** Optional human-readable label (max 256 characters). */
  label?: InputMaybe<Scalars['String']['input']>;
  /** Organization to mint the token for (BigInt as string). */
  orgId: Scalars['BigInt']['input'];
};

export type CreateOrganizationInput = {
  /** Organization display name (1-256 characters). */
  name: Scalars['String']['input'];
  /** Unique URL slug; lowercase letters, numbers, and dashes only (1-128 characters). */
  slug: Scalars['String']['input'];
};

/** Create a runtime session. */
export type CreateSessionInput = {
  /** The app (tenant) the session belongs to. */
  appId: Scalars['BigInt']['input'];
  /** JSON object of session metadata. */
  metadataJson?: InputMaybe<Scalars['String']['input']>;
  /** Optional session name. */
  name?: InputMaybe<Scalars['String']['input']>;
  /** Initial participants besides the creator. */
  participantUserIds?: InputMaybe<Array<Scalars['BigInt']['input']>>;
};

/** Create a team in an app. */
export type CreateTeamInput = {
  /** The app (tenant) the team belongs to. */
  appId: Scalars['BigInt']['input'];
  /** Optional free-text description of the team. */
  description?: InputMaybe<Scalars['String']['input']>;
  /** open | request | invite | admin. Defaults to the app policy. */
  membershipPolicy?: InputMaybe<Scalars['String']['input']>;
  /** Display name for the team (max 128 chars; unique per app+type). */
  name: Scalars['String']['input'];
};

export type CreateUserAppStateInput = {
  /** App (game) id to scope the state to. Required. BigInt sent as a decimal string. */
  appId: Scalars['BigInt']['input'];
  /** Per-app user state as base64-encoded binary. Omit or send null to clear it. */
  state?: InputMaybe<Scalars['String']['input']>;
};

/** Define an app feature key. */
export type DefineAppFeatureInput = {
  /** The app (tenant) defining the feature. */
  appId: Scalars['BigInt']['input'];
  /** Optional description of the feature. */
  description?: InputMaybe<Scalars['String']['input']>;
  /** The feature key (referenced by tier_feature authority rules). */
  featureKey: Scalars['String']['input'];
};

export type DestroyEnvironmentInput = {
  /** Optional idempotency key. Recommended for retries: replaying with the same key and identical input returns the first result instead of re-applying; the same key with different input returns IDEMPOTENCY_CONFLICT. Keys expire after 24h. */
  idempotencyKey?: InputMaybe<Scalars['String']['input']>;
  /** Organization id (BigInt) that owns the environment. */
  orgId: Scalars['BigInt']['input'];
  /** Slug of the environment to destroy (all cloud resources are torn down). */
  slug: Scalars['String']['input'];
};

/** Input for environmentQuote. Mirrors CreateEnvironmentInput’s class/flavor shape: dedicated needs the four per-role flavors + counts; dev_single needs only the single flavor. */
export type EnvironmentQuoteInput = {
  /** Flavor name from environmentFlavors(datacenter) for the Caddy LB VMs in front of the game-api fleet; must have a published hourly price. Required for dedicated. */
  caddyFlavor?: InputMaybe<Scalars['String']['input']>;
  /** Flavor name from environmentFlavors(datacenter); must have a published hourly price. Required for dedicated. */
  databaseFlavor?: InputMaybe<Scalars['String']['input']>;
  /** OVH datacenter/region code from environmentDatacenters (e.g. 'GRA11'). */
  datacenter: Scalars['String']['input'];
  /** Deployment class: 'dedicated' (default) or 'dev_single'. */
  environmentClass?: InputMaybe<Scalars['String']['input']>;
  /** Single VM flavor for environmentClass='dev_single'. Ignored for dedicated. */
  flavor?: InputMaybe<Scalars['String']['input']>;
  /** Flavor name from environmentFlavors(datacenter) for per-tenant game-api VMs; must have a published hourly price. Required for dedicated. */
  gameApiFlavor?: InputMaybe<Scalars['String']['input']>;
  gameApiMaxServers?: InputMaybe<Scalars['Int']['input']>;
  gameApiMinServers?: InputMaybe<Scalars['Int']['input']>;
  loadBalancerCount?: InputMaybe<Scalars['Int']['input']>;
  /** Organization id (BigInt) to quote against (uses its wallet balance). */
  orgId: Scalars['BigInt']['input'];
  /** Flavor name from environmentFlavors(datacenter); must have a published hourly price. Required for dedicated. */
  udpBuddyFlavor?: InputMaybe<Scalars['String']['input']>;
  udpBuddyMaxServers?: InputMaybe<Scalars['Int']['input']>;
  udpBuddyMinServers?: InputMaybe<Scalars['Int']['input']>;
};

/** Aggregate byte totals for one environment over the requested window. All *Bytes fields are string counters (may exceed Int range). */
export type EnvironmentUsageRollupRow = {
  __typename?: 'EnvironmentUsageRollupRow';
  /** Environment display name. */
  displayName: Scalars['String']['output'];
  /** Environment UUID (as a string). */
  environmentId: Scalars['String']['output'];
  /** Environment slug. */
  environmentSlug: Scalars['String']['output'];
  /** Total GraphQL bytes received (string counter). */
  graphqlRecvBytes: Scalars['String']['output'];
  /** Total GraphQL bytes sent (string counter). */
  graphqlSendBytes: Scalars['String']['output'];
  /** Total replication bytes received (string counter). */
  replicationRecvBytes: Scalars['String']['output'];
  /** Total replication bytes sent (string counter). */
  replicationSendBytes: Scalars['String']['output'];
};

/** Per-minute replication and GraphQL usage time series for an environment, with rate peaks and live Buddy rates. */
export type EnvironmentUsageSummary = {
  __typename?: 'EnvironmentUsageSummary';
  /** Live Buddy UDP rates, or null when no live server is reporting. */
  buddyLive: Maybe<BuddyLiveRates>;
  /** Environment UUID (as a string). */
  environmentId: Scalars['String']['output'];
  /** Environment slug. */
  environmentSlug: Scalars['String']['output'];
  /** GraphQL API usage, one row per minute. */
  graphql: Array<UsageMinuteRow>;
  /** Owning organization id (as a string). */
  orgId: Scalars['String']['output'];
  /** Replication (game state sync) usage, one row per minute. */
  replication: Array<UsageMinuteRow>;
  /** Peak/average replication send rates. */
  replicationRates: UsageRatePeaks;
};

/** An org's free shared app slot quota usage. */
export type FreeAppQuota = {
  __typename?: 'FreeAppQuota';
  /** Organization id (BigInt). */
  orgId: Scalars['BigInt']['output'];
  /** Apps on a paid subscription (do not consume free slots). */
  paidApps: Scalars['Int']['output'];
  /** Total free shared app slots granted to the org. */
  quota: Scalars['Int']['output'];
  /** Free slots still available (quota − usedFree); 0 means a paid plan is required. */
  remainingFree: Scalars['Int']['output'];
  /** Free slots currently in use. */
  usedFree: Scalars['Int']['output'];
};

/** Status of the recurring free-play window during which gameplay is open without entitlement. */
export type FreePlayWindowInfo = {
  __typename?: 'FreePlayWindowInfo';
  /** Human-readable description of the free-play schedule. */
  description: Scalars['String']['output'];
  /** True if a free-play window is active right now. */
  isCurrentlyActive: Scalars['Boolean']['output'];
  /** ISO-8601 start time of the next free-play window, or null if none. */
  nextWindowStart: Maybe<Scalars['String']['output']>;
};

/** One property write a function performs. */
export type FunctionMutationInput = {
  /** Expression string (compiled to AST server-side). */
  expression: Scalars['String']['input'];
  /** The property key to write. */
  property: Scalars['String']['input'];
  /** Container target: self | ref("uuid") | ref($param). */
  target: Scalars['String']['input'];
};

/** A typed parameter declaration for a function. */
export type FunctionParamInput = {
  /** JSON-encoded default value. */
  defaultValueJson?: InputMaybe<Scalars['String']['input']>;
  /** Optional description of the parameter. */
  description?: InputMaybe<Scalars['String']['input']>;
  /** Parameter name (referenced as $name in expressions). */
  name: Scalars['String']['input'];
  /** Whether the parameter is required. Defaults to true. */
  required?: InputMaybe<Scalars['Boolean']['input']>;
  /** Display/order index. Defaults to 0. */
  sortOrder?: InputMaybe<Scalars['Int']['input']>;
  /** int | float | string | bool | array | object | container_ref */
  valueType: Scalars['String']['input'];
};

/** Startup contract for browser game clients. Fetch this after login to initialize protocol/version checks and UDP proxy state in one round trip. */
export type GameClientBootstrap = {
  __typename?: 'GameClientBootstrap';
  /** The app (game) this bootstrap was requested for, echoed back. A BigInt as a decimal string. Reuse this exact appId to scope the udpNotifications subscription and on every spatial send for this play session. */
  appId: Scalars['BigInt']['output'];
  /** Maximum allowed value for the `decayRate` (named attenuation algorithm id) field on spatial sends. Currently 5; the server clamps send `decayRate` to 0..this. decayRate selects how the message attenuates with distance (0 = none). */
  maxDecayRate: Scalars['Int']['output'];
  /** Maximum allowed value for the `distance` (chunk fan-out radius) field on spatial sends. Currently 8; the server clamps send `distance` to 0..this. distance is the number of chunks outward the message is replicated. */
  maxReplicationDistance: Scalars['Int']['output'];
  /** The authenticated user resolved from the bearer game token on the request. Use this for the local player identity instead of a separate `me` call. */
  me: User;
  /** GraphQL WebSocket subprotocol expected by udpNotifications. */
  realtimeProtocol: Scalars['String']['output'];
  /** The modulus the per-message sequenceNumber wraps at (256), i.e. sequenceNumber is a uint8 in 0-255. sequenceNumber exists ONLY to correlate asynchronous responses/errors (delivered on udpNotifications) with the send that produced them — it is NOT an idempotency key, and the server does not dedupe replays. */
  sequenceNumberModulo: Scalars['Int']['output'];
  /** GraphQL subscription field that carries UDP proxy notifications. */
  subscriptionName: Scalars['String']['output'];
  /** UDP proxy session status for this game token at bootstrap time. connected is false until you open a session (via connectUdpProxy, any send* mutation, or subscribing to udpNotifications); fetching the bootstrap does not open one. */
  udpProxyConnectionStatus: UdpProxyConnectionStatus;
  /** Current server version and the minimum client version the server accepts. Compare your build against minimumClientVersion before connecting; prompt the player to update if it is too old. */
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

/** Relay-style cursor-paginated connection over the function-invocation event log (GmEvent). Page with `first`/`after`; cursors are opaque. */
export type GameModelEventsConnection = {
  __typename?: 'GameModelEventsConnection';
  /** Edges on this page. */
  edges: Array<GmEventEdge>;
  /** Pagination metadata. */
  pageInfo: ConnectionPageInfo;
  /** Total matching records across all pages, when known (null for sources that do not compute a total). */
  totalCount: Maybe<Scalars['Int']['output']>;
};

/** Asynchronous error from the UDP game server for a previously sent datagram (e.g. a send* mutation). Delivered as a member of the udpNotifications union, NOT as a GraphQL error on the mutation (which only reports whether the datagram was accepted for sending). Match it to the originating send via sequenceNumber and read errorCode for the reason. Note: not every failure produces one — some auth failures are dropped silently (see UdpErrorCode). */
export type GenericErrorResponse = {
  __typename?: 'GenericErrorResponse';
  /** Error code indicating the reason for the failure. */
  errorCode: UdpErrorCode;
  /** Echoes the sequenceNumber of the request that failed (a uint8, 0-255, wrapping at modulo 256) so you can correlate this error with the send* mutation that produced it. Correlation only — it is not an idempotency key. */
  sequenceNumber: Scalars['Int']['output'];
};

/** Arguments for getChunk: selects a single chunk by app id and chunk coordinates, with optional LOD filtering. */
export type GetChunkInput = {
  /** Id of the app that owns the chunk (decimal string). */
  appId: Scalars['BigInt']['input'];
  /** Address of the chunk to fetch. */
  coordinates: ChunkCoordinatesInput;
  /** When true, return all available LODs and ignore `requestedLodLevels`. */
  includeAllLods?: InputMaybe<Scalars['Boolean']['input']>;
  /** Optional list of LOD levels (each >= 0) to include in the returned chunk's `lods`. Ignored when `includeAllLods` is true. Omit to apply no LOD filtering. */
  requestedLodLevels?: InputMaybe<Array<Scalars['Int']['input']>>;
};

/** Arguments for getChunkLods: selects the LOD meshes for one chunk and returns only the requested levels. */
export type GetChunkLodsInput = {
  /** Id of the app that owns the chunk (decimal string). */
  appId: Scalars['BigInt']['input'];
  /** Address of the chunk whose LODs to fetch. */
  coordinates: ChunkCoordinatesInput;
  /** LOD levels to return (each >= 0; 0 is the finest). Only matching levels are included in the response. */
  lodLevels: Array<Scalars['Int']['input']>;
};

/** Arguments for getChunksByDistance: selects chunks within a cubic (Chebyshev-distance) radius around a center chunk, with pagination. */
export type GetChunksByDistanceInput = {
  /** Id of the app whose chunks to search (decimal string). */
  appId: Scalars['BigInt']['input'];
  /** Center chunk of the search cube. */
  centerCoordinate: ChunkCoordinatesInput;
  /** Maximum number of chunks to return. Defaults to 1000 when omitted. Must be >= 0. */
  limit?: InputMaybe<Scalars['Int']['input']>;
  /** Cube 'radius' in chunks measured as Chebyshev distance: matches chunks whose x, y and z each differ from the center by at most this many chunks (a (2*maxDistance+1)^3 cube). Integer, 1-8 inclusive. */
  maxDistance: Scalars['Int']['input'];
  /** Number of chunks to skip for pagination. Defaults to 0 when omitted. Must be >= 0. */
  skip?: InputMaybe<Scalars['Int']['input']>;
};

/** Arguments for getVoxelList: selects all recorded voxel edits for one chunk by app id and chunk coordinates. */
export type GetVoxelListInput = {
  /** Id of the app that owns the chunk (decimal string). */
  appId: Scalars['BigInt']['input'];
  /** Address of the chunk whose voxel edits to list. */
  coordinates: ChunkCoordinatesInput;
};

/** An app feature key that functions can gate on and tiers can grant. */
export type GmAppFeature = {
  __typename?: 'GmAppFeature';
  /** The app (tenant) that defines the feature. */
  appId: Scalars['BigInt']['output'];
  /** Optional description of the feature. */
  description: Maybe<Scalars['String']['output']>;
  /** The feature key (referenced by tier_feature authority rules). */
  featureKey: Scalars['String']['output'];
};

/** The app's game-model runtime policy. */
export type GmAppPolicy = {
  __typename?: 'GmAppPolicy';
  /** The app (tenant) the policy applies to. */
  appId: Scalars['BigInt']['output'];
  /** Default role assigned to new session participants. */
  defaultParticipantRole: Scalars['String']['output'];
  /** Who may create sessions: admin | member | anyone. */
  sessionCreationPolicy: Scalars['String']['output'];
};

/** A container: a runtime instance of a container type (optionally scoped to a session). */
export type GmContainer = {
  __typename?: 'GmContainer';
  /** The app (tenant) that owns the container. */
  appId: Scalars['BigInt']['output'];
  /** Unique container id (UUID). */
  containerId: Scalars['String']['output'];
  /** Optional description. */
  description: Maybe<Scalars['String']['output']>;
  /** Human-friendly display name. */
  displayName: Scalars['String']['output'];
  /** JSON object of developer metadata. */
  metadataJson: Scalars['String']['output'];
  /** The owning user, or null if unowned. */
  ownerUserId: Maybe<Scalars['BigInt']['output']>;
  /** Owning session id, or null for an app-global container. */
  sessionId: Maybe<Scalars['String']['output']>;
  /** The container type name. */
  typeName: Scalars['String']['output'];
};

/** A container plus its property values filtered to what the requesting caller is allowed to see. */
export type GmContainerState = {
  __typename?: 'GmContainerState';
  /** The app (tenant) that owns the container. */
  appId: Scalars['BigInt']['output'];
  /** The container id (UUID). */
  containerId: Scalars['String']['output'];
  /** Human-friendly display name. */
  displayName: Scalars['String']['output'];
  /** The owning user, or null if unowned. */
  ownerUserId: Maybe<Scalars['BigInt']['output']>;
  /** JSON object of visible properties (filtered by the caller). */
  propertiesJson: Scalars['String']['output'];
  /** Owning session id, or null if app-global. */
  sessionId: Maybe<Scalars['String']['output']>;
  /** The container type name. */
  typeName: Scalars['String']['output'];
};

/** A studio-defined container type: the schema for a kind of runtime entity (like a class). */
export type GmContainerType = {
  __typename?: 'GmContainerType';
  /** The app (tenant) that owns the type. */
  appId: Scalars['BigInt']['output'];
  /** Default visibility for this type's properties: public | owner | hidden. */
  defaultPropertyVisibility: Scalars['String']['output'];
  /** Optional description of the type. */
  description: Maybe<Scalars['String']['output']>;
  /** Human-friendly display name. */
  displayName: Scalars['String']['output'];
  /** Who may instantiate this type: admin | member | owner. */
  instantiableBy: Scalars['String']['output'];
  /** JSON object of developer metadata. */
  metadataJson: Scalars['String']['output'];
  /** Stable type name (unique per app); used to reference the type. */
  typeName: Scalars['String']['output'];
};

/** A directed relationship edge between two containers. */
export type GmEdge = {
  __typename?: 'GmEdge';
  /** Unique edge id (UUID). */
  edgeId: Scalars['String']['output'];
  /** Source container id. */
  fromContainerId: Scalars['String']['output'];
  /** The relationship type label. */
  relationshipType: Scalars['String']['output'];
  /** Target container id. */
  toContainerId: Scalars['String']['output'];
  /** Optional edge weight. */
  weight: Maybe<Scalars['Float']['output']>;
};

/** An audit-log entry recording one function invocation and its outcome. */
export type GmEvent = {
  __typename?: 'GmEvent';
  /** The user who invoked the function. */
  callerUserId: Maybe<Scalars['BigInt']['output']>;
  /** Error message when the invocation failed. */
  errorMessage: Maybe<Scalars['String']['output']>;
  /** Unique event id. */
  eventId: Scalars['String']['output'];
  /** When the invocation executed. */
  executedAt: Scalars['DateTime']['output'];
  /** The function that was invoked. */
  functionName: Scalars['String']['output'];
  /** JSON array of applied mutations. */
  mutationsAppliedJson: Scalars['String']['output'];
  /** JSON object of params. */
  paramsJson: Scalars['String']['output'];
  /** JSON-encoded return value. */
  returnValueJson: Maybe<Scalars['String']['output']>;
  /** The self container id the function ran against. */
  selfContainerId: Maybe<Scalars['String']['output']>;
  /** The session the invocation ran in, if any. */
  sessionId: Maybe<Scalars['String']['output']>;
  /** True if the invocation succeeded. */
  success: Scalars['Boolean']['output'];
};

/** An edge in a GmEvent connection. */
export type GmEventEdge = {
  __typename?: 'GmEventEdge';
  /** Opaque cursor for this edge. */
  cursor: Scalars['String']['output'];
  /** The node at the end of this edge. */
  node: GmEvent;
};

/** A studio-defined function: a named, sandboxed behavior over containers (parameters, declared mutations, optional return, and an authority invoke policy). */
export type GmFunction = {
  __typename?: 'GmFunction';
  /** The app (tenant) that owns the function. */
  appId: Scalars['BigInt']['output'];
  /** Optional container type this function is bound to (null = global). */
  containerTypeName: Maybe<Scalars['String']['output']>;
  /** Optional description of the function. */
  description: Maybe<Scalars['String']['output']>;
  /** Unique function id (UUID). */
  functionId: Scalars['String']['output'];
  /** JSON-encoded invoke policy rule tree. */
  invokePolicyJson: Maybe<Scalars['String']['output']>;
  /** Who may invoke and in what context: player | server | internal. */
  invokeScope: Scalars['String']['output'];
  /** The property writes the function performs when invoked. */
  mutations: Array<GmFunctionMutation>;
  /** Function name (unique per app); used to invoke it. */
  name: Scalars['String']['output'];
  /** Typed parameters the function accepts. */
  parameters: Array<GmFunctionParam>;
  /** Optional expression whose value becomes the invoke result. */
  returnExpression: Maybe<Scalars['String']['output']>;
  /** Optional declared return value type. */
  returnType: Maybe<Scalars['String']['output']>;
  /** Non-fatal static-analysis warnings from the last upload. */
  warnings: Array<Scalars['String']['output']>;
};

/** One declared write a function performs: set `property` on `target` to `expression`. */
export type GmFunctionMutation = {
  __typename?: 'GmFunctionMutation';
  /** The expression (source) evaluated to produce the new value. */
  expression: Scalars['String']['output'];
  /** The property key being written. */
  property: Scalars['String']['output'];
  /** Container reference target: self | ref("uuid") | ref($param). */
  target: Scalars['String']['output'];
};

/** A typed parameter of a studio-defined function. */
export type GmFunctionParam = {
  __typename?: 'GmFunctionParam';
  /** JSON-encoded default value. */
  defaultValueJson: Maybe<Scalars['String']['output']>;
  /** Optional description of the parameter. */
  description: Maybe<Scalars['String']['output']>;
  /** Parameter name (referenced as $name in expressions). */
  name: Scalars['String']['output'];
  /** Whether the parameter is required at invoke time. */
  required: Scalars['Boolean']['output'];
  /** Display/order index of the parameter. */
  sortOrder: Scalars['Int']['output'];
  /** Value type: int | float | string | bool | array | object | container_ref. */
  valueType: Scalars['String']['output'];
};

/** The outcome of a gameModelInvoke call (return value, applied writes, and any error). */
export type GmInvokeResult = {
  __typename?: 'GmInvokeResult';
  /** Error message when success is false (e.g. authority denied or evaluation error). */
  errorMessage: Maybe<Scalars['String']['output']>;
  /** The id of the event logged for this invocation. */
  eventId: Scalars['String']['output'];
  /** The function that was invoked. */
  functionName: Scalars['String']['output'];
  /** The property writes that were applied (empty if none / on failure). */
  mutationsApplied: Array<GmMutationApplied>;
  /** JSON-encoded return value. */
  returnValueJson: Maybe<Scalars['String']['output']>;
  /** True if the invocation succeeded; false if it was rejected or errored. */
  success: Scalars['Boolean']['output'];
};

/** One property write applied during a function invocation (with before/after values). */
export type GmMutationApplied = {
  __typename?: 'GmMutationApplied';
  /** The container that was written. */
  containerId: Scalars['String']['output'];
  /** The property key written. */
  key: Scalars['String']['output'];
  /** JSON-encoded value after the write. */
  newValueJson: Maybe<Scalars['String']['output']>;
  /** JSON-encoded value before the write. */
  oldValueJson: Maybe<Scalars['String']['output']>;
  /** The value type written. */
  valueType: Scalars['String']['output'];
};

/** A typed property (field) defined on a container type. */
export type GmPropertyDef = {
  __typename?: 'GmPropertyDef';
  /** The app (tenant) that owns the type. */
  appId: Scalars['BigInt']['output'];
  /** The container type this property belongs to. */
  containerTypeName: Scalars['String']['output'];
  /** JSON-encoded default value. */
  defaultValueJson: Maybe<Scalars['String']['output']>;
  /** Optional description of the property. */
  description: Maybe<Scalars['String']['output']>;
  /** Property key (unique within the type). */
  key: Scalars['String']['output'];
  /** Value type: int | float | string | bool | array | object | container_ref. */
  valueType: Scalars['String']['output'];
  /** Read visibility: public | owner | hidden. */
  visibility: Scalars['String']['output'];
  /** Who may write the property: function | owner | admin. */
  writable: Scalars['String']['output'];
};

/** Summary of what a gameModelSeed call created. */
export type GmSeedResult = {
  __typename?: 'GmSeedResult';
  /** Number of container types created. */
  containerTypesCreated: Scalars['Int']['output'];
  /** Number of containers (instances) created. */
  containersCreated: Scalars['Int']['output'];
  /** Number of edges created. */
  edgesCreated: Scalars['Int']['output'];
  /** Number of functions created. */
  functionsCreated: Scalars['Int']['output'];
  /** JSON object mapping seed temp_id -> created container UUID. */
  idMapJson: Scalars['String']['output'];
  /** Number of property definitions created. */
  propertyDefinitionsCreated: Scalars['Int']['output'];
  /** Non-fatal warnings produced while seeding. */
  warnings: Array<Scalars['String']['output']>;
};

/** A runtime session: an isolated instance scope (e.g. a match or room) for containers. */
export type GmSession = {
  __typename?: 'GmSession';
  /** The app (tenant) that owns the session. */
  appId: Scalars['BigInt']['output'];
  /** The user who created the session. */
  createdByUserId: Maybe<Scalars['BigInt']['output']>;
  /** The user whose turn it currently is (turn-based play), or null. */
  currentTurnUserId: Maybe<Scalars['BigInt']['output']>;
  /** JSON object of developer metadata. */
  metadataJson: Scalars['String']['output'];
  /** Optional session name. */
  name: Maybe<Scalars['String']['output']>;
  /** Unique session id. */
  sessionId: Scalars['String']['output'];
  /** Lifecycle status (e.g. active). */
  status: Scalars['String']['output'];
};

/** A user's participation in a session. */
export type GmSessionParticipant = {
  __typename?: 'GmSessionParticipant';
  /** The participant role within the session. */
  role: Scalars['String']['output'];
  /** The session id. */
  sessionId: Scalars['String']['output'];
  /** The participant user id. */
  userId: Scalars['BigInt']['output'];
};

/** A grant of a feature key to an access tier. */
export type GmTierFeature = {
  __typename?: 'GmTierFeature';
  /** The app (tenant). */
  appId: Scalars['BigInt']['output'];
  /** The feature key granted to the tier. */
  featureKey: Scalars['String']['output'];
  /** The access tier the feature is granted to. */
  tierId: Scalars['BigInt']['output'];
};

/** The result of a graph traversal: the reachable container nodes and the edges between them. */
export type GmTraverseResult = {
  __typename?: 'GmTraverseResult';
  /** Edges traversed, of the requested relationship type. */
  edges: Array<GmEdge>;
  /** Containers reached within the requested depth. */
  nodes: Array<GmContainer>;
  /** The root container the traversal started from. */
  rootId: Scalars['String']['output'];
};

/** A container type's complete schema: its property definitions and available functions. */
export type GmTypeSchema = {
  __typename?: 'GmTypeSchema';
  /** The functions available on the type. */
  functions: Array<GmFunction>;
  /** The type's property definitions. */
  propertyDefinitions: Array<GmPropertyDef>;
  /** The container type name. */
  typeName: Scalars['String']['output'];
};

/** Input for granting a user access to an app, optionally on a specific tier. */
export type GrantAppAccessInput = {
  /** Numeric id of the app to grant access to. The caller must hold manage_access_tiers on this app. */
  appId: Scalars['BigInt']['input'];
  /** Optional audit override for who granted access; defaults to the calling user id. Service grants use "system". */
  grantedBy?: InputMaybe<Scalars['String']['input']>;
  /** Optional idempotency key. Recommended for retries: replaying with the same key and identical input returns the first result instead of re-applying; the same key with different input returns IDEMPOTENCY_CONFLICT. Keys expire after 24h. */
  idempotencyKey?: InputMaybe<Scalars['String']['input']>;
  /** Optional tier to grant. When omitted, an existing grant keeps its current tier (no tier change). */
  tierId?: InputMaybe<Scalars['BigInt']['input']>;
  /** Numeric id of the user who should receive access. */
  userId: Scalars['BigInt']['input'];
};

/** Grant runtime permission keys directly to one user on one grid (writes the grid_user_direct_grants input table). */
export type GrantGridPermissionsInput = {
  /** The app (tenant) that owns the grid. */
  appId: Scalars['BigInt']['input'];
  /** Optional expiry; after this time the grant stops contributing to the effective ACL. Null/omitted means it never expires. */
  expiresAt?: InputMaybe<Scalars['DateTime']['input']>;
  /** The grid to grant on. */
  gridId: Scalars['BigInt']['input'];
  /** Runtime permission key strings to grant (e.g. update_voxel_data). Each must be a known key in runtime_permissions, unique, and at most 64 chars. */
  permissionKeys: Array<Scalars['String']['input']>;
  /** The user receiving the grant. Must already have active app access for this app. */
  userId: Scalars['BigInt']['input'];
};

/** Grant or revoke a feature key for an access tier. */
export type GrantTierFeatureInput = {
  /** The app (tenant). */
  appId: Scalars['BigInt']['input'];
  /** The feature key to grant to (or revoke from) the tier. */
  featureKey: Scalars['String']['input'];
  /** The access tier id. */
  tierId: Scalars['BigInt']['input'];
};

/** A registered GraphQL API server instance in the fleet (either a management-api or a game-api, see `kind`), with reachability addresses and basic host telemetry. Returned by graphqlServers (all) and activeGraphQLServers (only ReadyForClients). Use this for service discovery; realtime/UDP play still goes through the game-api UDP proxy. */
export type GraphQlServer = {
  __typename?: 'GraphQLServer';
  /** TCP port the GraphQL/HTTP API listens on (default 4000). */
  apiPort: Scalars['Int']['output'];
  /** Current CPU utilization percentage (0-100) of the host, if reported. */
  cpuUsagePct: Maybe<Scalars['Float']['output']>;
  /** When this server was first registered in the fleet. */
  createdAt: Scalars['DateTime']['output'];
  /** Unique id of this GraphQL server registration. */
  graphqlServerId: Scalars['ID']['output'];
  /** Internal/private IPv4 address of this server. Use publicIp4 for external reachability. */
  ip4: Maybe<Scalars['String']['output']>;
  /** Internal/private IPv6 address of this server. Use publicIp6 for external reachability. */
  ip6: Maybe<Scalars['String']['output']>;
  /** Logical kind of GraphQL service: 'management-api' or 'game-api'. */
  kind: Maybe<Scalars['String']['output']>;
  /** 1-minute load average of the host, if reported. */
  loadAverage1m: Maybe<Scalars['Float']['output']>;
  /** Current memory utilization percentage (0-100) of the host, if reported. */
  memoryUsagePct: Maybe<Scalars['Float']['output']>;
  /** Cloud provider instance id of the underlying host, if known. */
  providerInstanceId: Maybe<Scalars['String']['output']>;
  /** Public IPv4 address clients use to reach this server, if assigned. */
  publicIp4: Maybe<Scalars['String']['output']>;
  /** Public IPv6 address clients use to reach this server, if assigned. */
  publicIp6: Maybe<Scalars['String']['output']>;
  /** UUID of the runtime/Buddy (cks-udp-api) instance this API server is paired with, if any. */
  runtimeServerId: Maybe<Scalars['String']['output']>;
  /** Current lifecycle state (see ServerState). activeGraphQLServers returns only ReadyForClients. */
  status: ServerState;
  /** When this server row was last updated (heartbeat). Use to judge freshness. */
  updatedAt: Scalars['DateTime']['output'];
};

/** Usage totals for a single GraphQL operation over the window. */
export type GraphqlOperationUsageRow = {
  __typename?: 'GraphqlOperationUsageRow';
  /** GraphQL operation name (or '(anonymous)'). */
  operationName: Scalars['String']['output'];
  /** Total bytes received for this operation (string counter). */
  recvBytes: Scalars['String']['output'];
  /** Total bytes sent for this operation (string counter). */
  sendBytes: Scalars['String']['output'];
  /** Total invocation count (string counter). */
  totalOps: Scalars['String']['output'];
};

/** A grid: a 3D box of chunks within an app that runtime/world (voxel) permissions are scoped to. Its bounds lie inside one of the app's grid assignments and never overlap another grid. */
export type Grid = {
  __typename?: 'Grid';
  /** The app (tenant) that owns the grid. */
  app_id: Scalars['BigInt']['output'];
  /** When the grid was created. */
  created_at: Scalars['DateTime']['output'];
  /** Unique grid id. */
  grid_id: Scalars['BigInt']['output'];
  /** High (maximum x/y/z) corner chunk of the box. */
  high_chunk: ChunkCoordinates;
  /** Low (minimum x/y/z) corner chunk of the box. */
  low_chunk: ChunkCoordinates;
};

/** A single group/role -> permission-key grant on a grid (one row of the grid_group_grants input table). */
export type GridGroupGrant = {
  __typename?: 'GridGroupGrant';
  /** The app (tenant) that owns the grid. */
  appId: Scalars['BigInt']['output'];
  /** When the grant expires; null means it never expires. */
  expiresAt: Maybe<Scalars['DateTime']['output']>;
  /** The grid this grant applies to. */
  gridId: Scalars['BigInt']['output'];
  /** The group this grant is for. */
  groupId: Scalars['BigInt']['output'];
  /** Null means the grant applies to all members of the group. */
  groupRoleId: Maybe<Scalars['BigInt']['output']>;
  /** The runtime permission key string granted to the group/role. */
  permissionKey: Scalars['String']['output'];
};

/** The permission-key whitelist configured for a grid (the grid_permission_limits input table). */
export type GridPermissionLimits = {
  __typename?: 'GridPermissionLimits';
  /** The app (tenant) that owns the grid. */
  appId: Scalars['BigInt']['output'];
  /** The grid the limits apply to. */
  gridId: Scalars['BigInt']['output'];
  /** The permission keys this grid is limited to. Empty means no limit (every active grid permission is allowed). */
  permissionKeys: Array<Scalars['String']['output']>;
};

/** A user's effective (materialized) runtime permissions on one grid: the flattened union of direct + group grants, with expired grants excluded, that Buddy enforces. */
export type GridUserPermissions = {
  __typename?: 'GridUserPermissions';
  /** The app (tenant) that owns the grid. */
  appId: Scalars['BigInt']['output'];
  /** The grid these permissions apply to. */
  gridId: Scalars['BigInt']['output'];
  /** The effective runtime permission key strings the user currently holds on this grid. */
  permissionKeys: Array<Scalars['String']['output']>;
  /** The user these permissions belong to. */
  userId: Scalars['BigInt']['output'];
};

/** A generic group. `groupType` discriminates teams ('team'), channels ('channel'), and grid-access groups ('grid'). */
export type Group = {
  __typename?: 'Group';
  /** The app (tenant) the group belongs to. */
  appId: Scalars['BigInt']['output'];
  /** When the group was created. */
  createdAt: Scalars['DateTime']['output'];
  /** Optional role auto-assigned to every new member (e.g. a channel "member" role granting send_messages). Null means new members get no role by default. */
  defaultRoleId: Maybe<Scalars['BigInt']['output']>;
  /** Optional free-text description. */
  description: Maybe<Scalars['String']['output']>;
  /** Unique group id. */
  groupId: Scalars['BigInt']['output'];
  /** Discriminator: 'team' | 'channel' | 'grid'. */
  groupType: Scalars['String']['output'];
  /** How users may join: open (join immediately) | request (pending approval) | invite | admin. */
  membershipPolicy: Scalars['String']['output'];
  /** Display name (unique per app + group type). */
  name: Scalars['String']['output'];
  /** The user who created/owns the group (holds the system 'leader' role). */
  ownerUserId: Maybe<Scalars['BigInt']['output']>;
  /** Lifecycle status, e.g. 'active'. */
  status: Scalars['String']['output'];
};

/** A user's membership in a group, including the roles assigned to them. */
export type GroupMember = {
  __typename?: 'GroupMember';
  /** When the membership row was created. */
  createdAt: Scalars['DateTime']['output'];
  /** The group this membership is in. */
  groupId: Scalars['BigInt']['output'];
  /** Unique membership id. */
  groupMemberId: Scalars['BigInt']['output'];
  /** Roles assigned to this member. */
  roles: Array<GroupRole>;
  /** Membership status: 'active' | 'pending' (awaiting approval) | 'banned'. */
  status: Scalars['String']['output'];
  /** The member user id. */
  userId: Scalars['BigInt']['output'];
};

/** The caller's view of a group they belong to: the group, their roles, and their effective group permission keys. */
export type GroupMembership = {
  __typename?: 'GroupMembership';
  /** The group the caller belongs to. */
  group: Group;
  /** When the caller joined the group. */
  joinedAt: Scalars['DateTime']['output'];
  /** The caller's effective group permission key strings (union across their roles). */
  permissions: Array<Scalars['String']['output']>;
  /** The caller's roles in this group. */
  roles: Array<GroupRole>;
};

/** A role within a group (team/channel). Carries the group-management permission keys it grants (e.g. manage_members), NOT world/runtime grid permissions. */
export type GroupRole = {
  __typename?: 'GroupRole';
  /** When the role was created. */
  createdAt: Scalars['DateTime']['output'];
  /** The group this role belongs to. */
  groupId: Scalars['BigInt']['output'];
  /** Unique role id. */
  groupRoleId: Scalars['BigInt']['output'];
  /** True for built-in roles (e.g. 'leader') that cannot be renamed, re-ranked, or deleted. */
  isSystem: Scalars['Boolean']['output'];
  /** Group permission key strings this role grants (e.g. manage_members, manage_roles, manage_group, send_messages). */
  permissions: Array<Scalars['String']['output']>;
  /** Sort/precedence rank; higher is more senior. */
  rank: Scalars['Int']['output'];
  /** Role display name (unique within the group). */
  roleName: Scalars['String']['output'];
};

export type IngestEnvironmentVersionInput = {
  /** Overwrite an existing version row if one already exists (default false). */
  force?: Scalars['Boolean']['input'];
  /** Override the release notes. Defaults to the manifest value. */
  notes?: InputMaybe<Scalars['String']['input']>;
  /** Override the manifest status (e.g. 'available'). Defaults to the manifest value. */
  status?: InputMaybe<Scalars['String']['input']>;
  /** Environment release version to ingest, e.g. 'v0.1.4'. */
  version: Scalars['String']['input'];
};

export type InviteOrgMemberInput = {
  /** Organization to add the user to (BigInt as string). */
  orgId: Scalars['BigInt']['input'];
  /** user_id of the user to add (BigInt as string). */
  userId: Scalars['BigInt']['input'];
};

/** Invoke a studio-defined function against a self container. */
export type InvokeFunctionInput = {
  /** The app (tenant) that owns the function. */
  appId: Scalars['BigInt']['input'];
  /** The function name to invoke. */
  functionName: Scalars['String']['input'];
  /** JSON object of params. */
  paramsJson?: InputMaybe<Scalars['String']['input']>;
  /** The 'self' container the function runs against (referenced as self in expressions). */
  selfContainerId: Scalars['String']['input'];
  /** Optional session context for the invocation. */
  sessionId?: InputMaybe<Scalars['String']['input']>;
};

/** Join an existing session. */
export type JoinSessionInput = {
  /** The app (tenant) that owns the session. */
  appId: Scalars['BigInt']['input'];
  /** Optional participant role to join as. */
  role?: InputMaybe<Scalars['String']['input']>;
  /** The session id to join. */
  sessionId: Scalars['String']['input'];
};

export type LinkAppToEnvironmentInput = {
  /** App id (BigInt) to link. Must be unlinked and not a shared app. */
  appId: Scalars['BigInt']['input'];
  /** Environment slug (cks_environments.slug) to link the app to. */
  environmentSlug: Scalars['String']['input'];
  /** Organization id (BigInt) that owns both the app and the environment. */
  orgId: Scalars['BigInt']['input'];
};

/** Arguments for listVoxelUpdatesByDistance: selects recorded voxel edits across chunks within a cubic (Chebyshev) radius of a center chunk, grouped per chunk and ordered by increasing distance. */
export type ListVoxelUpdatesByDistanceInput = {
  /** Id of the app whose voxel edits to search (decimal string). */
  appId: Scalars['BigInt']['input'];
  /** Center chunk of the search cube. */
  centerCoordinate: ChunkCoordinatesInput;
  /** Maximum number of CHUNKS (not voxels) to include. Defaults to 1000 when omitted. Must be >= 0. */
  limit?: InputMaybe<Scalars['Int']['input']>;
  /** Cube radius in chunks measured as Chebyshev distance: matches chunks whose x, y and z each differ from the center by at most this many chunks. Integer, 1-8 inclusive. */
  maxDistance: Scalars['Int']['input'];
  /** Optional inclusive lower time bound; only edits with createdAt >= this timestamp are returned. */
  since?: InputMaybe<Scalars['DateTime']['input']>;
  /** Number of chunks to skip for pagination. Defaults to 0 when omitted. Must be >= 0. */
  skip?: InputMaybe<Scalars['Int']['input']>;
};

/** Arguments for listVoxels: selects recorded voxel edits for one chunk, optionally only those at/after a timestamp. */
export type ListVoxelsInput = {
  /** Id of the app that owns the chunk (decimal string). */
  appId: Scalars['BigInt']['input'];
  /** Address of the chunk whose voxel edits to list. */
  coordinates: ChunkCoordinatesInput;
  /** Optional inclusive lower time bound. When set, only voxel edits with createdAt >= this timestamp are returned. */
  since?: InputMaybe<Scalars['DateTime']['input']>;
};

/** A single level-of-detail (LOD) representation of a chunk. */
export type LodData = {
  __typename?: 'LodData';
  /** BASE64-encoded binary LOD data (decode from base64). */
  data: Scalars['String']['output'];
  /** LOD level (0 is the finest; higher numbers are coarser). */
  level: Scalars['Int']['output'];
};

/** A single LOD level and its encoded data for a chunk. */
export type LodDataInput = {
  /** BASE64-encoded binary LOD data for this level. */
  data: Scalars['String']['input'];
  /** LOD level (>= 0; 0 is the finest / highest detail). */
  level: Scalars['Int']['input'];
};

export type LoginUserInput = {
  /** Account email address. */
  email: Scalars['String']['input'];
  /** Account password (min 8 characters). */
  password: Scalars['String']['input'];
};

export type Mutation = {
  __typename?: 'Mutation';
  /** Liveness heartbeat for the authenticated user's actors in an app. Refreshes actors.updated_at for every actor row the user owns so the user stays host-eligible, then returns the freshly-elected host (same shape as the gameHost query) so a client can fold its poll and heartbeat into one round-trip. Call on an interval shorter than HOST_ACTOR_FRESHNESS_SECONDS. Only refreshes rows that already exist (created by Buddy on chunk entry); returns null when no fresh actors exist for the app. */
  actorHeartbeat: Maybe<GameHost>;
  /** Add a user to a channel, or approve their pending join request (upsert to active). Requires the 'manage_members' channel permission (app admins bypass). Auto-assigns the default role if configured and notifies Buddy with the member's effective send permission. */
  addChannelMember: GroupMember;
  /** Add a user to a team, or approve their pending join request (upsert to active). Requires the 'manage_members' team permission (app admins bypass). Auto-assigns the team's default role if configured. */
  addTeamMember: GroupMember;
  /** Soft-delete an access tier by setting its status to 'archived' (the row is retained, NOT hard-deleted) and notifies the game API. Requires the 'manage_access_tiers' permission on the app that owns the tier; super admins bypass. Existing user grants on this tier are NOT automatically revoked. Throws if the tier is not found. */
  archiveAccessTier: AppAccessTier;
  /** Soft-delete an app by setting status=ARCHIVED. The row is retained (NOT hard-deleted) and is excluded from the public marketplace. REVERSIBLE: call updateApp to set status back to DRAFT or LIVE. Requires the 'manage_apps' permission on the app; super admins bypass. Throws if the app id does not exist. */
  archiveApp: App;
  /** Grant runtime permission keys to a group (optionally scoped to a single group role) on a grid by writing the `grid_group_grants` input table, then recompute the materialized effective ACL so every affected member gains the keys. Requires app-admin ('manage_apps'). Returns the grid's current group grants for the group. Use `grantGridPermissions` for per-user grants instead. */
  assignGroupToGrid: Array<GridGroupGrant>;
  /** DESTRUCTIVE. Cancels an app's paid shared-environment subscription. The app loses its paid shared slot (typically at currentPeriodEnd) and may be denied runtime once the period lapses unless a free slot covers it. Returns the updated subscription. Requires the 'manage_billing' permission on the app's org. */
  cancelSharedSubscription: AppSharedSubscription;
  /** Captures an approved PayPal order after the hosted checkout redirects back, and returns the updated Checkout. The resulting wallet credit / access grant still reconciles through PayPal webhooks. Requires an authenticated user who owns the checkout. */
  capturePaypalCheckout: Checkout;
  /** Changes the authenticated user's password after verifying the current password. Requires a valid session token. Returns true on success; throws if the current password is wrong. Existing sessions are not revoked. */
  changePassword: Scalars['Boolean']['output'];
  /** Self-service: the authenticated caller claims access to an app via its free, open-by-default tier. Requires authentication only (no org membership needed). ENTITLEMENT CHANGE: grants the free default tier as a 'system' grant and notifies the game API. Idempotent: returns the existing row if already granted, and never overrides a prior revoke. Errors if the app has no free default tier or is archived. */
  claimFreeAppAccess: AppUserAccess;
  /** Confirms a user email address using the token from the confirmation email. Returns true on success, false if the token is invalid or expired. Public (the token authorizes the call). */
  confirmEmail: Scalars['Boolean']['output'];
  /** Open the UDP proxy session for this game token (idempotent: returns the existing status if one is already open). Binds a socket and selects the game server with the fewest clients on first open. Optional: send mutations and udpNotifications also create a session lazily when none exists. To force a fresh socket, call disconnectUdpProxy first. */
  connectUdpProxy: UdpProxyConnectionStatus;
  /** Create a new access tier (a free/paid bundle of runtime permissions) for an app. Requires the 'manage_access_tiers' permission on the app (input.appId); super admins bypass. SIDE EFFECTS: validates the tier's permission keys against runtimePermissions and notifies the game API so Buddy sees the new tier. Does NOT grant the tier to any user. */
  createAccessTier: AppAccessTier;
  /** Creates an actor (a player’s presence/instance in an app world) owned by the authenticated user and returns the persisted row (including the server-set `createdAt`). Requires a valid game token. If `input.avatarId` is set it must reference an avatar the caller owns (throws Unauthorized otherwise). `input.uuid` must be the 32-character ASCII actor id used on the UDP wire (NOT a hyphenated RFC-4122 UUID). */
  createActor: Actor;
  /** Create a new app within an organization. Requires the 'manage_apps' permission on the target org (input.orgId); super admins bypass. SIDE EFFECTS: also provisions a free, open-by-default "Default" access tier granting full runtime permissions, and notifies the game API. Slug must be unique within the org (a duplicate slug fails). New apps default to visibility=PUBLIC and status=DRAFT unless overridden in the input. */
  createApp: App;
  /** Creates a new avatar owned by the authenticated user and returns it. Requires a valid game token; the new avatar is always owned by the caller. `input.name` is optional and defaults to "Default Avatar". */
  createAvatar: Avatar;
  /** Create a channel. Whether the caller may create one is governed by the per-app channel policy (app_group_policies: admin | member | anyone). The caller becomes the owner with a system 'leader' role. When membersCanSend is true (default) a default 'member' role granting send_messages is created and auto-assigned to joiners (open chat channel); when false only roles you grant may post (announce/read-only channel). */
  createChannel: Group;
  /** Create a custom (non-system) channel role granting the given channel permission keys (e.g. send_messages for posting rights). Requires the 'manage_roles' channel permission (app admins bypass). */
  createChannelRole: GroupRole;
  /** Creates a Checkout row, opens a hosted payment session with the selected provider, and returns the row with `externalUrl` set — redirect the user there to pay. Status starts PENDING and is reconciled to COMPLETED/FAILED later via provider webhooks (this call does not itself capture funds). The side effect applied on completion depends on `purpose` (e.g. ORG_WALLET_TOPUP credits the org wallet, APP_ACCESS_PURCHASE grants app access). Requires an authenticated user; ORG_WALLET_TOPUP additionally requires the 'manage_billing' org permission. Purposes DONATION and PROPERTY_TOKENS are rejected. Pass `input.idempotencyKey` to make retries safe (a replay returns the first checkout instead of opening a second provider session). */
  createCheckout: Checkout;
  /** Provisions a new environment. SIDE EFFECTS / COST: creates billable cloud infrastructure (OVH VMs + DNS) and starts hourly wallet charges; fails if the wallet's available balance is below the first-day reserve (see environmentQuote.canCreate). Each selected flavor must be available and customer-priced (use environmentFlavors / environmentDatacenters). When input.slug is omitted the slug is auto-generated as 'e-<12 chars>'. Returns immediately with status 'deploy_requested'; poll orgEnvironment for deploy progress. Requires the 'manage_environments' org permission. */
  createEnvironment: CksEnvironmentDetail;
  /** Create a grid: a named 3D box of chunks that runtime/world (voxel) permissions are scoped to. The box must fit entirely within one of the app's existing grid assignments and must not overlap another grid. Requires app-admin ('manage_apps'). Returns a hybrid response — on success `grid` is populated and `error` is NO_ERROR; on failure `grid` is null and `error` is a UDP-style error code (e.g. NO_MATCHING_GRID_ASSIGNMENT, GRID_OUTSIDE_ASSIGNMENT, GRID_OVERLAPS_EXISTING, GRID_ALREADY_EXISTS). */
  createGrid: CreateGridResponse;
  /** Creates a custom role in an organization with a name, optional description, and permission keys. Requires the 'manage_members' permission on the org (super admins bypass). */
  createOrgRole: OrgRole;
  /** Mints a new org API token and returns the plaintext token exactly once - save it, since subsequent queries only show metadata. Requires the 'manage_tokens' permission on the target org (super admins bypass). */
  createOrgToken: OrgTokenWithSecret;
  /** Creates a new organization and makes the authenticated caller its owner (with full permissions). Requires a valid session token. */
  createOrganization: Organization;
  /** Create a team. Whether the caller may create one is governed by the per-app team policy (app_group_policies: admin | member | anyone). The caller becomes the owner and is granted a system 'leader' role holding every team permission. New teams default to the app's default membership policy unless overridden. */
  createTeam: Group;
  /** Create a custom (non-system) team role granting the given team permission keys. Requires the 'manage_roles' team permission (app admins bypass). Permission keys must be valid team permission keys (group_permission_defs). */
  createTeamRole: GroupRole;
  /** DESTRUCTIVE: permanently deletes the actor identified by `uuid` and returns a copy of the now-deleted row. OWNER-EXCLUSIVE: only the owner may delete (throws Unauthorized otherwise). Requires a valid game token. `uuid` is the 32-character ASCII actor id. */
  deleteActor: Actor;
  /** DESTRUCTIVE: permanently deletes the avatar and returns a copy of the now-deleted row. OWNER-EXCLUSIVE: only the owner may delete (throws Unauthorized otherwise). Requires a valid game token. */
  deleteAvatar: Avatar;
  /** Delete a channel. Requires the 'manage_group' channel permission (app admins bypass). DESTRUCTIVE: cascades to members and roles and notifies Buddy servers to tear down message routing for the channel. Returns true on success. */
  deleteChannel: Scalars['Boolean']['output'];
  /** Delete a non-system channel role. Requires the 'manage_roles' channel permission (app admins bypass). The system 'leader' role cannot be deleted. DESTRUCTIVE: removes the role from members. Returns true if a role was deleted. */
  deleteChannelRole: Scalars['Boolean']['output'];
  /** Operator only (is_operator). Deletes a control-plane secret by environment + name and writes an audit entry. Returns true when a secret was removed. */
  deleteCpSecret: Scalars['Boolean']['output'];
  /** DESTRUCTIVE self-service: soft-deletes the authenticated caller's OWN account — anonymizes PII and revokes all sessions; wallet, voxel, and donation history stay intact via FK. Acts only on the caller (no target argument). Requires a valid game token. NOTE: the users table is management-owned, so in cks-game-api this throws ForbiddenException — call cks-management-api instead. */
  deleteMyAccount: Scalars['Boolean']['output'];
  /** Deletes an organization role. Requires the 'manage_members' permission on the role's org (super admins bypass). DESTRUCTIVE: removes the role and unassigns it from all members. Returns false if the role does not exist. */
  deleteOrgRole: Scalars['Boolean']['output'];
  /** Permanently deletes a quota enforcement rule by id. Returns true if a rule was removed, or false if no quota with that id exists. Destructive and not reversible: once removed, the metric falls back to the next-most-specific rule or the free-tier default. Requires the 'manage_quotas' permission on the same scope (app or org) the quota belongs to, or super admin for global quotas. */
  deleteQuota: Scalars['Boolean']['output'];
  /** Delete a team. Requires the 'manage_group' team permission (app admins bypass). DESTRUCTIVE: cascades to members, roles, and any grid grants the team conferred, and recomputes the effective grid ACL for affected grids. Returns true on success. */
  deleteTeam: Scalars['Boolean']['output'];
  /** Delete a non-system team role. Requires the 'manage_roles' team permission (app admins bypass). The system 'leader' role cannot be deleted. DESTRUCTIVE: removes the role from members and recomputes any grid ACLs the role granted on. Returns true if a role was deleted. */
  deleteTeamRole: Scalars['Boolean']['output'];
  /** DESTRUCTIVE: deletes the authenticated user’s per-app state row for `appId` and returns the deleted row. Requires a valid game token; acts only on the caller’s own state. Throws NotFound when no row exists. */
  deleteUserAppState: UserAppState;
  /** DESTRUCTIVE and IRREVERSIBLE. Tears down all cloud resources for the environment (per-tenant Postgres, game-api, Buddy, and load-balancer VMs plus DNS records) and revokes its service tokens; all tenant data is lost. Sets status to 'destroy_requested' and returns the tracking change order — poll orgEnvironment.destroyProgress. Fails if a destroy is already queued. After it reaches 'destroyed', call purgeEnvironment to remove the record. Requires the 'manage_environments' org permission. */
  destroyEnvironment: CksEnvironmentChangeOrder;
  /** Close the UDP proxy session and socket for this game token. Unsubscribing from udpNotifications does not disconnect; use this mutation (or rely on server inactivity timeout). */
  disconnectUdpProxy: Scalars['Boolean']['output'];
  /** ADMIN/DESTRUCTIVE: revokes ALL of the target user’s sessions by deleting every game_token row, forcing re-authentication on every device. Returns true if at least one session was revoked. Requires a super-admin bearer game token (and the management API enabled). NOTE: management-owned in cks-game-api (throws ForbiddenException) — use cks-management-api. */
  forceLogoutUser: Scalars['Boolean']['output'];
  /** Create a directed relationship edge between two containers (the game model is a graph), with a relationship type and optional weight. Requires a valid token. */
  gameModelAddEdge: GmEdge;
  /** Instantiate a container (a runtime entity of a given type), optionally within a session, with an owner and initial properties. Subject to the type's instantiableBy rule (admin | member | owner). Requires a valid token. */
  gameModelCreateContainer: GmContainer;
  /** Create a runtime session: an isolated instance scope for containers (e.g. a match, room, or save). Subject to the app's session creation policy. The caller becomes the creator and a participant. Requires a valid token. */
  gameModelCreateSession: GmSession;
  /** Define an app feature key that functions can gate on (via a tier_feature authority rule) and that access tiers can be granted. Idempotent on (app, featureKey). Requires app-admin ('manage_apps'). */
  gameModelDefineFeature: GmAppFeature;
  /** Delete a studio-defined function by name. Requires app-admin ('manage_apps'). DESTRUCTIVE. Returns true if a function was deleted. */
  gameModelDeleteFunction: Scalars['Boolean']['output'];
  /** Grant a feature key to an access tier, so users on that tier satisfy tier_feature authority checks for it. Requires app-admin ('manage_apps'). */
  gameModelGrantTierFeature: GmTierFeature;
  /** Invoke a studio-defined function against a 'self' container with JSON params. The server enforces the function's invoke policy (authority rule tree: owner_of_self / is_host / is_current_turn / is_participant / tier_feature / group_permission / grid_permission / condition), evaluates its expressions, atomically applies its declared property mutations, logs an event, and returns the result (return value + mutations applied, or success=false with an error message). This is the primary, safe way for players to mutate game state. Requires a valid token; only player-scope functions are invocable here. */
  gameModelInvoke: GmInvokeResult;
  /** Join an existing session as a participant, optionally with a role. Requires a valid token and app access. */
  gameModelJoinSession: GmSessionParticipant;
  /** Revoke a feature key from an access tier. Requires app-admin ('manage_apps'). Returns true if a grant was removed. */
  gameModelRevokeTierFeature: Scalars['Boolean']['output'];
  /** Bulk-create game-model definitions (container types, property defs, functions) and optionally instances (containers + edges) in one transaction — used to initialize or import a model. Requires app-admin ('manage_apps'). Returns counts created, warnings, and a map of seed temp_id -> created container UUID. */
  gameModelSeed: GmSeedResult;
  /** Set the app's game-model runtime policy: who may create sessions (admin | member | anyone) and the default participant role. Requires app-admin ('manage_apps'). */
  gameModelSetPolicy: GmAppPolicy;
  /** Set a single property value on a container directly (outside a function). Allowed only when the property's writability (function | owner | admin) permits the caller. The value is JSON-encoded and coerced to the property's value type. Requires a valid token. For game-logic changes prefer gameModelInvoke. */
  gameModelSetProperty: GmContainer;
  /** Set or clear the session's current-turn user, for turn-based play (authority enforced by the service). Pass userId null to clear the turn. Requires a valid token. */
  gameModelSetSessionTurn: GmSession;
  /** Create or update a container type: the studio-defined schema for a kind of runtime entity (like a class). Idempotent on (app, typeName). Requires app-admin ('manage_apps'). */
  gameModelUpsertContainerType: GmContainerType;
  /** Create or update a studio-defined function: a named, sandboxed behavior with typed parameters, declared property mutations (expressions compiled to an AST server-side, never eval'd), an optional return expression, an invoke scope, and an invoke policy (authority rule tree). Idempotent on (app, name). Requires app-admin ('manage_apps'). Returns the function plus any non-fatal static-analysis warnings. */
  gameModelUpsertFunction: GmFunction;
  /** Create or update a property definition on a container type (a typed field with default value, visibility, and writability). Idempotent on (app, containerTypeName, key). Requires app-admin ('manage_apps'). */
  gameModelUpsertPropertyDef: GmPropertyDef;
  /** Grant (or re-activate) a user's access to an app, optionally on a specific tier. Requires the 'manage_access_tiers' permission on the app (input.appId); super admins bypass. ENTITLEMENT CHANGE: upserts an active app_user_access row and notifies the game API, so the target user immediately gains that tier's runtime permissions in Buddy. Idempotent per (app,user): re-granting updates the tier and sets status back to active. */
  grantAppAccess: AppUserAccess;
  /** Grant one or more runtime permission keys directly to a single user on a grid (writes the `grid_user_direct_grants` input table), then recompute that user's materialized effective ACL on the grid. The target user must already have active app access (otherwise this fails). Requires app-admin ('manage_apps'). Returns the user's full effective permission-key set on the grid. To grant by group/role instead of per-user, use `assignGroupToGrid`. */
  grantGridPermissions: GridUserPermissions;
  /** Org dashboard shortcut: the authenticated caller grants themselves access to an app using its default active tier. Requires that the caller is an active member of the app's owning org OR holds the 'manage_access_tiers' permission on the app. ENTITLEMENT CHANGE: upserts an active grant and notifies the game API. Errors if the app has no active tier, or the caller is neither a member nor a manager. */
  grantMyAppAccess: AppUserAccess;
  /** Operator only (is_operator). Ingests a release manifest into cks_environment_versions, making the version deployable, and writes an audit entry. Use force to overwrite an existing row. */
  ingestEnvironmentVersion: CpEnvironmentVersionRow;
  /** Adds a user to an organization as a member. Requires the 'manage_members' permission on the target org (super admins bypass). */
  inviteOrgMember: OrgMember;
  /** Join a channel as the caller (subscribe to it). Honors the channel membership policy: open -> active immediately, request -> pending (a manager must approve), invite/admin -> rejected. On becoming active, Buddy is notified with the caller's effective send permission so routing starts. */
  joinChannel: GroupMember;
  /** Join a team as the caller. Honors the team membership policy: open -> active immediately, request -> pending (a manager must approve), invite/admin -> rejected. Banned users are rejected. No special permission required. */
  joinTeam: GroupMember;
  /** Leave a channel (unsubscribe the caller). Notifies Buddy to stop routing messages to the caller. Returns true if a membership was removed. */
  leaveChannel: Scalars['Boolean']['output'];
  /** Leave a team (removes the caller's own membership). Returns true if a membership was removed. */
  leaveTeam: Scalars['Boolean']['output'];
  /** Links an unlinked app to an existing environment for split-mode routing. Refuses shared apps and apps already linked elsewhere. Requires the 'manage_environments' org permission. */
  linkAppToEnvironment: App;
  /** Authenticates with email + password and starts a new session. Returns an AuthResponse whose `token` must be sent on subsequent requests as `Authorization: Bearer <token>`. Public (no auth required); throws on invalid credentials. */
  login: AuthResponse;
  /** Single-device logout: revokes the game token that authenticated this request by deleting its game_tokens row. Returns true if a token was revoked, false if the request had no game token. Other devices/tokens are unaffected (use the Management API to revoke all devices). After this, the bearer token is rejected and any open UDP proxy session will no longer authorize new traffic. */
  logout: Scalars['Boolean']['output'];
  /** Ends every active session for the authenticated user (deletes all their game_tokens and records revocations). Requires a valid session token. Use logout to end only the current session. */
  logoutAllDevices: Scalars['Boolean']['output'];
  /** Publishes an app to the shared game-api environment. Free under the org's quota (result.free = true, no charge); otherwise pass a planId to start a paid subscription — SIDE EFFECT: returns a checkout the caller must complete, which creates a recurring subscription and charges the org. Requires the 'manage_apps' permission on the app's org; currently limited to super admins (preview). */
  publishAppToShared: PublishAppResult;
  /** Operator only (is_operator). Cuts a new environment release from a cks-game-api git tag: ingests it as available and commits the manifest to the git ref. SIDE EFFECT: makes the version the new redeploy target and writes to GitHub. Use force to overwrite. Writes an audit entry. */
  publishEnvironmentReleaseFromGameApiTag: CpPublishEnvironmentReleaseResult;
  /** DESTRUCTIVE. Permanently deletes a destroyed environment's record and all cascaded metadata from the platform; returns true on success. The environment must already be in status 'destroyed' (run destroyEnvironment first) and must not have deletion protection enabled, otherwise this fails. Does not touch cloud resources. Requires the 'manage_environments' org permission. */
  purgeEnvironment: Scalars['Boolean']['output'];
  /** Operator only (is_operator). Creates or overwrites an environment-delivered secret (injected into the tenant runtime) and writes an audit entry. SENSITIVE: plaintext is write-only and never returned. */
  putCpEnvSecret: CpEnvSecretRow;
  /** Operator only (is_operator). Creates or overwrites a control-plane secret (encrypted at rest) and writes an audit entry. SENSITIVE: plaintext is write-only and never returned by cpSecrets. */
  putCpSecret: CpSecretRow;
  /** Redeploys the environment to a target release version (input.version) or, when omitted, the latest available version for its class, reusing its current flavors/scaling and linked apps. Preserves the environment URLs. No-op-safe: re-running when already at latest still redeploys. If a prior deploy failed but stayed in_progress, it is abandoned first so the redeploy can proceed. Requires the 'manage_environments' org permission. */
  redeployEnvironment: CksEnvironmentChangeOrder;
  /** Creates a new (initially unconfirmed) account, sends a confirmation email, and returns an AuthResponse with a session `token` for immediate login (send as `Authorization: Bearer <token>`). Public; throws if the email already exists. */
  register: AuthResponse;
  /** Remove a member from a channel. Requires the 'manage_members' channel permission, except that any member may remove themselves. Notifies Buddy to stop routing to the removed member. Returns true if a membership was removed. */
  removeChannelMember: Scalars['Boolean']['output'];
  /** Removes a user from an organization. Requires the 'manage_members' permission on the org (super admins bypass). DESTRUCTIVE: revokes the user's membership and role assignments in that org. Returns false if the user was not a member. */
  removeOrgMember: Scalars['Boolean']['output'];
  /** Removes a saved (vaulted) off-session payment method from the org; returns true on success. If it was the method backing auto-billing, recharges will fail until another is set up. Requires the 'manage_billing' org permission. */
  removeSharedPaymentMethod: Scalars['Boolean']['output'];
  /** Remove a member from a team. Requires the 'manage_members' team permission, except that any member may remove themselves. DESTRUCTIVE: drops the membership and its roles. Returns true if a membership was removed. */
  removeTeamMember: Scalars['Boolean']['output'];
  /** Starts the password-reset flow by emailing a reset link to the address. Always returns true regardless of whether the email exists or is confirmed (prevents account enumeration). Public. */
  requestPasswordReset: Scalars['Boolean']['output'];
  /** Request to join a request-only channel (creates a pending membership a manager can approve via addChannelMember). Behaves identically to joinChannel; named for request-policy UIs. */
  requestToJoinChannel: GroupMember;
  /** Request to join a request-only team (creates a pending membership a manager can approve via addTeamMember). Behaves identically to joinTeam; named for request-policy UIs. */
  requestToJoinTeam: GroupMember;
  /** Re-sends the email-confirmation link. Always returns true regardless of whether the account exists or is already confirmed (prevents enumeration); the email is only sent for existing unconfirmed accounts. Public. */
  resendConfirmationEmail: Scalars['Boolean']['output'];
  /** Completes a password reset using the reset token and a new password. Returns true on success; throws if the token is invalid or expired. Public (the token authorizes the call). Existing sessions are not revoked. */
  resetPassword: Scalars['Boolean']['output'];
  /** SSH-restarts the Buddy systemd service on the active UDP runtime VM. Symptom relief when server_status heartbeat is stale (see CksBuddyHealth.isStale); does not replace cks-udp-api pool fixes. Requires the 'manage_environments' org permission. */
  restartEnvironmentServices: CksEnvironmentChangeOrder;
  /** Resumes a payment-suspended environment, queuing a change order and moving billingStatus to 'resume_queued' (and restarting runtime once it settles). Only valid when billingStatus is grace, suspension_queued, suspended, or resume_failed; otherwise fails. Resumes billable hourly charges. Requires the 'manage_environments' org permission. */
  resumeEnvironment: CksEnvironmentChangeOrder;
  /** Revoke a user's access to an app by setting their app_user_access status to 'revoked', and notifies the game API so the user immediately loses runtime access in Buddy. Requires the 'manage_access_tiers' permission on the app; super admins bypass. The row is retained for audit (not deleted); REVERSIBLE via grantAppAccess. */
  revokeAppAccess: AppUserAccess;
  /** Revoke a user's direct grants on a grid (deletes from the `grid_user_direct_grants` input table) and recompute their materialized effective ACL. Omit `permissionKeys` to remove ALL of the user's direct grants on the grid; pass a subset to remove only those keys. Does not affect permissions the user receives via group grants. Requires app-admin ('manage_apps'). DESTRUCTIVE for the targeted grants. Returns the user's remaining effective permission keys on the grid. */
  revokeGridPermissions: GridUserPermissions;
  /** Revoke group/role grants on a grid (deletes from the `grid_group_grants` input table) and recompute the materialized effective ACL. Omit `permissionKeys` to revoke ALL of the group/role's grants on the grid; pass a subset to revoke only those keys. Requires app-admin ('manage_apps'). DESTRUCTIVE: removes the granted permissions from every affected member. Returns the group's remaining grants on the grid. */
  revokeGroupFromGrid: Array<GridGroupGrant>;
  /** Permanently deactivates an org token so it can no longer authenticate. Requires the 'manage_tokens' permission on the token's org (super admins bypass). DESTRUCTIVE and irreversible; the secret cannot be reactivated. Returns false if the token does not exist. */
  revokeOrgToken: Scalars['Boolean']['output'];
  /** Reverts every voxel edit made by `userId` in `appId` between `from` and `to`, returning one RollbackVoxelEventResult per affected voxel (`applied` tells you whether each was actually changed). DEFAULTS to dryRun=true, which only PREVIEWS the planned reversions without writing; pass dryRun=false to actually apply them (DESTRUCTIVE — mutates world state). Requires a valid bearer token AND the `manage_apps` permission on the org that owns `appId` (super admins bypass). */
  rollbackVoxelUpdates: Array<RollbackVoxelEventResult>;
  /** Send an actor (player/NPC) state update for spatial replication to nearby chunks. Requires a bearer game token; opens a UDP proxy session automatically if none exists. Returns Boolean! that is true only when the datagram was ACCEPTED FOR SENDING to the game server — it does NOT confirm the world applied the update. The applied echo (ActorUpdateResponse) and any failure (GenericErrorResponse) arrive ASYNCHRONOUSLY on the udpNotifications subscription, correlated by the request sequenceNumber (correlation only — not an idempotency key; the server does not dedupe replays). Subscribe to udpNotifications before sending so the reply is not missed. */
  sendActorUpdate: Scalars['Boolean']['output'];
  /** Send a spatial voice/audio packet, fanned out to nearby actors as a ClientAudioNotification. Requires a bearer game token; voice may additionally be gated by a runtime/grid permission for the region — if the caller lacks it the game server responds asynchronously with a GenericErrorResponse (errorCode UNAUTHORIZED). Opens a UDP proxy session automatically if none exists. Returns Boolean! that is true only when the datagram was ACCEPTED FOR SENDING — NOT that it was delivered; the sender receives no echo, only errors (GenericErrorResponse, correlated by sequenceNumber) on udpNotifications. sequenceNumber is correlation only, not an idempotency key. */
  sendAudioPacket: Scalars['Boolean']['output'];
  /** Publish a message to a channel, delivered to every active member of the channel (not chunk-routed) as a ChannelMessageNotification on udpNotifications. Requires a bearer game token and the channel send_messages permission; lacking the permission the server drops the message. Opens a UDP proxy session automatically if none exists. The sender receives no echo. Returns Boolean! that is true only when the datagram was ACCEPTED FOR SENDING — NOT confirmation of delivery; failures arrive ASYNCHRONOUSLY as GenericErrorResponse on udpNotifications, correlated by the request sequenceNumber (correlation only — not an idempotency key; the server does not dedupe replays). */
  sendChannelMessage: Scalars['Boolean']['output'];
  /** Send a custom, app-defined client event (identified by eventType, a uint16) for spatial replication to nearby chunks; nearby actors receive it as a ClientEventNotification. Requires a bearer game token; opens a UDP proxy session automatically if none exists. Returns Boolean! that is true only when the datagram was ACCEPTED FOR SENDING — NOT that the world processed it. Failures arrive ASYNCHRONOUSLY as GenericErrorResponse on udpNotifications, correlated by the request sequenceNumber (correlation only — not an idempotency key; the server does not dedupe replays). */
  sendClientEvent: Scalars['Boolean']['output'];
  /** Send a direct actor-to-actor message, delivered only to the actor identified by targetUuid (NOT broadcast to nearby actors). The sender must know the destination actor’s current chunk. Requires a bearer game token; opens a UDP proxy session automatically if none exists. The target receives a SingleActorMessageNotification on udpNotifications; the sender receives no echo. Returns Boolean! that is true only when the datagram was ACCEPTED FOR SENDING — NOT confirmation of delivery; failures arrive ASYNCHRONOUSLY as GenericErrorResponse on udpNotifications, correlated by the request sequenceNumber (correlation only — not an idempotency key; the server does not dedupe replays). */
  sendSingleActorMessage: Scalars['Boolean']['output'];
  /** Send a spatial text/chat packet, fanned out to nearby actors as a ClientTextNotification. Requires a bearer game token; opens a UDP proxy session automatically if none exists. Returns Boolean! that is true only when the datagram was ACCEPTED FOR SENDING to the game server — NOT confirmation of delivery. The sender receives no echo; failures arrive ASYNCHRONOUSLY as GenericErrorResponse on udpNotifications, correlated by the request sequenceNumber (correlation only — not an idempotency key; the server does not dedupe replays). */
  sendTextPacket: Scalars['Boolean']['output'];
  /** Send a single voxel (block) update for spatial replication to nearby chunks. Requires a bearer game token; opens a UDP proxy session automatically if none exists. Returns Boolean! that is true only when the datagram was ACCEPTED FOR SENDING to the game server — NOT confirmation that the world applied the change. The applied echo (VoxelUpdateResponse) and any failure (GenericErrorResponse) arrive ASYNCHRONOUSLY on udpNotifications, correlated by the request sequenceNumber (correlation only — not an idempotency key; the server does not dedupe replays). */
  sendVoxelUpdate: Scalars['Boolean']['output'];
  /** Creates or updates an app's monthly spend cap (idempotent upsert keyed by org + app) and returns the resulting budget. This only records the cap used to monitor/limit overspend; it does not move money, charge a card, or alter the wallet balance. Requires the 'manage_billing' app permission. */
  setAppBudget: AppBudget;
  /** Sets per-app hourly/daily spend caps (in cents) and returns the re-evaluated runtime state. Pass null for a limit to clear that cap. Exceeding a cap denies the app's runtime (runtimeDenialReason = spend_cap). Requires the 'manage_billing' permission on the app's org. */
  setAppSpendCaps: AppRuntimeState;
  /** Super admin only (also requires the management API to be enabled for this deployment). Overrides an app visibility platform-wide, e.g. to take down (PRIVATE/UNLISTED) or relist (PUBLIC) an app. Throws ForbiddenException for non-super-admins or when management APIs are disabled. Throws if the app id does not exist. */
  setAppVisibility: App;
  /** Enables or disables off-session auto-billing for an org and updates its thresholds. When enabled and the wallet falls to lowWaterThresholdCents, the saved payment method is charged rechargeAmountCents (requires setupSharedPaymentMethod first). Pass limitCents=null for no per-period cap. Requires the 'manage_billing' org permission. */
  setAutoBilling: OrgAutoBilling;
  /** Replace a member's channel roles with the given set (not additive — roles not listed are removed). Requires the 'manage_roles' channel permission (app admins bypass). Re-pushes the member's effective send permission to Buddy so their ability to post updates immediately. */
  setChannelMemberRoles: GroupMember;
  /** Set who may create channels in an app and the default membership policy for new channels. Requires app-admin ('manage_apps'). Affects future channel creation only, not existing channels. */
  setChannelPolicy: AppGroupPolicy;
  /** Sets the per-user early-access override flag, forcing early access on or off regardless of the global free-play window. Requires a super-admin bearer game token (and the management API enabled). NOTE: management-owned in cks-game-api (throws ForbiddenException) — use cks-management-api. */
  setEarlyAccessOverride: User;
  /** Operator only (is_operator). Toggles deletion protection on an environment (when enabled, purgeEnvironment is blocked) and writes an audit entry. Returns true on success. */
  setEnvironmentDeletionProtection: Scalars['Boolean']['output'];
  /** Replace the whitelist of permission keys allowed on a grid (writes the `grid_permission_limits` input table), then recompute the grid's materialized effective ACL so any keys no longer on the whitelist are dropped for all users. Pass an empty array to remove all limits. Requires app-admin ('manage_apps'). DESTRUCTIVE: narrowing the whitelist can strip effective permissions from existing users on the grid. */
  setGridPermissionLimits: GridPermissionLimits;
  /** Super-admin only. Flip users.is_operator to grant or revoke control-plane / operator access. */
  setOperator: User;
  /** Super admin only. Used to freeze/unfreeze orgs platform-wide. SIDE EFFECT: sets organizations.status, which gates the org's platform access. */
  setOrgStatus: Organization;
  /** Creates or updates a quota enforcement rule (idempotent upsert keyed by org/app/tier + metric + period) and returns it. Scope is inferred from the input ids: an app-scoped rule requires the 'manage_quotas' app permission, an org-scoped rule requires the 'manage_quotas' org permission, and a global rule (no org/app/tier) requires super admin. Changes which limit `effectiveQuota` resolves for the metric; does not retroactively alter past usage. */
  setQuota: ServiceQuota;
  /** ADMIN PRIVILEGE CHANGE: grants or revokes platform super-admin on the target user, changing their privileges across the whole platform. Requires a super-admin bearer game token (and the management API enabled). NOTE: in cks-game-api super-admin checks always fail and the users table is management-owned — perform this via cks-management-api. */
  setSuperAdmin: User;
  /** Replace a member's roles with the given set (not additive — roles not listed are removed). Requires the 'manage_roles' team permission (app admins bypass). */
  setTeamMemberRoles: GroupMember;
  /** Set who may create teams in an app and the default membership policy for new teams. Requires app-admin ('manage_apps'). Affects future team creation only, not existing teams. */
  setTeamPolicy: AppGroupPolicy;
  /** Begins vaulting a card for off-session auto-billing. Returns a Stripe SetupIntent client secret the browser confirms; no charge is made here. Requires the 'manage_billing' org permission. */
  setupSharedPaymentMethod: PaymentMethodSetup;
  /** Checks whether the authenticated user is allowed to teleport an actor to a destination within an app and returns the authorization result. This is an authorization check only — it does NOT itself move the actor; the UDP runtime performs the actual movement. Requires a valid bearer game token plus the app-level "teleport" runtime permission. Returns success=false with errorCode INVALID_APP_ID (non-positive appId), UNAUTHORIZED (reserved sentinel destination -6,-6,-6 or missing permission), or success=true / NO_ERROR when allowed. */
  teleportRequest: TeleportResponse;
  /** Update an existing access tier (name, ordering, pricing, permissions, etc.); only fields present in the input are changed. Requires the 'manage_access_tiers' permission on the app that owns the tier (resolved from tierId); super admins bypass. SIDE EFFECTS: re-syncs the tier's permissions to the game API. Throws if the tier is not found or the caller lacks permission. */
  updateAccessTier: AppAccessTier;
  /** Partially updates an actor (appId, avatarId, chunk, publicState, privateState); fields omitted from `input` are left unchanged. OWNER-EXCLUSIVE: only the actor’s owner may update (throws Unauthorized otherwise). Requires a valid game token. `uuid` is the 32-character ASCII actor id. */
  updateActor: Actor;
  /** Replaces an actor’s `publicState` and/or `privateState` blobs (fields omitted from `input` are left unchanged). OWNER-EXCLUSIVE: only the actor’s owner may write (throws Unauthorized otherwise). Requires a valid game token. `uuid` is the 32-character ASCII actor id; blobs are base64-encoded binary. */
  updateActorState: Actor;
  /** Update mutable fields of an existing app (name, description, visibility, status, metadata); only fields present in the input are changed. Requires the 'manage_apps' permission on the app (resolved via its org); super admins bypass. Use this to publish (status=LIVE), change visibility, or restore an archived app (status back to DRAFT/LIVE). Throws if the app id does not exist. */
  updateApp: App;
  /** Updates an avatar’s mutable fields (currently `name`) and returns it. OWNER-EXCLUSIVE: only the avatar’s owner may call this (throws Unauthorized otherwise). Requires a valid game token. To change state blobs use `updateAvatarState`. */
  updateAvatar: Avatar;
  /** Creates or replaces one avatar’s per-app state (upsert keyed by appId+avatarId; bumps updatedAt). OWNER-EXCLUSIVE: only the avatar’s owner may write (throws Unauthorized otherwise); every authenticated user can read it via `avatarAppState`/`avatarAppStates`. Requires a valid game token. `input.state` is base64-encoded binary (null clears it). */
  updateAvatarAppState: AppAvatarState;
  /** Replaces an avatar’s `publicState` and/or `privateState` blobs (fields omitted from `input` are left unchanged). OWNER-EXCLUSIVE: only the owner may write (throws Unauthorized otherwise). Requires a valid game token. Both blobs are base64-encoded binary. */
  updateAvatarState: Avatar;
  /** Update a channel's name, description, and/or membership policy. Requires the 'manage_group' channel permission (app admins bypass). */
  updateChannel: Group;
  /** Update a channel role's name, rank, and/or permission keys (system roles cannot be renamed/re-ranked). When permissions are supplied they REPLACE the role's existing keys. Requires the 'manage_roles' channel permission (app admins bypass). Note: changing send_messages here does not re-push Buddy until affected members' roles are re-applied via setChannelMemberRoles. */
  updateChannelRole: GroupRole;
  /** Creates or replaces a chunk's dense voxel grid and/or per-voxel states for the given app and coordinates, records each provided voxel state as an individual voxel update, and asynchronously uploads the chunk to the CDN. WRITES world state. Leaves chunkState and LODs untouched. Requires a valid bearer token (app-scoped tokens are limited to their own app); no additional org/app permission is enforced on this field. */
  updateChunk: Chunk;
  /** Replaces the level-of-detail (LOD) set for a chunk, preserving voxels, per-voxel states, chunk state and owner; returns the updated chunk (or null if it could not be written). WRITES world state. Requires a valid bearer token AND the `manage_apps` permission on the org that owns input.appId (super admins bypass). */
  updateChunkLods: Maybe<Chunk>;
  /** Upserts ONLY the opaque base64 chunk-level state blob for a chunk, preserving its voxels, per-voxel states and LODs; returns the updated chunk (or null if it could not be written). WRITES world state. Requires a valid bearer token AND the `manage_apps` permission on the org that owns input.appId (super admins bypass). */
  updateChunkState: Maybe<Chunk>;
  /** Updates a dedicated environment's autoscaling bounds (game-api / Buddy min & max server counts), load-balancer count, and optionally the Caddy flavor, queuing a change order that redeploys the affected tiers. May change the hourly cost. Rejected for 'dev_single' environments and when another change order is already active. Requires the 'manage_environments' org permission. */
  updateEnvironmentScaling: CksEnvironmentChangeOrder;
  /** Sets the authenticated user’s gamertag and disambiguation and appends a gamertag-history row. Requires a valid game token; only ever updates the caller. Fails if the gamertag+disambiguation pair is already taken. NOTE: the users table is management-owned, so in cks-game-api this throws ForbiddenException — call cks-management-api instead. */
  updateGamertag: User;
  /** Replaces the full set of roles assigned to an org member. Requires the 'manage_members' permission on the org (super admins bypass). Pass the complete desired role list; roles not included are removed. */
  updateOrgMemberRoles: OrgMember;
  /** Updates a role's name, description, and/or permission set. Requires the 'manage_members' permission on the role's org (super admins bypass). If input.permissions is provided it replaces the entire set (empty array clears all); omit to leave permissions unchanged. */
  updateOrgRole: OrgRole;
  /** Updates an org token's metadata (label, expiry, active flag). Requires the 'manage_tokens' permission on the token's org (super admins bypass). Does not rotate the secret value. */
  updateOrgToken: OrgToken;
  /** Update a team's name, description, and/or membership policy. Requires the 'manage_group' team permission (app admins bypass). */
  updateTeam: Group;
  /** Update a team role's name, rank, and/or permission keys (system roles cannot be renamed/re-ranked). When permissions are supplied they REPLACE the role's existing keys. Requires the 'manage_roles' team permission (app admins bypass). */
  updateTeamRole: GroupRole;
  /** Creates or replaces the authenticated user’s per-app state for `input.appId` (upsert keyed by appId+userId). Requires a valid game token; always writes the caller’s own state. `input.state` is base64-encoded binary. */
  updateUserAppState: UserAppState;
  /** Replaces the authenticated user’s top-level `state` blob (base64-encoded binary; omit/null clears it). Requires a valid game token; only ever writes the caller. NOTE: users.state is management-owned, so in cks-game-api this throws ForbiddenException — call cks-management-api instead. */
  updateUserState: User;
  /** Sets the target user’s account `user_type` (e.g. "direct", "deleted"). Requires a super-admin bearer game token (and the management API enabled). NOTE: management-owned in cks-game-api (throws ForbiddenException) — use cks-management-api. */
  updateUserType: User;
  /** Records (upserts) a single voxel edit in the voxel_updates log for one chunk and returns the resulting Voxel. WRITES world state; a background maintenance job later folds these edits into the chunk's packed grid. Requires a valid bearer token AND voxel-edit permission for the target region: the user must have active app access, the `update_voxel_data` tier permission, and (when grids cover the chunk) `update_voxel_data` on a covering grid. */
  updateVoxel: Voxel;
  /** Operator only (is_operator). Yanks (withdraws) an environment version so it can no longer be deployed; existing environments are unaffected. Writes an audit entry. Returns true on success. */
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
  idempotencyKey?: InputMaybe<Scalars['String']['input']>;
  tierId: Scalars['BigInt']['input'];
};


export type MutationArchiveAppArgs = {
  appId: Scalars['BigInt']['input'];
  idempotencyKey?: InputMaybe<Scalars['String']['input']>;
};


export type MutationAssignGroupToGridArgs = {
  input: AssignGroupToGridInput;
};


export type MutationCancelSharedSubscriptionArgs = {
  appId: Scalars['BigInt']['input'];
  idempotencyKey?: InputMaybe<Scalars['String']['input']>;
};


export type MutationCapturePaypalCheckoutArgs = {
  idempotencyKey?: InputMaybe<Scalars['String']['input']>;
  orderId: Scalars['String']['input'];
};


export type MutationChangePasswordArgs = {
  currentPassword: Scalars['String']['input'];
  newPassword: Scalars['String']['input'];
};


export type MutationClaimFreeAppAccessArgs = {
  appId: Scalars['BigInt']['input'];
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
  idempotencyKey?: InputMaybe<Scalars['String']['input']>;
  uuid: Scalars['String']['input'];
};


export type MutationDeleteAvatarArgs = {
  id: Scalars['BigInt']['input'];
  idempotencyKey?: InputMaybe<Scalars['String']['input']>;
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
  idempotencyKey?: InputMaybe<Scalars['String']['input']>;
  orgRoleId: Scalars['BigInt']['input'];
};


export type MutationDeleteQuotaArgs = {
  idempotencyKey?: InputMaybe<Scalars['String']['input']>;
  quotaId: Scalars['BigInt']['input'];
};


export type MutationDeleteTeamArgs = {
  groupId: Scalars['BigInt']['input'];
  idempotencyKey?: InputMaybe<Scalars['String']['input']>;
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


export type MutationGameModelAddEdgeArgs = {
  input: AddEdgeInput;
};


export type MutationGameModelCreateContainerArgs = {
  input: CreateContainerInput;
};


export type MutationGameModelCreateSessionArgs = {
  input: CreateSessionInput;
};


export type MutationGameModelDefineFeatureArgs = {
  input: DefineAppFeatureInput;
};


export type MutationGameModelDeleteFunctionArgs = {
  appId: Scalars['BigInt']['input'];
  name: Scalars['String']['input'];
};


export type MutationGameModelGrantTierFeatureArgs = {
  input: GrantTierFeatureInput;
};


export type MutationGameModelInvokeArgs = {
  input: InvokeFunctionInput;
};


export type MutationGameModelJoinSessionArgs = {
  input: JoinSessionInput;
};


export type MutationGameModelRevokeTierFeatureArgs = {
  input: GrantTierFeatureInput;
};


export type MutationGameModelSeedArgs = {
  input: SeedGameModelInput;
};


export type MutationGameModelSetPolicyArgs = {
  input: SetGameModelPolicyInput;
};


export type MutationGameModelSetPropertyArgs = {
  input: SetContainerPropertyInput;
};


export type MutationGameModelSetSessionTurnArgs = {
  input: SetSessionTurnInput;
};


export type MutationGameModelUpsertContainerTypeArgs = {
  input: UpsertContainerTypeInput;
};


export type MutationGameModelUpsertFunctionArgs = {
  input: UpsertFunctionInput;
};


export type MutationGameModelUpsertPropertyDefArgs = {
  input: UpsertPropertyDefInput;
};


export type MutationGrantAppAccessArgs = {
  input: GrantAppAccessInput;
};


export type MutationGrantGridPermissionsArgs = {
  input: GrantGridPermissionsInput;
};


export type MutationGrantMyAppAccessArgs = {
  appId: Scalars['BigInt']['input'];
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
  idempotencyKey?: InputMaybe<Scalars['String']['input']>;
};


export type MutationLinkAppToEnvironmentArgs = {
  input: LinkAppToEnvironmentInput;
};


export type MutationLoginArgs = {
  loginUserInput: LoginUserInput;
};


export type MutationPublishAppToSharedArgs = {
  appId: Scalars['BigInt']['input'];
  cancelUrl?: InputMaybe<Scalars['String']['input']>;
  idempotencyKey?: InputMaybe<Scalars['String']['input']>;
  planId?: InputMaybe<Scalars['BigInt']['input']>;
  provider?: InputMaybe<PaymentProvider>;
  successUrl?: InputMaybe<Scalars['String']['input']>;
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
  idempotencyKey?: InputMaybe<Scalars['String']['input']>;
  orgId: Scalars['BigInt']['input'];
  userId: Scalars['BigInt']['input'];
};


export type MutationRemoveSharedPaymentMethodArgs = {
  idempotencyKey?: InputMaybe<Scalars['String']['input']>;
  orgId: Scalars['BigInt']['input'];
  paymentMethodId: Scalars['BigInt']['input'];
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
  idempotencyKey?: InputMaybe<Scalars['String']['input']>;
  userId: Scalars['BigInt']['input'];
};


export type MutationRevokeGridPermissionsArgs = {
  input: RevokeGridPermissionsInput;
};


export type MutationRevokeGroupFromGridArgs = {
  input: RevokeGroupFromGridInput;
};


export type MutationRevokeOrgTokenArgs = {
  idempotencyKey?: InputMaybe<Scalars['String']['input']>;
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
  idempotencyKey?: InputMaybe<Scalars['String']['input']>;
  monthlyLimitCents: Scalars['BigInt']['input'];
  orgId: Scalars['BigInt']['input'];
};


export type MutationSetAppSpendCapsArgs = {
  appId: Scalars['BigInt']['input'];
  dailyLimitCents?: InputMaybe<Scalars['BigInt']['input']>;
  hourlyLimitCents?: InputMaybe<Scalars['BigInt']['input']>;
};


export type MutationSetAppVisibilityArgs = {
  appId: Scalars['BigInt']['input'];
  visibility: AppVisibility;
};


export type MutationSetAutoBillingArgs = {
  enabled: Scalars['Boolean']['input'];
  idempotencyKey?: InputMaybe<Scalars['String']['input']>;
  limitCents?: InputMaybe<Scalars['BigInt']['input']>;
  lowWaterThresholdCents?: InputMaybe<Scalars['BigInt']['input']>;
  orgId: Scalars['BigInt']['input'];
  rechargeAmountCents?: InputMaybe<Scalars['BigInt']['input']>;
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


export type MutationSetupSharedPaymentMethodArgs = {
  idempotencyKey?: InputMaybe<Scalars['String']['input']>;
  orgId: Scalars['BigInt']['input'];
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

/** A grid overlapping a scanned region, plus a user's effective permission keys on it (returned by nearbyGridPermissions). */
export type NearbyGridPermissions = {
  __typename?: 'NearbyGridPermissions';
  /** The app (tenant) that owns the grid. */
  appId: Scalars['BigInt']['output'];
  /** The grid id. */
  gridId: Scalars['BigInt']['output'];
  /** High (maximum) corner chunk of the grid box. */
  highChunk: ChunkCoordinates;
  /** Low (minimum) corner chunk of the grid box. */
  lowChunk: ChunkCoordinates;
  /** The user's effective runtime permission key strings on this grid. */
  permissionKeys: Array<Scalars['String']['output']>;
  /** The user the permissions were computed for. */
  userId: Scalars['BigInt']['output'];
};

/** Scan a region for grids and report a user's effective permissions on each. */
export type NearbyGridPermissionsInput = {
  /** The app (tenant) to scan within. */
  appId: Scalars['BigInt']['input'];
  /** High corner of the region to scan, in chunk coordinates (normalized). */
  highChunk: ChunkCoordinatesInput;
  /** Low corner of the region to scan, in chunk coordinates (normalized). */
  lowChunk: ChunkCoordinatesInput;
  /** The user whose effective permissions to report per grid. */
  userId: Scalars['BigInt']['input'];
};

/** Org off-session auto-billing configuration. */
export type OrgAutoBilling = {
  __typename?: 'OrgAutoBilling';
  /** Amount already auto-billed in the current period, in cents. */
  autoBilledThisPeriodCents: Scalars['BigInt']['output'];
  /** Whether off-session auto-billing is enabled. */
  enabled: Scalars['Boolean']['output'];
  /** True when a vaulted payment method exists to charge off-session. */
  hasPaymentMethod: Scalars['Boolean']['output'];
  /** Most recent auto-billing failure message, if any. */
  lastError: Maybe<Scalars['String']['output']>;
  /** Max auto-billed per period in cents. Null = no limit. */
  limitCents: Maybe<Scalars['BigInt']['output']>;
  /** Wallet balance at or below which an auto-recharge is triggered, in cents. */
  lowWaterThresholdCents: Scalars['BigInt']['output'];
  /** Organization id (BigInt). */
  orgId: Scalars['BigInt']['output'];
  /** Reset window for the per-period auto-billed total, e.g. 'month'. */
  period: Scalars['String']['output'];
  /** Amount to top up the wallet by on each auto-recharge, in cents. */
  rechargeAmountCents: Scalars['BigInt']['output'];
};

export type OrgMember = {
  __typename?: 'OrgMember';
  /** When the membership was created. */
  createdAt: Scalars['DateTime']['output'];
  /** Organization this membership belongs to (BigInt as string). */
  orgId: Scalars['BigInt']['output'];
  /** Unique membership id (primary key, BigInt as string). Distinct from userId. */
  orgMemberId: Scalars['BigInt']['output'];
  /** Membership status. Only 'active' members count for permission checks; other values (e.g. 'invited' or 'removed') grant no permissions. */
  status: Scalars['String']['output'];
  /** When the membership was last updated. */
  updatedAt: Scalars['DateTime']['output'];
  /** The member's user_id (BigInt as string). */
  userId: Scalars['BigInt']['output'];
};

/** Represents one user's membership in one organization. Bundles the org, the union of permissions across the user's assigned roles, and the role list itself - so the UI can render an org dashboard without a follow-up round trip. */
export type OrgMembership = {
  __typename?: 'OrgMembership';
  /** When the user joined the organization. */
  joinedAt: Scalars['DateTime']['output'];
  /** The organization. */
  org: Organization;
  /** Effective permission keys the user holds in this org (union across assigned roles; full set for super admins). */
  permissions: Array<Scalars['String']['output']>;
  /** Roles assigned to the user in this org. */
  roles: Array<OrgRole>;
};

export type OrgPermission = {
  __typename?: 'OrgPermission';
  /** Optional grouping category for UI display. */
  category: Maybe<Scalars['String']['output']>;
  /** Human-readable explanation of what the permission allows. */
  description: Maybe<Scalars['String']['output']>;
  /** Stable permission key used in role grants (e.g. 'manage_members', 'manage_tokens'). */
  permissionKey: Scalars['ID']['output'];
};

export type OrgRole = {
  __typename?: 'OrgRole';
  /** When the role was created. */
  createdAt: Scalars['DateTime']['output'];
  /** Optional human-readable description of the role. */
  description: Maybe<Scalars['String']['output']>;
  /** True for built-in / seeded roles managed by the platform; typically not editable. */
  isSystem: Scalars['Boolean']['output'];
  /** Organization this role belongs to (BigInt as string). */
  orgId: Scalars['BigInt']['output'];
  /** Unique role id (primary key, BigInt as string). */
  orgRoleId: Scalars['BigInt']['output'];
  /** Permission keys granted by this role (resolved from org_role_permissions). */
  permissions: Array<Scalars['String']['output']>;
  /** Display name of the role. */
  roleName: Scalars['String']['output'];
};

export type OrgToken = {
  __typename?: 'OrgToken';
  /** When the token was created. */
  createdAt: Scalars['DateTime']['output'];
  /** For 'service' tokens, the environment id (UUID) the token is scoped to; null for user-minted tokens. */
  environmentId: Maybe<Scalars['String']['output']>;
  /** Optional expiry timestamp; null means the token never expires. */
  expiresAt: Maybe<Scalars['DateTime']['output']>;
  /** False once revoked; inactive tokens cannot authenticate. */
  isActive: Scalars['Boolean']['output'];
  /** 'user_minted' (human-created) or 'service' (minted by the control plane for per-tenant game-apis). */
  kind: Scalars['String']['output'];
  /** Optional human-readable label. */
  label: Maybe<Scalars['String']['output']>;
  /** When the token last authenticated a request, if ever. */
  lastUsedAt: Maybe<Scalars['DateTime']['output']>;
  /** Organization that owns this token (BigInt as string). */
  orgId: Scalars['BigInt']['output'];
  /** Unique token id (primary key, BigInt as string). */
  orgTokenId: Scalars['BigInt']['output'];
  /** When the token was revoked, if it has been. */
  revokedAt: Maybe<Scalars['DateTime']['output']>;
  /** When the token was last updated. */
  updatedAt: Scalars['DateTime']['output'];
};

/** Returned exactly once - on org token creation. The plaintext `token` field is never re-emitted. Future listings show metadata only via the `OrgToken` type. */
export type OrgTokenWithSecret = {
  __typename?: 'OrgTokenWithSecret';
  /** When the token was created. */
  createdAt: Scalars['DateTime']['output'];
  /** Optional expiry timestamp; null means no expiry. */
  expiresAt: Maybe<Scalars['DateTime']['output']>;
  /** Whether the token is active. */
  isActive: Scalars['Boolean']['output'];
  /** Optional human-readable label. */
  label: Maybe<Scalars['String']['output']>;
  /** Organization that owns this token (BigInt as string). */
  orgId: Scalars['BigInt']['output'];
  /** Unique token id (BigInt as string). */
  orgTokenId: Scalars['BigInt']['output'];
  /** The plaintext token. Save it now; it is not stored. */
  token: Scalars['String']['output'];
};

export type OrgWallet = {
  __typename?: 'OrgWallet';
  /** Current wallet balance in minor currency units (cents) of `currency`, as a BigInt decimal string. May be negative if usage was charged against an empty wallet. */
  balanceCents: Scalars['BigInt']['output'];
  /** When the wallet was created (ISO-8601 UTC timestamp). */
  createdAt: Scalars['DateTime']['output'];
  /** ISO-4217 currency code for `balanceCents`, lowercase (e.g. "usd"). Defaults to "usd". */
  currency: Scalars['String']['output'];
  /** Organization that owns this wallet (BigInt as a decimal string). There is exactly one wallet per organization. */
  orgId: Scalars['BigInt']['output'];
  /** When the wallet was last modified, e.g. on balance change (ISO-8601 UTC timestamp). */
  updatedAt: Scalars['DateTime']['output'];
  /** Unique wallet id (BigInt as a decimal string). */
  walletId: Scalars['BigInt']['output'];
};

export type Organization = {
  __typename?: 'Organization';
  /** When the organization was created. */
  createdAt: Scalars['DateTime']['output'];
  /** Human-readable organization name. */
  name: Scalars['String']['output'];
  /** Unique organization id (primary key). BigInt as a string. */
  orgId: Scalars['BigInt']['output'];
  /** user_id of the organization owner (BigInt as string). */
  ownerUserId: Scalars['BigInt']['output'];
  /** Unique URL-safe slug (lowercase letters, numbers, and dashes). */
  slug: Scalars['String']['output'];
  /** Lifecycle status, e.g. 'active' or 'frozen'. Set platform-wide via setOrgStatus. */
  status: Scalars['String']['output'];
  /** When the organization was last updated. */
  updatedAt: Scalars['DateTime']['output'];
};

/** Offset/limit pagination metadata for a paginated list. */
export type PageInfo = {
  __typename?: 'PageInfo';
  /** Maximum number of items returned in this page (the page size that was applied). */
  limit: Scalars['Int']['output'];
  /** Number of items skipped before this page (zero-based offset). */
  offset: Scalars['Int']['output'];
  /** Total number of records matching the query across all pages, ignoring limit and offset. */
  totalCount: Scalars['Int']['output'];
};

/** A single inbound payment-provider webhook event from the reconciliation audit log. */
export type PaymentEventRecord = {
  __typename?: 'PaymentEventRecord';
  /** Checkout this event was matched to (BigInt as a decimal string); null if it could not be matched. */
  checkoutId: Maybe<Scalars['BigInt']['output']>;
  /** When the event was received (ISO-8601 UTC timestamp). */
  createdAt: Scalars['DateTime']['output'];
  /** Error message if processing this event failed; null on success. */
  error: Maybe<Scalars['String']['output']>;
  /** Unique payment-event id (BigInt as a decimal string). */
  eventId: Scalars['BigInt']['output'];
  /** Provider event type string (e.g. "checkout.session.completed" for Stripe). */
  eventType: Scalars['String']['output'];
  /** Provider-assigned event id, unique per provider; used to make webhook handling idempotent. */
  externalEventId: Scalars['String']['output'];
  /** When the event was successfully processed (ISO-8601 UTC timestamp); null if not yet processed. */
  processedAt: Maybe<Scalars['DateTime']['output']>;
  /** Provider that delivered this webhook event. */
  provider: PaymentProvider;
};

/** An edge in a PaymentEventRecord connection. */
export type PaymentEventRecordEdge = {
  __typename?: 'PaymentEventRecordEdge';
  /** Opaque cursor for this edge. */
  cursor: Scalars['String']['output'];
  /** The node at the end of this edge. */
  node: PaymentEventRecord;
};

/** A Relay cursor connection over PaymentEventRecord rows. Page with first/after; pass pageInfo.endCursor back as after for the next page. */
export type PaymentEventsConnection = {
  __typename?: 'PaymentEventsConnection';
  /** Edges on this page. */
  edges: Array<PaymentEventRecordEdge>;
  /** Pagination metadata. */
  pageInfo: ConnectionPageInfo;
  /** Total matching records across all pages, when known (null for sources that do not compute a total). */
  totalCount: Maybe<Scalars['Int']['output']>;
};

/** A page of payment webhook events with offset/limit pagination metadata. */
export type PaymentEventsPage = {
  __typename?: 'PaymentEventsPage';
  /** The webhook events on this page, ordered newest first. */
  items: Array<PaymentEventRecord>;
  /** Offset/limit pagination metadata (totalCount, limit, offset) for this result set. */
  pageInfo: PageInfo;
};

/** Stripe SetupIntent handle the browser uses to vault a card for auto-billing. */
export type PaymentMethodSetup = {
  __typename?: 'PaymentMethodSetup';
  /** SetupIntent client secret the browser confirms to vault the card. */
  clientSecret: Maybe<Scalars['String']['output']>;
  /** Provider customer id (e.g. Stripe customer) the card is vaulted under. */
  externalCustomerId: Scalars['String']['output'];
  /** Provider publishable key for the browser SDK. */
  publishableKey: Maybe<Scalars['String']['output']>;
};

/** External payment processor for a checkout. */
export enum PaymentProvider {
  /** PayPal. Hosted approval flow; the approved order is captured (see capturePaypalCheckout) and confirmed via PayPal webhooks. */
  Paypal = 'PAYPAL',
  /** Stripe Checkout. Hosted card payment session; completion is confirmed via Stripe webhooks. */
  Stripe = 'STRIPE'
}

/** Public platform discovery. Clients/SDKs read the shared game-api URL here to route apps deployed to the shared environment. */
export type PlatformConfig = {
  __typename?: 'PlatformConfig';
  /** Free shared app slots an org gets before a paid subscription. */
  freeAppsPerOrg: Scalars['Int']['output'];
  /** Shared game-api HTTP/GraphQL root for shared-environment apps. */
  sharedGameApiUrl: Maybe<Scalars['String']['output']>;
  /** Shared game-api WebSocket root (subscriptions / UDP proxy). */
  sharedGameApiWsUrl: Maybe<Scalars['String']['output']>;
};

/** Result of publishing an app to the shared environment. Free path returns a runtime state with no checkout; paid path returns a checkout to redirect to. */
export type PublishAppResult = {
  __typename?: 'PublishAppResult';
  appId: Scalars['BigInt']['output'];
  /** Subscription checkout to redirect to (paid path only). */
  checkout: Maybe<Checkout>;
  /** True when published under the free quota (no payment). */
  free: Scalars['Boolean']['output'];
};

export type PublishEnvironmentReleaseFromGameApiTagInput = {
  /** Overwrite an existing environment version row if it already exists. */
  force?: Scalars['Boolean']['input'];
  /** cks-game-api semver tag (e.g. v0.6.20). */
  gameApiTag: Scalars['String']['input'];
};

export type PurgeEnvironmentInput = {
  /** Optional idempotency key. Recommended for retries: replaying with the same key and identical input returns the first result instead of re-applying; the same key with different input returns IDEMPOTENCY_CONFLICT. Keys expire after 24h. */
  idempotencyKey?: InputMaybe<Scalars['String']['input']>;
  /** Organization id (BigInt) that owns the environment. */
  orgId: Scalars['BigInt']['input'];
  /** Slug of the already-destroyed environment whose record to permanently delete. */
  slug: Scalars['String']['input'];
};

export type Query = {
  __typename?: 'Query';
  /** List only healthy GraphQL API servers (status = ReadyForClients) for client routing/discovery. No authentication required. */
  activeGraphQLServers: Array<GraphQlServer>;
  /** Fetches a single actor by its 32-character ASCII `uuid`. Requires a valid game token. Owner-aware: the owner receives full state; non-owners receive a public copy with `privateState` stripped (null). Throws NotFound if the uuid does not exist. */
  actor: Actor;
  /** Lists actors owned by the authenticated user, optionally narrowed by `filter` (appId, avatarId, uuid, chunk). Requires a valid game token; only the caller’s own actors are returned (full state included). For other users’ actors use `actor` or `batchLookupActors`. */
  actors: Array<Actor>;
  /** Relay-style cursor-paginated version of `actors`: lists actors owned by the authenticated user, optionally narrowed by `filter` (appId, avatarId, uuid, chunk). Page forward with `first` (default 50, max 200) and `after` (an opaque cursor from a previous page’s `pageInfo.endCursor`); `totalCount` is the full number of matching actors. Requires a valid game token; only the caller’s own actors are returned (full state included). */
  actorsConnection: ActorsConnection;
  /** Fetch a single app by its numeric id. Requires authentication (any signed-in user); does NOT enforce org/app permissions, so it can read apps the caller does not own, of any visibility/status. Returns null if the id does not exist. Prefer appBySlug for slug-based marketplace lookups. */
  app: Maybe<App>;
  /** Public listing of an app's access tiers (the free/paid bundles of runtime permissions), ordered by tierOrder ascending. PUBLIC: no authentication required. Powers the marketplace app detail / pricing page. Includes tiers of all statuses; inspect AppAccessTier.status to skip archived tiers. */
  appAccessTiers: Array<AppAccessTier>;
  /** Returns the monthly spend cap and current-month usage for a single app, or null if no budget has been configured for it. Requires the 'view_billing' app permission. */
  appBudget: Maybe<AppBudget>;
  /** Lists every app spend-cap budget configured under the organization. Requires the 'view_billing' org permission. */
  appBudgets: Array<AppBudget>;
  /** Look up a single app by its org slug + app slug (the marketplace URL path). PUBLIC: no authentication required, and NOT filtered by visibility/status, so it can resolve unlisted or draft apps when the exact slugs are known. Returns null if no matching app exists. */
  appBySlug: Maybe<App>;
  /** Lists org members eligible for a manual app access grant (active members of the app's owning org). Requires the 'manage_access_tiers' permission on the app; super admins bypass. Use the returned user ids with grantAppAccess. */
  appGrantMemberCandidates: Array<AppGrantMemberCandidate>;
  /** Top GraphQL operations for an app ranked by bytes over the time range. Read-only reporting; the app must be linked to an environment in the org. Requires the 'view_usage' org permission. */
  appGraphqlOperations: Array<GraphqlOperationUsageRow>;
  /** Shared-environment runtime gate decision plus current hour/day billing-window usage for an app. Read this to learn why an app is not running (runtimeDenialReason). Caller must be a member of the app's org. */
  appRuntimeState: AppRuntimeState;
  /** An app's paid shared-environment subscription, or null when it has none (e.g. unpublished or on the free quota). Caller must be a member of the app's org. */
  appSharedSubscription: Maybe<AppSharedSubscription>;
  /** Replication and GraphQL byte totals plus the top GraphQL operations for one app over the time range. Read-only reporting; the app must be linked to an environment in the org. Requires the 'view_usage' org permission. */
  appUsageSummary: AppUsageSummary;
  /** Admin view of the user access records for an app (who has been granted/revoked access and on which tier). Requires the 'manage_access_tiers' permission on the app; super admins bypass. Ordered by most recently updated. Paginated via limit/offset. */
  appUserAccessByApp: Array<AppUserAccess>;
  /** Admin view of the user access records for an app (who has been granted/revoked access and on which tier). Requires the 'manage_access_tiers' permission on the app; super admins bypass. Ordered by most recently updated. Relay cursor connection; prefer this over the offset-based appUserAccessByApp. */
  appUserAccessConnection: AppUserAccessConnection;
  /** Public marketplace listing of apps. PUBLIC: no authentication required. Returns ONLY apps with visibility=PUBLIC AND status=LIVE (drafts, unlisted, private, and archived apps are never returned). Use myApps or appsForOrg for caller-visible or org-scoped apps. Results are ordered newest-first and paginated via pageInfo. */
  apps: AppsPage;
  /** Public marketplace listing of apps. PUBLIC: no authentication required. Returns ONLY apps with visibility=PUBLIC AND status=LIVE (drafts, unlisted, private, and archived apps are never returned). Results are ordered newest-first. Relay cursor connection; prefer this over the offset-based apps. */
  appsConnection: AppsConnection;
  /** All apps belonging to an organization, identified by the org's slug, regardless of visibility or status (includes drafts and archived). Requires authentication; intended for org dashboards. Ordered newest-first. Returns an empty list for an unknown slug. */
  appsForOrg: Array<App>;
  /** Fetches a single avatar by id. Requires a valid game token. Owner-aware: the owner receives full state; non-owners receive a public copy with `privateState` stripped (null). Throws NotFound if the id does not exist. State blobs are base64-encoded binary. */
  avatar: Avatar;
  /** Reads one avatar’s per-app state (keyed by appId+avatarId). PUBLIC READ: any authenticated user may read it. Requires a valid game token. Returns null when no row exists. `state` is base64-encoded binary. */
  avatarAppState: Maybe<AppAvatarState>;
  /** Batch-reads per-app state for many avatars under a single app in one call. PUBLIC READ: any authenticated user may read. Requires a valid game token. Avatars with no row for the app are omitted. `state` blobs are base64-encoded binary. */
  avatarAppStates: Array<AppAvatarState>;
  /** Bulk-fetches actors by a list of 32-character ASCII uuids in one round-trip. Requires a valid game token. PUBLIC-STATE ONLY: `privateState` is stripped (null) for every result regardless of ownership. Unknown uuids are silently omitted. Use this to resolve many actors at once; use `actor` for a single owner-scoped fetch. */
  batchLookupActors: Array<Actor>;
  /** Fetch one channel by id. Errors if the id is not a channel. */
  channel: Group;
  /** List the members of a channel (the subscriber set, including pending requests), each with their status and roles. */
  channelMembers: Array<GroupMember>;
  /** The current channel creation/membership policy for an app (who may create channels and the default membership policy of new channels). Falls back to app defaults when unset. */
  channelPolicy: AppGroupPolicy;
  /** List the roles of a channel, including the system 'leader' role and any default 'member' role (which typically grants send_messages). */
  channelRoles: Array<GroupRole>;
  /** List all active channels in an app (not just the caller's). */
  channels: Array<Group>;
  /** Cross-tenant payments audit across all users, orgs, and apps (newest first), with optional filtering. Restricted to super admins; requests from non-super-admins are rejected. For a caller's own history use `myCheckouts` instead. */
  checkouts: CheckoutsPage;
  /** Cross-tenant payments audit across all users, orgs, and apps (newest first), with optional filtering. Restricted to super admins; requests from non-super-admins are rejected. For a caller's own history use `myCheckoutsConnection` instead. Relay cursor connection; prefer this over the offset-based checkouts. */
  checkoutsConnection: CheckoutsConnection;
  /** Operator only (is_operator). Most recent operator audit entries, newest first, optionally filtered by environment. */
  cpAudit: Array<CpAuditEntry>;
  /** Operator only (is_operator). One change order with its tasks and steps. Null when the id is not found. */
  cpChangeOrder: Maybe<CpChangeOrderDetail>;
  /** Operator only (is_operator). Paginated change orders, optionally filtered by environment. Returns a *Page (rows/total/page/pageSize); page is 1-based. */
  cpChangeOrders: CpChangeOrdersPage;
  /** Operator only (is_operator). Lists environment-delivered secret metadata (names/kinds only, never plaintext) injected into the tenant runtime, optionally filtered by environment. */
  cpEnvSecrets: Array<CpEnvSecretRow>;
  /** Operator only (is_operator). Operator view of one environment by slug, across any org. Null when not found. */
  cpEnvironment: Maybe<CpAdminEnvironment>;
  /** Operator only (is_operator). Environment release manifests merged from git and the database, with the latest available version and git-source availability. Read-only. */
  cpEnvironmentVersions: CpEnvironmentVersionsPage;
  /** Operator only (is_operator). Paginated list of all environments across every org. Returns a *Page (rows/total/page/pageSize); page is 1-based. */
  cpEnvironments: CpAdminEnvironmentsPage;
  /** Operator only (is_operator). OVH flavor catalog with provider vs. customer pricing for cost analysis, optionally filtered by region. Read-only. */
  cpOvhCatalogSummary: Array<CpOvhCatalogRow>;
  /** Operator only (is_operator). Lists control-plane secret metadata (names/kinds only, never plaintext), optionally filtered by environment. */
  cpSecrets: Array<CpSecretRow>;
  /** Operator only (is_operator). cks-game-api git tags not yet pinned by any environment release, each with the version a publish would create. Read-only. */
  cpUnreleasedGameApiTags: CpUnreleasedGameApiTagsPage;
  /** Operator only (is_operator). Per-minute usage summary for any environment by slug (operator equivalent of environmentUsageSummary, not org-scoped). Read-only. */
  cpUsageSummary: CpUsageSummary;
  /** Resolves the single most-specific quota that applies to the given (tierId, appId, orgId, metric) by walking tier -> app -> org -> free-tier defaults and returning the first match; its limitValue/period describe the enforced limit. Returns null if no matching rule and no free-tier default exist for the metric. Requires the 'view_usage' permission on the most-specific scope provided: tierId or appId -> 'view_usage' on the (owning) app; orgId -> 'view_usage' on the org. A metric-only query (no scope ids) resolves the platform free-tier default and only requires an authenticated user. */
  effectiveQuota: Maybe<ServiceQuota>;
  /** OVH datacenters that have at least one customer-priced instance flavor available for customer selection. */
  environmentDatacenters: Array<CksOvhDatacenter>;
  /** Customer-selectable instance flavors in the datacenter with current availability and customer pricing. */
  environmentFlavors: Array<CksOvhFlavor>;
  /** Release versions a specific environment may upgrade to: available, deployable by its environment class, and not older than the version it currently runs (forward-only — no rollback). Newest first; backs the version picker passed to redeployEnvironment. Requires the 'view_environments' org permission. */
  environmentForwardVersions: Array<CksEnvironmentVersion>;
  /** Pricing quote for the selected flavors plus the org wallet balance and a canCreate gate. Read-only — provisions nothing. Fails if any flavor is unavailable, hidden, or lacks customer pricing. Requires the 'view_billing' org permission. */
  environmentQuote: CksEnvironmentQuote;
  /** Aggregate replication/GraphQL byte totals per app for the apps linked to an environment, over the time window. Read-only reporting. Requires the 'view_usage' org permission. */
  environmentUsageByApp: Array<AppUsageRollupRow>;
  /** Per-minute replication and GraphQL byte/message usage time series for the apps linked to an environment, plus replication rate peaks and live Buddy rates. Read-only observability. Requires the 'view_usage' org permission. */
  environmentUsageSummary: EnvironmentUsageSummary;
  /** Catalog of available environment release versions that can be deployed, newest first. Not org-scoped (any authenticated caller). For the versions a specific environment may move to, use environmentForwardVersions. */
  environmentVersions: Array<CksEnvironmentVersion>;
  /** Reports whether a free-play window is active now, a human-readable schedule description, and the ISO-8601 start of the next window. PUBLIC: no authentication required. Takes no arguments; computed from server config and the current clock. */
  freePlayWindowInfo: FreePlayWindowInfo;
  /** Single startup payload for browser game clients: the authenticated user, server/min-client version requirements, current UDP proxy status, realtime protocol details (subprotocol + subscription name), and the spatial send limits/constants (maxReplicationDistance, maxDecayRate, sequenceNumberModulo). Requires a bearer game token. Read-only: does not open a UDP proxy session. Call this once after login to initialize a play session. */
  gameClientBootstrap: GameClientBootstrap;
  /** Returns the single elected host user for an app (game). Deterministic across all cks-game-api replicas behind the LB: the user whose earliest still-connected actor row was created first wins, with a uuid tiebreaker. Returns null when no actors exist for the app. Stale actors (no recent actorHeartbeat) are excluded once HOST_ACTOR_FRESHNESS_SECONDS is enabled. Clients should poll; there is no host-change subscription in v1. */
  gameHost: Maybe<GameHost>;
  /** Fetch one container (instance) by id. Requires a valid token. */
  gameModelContainer: GmContainer;
  /** Fetch a container with its property values filtered to what the CALLER may see (public always; owner/hidden depend on the caller's relationship to the container). Use this for a player-facing view of an entity. Requires a valid token. */
  gameModelContainerState: GmContainerState;
  /** List all container types defined for an app. Requires app-admin ('manage_apps'). */
  gameModelContainerTypes: Array<GmContainerType>;
  /** List containers in an app, optionally filtered by container type and/or session. Requires a valid token. */
  gameModelContainers: Array<GmContainer>;
  /** Query the function-invocation event log (audit trail) with optional filters and pagination. Useful for debugging functions or showing recent activity. Requires a valid token. */
  gameModelEvents: Array<GmEvent>;
  /** Relay-style cursor-paginated version of `gameModelEvents`: query the function-invocation event log (audit trail) with optional filters. Page forward with `first` (default 50, max 200) and `after` (an opaque cursor from a previous page’s `pageInfo.endCursor`), which replace the legacy `limit`/`offset`. Useful for debugging functions or showing recent activity. Requires a valid token. */
  gameModelEventsConnection: GameModelEventsConnection;
  /** List the feature keys defined for an app. Requires app-admin ('manage_apps'). */
  gameModelFeatures: Array<GmAppFeature>;
  /** Fetch one studio-defined function by name. Requires app-admin ('manage_apps'). */
  gameModelFunction: GmFunction;
  /** List studio-defined functions for an app, optionally filtered to those attached to a container type. Requires app-admin ('manage_apps'). */
  gameModelFunctions: Array<GmFunction>;
  /** Read the app's game-model runtime policy (session creation policy + default participant role). Requires app-admin ('manage_apps'). */
  gameModelPolicy: GmAppPolicy;
  /** List the property definitions for a container type. Requires app-admin ('manage_apps'). */
  gameModelPropertyDefs: Array<GmPropertyDef>;
  /** Fetch one session by id. Requires a valid token. */
  gameModelSession: GmSession;
  /** List sessions in an app, optionally filtered by status. Requires a valid token. */
  gameModelSessions: Array<GmSession>;
  /** List tier -> feature grants for an app, optionally filtered to one tier. Requires app-admin ('manage_apps'). */
  gameModelTierFeatures: Array<GmTierFeature>;
  /** Traverse the container graph from a root container along a relationship type up to a depth, returning the reachable nodes and edges. Requires a valid token. */
  gameModelTraverse: GmTraverseResult;
  /** Fetch a container type's full schema: its property definitions plus the functions available on it. Requires app-admin ('manage_apps'). */
  gameModelTypeSchema: GmTypeSchema;
  /** Fetches one chunk (its base64 voxel grid, per-voxel states, chunk state and LODs) by app id and chunk coordinates. Returns null if the chunk does not exist. Use the input's LOD options to limit which LODs come back. Requires a valid bearer token in the Authorization header; a token scoped to an app may only read that app's chunks. Read-only (no world state is changed). */
  getChunk: Maybe<Chunk>;
  /** Fetches only the requested level-of-detail (LOD) meshes for one chunk, identified by app id and coordinates. Returns null if the chunk does not exist. Cheaper than getChunk when you only need LODs. Requires a valid bearer token; app-scoped tokens are limited to their own app. Read-only. */
  getChunkLods: Maybe<ChunkLodsResponse>;
  /** Returns all chunks for an app within a cubic (Chebyshev-distance) radius of a center chunk, paginated. The cube spans center +/- maxDistance chunks on each axis. Use this for bulk region loads; use getChunk for a single chunk. Requires a valid bearer token; app-scoped tokens are limited to their own app. Read-only. */
  getChunksByDistance: ChunksByDistanceResponse;
  /** Returns all recorded voxel edits (the voxel_updates log) for a single chunk, newest first, as a ChunkVoxelResponse. Use getChunk instead when you want the packed voxel grid rather than the individual edit log. Requires a valid bearer token; app-scoped tokens are limited to their own app. Read-only. */
  getVoxelList: ChunkVoxelResponse;
  /** List every registered GraphQL API server (both management-api and game-api kinds), regardless of health/state. No authentication required. For service discovery; to route clients, prefer activeGraphQLServers (filters to healthy servers). */
  graphqlServers: Array<GraphQlServer>;
  /** List the group/role -> permission-key grants configured on a grid for one group (rows of the `grid_group_grants` input table). These are inputs to the effective ACL, not the materialized result — use `gridUserPermissions` for a specific user's effective keys. Requires app-admin ('manage_apps'). */
  gridGroupGrants: Array<GridGroupGrant>;
  /** Read the permission-key whitelist configured for a grid. An empty list means there is no limit (every active runtime permission may be granted on the grid). Requires app-admin ('manage_apps'). */
  gridPermissionLimits: GridPermissionLimits;
  /** Read one user's effective (materialized) runtime permission keys on a grid — the flattened union of direct and group-derived grants that Buddy enforces, with expired grants excluded. Use this to see what a user can actually do. To inspect the underlying inputs instead, use `gridGroupGrants` (group grants) and `gridPermissionLimits` (the whitelist). Requires app-admin ('manage_apps'). */
  gridUserPermissions: GridUserPermissions;
  /** Lists recorded voxel edits for all chunks within a cubic (Chebyshev) radius of a center chunk, grouped per chunk and ordered by increasing distance, paginated over chunks. Requires a valid bearer token; app-scoped tokens are limited to their own app. Read-only. */
  listVoxelUpdatesByDistance: VoxelUpdatesByDistanceResponse;
  /** Lists recorded voxel edits for a single chunk (optionally only those at/after `since`), newest first. Requires a valid bearer token; app-scoped tokens are limited to their own app. Read-only. */
  listVoxels: Array<Voxel>;
  /** Returns the authenticated user for the bearer game token on this request, or null if the token is missing/invalid. Use this to validate a token and fetch the current player. The token is issued by the Management API login and sent as `Authorization: Bearer <token>` (and, for the udpNotifications WebSocket, in the graphql-transport-ws connection_init payload as `Authorization`). game-api does not issue tokens. */
  me: Maybe<User>;
  /** Lists the roles assigned to a single org member. Requires a valid session token. */
  memberRoles: Array<OrgRole>;
  /** The authenticated caller's own access record for a given app, or null if they have none. Requires authentication. Use this to check whether the current user is entitled to the app and on which tier; inspect status to distinguish active vs revoked. */
  myAppAccess: Maybe<AppUserAccess>;
  /** Apps the authenticated caller can see in their account: those owned by an org they are an active member of, OR those where they hold an active app_user_access grant. Requires authentication. Includes apps of any visibility/status (e.g. drafts the caller can access). Ordered newest-first. */
  myApps: Array<App>;
  /** Lists all avatars owned by the authenticated user, including full `publicState` and `privateState` (the caller is always the owner here). Requires a valid bearer game token; takes no arguments. State blobs are base64-encoded binary. Use `userAvatars` to view another user’s avatars (private state is stripped for non-owners). */
  myAvatars: Array<AvatarDto>;
  /** The caller's channels in an app, with their roles and effective channel permissions (e.g. whether they hold send_messages). Use this to discover which channels the current user can read/post in. */
  myChannels: Array<GroupMembership>;
  /** Lists the authenticated caller's own checkouts (newest first), across every org and app. Use this for a self-service payment history; use `checkouts` for the cross-tenant super-admin view. Requires an authenticated user. */
  myCheckouts: CheckoutsPage;
  /** Lists the authenticated caller's own checkouts (newest first), across every org and app. Use this for a self-service payment history; use `checkoutsConnection` for the cross-tenant super-admin view. Requires an authenticated user. Relay cursor connection; prefer this over the offset-based myCheckouts. */
  myCheckoutsConnection: CheckoutsConnection;
  /**
   * Lifetime donation totals for the authenticated user, summed across every app. Requires a valid game token. NOTE: donations are management-owned, so in cks-game-api this throws ForbiddenException — call cks-management-api instead.
   * @deprecated Legacy donation/property-token data; these products are no longer purchasable. Retained for historical records.
   */
  myDonationData: UserDonationData;
  /** Lists the authenticated caller's organization memberships. Each entry bundles the org, the caller's effective permission keys, and assigned roles. Requires a valid session token. */
  myOrganizations: Array<OrgMembership>;
  /**
   * The authenticated user’s property-token balances (available, in use, total). Requires a valid game token. NOTE: property tokens are management-owned, so in cks-game-api this throws ForbiddenException — call cks-management-api instead.
   * @deprecated Legacy donation/property-token data; these products are no longer purchasable. Retained for historical records.
   */
  myPropertyTokens: UserPropertyTokenData;
  /** The caller's teams in an app, with their roles and effective team permissions. Use this to discover which teams the current user belongs to and what they may do in each. */
  myTeams: Array<GroupMembership>;
  /** List every grid overlapping a chunk-coordinate bounding box, each with the given user's effective permission keys on it. Useful for previewing what a user can do across a region (e.g. around their current position). Requires app-admin ('manage_apps'). */
  nearbyGridPermissions: Array<NearbyGridPermissions>;
  /** Operator only (is_operator). Lists users with is_operator or is_super_admin set, ordered by user id. Read-only. */
  operatorUsers: Array<CpOperatorUser>;
  /** An org's off-session auto-billing configuration (enabled flag, recharge amount, low-water threshold, per-period cap, and last error). Requires the 'view_billing' org permission. */
  orgAutoBilling: OrgAutoBilling;
  /** Full detail for one environment: the environment row plus components, change orders, audit log, secrets, outputs, billing resources, live deploy/destroy progress, and Buddy UDP health. Returns null when no environment with that slug exists for the org. Requires the 'view_environments' org permission. */
  orgEnvironment: Maybe<CksEnvironmentDetail>;
  /** Lists every environment owned by an organization, in any lifecycle state (including destroyed). Summary rows only — use orgEnvironment(slug) for full detail. Requires the 'view_environments' org permission. */
  orgEnvironments: Array<CksEnvironment>;
  /** An org's free shared-app slot quota and how much of it is used. Use before publishAppToShared to know whether the free path applies or a paid planId is needed. Caller must be a member of the org. */
  orgFreeAppQuota: FreeAppQuota;
  /** Lists the members of an organization. Requires the 'manage_members' permission on the org (super admins bypass). */
  orgMembers: Array<OrgMember>;
  /** Lists the org's saved (vaulted) off-session payment methods. Returns metadata only (brand/last4/status), never card numbers. Requires the 'view_billing' org permission. */
  orgPaymentMethods: Array<SavedPaymentMethod>;
  /** The full seed list of permission keys. Used by the UI to render role editors. */
  orgPermissions: Array<OrgPermission>;
  /** Lists all roles defined in an organization. Requires the 'manage_members' permission on the org (super admins bypass). */
  orgRoles: Array<OrgRole>;
  /** Lists an organization's API tokens (metadata only; secret values are never returned here). Requires the 'manage_tokens' permission on the org (super admins bypass). */
  orgTokens: Array<OrgToken>;
  /** Aggregate replication/GraphQL byte totals per environment across the org for the time window. Read-only reporting. Requires the 'view_usage' org permission. */
  orgUsageByEnvironment: Array<EnvironmentUsageRollupRow>;
  /** Fetches an organization by id (BigInt as string). Requires a valid session token. Returns null if no such organization exists. */
  organization: Maybe<Organization>;
  /** Fetches an organization by its unique URL slug. Requires a valid session token. Returns null if not found. Use this when you only have the slug; otherwise prefer organization(id). */
  organizationBySlug: Maybe<Organization>;
  /** Audit log of inbound payment-provider webhook events (used for idempotent reconciliation of checkouts), newest first. Restricted to super admins; requests from non-super-admins are rejected. */
  paymentEvents: PaymentEventsPage;
  /** Audit log of inbound payment-provider webhook events (used for idempotent reconciliation of checkouts), newest first. Restricted to super admins; requests from non-super-admins are rejected. Relay cursor connection; prefer this over the offset-based paymentEvents. */
  paymentEventsConnection: PaymentEventsConnection;
  /** Public platform discovery. Returns the shared game-api URL clients use for shared-environment apps. No auth required. */
  platformConfig: PlatformConfig;
  /** Lists the app-scoped quota rules explicitly configured for an app (excludes org-, tier-, and free-tier-default quotas). Use `effectiveQuota` to resolve the limit actually applied for a given metric. Requires the 'view_usage' app permission. */
  quotasForApp: Array<ServiceQuota>;
  /** Lists the org-scoped quota rules explicitly configured for an organization (excludes app-, tier-, and free-tier-default quotas). Use `effectiveQuota` to resolve the limit actually applied for a given metric. Requires the 'view_usage' org permission. */
  quotasForOrg: Array<ServiceQuota>;
  /** Lists all valid runtime permission keys (e.g. "access", "teleport", "update_voxel_data", "use_voice_chat") that may be assigned to an access tier permissionKeys. PUBLIC: no authentication required. Ordered by the permission bit index. */
  runtimePermissions: Array<Scalars['String']['output']>;
  /** Pick a low-load game server for a native (direct-UDP) client to connect to: returns a random server from the least-loaded ~20% (by client count) of ReadyForClients servers to spread load. Requires a bearer game token; as a side effect it authorizes that token’s P2P session with the chosen Buddy so the native client’s spatial datagrams are accepted. Connect the native client to the returned ip4 and clientPort. Browser clients should instead use the UDP proxy (connectUdpProxy / udpNotifications) and do not need this. */
  serverWithLeastClients: ServerStatus;
  /** Public catalog of paid shared-environment app-slot subscription plans. */
  sharedEnvPlans: Array<SharedEnvPlan>;
  /** Fetch one team by id. Errors if the id is not a team. */
  team: Group;
  /** List the members of a team (including pending requests, each with their status and roles). */
  teamMembers: Array<GroupMember>;
  /** The current team creation/membership policy for an app (who may create teams and the default membership policy of new teams). Falls back to app defaults when unset. */
  teamPolicy: AppGroupPolicy;
  /** List the roles of a team, including the system 'leader' role and the group-management permission keys each role grants. */
  teamRoles: Array<GroupRole>;
  /** List all active teams in an app (not just the caller's). */
  teams: Array<Group>;
  /** UDP proxy session status for the game token on this request. Without a game token, returns connected: false. Does not open a session—use udpNotifications or connectUdpProxy. */
  udpProxyConnectionStatus: UdpProxyConnectionStatus;
  /** Looks up a single user by id. Requires a valid game token. NOTE: the users table is management-owned, so in cks-game-api this throws ForbiddenException directing you to call cks-management-api directly; use that API to read arbitrary users. Use `me` to read the caller’s own profile. */
  user: Maybe<User>;
  /** Reads the authenticated user’s per-app state for `appId` (keyed by appId+userId). Requires a valid game token; only the caller’s own state is returned. Returns null when no row exists. `state` is base64-encoded binary. */
  userAppState: Maybe<UserAppState>;
  /** Lists all per-app state rows for the authenticated user, ordered newest-updated first. Requires a valid game token; only the caller’s own states are returned. `state` blobs are base64-encoded binary. */
  userAppStates: Array<UserAppState>;
  /** Lists the avatars owned by `userId`. Requires a valid game token. Owner-aware: when the caller is NOT the owner, each avatar’s `privateState` is stripped (returned null); `publicState` is always included. State blobs are base64-encoded binary. */
  userAvatars: Array<Avatar>;
  /** Super admin only. Paginated user search across email, gamertag, disambiguation, and exact user_id. Relay cursor connection; prefer this over the offset-based usersPaginated. */
  usersConnection: UsersConnection;
  /** SUPER-ADMIN ONLY paginated user search; replaces the legacy `users`/`usersByGamertag`/`usersByEmail` queries. `query` is ILIKE-prefix matched against email, gamertag, and disambiguation, plus an exact user_id match. Requires a super-admin bearer game token. NOTE: in cks-game-api super-admin checks always fail and the users table is management-owned, so this is effectively served only by cks-management-api. */
  usersPaginated: UsersPage;
  /** Current server version and the minimum client version the server accepts. No authentication required. Compare your client build against minimumClientVersion before connecting and prompt an update if it is too old. */
  versionInfo: ServerVersionInfo;
  /** Returns entries from the immutable voxel edit history (voxel_updates_history) for an app, newest first, optionally filtered by user id and a changed-at time window. Returns up to `limit` entries (DEFAULT 500, max 50000) starting at `offset`. Requires a valid bearer token; app-scoped tokens are limited to their own app. Read-only. */
  voxelUpdateHistory: Array<VoxelUpdateHistoryEvent>;
  /** Relay-style cursor-paginated version of `voxelUpdateHistory`: returns entries from the immutable voxel edit history (voxel_updates_history) for an app, newest first, optionally filtered by user id and a changed-at time window. Page forward with `first` (default 50, max 200) and `after` (an opaque cursor from a previous page’s `pageInfo.endCursor`); the legacy `limit`/`offset` args are ignored on this query. Requires a valid bearer token; app-scoped tokens are limited to their own app. Read-only. */
  voxelUpdateHistoryConnection: VoxelUpdateHistoryConnection;
  /** Returns the organization's wallet, creating an empty zero-balance wallet on first access if one does not yet exist (so it never returns null). Use it to read the current balance and currency before charging usage or topping up. Requires the 'view_billing' org permission. */
  walletBalance: OrgWallet;
  /** Lists the organization's wallet transactions (credits and debits), ordered newest first. Use it to audit how the balance changed over time. Requires the 'view_billing' org permission. */
  walletTransactions: Array<WalletTransaction>;
  /** Lists the organization's wallet transactions (credits and debits), ordered newest first. Use it to audit how the balance changed over time. Requires the 'view_billing' org permission. Relay cursor connection; prefer this over the offset-based walletTransactions. */
  walletTransactionsConnection: WalletTransactionsConnection;
};


export type QueryActorArgs = {
  uuid: Scalars['String']['input'];
};


export type QueryActorsArgs = {
  filter?: InputMaybe<ActorFilterInput>;
};


export type QueryActorsConnectionArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  filter?: InputMaybe<ActorFilterInput>;
  first?: InputMaybe<Scalars['Int']['input']>;
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


export type QueryAppGrantMemberCandidatesArgs = {
  appId: Scalars['BigInt']['input'];
};


export type QueryAppGraphqlOperationsArgs = {
  appId: Scalars['BigInt']['input'];
  limit?: InputMaybe<Scalars['Int']['input']>;
  orgId: Scalars['BigInt']['input'];
  since: Scalars['DateTime']['input'];
};


export type QueryAppRuntimeStateArgs = {
  appId: Scalars['BigInt']['input'];
};


export type QueryAppSharedSubscriptionArgs = {
  appId: Scalars['BigInt']['input'];
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


export type QueryAppUserAccessConnectionArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  appId: Scalars['BigInt']['input'];
  first?: InputMaybe<Scalars['Int']['input']>;
  status?: InputMaybe<Scalars['String']['input']>;
};


export type QueryAppsArgs = {
  filter?: InputMaybe<AppMarketplaceFilterInput>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
};


export type QueryAppsConnectionArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  filter?: InputMaybe<AppMarketplaceFilterInput>;
  first?: InputMaybe<Scalars['Int']['input']>;
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


export type QueryCheckoutsConnectionArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  filter?: InputMaybe<CheckoutFilterInput>;
  first?: InputMaybe<Scalars['Int']['input']>;
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


export type QueryEnvironmentForwardVersionsArgs = {
  orgId: Scalars['BigInt']['input'];
  slug: Scalars['String']['input'];
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


export type QueryGameModelContainerArgs = {
  appId: Scalars['BigInt']['input'];
  containerId: Scalars['String']['input'];
};


export type QueryGameModelContainerStateArgs = {
  appId: Scalars['BigInt']['input'];
  containerId: Scalars['String']['input'];
};


export type QueryGameModelContainerTypesArgs = {
  appId: Scalars['BigInt']['input'];
};


export type QueryGameModelContainersArgs = {
  appId: Scalars['BigInt']['input'];
  sessionId?: InputMaybe<Scalars['String']['input']>;
  typeName?: InputMaybe<Scalars['String']['input']>;
};


export type QueryGameModelEventsArgs = {
  appId: Scalars['BigInt']['input'];
  functionName?: InputMaybe<Scalars['String']['input']>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  selfContainerId?: InputMaybe<Scalars['String']['input']>;
  sessionId?: InputMaybe<Scalars['String']['input']>;
  success?: InputMaybe<Scalars['Boolean']['input']>;
};


export type QueryGameModelEventsConnectionArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  appId: Scalars['BigInt']['input'];
  first?: InputMaybe<Scalars['Int']['input']>;
  functionName?: InputMaybe<Scalars['String']['input']>;
  selfContainerId?: InputMaybe<Scalars['String']['input']>;
  sessionId?: InputMaybe<Scalars['String']['input']>;
  success?: InputMaybe<Scalars['Boolean']['input']>;
};


export type QueryGameModelFeaturesArgs = {
  appId: Scalars['BigInt']['input'];
};


export type QueryGameModelFunctionArgs = {
  appId: Scalars['BigInt']['input'];
  name: Scalars['String']['input'];
};


export type QueryGameModelFunctionsArgs = {
  appId: Scalars['BigInt']['input'];
  containerTypeName?: InputMaybe<Scalars['String']['input']>;
};


export type QueryGameModelPolicyArgs = {
  appId: Scalars['BigInt']['input'];
};


export type QueryGameModelPropertyDefsArgs = {
  appId: Scalars['BigInt']['input'];
  typeName: Scalars['String']['input'];
};


export type QueryGameModelSessionArgs = {
  appId: Scalars['BigInt']['input'];
  sessionId: Scalars['String']['input'];
};


export type QueryGameModelSessionsArgs = {
  appId: Scalars['BigInt']['input'];
  status?: InputMaybe<Scalars['String']['input']>;
};


export type QueryGameModelTierFeaturesArgs = {
  appId: Scalars['BigInt']['input'];
  tierId?: InputMaybe<Scalars['BigInt']['input']>;
};


export type QueryGameModelTraverseArgs = {
  appId: Scalars['BigInt']['input'];
  depth?: InputMaybe<Scalars['Int']['input']>;
  relationshipType: Scalars['String']['input'];
  rootId: Scalars['String']['input'];
};


export type QueryGameModelTypeSchemaArgs = {
  appId: Scalars['BigInt']['input'];
  typeName: Scalars['String']['input'];
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


export type QueryMyCheckoutsConnectionArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
};


export type QueryMyTeamsArgs = {
  appId: Scalars['BigInt']['input'];
};


export type QueryNearbyGridPermissionsArgs = {
  input: NearbyGridPermissionsInput;
};


export type QueryOrgAutoBillingArgs = {
  orgId: Scalars['BigInt']['input'];
};


export type QueryOrgEnvironmentArgs = {
  orgId: Scalars['BigInt']['input'];
  slug: Scalars['String']['input'];
};


export type QueryOrgEnvironmentsArgs = {
  orgId: Scalars['BigInt']['input'];
};


export type QueryOrgFreeAppQuotaArgs = {
  orgId: Scalars['BigInt']['input'];
};


export type QueryOrgMembersArgs = {
  orgId: Scalars['BigInt']['input'];
};


export type QueryOrgPaymentMethodsArgs = {
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


export type QueryPaymentEventsConnectionArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
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


export type QueryUsersConnectionArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  query?: InputMaybe<Scalars['String']['input']>;
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


export type QueryVoxelUpdateHistoryConnectionArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  appId: Scalars['BigInt']['input'];
  first?: InputMaybe<Scalars['Int']['input']>;
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


export type QueryWalletTransactionsConnectionArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  orgId: Scalars['BigInt']['input'];
};

/** Realtime lifecycle/error event delivered on the udpNotifications subscription when a session cannot be opened or correctly scoped. It is a control frame — it carries no appId, so it is never dropped by the per-app fan-out filter — and it is terminal: the subscription completes immediately after emitting it, so the client must fix the cause and resubscribe. Branch on `code`; use `retryable` to decide whether retrying can succeed. A healthy subscription never emits this type; it yields game-server notifications/responses instead. */
export type RealtimeConnectionEvent = {
  __typename?: 'RealtimeConnectionEvent';
  /** Machine-readable failure reason. Branch on this (not on `message`). Known values: AUTH_REQUIRED — no valid bearer game token was presented on the WS connection_init / request; authenticate via the Management API and resubscribe (not retryable as-is). APP_ID_REQUIRED — the subscription was opened without an appId scope; udpNotifications must be app-scoped (game tokens are app-agnostic and one socket is shared across apps), so pass the app you are playing and resubscribe (not retryable as-is). UDP_PROXY_CONNECTION_FAILED — the proxy could not open or keep a UDP socket to the selected game server (transient/infrastructure); back off and resubscribe (retryable). `message` carries the specific underlying detail for this case. */
  code: Scalars['String']['output'];
  /** Human-readable explanation of the failure, suitable for logs and developer-facing surfaces. Do not parse or branch on this text — branch on `code` instead. */
  message: Scalars['String']['output'];
  /** Whether resubscribing without changing anything may succeed. true for transient failures (e.g. UDP_PROXY_CONNECTION_FAILED) — back off and retry. false for caller errors that must be fixed first (AUTH_REQUIRED needs a fresh/valid game token; APP_ID_REQUIRED needs an appId-scoped subscription). */
  retryable: Scalars['Boolean']['output'];
  /** Lifecycle status of the session attempt. Currently always "failed" — this event is only emitted when udpNotifications could not establish (or had to tear down) the underlying UDP proxy session. */
  status: Scalars['String']['output'];
};

/** How redeployEnvironment rolls out a new version. Omit for automatic routing (services-only when active runtime VMs exist, otherwise full). */
export enum RedeployDeployMode {
  /** Replace the runtime VMs (reprovision game-api / Buddy instances). Slower; use when the box image or infra must change. */
  Full = 'FULL',
  /** Update services in place on the existing runtime VMs (no VM replacement). Faster; only valid when active runtime VMs exist. */
  Services = 'SERVICES'
}

export type RedeployEnvironmentInput = {
  /** How to roll out the version. When omitted, routes to services-only when active runtime VMs exist, otherwise full. */
  deployMode?: InputMaybe<RedeployDeployMode>;
  orgId: Scalars['BigInt']['input'];
  slug: Scalars['String']['input'];
  /** Target environment version. When omitted, redeploys to the latest available version for the class. Must be available, deployable by this class, and not older than the current version (forward-only — no rollback). */
  version?: InputMaybe<Scalars['String']['input']>;
};

export type RegisterUserInput = {
  /** Email for the new account; the confirmation email is sent here. */
  email: Scalars['String']['input'];
  /** Optional initial public gamertag (min 3 characters). Can be set later via updateGamertag. */
  gamertag?: InputMaybe<Scalars['String']['input']>;
  /** Password for the new account (min 8 characters). */
  password: Scalars['String']['input'];
};

export type ResetPasswordInput = {
  /** New password to set (min 8 characters). */
  newPassword: Scalars['String']['input'];
  /** Password-reset token from the emailed reset link. */
  token: Scalars['String']['input'];
};

export type RestartEnvironmentServicesInput = {
  /** Organization id (BigInt) that owns the environment. */
  orgId: Scalars['BigInt']['input'];
  /** Slug of the environment whose Buddy service should be SSH-restarted. */
  slug: Scalars['String']['input'];
};

export type ResumeEnvironmentInput = {
  /** Organization id (BigInt) that owns the environment. */
  orgId: Scalars['BigInt']['input'];
  /** Slug of the suspended/grace environment to resume (billingStatus must be grace, suspension_queued, suspended, or resume_failed). */
  slug: Scalars['String']['input'];
};

/** Revoke a user's direct grants on a grid (deletes from the grid_user_direct_grants input table). */
export type RevokeGridPermissionsInput = {
  /** The app (tenant) that owns the grid. */
  appId: Scalars['BigInt']['input'];
  /** The grid to revoke on. */
  gridId: Scalars['BigInt']['input'];
  /** Optional idempotency key. Recommended for retries: replaying with the same key and identical input returns the first result instead of re-applying; the same key with different input returns IDEMPOTENCY_CONFLICT. Keys expire after 24h. */
  idempotencyKey?: InputMaybe<Scalars['String']['input']>;
  /** Optional subset of permission key strings to revoke. Omit to revoke ALL of the user's direct grants on this grid. Each key must be a known runtime permission key, unique, and at most 64 chars. */
  permissionKeys?: InputMaybe<Array<Scalars['String']['input']>>;
  /** The user whose direct grants to revoke. */
  userId: Scalars['BigInt']['input'];
};

/** Revoke a group's (optionally one role's) grants on a grid (deletes from the grid_group_grants input table). */
export type RevokeGroupFromGridInput = {
  /** The app (tenant) that owns the grid. */
  appId: Scalars['BigInt']['input'];
  /** The grid to revoke on. */
  gridId: Scalars['BigInt']['input'];
  /** The group whose grants to revoke. */
  groupId: Scalars['BigInt']['input'];
  /** Optional role to target. Must match the role the grant was created with (omit to target the group-wide grant, i.e. the grant with no role). */
  groupRoleId?: InputMaybe<Scalars['BigInt']['input']>;
  /** Optional subset of keys to revoke. Omit to revoke all of the group/role grants on this grid. */
  permissionKeys?: InputMaybe<Array<Scalars['String']['input']>>;
};

/** Per-voxel outcome of a rollbackVoxelUpdates call. In dry-run mode this describes what WOULD happen; otherwise it reports what was applied. One result is returned per affected voxel. */
export type RollbackVoxelEventResult = {
  __typename?: 'RollbackVoxelEventResult';
  /** Id of the app this result belongs to (decimal string). */
  appId: Scalars['BigInt']['output'];
  /** True if the change was actually written; false in dry-run mode or when the voxel was skipped. */
  applied: Scalars['Boolean']['output'];
  /** Address of the chunk that contains the affected voxel. */
  coordinates: ChunkCoordinates;
  /** Voxel type immediately before the rollback (the current value), or null. */
  fromVoxelType: Maybe<Scalars['Int']['output']>;
  /** Local position of the affected voxel within its chunk. */
  location: VoxelCoordinates;
  /** The action computed for this voxel by the rollback (the revert operation to perform). */
  plannedAction: Scalars['String']['output'];
  /** Human-readable explanation when a voxel is skipped or an action is taken, or null. */
  reason: Maybe<Scalars['String']['output']>;
  /** Voxel type the voxel would be / was reverted to, or null. */
  toVoxelType: Maybe<Scalars['Int']['output']>;
};

/** Payload for rollbackVoxelUpdates: selects the voxel edits made by one user in one app within a time window to revert. */
export type RollbackVoxelUpdatesInput = {
  /** Id of the app whose voxels to roll back (decimal string). */
  appId: Scalars['BigInt']['input'];
  /** When true (the DEFAULT), only computes and returns the planned reversions WITHOUT writing anything; set false to actually apply the rollback (DESTRUCTIVE — mutates world state). */
  dryRun?: Scalars['Boolean']['input'];
  /** Inclusive start of the time window of edits to revert. */
  from: Scalars['DateTime']['input'];
  /** Optional idempotency key. Recommended for retries: replaying with the same key and identical input returns the first result instead of re-applying; the same key with different input returns IDEMPOTENCY_CONFLICT. Keys expire after 24h. */
  idempotencyKey?: InputMaybe<Scalars['String']['input']>;
  /** Inclusive end of the time window of edits to revert. */
  to: Scalars['DateTime']['input'];
  /** Id of the user (decimal string) whose edits within the window will be reverted. */
  userId: Scalars['BigInt']['input'];
};

/** A saved (vaulted) off-session payment method. */
export type SavedPaymentMethod = {
  __typename?: 'SavedPaymentMethod';
  /** Card brand, e.g. 'visa'. Null for non-card methods. */
  brand: Maybe<Scalars['String']['output']>;
  /** True when this is the org default method charged off-session. */
  isDefault: Scalars['Boolean']['output'];
  /** Last 4 digits of the card, if applicable. */
  last4: Maybe<Scalars['String']['output']>;
  /** Payment method id (BigInt). */
  paymentMethodId: Scalars['BigInt']['output'];
  /** Payment provider, e.g. 'stripe'. */
  provider: Scalars['String']['output'];
  /** Method status, e.g. 'active' or 'expired'. */
  status: Scalars['String']['output'];
};

/** A container (instance) to create as part of a seed. */
export type SeedContainerInput = {
  /** Optional description. */
  description?: InputMaybe<Scalars['String']['input']>;
  /** Human-friendly display name. */
  displayName: Scalars['String']['input'];
  /** JSON object of metadata. */
  metadataJson?: InputMaybe<Scalars['String']['input']>;
  /** Optional owning user id. */
  ownerUserId?: InputMaybe<Scalars['BigInt']['input']>;
  /** Initial property values for the container. */
  properties?: InputMaybe<Array<SeedPropertyInput>>;
  /** Developer-assigned id used only for edge references in this seed. */
  tempId: Scalars['String']['input'];
  /** The container type to instantiate. */
  typeName: Scalars['String']['input'];
};

/** A container type to create as part of a seed. */
export type SeedContainerTypeInput = {
  /** public | owner | hidden default for this type's properties. */
  defaultPropertyVisibility?: InputMaybe<Scalars['String']['input']>;
  /** Optional description of the type. */
  description?: InputMaybe<Scalars['String']['input']>;
  /** Human-friendly display name. */
  displayName: Scalars['String']['input'];
  /** admin | member | owner (who may instantiate this type). */
  instantiableBy?: InputMaybe<Scalars['String']['input']>;
  /** JSON object of metadata. */
  metadataJson?: InputMaybe<Scalars['String']['input']>;
  /** Stable type name (unique per app). */
  typeName: Scalars['String']['input'];
};

/** An edge to create between two seeded containers (by temp id). */
export type SeedEdgeInput = {
  /** Source container temp_id (from this seed). */
  fromTempId: Scalars['String']['input'];
  /** JSON object of edge metadata. */
  metadataJson?: InputMaybe<Scalars['String']['input']>;
  /** The relationship type label. */
  relationshipType: Scalars['String']['input'];
  /** Target container temp_id (from this seed). */
  toTempId: Scalars['String']['input'];
  /** Optional edge weight. */
  weight?: InputMaybe<Scalars['Float']['input']>;
};

/** A function to create as part of a seed. */
export type SeedFunctionInput = {
  /** Optional container type to bind to (omit for a global function). */
  containerTypeName?: InputMaybe<Scalars['String']['input']>;
  /** Optional description of the function. */
  description?: InputMaybe<Scalars['String']['input']>;
  /** JSON-encoded invoke-policy rule tree (authority requirements). */
  invokePolicyJson?: InputMaybe<Scalars['String']['input']>;
  /** player | server | internal */
  invokeScope?: InputMaybe<Scalars['String']['input']>;
  /** The property writes the function performs. */
  mutations?: InputMaybe<Array<FunctionMutationInput>>;
  /** Function name (unique per app). */
  name: Scalars['String']['input'];
  /** Typed parameters the function accepts. */
  parameters?: InputMaybe<Array<FunctionParamInput>>;
  /** Optional expression whose value becomes the invoke result. */
  returnExpression?: InputMaybe<Scalars['String']['input']>;
  /** Optional declared return value type. */
  returnType?: InputMaybe<Scalars['String']['input']>;
};

/** Bulk-create game-model definitions and optional instances in one transaction (model init/import). */
export type SeedGameModelInput = {
  /** The app (tenant) to seed into. */
  appId: Scalars['BigInt']['input'];
  /** Container types to create. */
  containerTypes?: InputMaybe<Array<SeedContainerTypeInput>>;
  /** Containers (instances) to create. */
  containers?: InputMaybe<Array<SeedContainerInput>>;
  /** Edges to create between seeded containers. */
  edges?: InputMaybe<Array<SeedEdgeInput>>;
  /** Functions to create. */
  functions?: InputMaybe<Array<SeedFunctionInput>>;
  /** Property definitions to create. */
  propertyDefinitions?: InputMaybe<Array<SeedPropertyDefInput>>;
  /** Optional session to seed instances into (NULL = app-global). */
  sessionId?: InputMaybe<Scalars['String']['input']>;
};

/** A property definition to create as part of a seed. */
export type SeedPropertyDefInput = {
  /** The container type to define the property on. */
  containerTypeName: Scalars['String']['input'];
  /** JSON-encoded default value. */
  defaultValueJson?: InputMaybe<Scalars['String']['input']>;
  /** Optional description of the property. */
  description?: InputMaybe<Scalars['String']['input']>;
  /** Property key (unique within the type). */
  key: Scalars['String']['input'];
  /** int | float | string | bool | array | object | container_ref */
  valueType: Scalars['String']['input'];
  /** public | owner | hidden */
  visibility?: InputMaybe<Scalars['String']['input']>;
  /** function | owner | admin */
  writable?: InputMaybe<Scalars['String']['input']>;
};

/** An initial property value for a seeded container. */
export type SeedPropertyInput = {
  /** Property key. */
  key: Scalars['String']['input'];
  /** JSON-encoded value. */
  valueJson: Scalars['String']['input'];
  /** Value type of the value being set. */
  valueType: Scalars['String']['input'];
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

/** Lifecycle state of a game/GraphQL server in the fleet. Only ReadyForClients servers should receive new client connections; serverWithLeastClients and activeGraphQLServers already filter to healthy servers. */
export enum ServerState {
  /** Not running or unreachable (e.g. crashed or missed heartbeats). */
  Offline = 'Offline',
  /** Healthy and accepting client traffic. The only state safe to route to. */
  ReadyForClients = 'ReadyForClients',
  /** Booting / not yet ready: registered but still initializing; do not route client traffic here. */
  Starting = 'Starting',
  /** Draining / shutting down: finishing in-flight work; do not send new traffic. */
  Stopping = 'Stopping'
}

/** Live status and load/telemetry for one UDP game server (Buddy) in the fleet. Returned by serverWithLeastClients (which picks a low-load ReadyForClients server). Throughput metrics are per-second samples from the last reporting window and are null until first reported. */
export type ServerStatus = {
  __typename?: 'ServerStatus';
  /** UDP port that native clients send spatial datagrams to (typically 9091). Browser clients do not use this directly — they reach the server through the UDP proxy / udpNotifications. */
  clientPort: Scalars['Int']['output'];
  /** Bytes per second received from clients in the last reporting window. Null until reported. */
  clientRecvBytesPerSec: Maybe<Scalars['Float']['output']>;
  /** Messages per second received from clients in the last reporting window. Null until reported. */
  clientRecvMsgsPerSec: Maybe<Scalars['Float']['output']>;
  /** Bytes per second sent to clients in the last reporting window. Null until reported. */
  clientSendBytesPerSec: Maybe<Scalars['Float']['output']>;
  /** Per-second rate of individually-addressed (single-actor) messages sent to clients in the last window, as opposed to spatial fan-out. Null until reported. */
  clientSendIndividualMsgsPerSec: Maybe<Scalars['Float']['output']>;
  /** Messages per second sent to clients in the last reporting window. Null until reported. */
  clientSendMsgsPerSec: Maybe<Scalars['Float']['output']>;
  /** Number of game clients currently connected to this server. serverWithLeastClients uses this to balance load across the fleet. */
  clients: Scalars['Int']['output'];
  /** Peak CPU utilization percentage (0-100) observed in the last reporting window. Null until reported. */
  cpuPeakPct: Maybe<Scalars['Float']['output']>;
  /** When this server was first registered in the fleet. */
  createdAt: Scalars['DateTime']['output'];
  /** IPv4 address native clients send spatial UDP datagrams to (paired with clientPort). Preferred over ip6 for inter-host UDP in current deployments. */
  ip4: Scalars['String']['output'];
  /** IPv6 address of the UDP game server. Global IPv6 between hosts can be unroutable in some deployments, so native clients generally use ip4 + clientPort. */
  ip6: Scalars['String']['output'];
  /** Bytes per second received from peer servers (server-to-server P2P) in the last reporting window. Null until reported. */
  peerRecvBytesPerSec: Maybe<Scalars['Float']['output']>;
  /** Messages per second received from peer servers (server-to-server P2P) in the last reporting window. Null until reported. */
  peerRecvMsgsPerSec: Maybe<Scalars['Float']['output']>;
  /** Bytes per second sent to peer servers (server-to-server P2P) in the last reporting window. Null until reported. */
  peerSendBytesPerSec: Maybe<Scalars['Float']['output']>;
  /** Messages per second sent to peer servers (server-to-server P2P) in the last reporting window. Null until reported. */
  peerSendMsgsPerSec: Maybe<Scalars['Float']['output']>;
  /** Number of peer (server-to-server P2P) connections this server currently holds. */
  peers: Scalars['Int']['output'];
  /** Unique id of this game-server row in the fleet registry. */
  serverId: Scalars['ID']['output'];
  /** Current lifecycle state of this server (see ServerState). Only ReadyForClients servers accept new clients. */
  status: ServerState;
  /** When this status row was last updated (server heartbeat). Use to judge how fresh the metrics/state are. */
  updatedAt: Scalars['DateTime']['output'];
};

/** Server version plus the minimum client version the server will accept. A client whose build is older than minimumClientVersion should prompt the user to update before connecting. */
export type ServerVersionInfo = {
  __typename?: 'ServerVersionInfo';
  /** Minimum accepted client version */
  minimumClientVersion: VersionInfo;
  /** Current server version */
  serverVersion: VersionInfo;
};

export type ServiceQuota = {
  __typename?: 'ServiceQuota';
  /** What happens when the limit is exceeded. Free-form string; defaults to "throttle" (typical values: "throttle" to rate-limit, "block" to reject). */
  actionOnExceed: Scalars['String']['output'];
  /** App this rule is scoped to (BigInt as a decimal string); null if not app-scoped. */
  appId: Maybe<Scalars['BigInt']['output']>;
  /** When the rule was created (ISO-8601 UTC timestamp). */
  createdAt: Scalars['DateTime']['output'];
  /** Maximum allowed amount of the metric per `period`, as a BigInt decimal string. */
  limitValue: Scalars['BigInt']['output'];
  /** The metered resource this rule limits (e.g. "api_requests", "storage_bytes"). Free-form metric key, matched exactly. */
  metric: Scalars['String']['output'];
  /** Organization this rule is scoped to (BigInt as a decimal string); null if not org-scoped. */
  orgId: Maybe<Scalars['BigInt']['output']>;
  /** Time window the limit applies over. Free-form string; defaults to "per_minute" (typical values: "per_minute", "per_hour", "per_day"). */
  period: Scalars['String']['output'];
  /** Unique quota rule id (BigInt as a decimal string). */
  quotaId: Scalars['BigInt']['output'];
  /** Access tier this rule is scoped to (BigInt as a decimal string); null if not tier-scoped. */
  tierId: Maybe<Scalars['BigInt']['output']>;
  /** When the rule was last updated (ISO-8601 UTC timestamp). */
  updatedAt: Scalars['DateTime']['output'];
};

/** Set the per-app channel creation/membership policy (app-admin only). */
export type SetChannelPolicyInput = {
  /** The app (tenant) whose channel policy to set. */
  appId: Scalars['BigInt']['input'];
  /** admin | member | anyone. Who may create channels in this app. */
  creationPolicy?: InputMaybe<Scalars['String']['input']>;
  /** open | request | invite | admin. Default membership policy for new channels. */
  defaultMembershipPolicy?: InputMaybe<Scalars['String']['input']>;
  /** Optional cap on how many channels a single user may belong to (null = unlimited). */
  maxGroupsPerUser?: InputMaybe<Scalars['Int']['input']>;
  /** Optional cap on members per channel (null = unlimited). */
  maxMembers?: InputMaybe<Scalars['Int']['input']>;
};

/** Set one property value on a container directly. */
export type SetContainerPropertyInput = {
  /** The app (tenant) that owns the container. */
  appId: Scalars['BigInt']['input'];
  /** The container id to write to. */
  containerId: Scalars['String']['input'];
  /** The property key to write. */
  key: Scalars['String']['input'];
  /** JSON-encoded value. */
  valueJson: Scalars['String']['input'];
  /** The value type being written (must match the property definition). */
  valueType: Scalars['String']['input'];
};

/** Set the app's game-model runtime policy. */
export type SetGameModelPolicyInput = {
  /** The app (tenant) whose policy to set. */
  appId: Scalars['BigInt']['input'];
  /** Default role assigned to new session participants. */
  defaultParticipantRole?: InputMaybe<Scalars['String']['input']>;
  /** admin | member | anyone */
  sessionCreationPolicy?: InputMaybe<Scalars['String']['input']>;
};

/** Set the per-grid permission-key whitelist (writes the grid_permission_limits input table). */
export type SetGridPermissionLimitsInput = {
  /** The app (tenant) that owns the grid. */
  appId: Scalars['BigInt']['input'];
  /** The grid whose whitelist to set. */
  gridId: Scalars['BigInt']['input'];
  /** The whitelist of permission keys allowed on this grid. Empty array removes all limits (every active grid permission becomes grantable again). Each key must be a known runtime permission key, unique, and at most 64 chars. */
  permissionKeys: Array<Scalars['String']['input']>;
};

/** Replace a member's roles in a group (the listed roles become their full set). */
export type SetMemberRolesInput = {
  /** The group (team/channel) id. */
  groupId: Scalars['BigInt']['input'];
  /** The complete set of group role ids the member should have. Roles not listed are removed; unknown ids or ids from other groups are ignored. */
  roleIds: Array<Scalars['BigInt']['input']>;
  /** The member (user) whose roles to set. */
  userId: Scalars['BigInt']['input'];
};

export type SetQuotaInput = {
  /** What to do when the limit is exceeded. Optional; defaults to "throttle" (typical values: "throttle" to rate-limit, "block" to reject). */
  actionOnExceed?: InputMaybe<Scalars['String']['input']>;
  /** Scope the rule to this app (BigInt as a decimal string). */
  appId?: InputMaybe<Scalars['BigInt']['input']>;
  /** Optional idempotency key. Recommended for retries: replaying with the same key and identical input returns the first result instead of re-applying; the same key with different input returns IDEMPOTENCY_CONFLICT. Keys expire after 24h. */
  idempotencyKey?: InputMaybe<Scalars['String']['input']>;
  /** Maximum allowed amount of the metric per `period`, as a BigInt decimal string. */
  limitValue: Scalars['BigInt']['input'];
  /** The metered resource key to limit (max 64 characters), e.g. "api_requests". */
  metric: Scalars['String']['input'];
  /** Scope the rule to this organization (BigInt as a decimal string). Provide one of orgId/appId/tierId to choose the scope; omit all three for a global (super-admin) rule. */
  orgId?: InputMaybe<Scalars['BigInt']['input']>;
  /** Time window the limit applies over. Optional; defaults to "per_minute" (typical values: "per_minute", "per_hour", "per_day"). Part of the upsert key, so different periods create separate rules. */
  period?: InputMaybe<Scalars['String']['input']>;
  /** Scope the rule to this access tier (BigInt as a decimal string). */
  tierId?: InputMaybe<Scalars['BigInt']['input']>;
};

/** Set or clear the current-turn user of a session. */
export type SetSessionTurnInput = {
  /** The app (tenant) that owns the session. */
  appId: Scalars['BigInt']['input'];
  /** The session id to update. */
  sessionId: Scalars['String']['input'];
  /** The user whose turn it now is (NULL clears the turn). */
  userId?: InputMaybe<Scalars['BigInt']['input']>;
};

/** Set the per-app team creation/membership policy (app-admin only). */
export type SetTeamPolicyInput = {
  /** The app (tenant) whose team policy to set. */
  appId: Scalars['BigInt']['input'];
  /** admin | member | anyone. Who may create teams in this app. */
  creationPolicy?: InputMaybe<Scalars['String']['input']>;
  /** open | request | invite | admin. Default membership policy for new teams. */
  defaultMembershipPolicy?: InputMaybe<Scalars['String']['input']>;
  /** Optional cap on how many teams a single user may belong to (null = unlimited). */
  maxGroupsPerUser?: InputMaybe<Scalars['Int']['input']>;
  /** Optional cap on members per team (null = unlimited). */
  maxMembers?: InputMaybe<Scalars['Int']['input']>;
};

/** A paid shared-environment app-slot subscription plan. Pass planId to publishAppToShared to subscribe. */
export type SharedEnvPlan = {
  __typename?: 'SharedEnvPlan';
  /** Billing cadence, e.g. 'month' or 'year'. */
  billingInterval: Scalars['String']['output'];
  /** Stable machine-readable plan code. */
  code: Scalars['String']['output'];
  /** ISO-4217 currency for priceCents, e.g. 'USD'. */
  currency: Scalars['String']['output'];
  description: Maybe<Scalars['String']['output']>;
  /** Human-readable plan name. */
  name: Scalars['String']['output'];
  /** Plan id (BigInt). */
  planId: Scalars['BigInt']['output'];
  /** Recurring price per billing interval, in cents. */
  priceCents: Scalars['BigInt']['output'];
  /** Plan status, e.g. 'active' (offered) or 'archived'. */
  status: Scalars['String']['output'];
};

/** Input for sending an actor-to-actor message: a message delivered only to the single actor identified by targetUuid. It is spatially routed (the sender must know the destination actor’s chunk), but unlike normal spatial messages it is NOT broadcast to other nearby actors and has no distance/decay. */
export type SingleActorMessageInput = {
  /** The ID of the app the destination actor belongs to. */
  appId: Scalars['BigInt']['input'];
  /** The chunk coordinates of the DESTINATION actor (where the target currently is). The sender must know this. */
  chunk: ChunkCoordinatesInput;
  /** The message payload, base64-encoded. Opaque to the server; the sender’s identity (if needed) must be embedded here by the application. */
  payload: Scalars['String']['input'];
  /** Client-assigned correlation id for this datagram: a uint8 (0-255) that wraps at gameClientBootstrap.sequenceNumberModulo (256); defaults to 0 if omitted. For CORRELATION ONLY — it is NOT an idempotency key and the server does not dedupe replays. Echoed on any GenericErrorResponse for this send, delivered on the udpNotifications subscription. */
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
  /** Realtime downlink from the game server: spatial notifications and responses, GenericErrorResponse (errors from your sends, correlated by sequenceNumber), and RealtimeConnectionEvent (lifecycle/setup failures). Requires a bearer game token AND an appId-scoped connection — the appId is read from the graphql-transport-ws connection (game tokens are app-agnostic and one UDP socket is shared across apps, so an app-agnostic subscription is rejected with a RealtimeConnectionEvent code APP_ID_REQUIRED, and a missing/invalid token with AUTH_REQUIRED). On subscribe, opens a UDP proxy session if none exists (binds to the least-loaded game server); open/transport failures are delivered as RealtimeConnectionEvent (code UDP_PROXY_CONNECTION_FAILED) and then the stream ends. Only this app’s spatial fan-out is delivered; appId-less control frames always pass. Subscribe before/while sending so async results are not missed. Unsubscribing stops delivery only — it does NOT close the UDP session; call disconnectUdpProxy (or rely on the server inactivity timeout) to release it. */
  udpNotifications: Maybe<UdpNotification>;
};

export type TeleportRequestInput = {
  /** App (game) to teleport within. Must be greater than 0 (a non-positive value yields errorCode INVALID_APP_ID). BigInt sent as a decimal string. */
  appId: Scalars['BigInt']['input'];
  /** Destination chunk-grid coordinates (x, y, z as int64 BigInt decimal strings). The reserved sentinel (-6, -6, -6) is rejected as UNAUTHORIZED. */
  chunkAddress: ChunkCoordinatesInput;
  /** Actor being teleported: exactly 32 ASCII characters (the UDP-wire actor id), NOT a hyphenated RFC-4122 UUID. */
  uuid: Scalars['String']['input'];
  /** Destination voxel coordinates within the chunk (x, y, z as signed 16-bit ints, -32768..32767). */
  voxelAddress: VoxelCoordinatesInput;
};

export type TeleportResponse = {
  __typename?: 'TeleportResponse';
  /** ErrorType enum: NO_ERROR on success; INVALID_APP_ID for a non-positive appId; UNAUTHORIZED when the destination is the reserved sentinel (-6,-6,-6) or the user lacks the app "teleport" runtime permission. */
  errorCode: UdpErrorCode;
  /** True when the teleport is authorized/accepted; false otherwise (inspect errorCode for the reason). */
  success: Scalars['Boolean']['output'];
};

/** Error codes returned by UDP game servers (and surfaced on `GenericErrorResponse.errorCode`) in response to a spatial/realtime message. NO_ERROR (0) indicates success; every other value indicates a failure. The numeric value is the byte sent on the wire; GraphQL exposes the name. Note: a failed message does not always produce an error — some auth failures are dropped silently (see the docs). */
export enum UdpErrorCode {
  /** No app matches the supplied appId. */
  AppNotFound = 'APP_NOT_FOUND',
  /** The app exists but is not currently loaded/active on this server. */
  AppNotLoaded = 'APP_NOT_LOADED',
  /** The password did not match (login validation). */
  BadPassword = 'BAD_PASSWORD',
  /** No chunk exists at the referenced coordinates. */
  ChunkNotFound = 'CHUNK_NOT_FOUND',
  /** Registration failed because the email is already in use. */
  EmailAlreadyExists = 'EMAIL_ALREADY_EXISTS',
  /** Email failed format validation. */
  EmailInvalid = 'EMAIL_INVALID',
  /** No account matches the supplied email (login validation). */
  EmailNotFound = 'EMAIL_NOT_FOUND',
  /** Email failed maximum-length validation. */
  EmailTooLong = 'EMAIL_TOO_LONG',
  /** Email failed minimum-length validation. */
  EmailTooShort = 'EMAIL_TOO_SHORT',
  /** The requested gamertag is already taken. */
  GamertagAlreadyExists = 'GAMERTAG_ALREADY_EXISTS',
  /** The game token is not the expected length. Use the exact token returned by login (do not trim or re-encode it). */
  GameTokenWrongSize = 'GAME_TOKEN_WRONG_SIZE',
  /** A grid already exists at these coordinates. */
  GridAlreadyExists = 'GRID_ALREADY_EXISTS',
  /** The target coordinates fall outside any grid assigned to the caller. */
  GridOutsideAssignment = 'GRID_OUTSIDE_ASSIGNMENT',
  /** The requested grid overlaps an existing grid. */
  GridOverlapsExisting = 'GRID_OVERLAPS_EXISTING',
  /** The appId was missing, zero, or not a valid value. */
  InvalidAppId = 'INVALID_APP_ID',
  /** The grid coordinates were invalid. */
  InvalidGridCoordinates = 'INVALID_GRID_COORDINATES',
  /** The message was malformed or failed validation. Check the byte layout. */
  InvalidRequest = 'INVALID_REQUEST',
  /** The state/payload bytes were invalid for this message type. */
  InvalidStateData = 'INVALID_STATE_DATA',
  /** The game token was rejected (expired, malformed, or revoked). Re-authenticate against the Management API to obtain a fresh token. */
  InvalidToken = 'INVALID_TOKEN',
  /** The supplied token was not a valid length. */
  InvalidTokenLength = 'INVALID_TOKEN_LENGTH',
  /** A supplied name exceeded the maximum length. */
  NameTooLong = 'NAME_TOO_LONG',
  /** No error (0). The message was accepted. */
  NoError = 'NO_ERROR',
  /** No grid assignment covers the referenced coordinates. */
  NoMatchingGridAssignment = 'NO_MATCHING_GRID_ASSIGNMENT',
  /** Password failed maximum-length validation. */
  PasswordTooLong = 'PASSWORD_TOO_LONG',
  /** Password failed minimum-length validation. */
  PasswordTooShort = 'PASSWORD_TOO_SHORT',
  /** The caller lacks the runtime/grid permission required for this action. Grid permissions can load asynchronously, so the first message to a newly entered region may transiently return this — retry shortly. */
  Unauthorized = 'UNAUTHORIZED',
  /** Unspecified server error (1). Retry; if it persists, report it. */
  UnknownError = 'UNKNOWN_ERROR',
  /** Requires app-admin privileges (the 'manage_apps' permission). */
  UserNotAppAdmin = 'USER_NOT_APP_ADMIN',
  /** This client has no authenticated session on the server. Complete the UDP token handshake (or open the UDP proxy) before sending spatial messages. */
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

/** Fields to update on an access tier. All fields are optional; omitted fields are left unchanged. */
export type UpdateAccessTierInput = {
  /** New billing cadence (e.g. "month", "year"); null clears it. */
  billingPeriod?: InputMaybe<Scalars['String']['input']>;
  /** New ISO 4217 currency code (e.g. "usd"). */
  currency?: InputMaybe<Scalars['String']['input']>;
  /** New tier description; null clears it. */
  description?: InputMaybe<Scalars['String']['input']>;
  /** Set whether this is the app's default tier. */
  isDefault?: InputMaybe<Scalars['Boolean']['input']>;
  /** Set whether the tier is free. */
  isFree?: InputMaybe<Scalars['Boolean']['input']>;
  /** New tier name (max 128 chars). */
  name?: InputMaybe<Scalars['String']['input']>;
  /** External PayPal plan id to associate (billing integration). */
  paypalPlanId?: InputMaybe<Scalars['String']['input']>;
  /** Replacement set of runtime permission keys for the tier (must be valid runtimePermissions). When provided, replaces the existing set entirely. */
  permissionKeys?: InputMaybe<Array<Scalars['String']['input']>>;
  /** New price in cents; null clears the price (makes the tier unpriced). */
  priceCents?: InputMaybe<Scalars['BigInt']['input']>;
  /** External Stripe price id to associate (billing integration). */
  stripePriceId?: InputMaybe<Scalars['String']['input']>;
  /** New sort order (ascending). */
  tierOrder?: InputMaybe<Scalars['Int']['input']>;
};

export type UpdateActorInput = {
  /** New app id, or omit to leave unchanged. BigInt sent as a decimal string. */
  appId?: InputMaybe<Scalars['BigInt']['input']>;
  /** New avatar id, or omit to leave unchanged. BigInt sent as a decimal string. */
  avatarId?: InputMaybe<Scalars['BigInt']['input']>;
  /** New chunk-grid coordinates (x, y, z as int64 BigInt decimal strings), or omit to leave unchanged. */
  chunk?: InputMaybe<ChunkCoordinatesInput>;
  /** New owner-only private state blob (base64-encoded binary), or omit to leave unchanged. */
  privateState?: InputMaybe<Scalars['String']['input']>;
  /** New public state blob (base64-encoded binary), or omit to leave unchanged. */
  publicState?: InputMaybe<Scalars['String']['input']>;
};

export type UpdateActorStateInput = {
  /** New owner-only private state blob (base64-encoded binary), or omit to leave unchanged. */
  privateState?: InputMaybe<Scalars['String']['input']>;
  /** New public state blob (base64-encoded binary), or omit to leave unchanged. */
  publicState?: InputMaybe<Scalars['String']['input']>;
};

/** Input payload for updating an app. All fields are optional; only fields that are provided are changed. */
export type UpdateAppInput = {
  /** New short description. Omit to leave unchanged. */
  description?: InputMaybe<Scalars['String']['input']>;
  /** New JSON-encoded marketplace metadata string, replacing the existing value (see App.metadata). Omit to leave unchanged. */
  metadata?: InputMaybe<Scalars['String']['input']>;
  /** New display name (1-256 chars). Omit to leave unchanged. */
  name?: InputMaybe<Scalars['String']['input']>;
  /** New lifecycle status; set LIVE to publish, or DRAFT/LIVE to restore an archived app. Omit to leave unchanged. */
  status?: InputMaybe<AppStatus>;
  /** New visibility (PUBLIC/UNLISTED/PRIVATE). Omit to leave unchanged. */
  visibility?: InputMaybe<AppVisibility>;
};

export type UpdateAvatarAppStateInput = {
  /** App (game) id the state is scoped to. Required. BigInt sent as a decimal string. */
  appId: Scalars['BigInt']['input'];
  /** Avatar whose per-app state to write; must be owned by the caller. Required. BigInt sent as a decimal string. */
  avatarId: Scalars['BigInt']['input'];
  /** Per-app avatar state as base64-encoded binary. Send null (or omit) to clear it. */
  state?: InputMaybe<Scalars['String']['input']>;
};

export type UpdateAvatarInput = {
  /** New avatar name, or omit to leave unchanged. */
  name?: InputMaybe<Scalars['String']['input']>;
};

export type UpdateAvatarStateInput = {
  /** New owner-only private state blob (base64-encoded binary), or omit to leave unchanged. */
  privateState?: InputMaybe<Scalars['String']['input']>;
  /** New public state blob (base64-encoded binary), or omit to leave unchanged. */
  publicState?: InputMaybe<Scalars['String']['input']>;
};

/** Update an existing channel. Omitted fields are left unchanged. */
export type UpdateChannelInput = {
  /** New description. Omit to leave unchanged. */
  description?: InputMaybe<Scalars['String']['input']>;
  /** The channel (group) id to update. */
  groupId: Scalars['BigInt']['input'];
  /** open | request | invite | admin. Omit to leave unchanged. */
  membershipPolicy?: InputMaybe<Scalars['String']['input']>;
  /** New channel name (max 128 chars). Omit to leave unchanged. */
  name?: InputMaybe<Scalars['String']['input']>;
};

/** Payload for updateChunkLods: replaces the chunk's entire LOD set. Only LODs are written; voxels, voxel states, chunk state and owner are preserved. */
export type UpdateChunkLodsInput = {
  /** Id of the app that owns the chunk (decimal string). */
  appId: Scalars['BigInt']['input'];
  /** Address of the chunk whose LODs to replace. */
  coordinates: ChunkCoordinatesInput;
  /** Full set of LOD levels to store for the chunk; this REPLACES any existing LODs. */
  lods: Array<LodDataInput>;
};

/** Payload for updateChunkState: upserts ONLY the chunk-level opaque state blob; the voxel grid, per-voxel states and LODs are preserved. */
export type UpdateChunkStateInput = {
  /** Id of the app that owns the chunk (decimal string). */
  appId: Scalars['BigInt']['input'];
  /** BASE64-encoded binary chunk-level state blob to store. Omit/null to store no chunk state. */
  chunkState?: InputMaybe<Scalars['String']['input']>;
  /** Address of the chunk whose chunk-level state to set. */
  coordinates: ChunkCoordinatesInput;
};

export type UpdateEnvironmentScalingInput = {
  /** Caddy LB flavor (in front of the game-api fleet). When omitted the existing value is preserved. */
  caddyFlavor?: InputMaybe<Scalars['String']['input']>;
  /** Maximum game-api servers (autoscaling ceiling). Min 1; ≥ gameApiMinServers. */
  gameApiMaxServers: Scalars['Int']['input'];
  /** Minimum game-api servers (autoscaling floor). Min 1; ≤ gameApiMaxServers. */
  gameApiMinServers: Scalars['Int']['input'];
  /** Number of Caddy load-balancer VMs in front of the game-api fleet. Min 1. */
  loadBalancerCount: Scalars['Int']['input'];
  /** Organization id (BigInt) that owns the environment. */
  orgId: Scalars['BigInt']['input'];
  /** Slug of the dedicated environment to rescale (rejected for 'dev_single'). */
  slug: Scalars['String']['input'];
  /** Maximum Buddy UDP servers (autoscaling ceiling). Min 1; ≥ udpBuddyMinServers. */
  udpBuddyMaxServers: Scalars['Int']['input'];
  /** Minimum Buddy UDP servers (autoscaling floor). Min 1; ≤ udpBuddyMaxServers. */
  udpBuddyMinServers: Scalars['Int']['input'];
};

export type UpdateGamertagInput = {
  /** Discriminator paired with `gamertag` (max 128 characters) to form a unique handle. */
  disambiguation: Scalars['String']['input'];
  /** New gamertag (max 64 characters). Must be unique in combination with `disambiguation`. */
  gamertag: Scalars['String']['input'];
};

/** Update a custom group role. Omitted fields are left unchanged. */
export type UpdateGroupRoleInput = {
  /** The group role id to update. */
  groupRoleId: Scalars['BigInt']['input'];
  /** When provided, REPLACES the role's permission key strings. Each must be a valid group permission key for the group type (max 64 chars, unique). Omit to leave permissions unchanged. */
  permissions?: InputMaybe<Array<Scalars['String']['input']>>;
  /** New rank (higher = more senior). Ignored for system roles. Omit to leave unchanged. */
  rank?: InputMaybe<Scalars['Int']['input']>;
  /** New role name (max 128 chars). Ignored for system roles. Omit to leave unchanged. */
  roleName?: InputMaybe<Scalars['String']['input']>;
};

export type UpdateOrgRoleInput = {
  /** New description; omit to leave unchanged. */
  description?: InputMaybe<Scalars['String']['input']>;
  /** If provided, replaces the entire permission set (empty array clears all); omit to leave unchanged. */
  permissions?: InputMaybe<Array<Scalars['String']['input']>>;
  /** New role name; omit to leave unchanged. */
  roleName?: InputMaybe<Scalars['String']['input']>;
};

export type UpdateOrgTokenInput = {
  /** New expiry timestamp; omit to leave unchanged. */
  expiresAt?: InputMaybe<Scalars['DateTime']['input']>;
  /** Set false to deactivate the token; omit to leave unchanged. Revoked tokens cannot be re-minted. */
  isActive?: InputMaybe<Scalars['Boolean']['input']>;
  /** New label; omit to leave unchanged. */
  label?: InputMaybe<Scalars['String']['input']>;
};

/** Update an existing team. Omitted fields are left unchanged. */
export type UpdateTeamInput = {
  /** New description. Omit to leave unchanged. */
  description?: InputMaybe<Scalars['String']['input']>;
  /** The team (group) id to update. */
  groupId: Scalars['BigInt']['input'];
  /** open | request | invite | admin. Omit to leave unchanged. */
  membershipPolicy?: InputMaybe<Scalars['String']['input']>;
  /** New team name (max 128 chars). Omit to leave unchanged. */
  name?: InputMaybe<Scalars['String']['input']>;
};

export type UpdateUserStateInput = {
  /** New user-level state blob, base64-encoded binary. Omit or send null to clear it. */
  state?: InputMaybe<Scalars['String']['input']>;
};

/** Payload for updateVoxel: records (upserts) a single voxel edit in the voxel_updates log for one chunk. */
export type UpdateVoxelInput = {
  /** Id of the app that owns the target chunk (decimal string). */
  appId: Scalars['BigInt']['input'];
  /** Address of the chunk that contains the voxel to edit. */
  coordinates: ChunkCoordinatesInput;
  /** Local voxel position within the chunk (0-15 per axis; validated to the signed 16-bit range). */
  location: VoxelCoordinatesInput;
  /** Optional BASE64-encoded binary state blob for the voxel; omit for none. */
  state?: InputMaybe<Scalars['String']['input']>;
  /** Voxel type id to write (0-255). */
  voxelType: Scalars['Float']['input'];
};

/** Create or update a container type (schema for a kind of entity). */
export type UpsertContainerTypeInput = {
  /** The app (tenant) that owns the type. */
  appId: Scalars['BigInt']['input'];
  /** public | owner | hidden default for this type's properties. */
  defaultPropertyVisibility?: InputMaybe<Scalars['String']['input']>;
  /** Optional description of the type. */
  description?: InputMaybe<Scalars['String']['input']>;
  /** Human-friendly display name. */
  displayName: Scalars['String']['input'];
  /** admin | member | owner (who may instantiate this type). */
  instantiableBy?: InputMaybe<Scalars['String']['input']>;
  /** JSON object of metadata. */
  metadataJson?: InputMaybe<Scalars['String']['input']>;
  /** Stable type name (unique per app). Acts as the upsert key. */
  typeName: Scalars['String']['input'];
};

/** Create or update a studio-defined function. Upsert key is (app, name). */
export type UpsertFunctionInput = {
  /** The app (tenant) that owns the function. */
  appId: Scalars['BigInt']['input'];
  /** Optional container type to bind the function to (omit for a global function). */
  containerTypeName?: InputMaybe<Scalars['String']['input']>;
  /** Optional description of the function. */
  description?: InputMaybe<Scalars['String']['input']>;
  /** JSON-encoded invoke-policy rule tree (authority requirements). */
  invokePolicyJson?: InputMaybe<Scalars['String']['input']>;
  /** player | server | internal */
  invokeScope?: InputMaybe<Scalars['String']['input']>;
  /** The property writes the function performs (applied atomically when invoked). */
  mutations?: InputMaybe<Array<FunctionMutationInput>>;
  /** Function name (unique per app). Used to invoke it. */
  name: Scalars['String']['input'];
  /** Typed parameters the function accepts. */
  parameters?: InputMaybe<Array<FunctionParamInput>>;
  /** Optional expression whose value becomes the invoke result. */
  returnExpression?: InputMaybe<Scalars['String']['input']>;
  /** Optional declared return value type. */
  returnType?: InputMaybe<Scalars['String']['input']>;
};

/** Create or update a typed property on a container type. */
export type UpsertPropertyDefInput = {
  /** The app (tenant) that owns the type. */
  appId: Scalars['BigInt']['input'];
  /** The container type to define the property on. */
  containerTypeName: Scalars['String']['input'];
  /** JSON-encoded default value. */
  defaultValueJson?: InputMaybe<Scalars['String']['input']>;
  /** Optional description of the property. */
  description?: InputMaybe<Scalars['String']['input']>;
  /** Property key (unique within the type). Part of the upsert key. */
  key: Scalars['String']['input'];
  /** int | float | string | bool | array | object | container_ref */
  valueType: Scalars['String']['input'];
  /** public | owner | hidden */
  visibility?: InputMaybe<Scalars['String']['input']>;
  /** function | owner | admin */
  writable?: InputMaybe<Scalars['String']['input']>;
};

/** One minute-bucketed usage sample. Byte/message counters are returned as strings because they can exceed the 32-bit Int range. */
export type UsageMinuteRow = {
  __typename?: 'UsageMinuteRow';
  /** Start of the one-minute bucket. */
  minute: Scalars['DateTime']['output'];
  /** Bytes received in the minute (string counter). */
  recvBytes: Scalars['String']['output'];
  /** Messages received in the minute (replication only). */
  recvMsgs: Maybe<Scalars['String']['output']>;
  /** Bytes sent in the minute (string counter). */
  sendBytes: Scalars['String']['output'];
  /** Messages sent in the minute (replication only). */
  sendMsgs: Maybe<Scalars['String']['output']>;
};

/** Peak and average send rates over the sampled replication window. */
export type UsageRatePeaks = {
  __typename?: 'UsageRatePeaks';
  /** Average sent megabits per second over the window. */
  avgSendMbitPerSec: Scalars['Float']['output'];
  /** Average sent messages per second over the window. */
  avgSendMsgsPerSec: Scalars['Float']['output'];
  /** Highest observed sent megabits per second. */
  peakSendMbitPerSec: Scalars['Float']['output'];
  /** Highest observed sent messages per second. */
  peakSendMsgsPerSec: Scalars['Float']['output'];
  /** Number of minute samples the averages are computed over. */
  sampleMinutes: Scalars['Float']['output'];
};

export type User = {
  __typename?: 'User';
  /** Account creation timestamp (ISO-8601). */
  createdAt: Scalars['DateTime']['output'];
  /** Discriminator paired with `gamertag` to form a unique handle; null if unset. */
  disambiguation: Maybe<Scalars['String']['output']>;
  /** Account email; null for anonymized/soft-deleted accounts. */
  email: Maybe<Scalars['String']['output']>;
  /** External identity-provider id for federated accounts, or null. */
  externalId: Maybe<Scalars['String']['output']>;
  /** Public display name; null if unset or anonymized. Unique in combination with `disambiguation`. */
  gamertag: Maybe<Scalars['String']['output']>;
  /** Whether the user qualifies for early access through normal eligibility (the free-play window/rollout). */
  grantEarlyAccess: Scalars['Boolean']['output'];
  /** Admin override forcing early access on/off regardless of normal eligibility (set via `setEarlyAccessOverride`). */
  grantEarlyAccessOverride: Scalars['Boolean']['output'];
  /** Whether the account email has been confirmed. */
  isConfirmed: Scalars['Boolean']['output'];
  /** Company-employee flag that grants access to control-plane / operator features. Independent from is_super_admin. */
  isOperator: Scalars['Boolean']['output'];
  /** Whether the user holds platform super-admin privileges (toggled via `setSuperAdmin`). */
  isSuperAdmin: Scalars['Boolean']['output'];
  /** Organization the user belongs to, or null. BigInt serialized as a decimal string. */
  orgId: Maybe<Scalars['BigInt']['output']>;
  /** The user's effective permission keys on the given org (empty if not a member; full set if super admin). Requires a valid bearer game token. NOTE: org permissions are management-owned, so in cks-game-api this currently resolves to an empty list — query cks-management-api for authoritative org permissions. */
  permissionsForOrg: Array<Scalars['String']['output']>;
  /** User-level state blob, base64-encoded binary (management-owned). Null when cleared. */
  state: Maybe<Scalars['String']['output']>;
  /** Unique user id and primary key. BigInt serialized as a decimal string. */
  userId: Scalars['BigInt']['output'];
  /** Account type, e.g. "direct" or "deleted". */
  userType: Scalars['String']['output'];
};


export type UserPermissionsForOrgArgs = {
  orgId: Scalars['BigInt']['input'];
};

export type UserAppState = {
  __typename?: 'UserAppState';
  /** App (game) id this state is scoped to. BigInt serialized as a decimal string. */
  appId: Scalars['BigInt']['output'];
  /** Row creation timestamp (ISO-8601). */
  createdAt: Scalars['DateTime']['output'];
  /** Per-app user state blob, base64-encoded binary; null when cleared. */
  state: Maybe<Scalars['String']['output']>;
  /** Last-update timestamp (ISO-8601). */
  updatedAt: Scalars['DateTime']['output'];
  /** Owner user id. BigInt serialized as a decimal string. */
  userId: Scalars['BigInt']['output'];
};

/** Aggregated lifetime donation totals for a user. LEGACY: donations are no longer purchasable. Returned by the deprecated myDonationData query. */
export type UserDonationData = {
  __typename?: 'UserDonationData';
  /** ISO currency code for the total, e.g. "usd". */
  currency: Scalars['String']['output'];
  /** Lifetime donation total in minor currency units (cents), as a decimal string. */
  totalAmountCents: Scalars['String']['output'];
};

/** An edge in a User connection. */
export type UserEdge = {
  __typename?: 'UserEdge';
  /** Opaque cursor for this edge. */
  cursor: Scalars['String']['output'];
  /** The node at the end of this edge. */
  node: User;
};

/** Aggregated property-token balances for a user. LEGACY: property tokens are no longer purchasable. Returned by the deprecated myPropertyTokens query. */
export type UserPropertyTokenData = {
  __typename?: 'UserPropertyTokenData';
  /** Property tokens currently available, as a decimal string. */
  available: Scalars['String']['output'];
  /** Property tokens currently in use, as a decimal string. */
  inUse: Scalars['String']['output'];
  /** Sum of available + inUse, as a decimal string. */
  total: Scalars['String']['output'];
};

/** A Relay cursor connection over User records. Page with first/after; pass pageInfo.endCursor back as after for the next page. */
export type UsersConnection = {
  __typename?: 'UsersConnection';
  /** Edges on this page. */
  edges: Array<UserEdge>;
  /** Pagination metadata. */
  pageInfo: ConnectionPageInfo;
  /** Total matching records across all pages, when known (null for sources that do not compute a total). */
  totalCount: Maybe<Scalars['Int']['output']>;
};

/** One page of users from usersPaginated, plus pagination metadata. */
export type UsersPage = {
  __typename?: 'UsersPage';
  /** Users on the current page, ordered by ascending user id. */
  items: Array<User>;
  /** Pagination metadata: totalCount, applied limit, and applied offset. */
  pageInfo: PageInfo;
};

/** A semantic-style version as four integer components (major.minor.patch.build). Compare components in order (major, then minor, then patch, then build). */
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

/** A recorded edit to a single voxel (one row of the voxel_updates log): the app/chunk/local-position that changed, the new voxel type, an optional state blob, and who/when. Returned by listVoxels, getVoxelList and listVoxelUpdatesByDistance; created by updateVoxel. A background maintenance job later folds these edits into the chunk grid. */
export type Voxel = {
  __typename?: 'Voxel';
  /** Id of the app this edit belongs to (decimal string). */
  appId: Scalars['BigInt']['output'];
  /** Address of the chunk that contains the edited voxel. */
  coordinates: ChunkCoordinates;
  /** When the edit was recorded; also serves as the last-modified time for the voxel. */
  createdAt: Scalars['DateTime']['output'];
  /** Id of the user that made this edit (decimal string). */
  createdBy: Scalars['BigInt']['output'];
  /** Local position of the edited voxel within its chunk (0-15 per axis). */
  location: VoxelCoordinates;
  /** BASE64-encoded binary state blob for the voxel (decode from base64); null when no state was set. */
  state: Maybe<Scalars['String']['output']>;
  /** New voxel type id written by this edit (0-255). */
  voxelType: Scalars['Int']['output'];
  /** Unique id of this voxel-update row (decimal string). */
  voxelUpdateId: Scalars['BigInt']['output'];
};

/** Integer (x, y, z) position of a single voxel LOCAL to its chunk (not a world position). Stored as signed 16-bit smallints (-32,768..32,767), but a chunk is 16x16x16 = 4096 voxels, so valid in-bounds positions are 0-15 on each axis. */
export type VoxelCoordinates = {
  __typename?: 'VoxelCoordinates';
  /** Local voxel X within the chunk (0-15 for in-bounds voxels). */
  x: Scalars['Int']['output'];
  /** Local voxel Y within the chunk (0-15 for in-bounds voxels). */
  y: Scalars['Int']['output'];
  /** Local voxel Z within the chunk (0-15 for in-bounds voxels). */
  z: Scalars['Int']['output'];
};

/** Input form of a voxel position LOCAL to its chunk (see VoxelCoordinates). Signed 16-bit integers; in-bounds positions are 0-15 on each axis for a 16x16x16 chunk. */
export type VoxelCoordinatesInput = {
  /** Local voxel X within the chunk (0-15 for in-bounds voxels). */
  x: Scalars['Int']['input'];
  /** Local voxel Y within the chunk (0-15 for in-bounds voxels). */
  y: Scalars['Int']['input'];
  /** Local voxel Z within the chunk (0-15 for in-bounds voxels). */
  z: Scalars['Int']['input'];
};

/** A single voxel's state override stored on a chunk: its local position, its voxel type, and an opaque base64-encoded state blob. */
export type VoxelState = {
  __typename?: 'VoxelState';
  /** BASE64-encoded binary state blob for this voxel (decode from base64); null/empty when the voxel has no extra state. */
  state: Maybe<Scalars['String']['output']>;
  /** Local voxel position within the chunk (0-15 per axis). */
  voxelCoord: VoxelCoordinates;
  /** Voxel type id at this position (0-255). */
  voxelType: Scalars['Int']['output'];
};

/** One per-voxel state entry to write to a chunk. */
export type VoxelStateInput = {
  /** BASE64-encoded binary state blob for this voxel; omit/null for no extra state. */
  state?: InputMaybe<Scalars['String']['input']>;
  /** Local voxel position within the chunk (0-15 per axis). */
  voxelCoord: VoxelCoordinatesInput;
  /** Voxel type id to set at this position (0-255). */
  voxelType: Scalars['Int']['input'];
};

/** Relay-style cursor-paginated connection over voxel edit history entries (VoxelUpdateHistoryEvent). Page with `first`/`after`; cursors are opaque. */
export type VoxelUpdateHistoryConnection = {
  __typename?: 'VoxelUpdateHistoryConnection';
  /** Edges on this page. */
  edges: Array<VoxelUpdateHistoryEventEdge>;
  /** Pagination metadata. */
  pageInfo: ConnectionPageInfo;
  /** Total matching records across all pages, when known (null for sources that do not compute a total). */
  totalCount: Maybe<Scalars['Int']['output']>;
};

/** One entry in the immutable voxel edit history (voxel_updates_history): a recorded change of a single voxel's type, with who and when. Returned by voxelUpdateHistory, newest first. */
export type VoxelUpdateHistoryEvent = {
  __typename?: 'VoxelUpdateHistoryEvent';
  /** Id of the app this change belongs to (decimal string). */
  appId: Scalars['BigInt']['output'];
  /** Timestamp when the change occurred. */
  changedAt: Scalars['DateTime']['output'];
  /** Id of the user that made the change (decimal string), or null if unknown. */
  changedBy: Maybe<Scalars['BigInt']['output']>;
  /** Address of the chunk that contains the changed voxel. */
  coordinates: ChunkCoordinates;
  /** Unique id of this history entry (decimal string). */
  id: Scalars['BigInt']['output'];
  /** Local position of the changed voxel within its chunk. */
  location: VoxelCoordinates;
  /** Voxel type after the change, or null if the voxel was cleared/removed. */
  newVoxelType: Maybe<Scalars['Int']['output']>;
  /** Voxel type before the change, or null if the voxel did not previously exist. */
  oldVoxelType: Maybe<Scalars['Int']['output']>;
};

/** An edge in a VoxelUpdateHistoryEvent connection. */
export type VoxelUpdateHistoryEventEdge = {
  __typename?: 'VoxelUpdateHistoryEventEdge';
  /** Opaque cursor for this edge. */
  cursor: Scalars['String']['output'];
  /** The node at the end of this edge. */
  node: VoxelUpdateHistoryEvent;
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
  /** Client-assigned correlation id for this datagram: a uint8 (0-255) that wraps at gameClientBootstrap.sequenceNumberModulo (256); defaults to 0 if omitted. For CORRELATION ONLY — it is NOT an idempotency key and the server does not dedupe replays. Echoed on the matching response and on any GenericErrorResponse for this send, both delivered on the udpNotifications subscription. */
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
  /** The sequenceNumber echoed back from the originating sendVoxelUpdate request (a uint8, 0-255, wrapping at modulo 256). Use it to correlate this response with that send. Correlation only — not an idempotency key. */
  sequenceNumber: Scalars['Int']['output'];
  /** The unique identifier for this voxel update. */
  uuid: Scalars['String']['output'];
};

/** Result of listVoxelUpdatesByDistance: per-chunk groups of voxel edits ordered by increasing distance from the center, plus an echo of the pagination applied. */
export type VoxelUpdatesByDistanceResponse = {
  __typename?: 'VoxelUpdatesByDistanceResponse';
  /** The center chunk the search was performed around. */
  centerCoordinate: ChunkCoordinates;
  /** Per-chunk groups of voxel edits, ordered by increasing Chebyshev distance from centerCoordinate. */
  chunks: Array<ChunkVoxelUpdatesResponse>;
  /** Echo of the chunk `limit` applied to this page, or null if none was supplied. */
  limit: Maybe<Scalars['Int']['output']>;
  /** Echo of the chunk `skip` applied to this page, or null if none was supplied. */
  skip: Maybe<Scalars['Int']['output']>;
};

export type WalletTransaction = {
  __typename?: 'WalletTransaction';
  /** Signed change applied to the wallet in minor currency units (cents), as a BigInt decimal string: positive credits funds, negative debits funds. */
  amountCents: Scalars['BigInt']['output'];
  /** App that incurred the charge (BigInt as a decimal string), set on usage-type transactions; null for org-level credits such as top-ups. */
  appId: Maybe<Scalars['BigInt']['output']>;
  /** Wallet balance in cents immediately after this transaction was applied, as a BigInt decimal string. */
  balanceAfter: Scalars['BigInt']['output'];
  /** When the transaction was recorded (ISO-8601 UTC timestamp). */
  createdAt: Scalars['DateTime']['output'];
  /** Optional human-readable note describing the transaction; null when not set. */
  description: Maybe<Scalars['String']['output']>;
  /** Organization that owns the wallet (BigInt as a decimal string). */
  orgId: Scalars['BigInt']['output'];
  /** Optional external reference (e.g. payment-provider charge id or checkout id) linking this transaction to its source; null when not set. */
  referenceId: Maybe<Scalars['String']['output']>;
  /** Unique transaction id (BigInt as a decimal string). */
  transactionId: Scalars['BigInt']['output'];
  /** What produced this transaction. Known values: "topup" (wallet credit from a checkout/top-up), "usage" (per-app usage charge, negative), "shared_usage" (shared-environment usage charge, negative), "environment_usage" (hourly environment cost, negative), "auto_recharge" (automatic wallet recharge). Other caller-supplied deposit types are possible. */
  transactionType: Scalars['String']['output'];
  /** Wallet this transaction belongs to (BigInt as a decimal string). */
  walletId: Scalars['BigInt']['output'];
};

/** An edge in a WalletTransaction connection. */
export type WalletTransactionEdge = {
  __typename?: 'WalletTransactionEdge';
  /** Opaque cursor for this edge. */
  cursor: Scalars['String']['output'];
  /** The node at the end of this edge. */
  node: WalletTransaction;
};

/** A Relay cursor connection over WalletTransaction records. Page with first/after; pass pageInfo.endCursor back as after for the next page. */
export type WalletTransactionsConnection = {
  __typename?: 'WalletTransactionsConnection';
  /** Edges on this page. */
  edges: Array<WalletTransactionEdge>;
  /** Pagination metadata. */
  pageInfo: ConnectionPageInfo;
  /** Total matching records across all pages, when known (null for sources that do not compute a total). */
  totalCount: Maybe<Scalars['Int']['output']>;
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
  idempotencyKey?: InputMaybe<Scalars['String']['input']>;
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


export type AppQuery = { __typename?: 'Query', app: { __typename?: 'App', appId: string, orgId: string, name: string, slug: string | null, description: string | null, visibility: AppVisibility, status: AppStatus, metadata: string | null, splitMode: boolean, deploymentTarget: string, runtimeStatus: string, runtimeDenialReason: string | null, gameApiUrl: string | null, createdAt: string, updatedAt: string, org: { __typename?: 'Organization', orgId: string, slug: string, name: string } | null } | null };

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

export type GmSessionFieldsFragment = { __typename?: 'GmSession', sessionId: string, appId: string, name: string | null, status: string, createdByUserId: string | null, currentTurnUserId: string | null, metadataJson: string };

export type GmContainerFieldsFragment = { __typename?: 'GmContainer', containerId: string, appId: string, sessionId: string | null, typeName: string, displayName: string, description: string | null, ownerUserId: string | null, metadataJson: string };

export type GmInvokeResultFieldsFragment = { __typename?: 'GmInvokeResult', eventId: string, functionName: string, success: boolean, returnValueJson: string | null, errorMessage: string | null, mutationsApplied: Array<{ __typename?: 'GmMutationApplied', containerId: string, key: string, valueType: string, oldValueJson: string | null, newValueJson: string | null }> };

export type GameModelCreateSessionMutationVariables = Exact<{
  input: CreateSessionInput;
}>;


export type GameModelCreateSessionMutation = { __typename?: 'Mutation', gameModelCreateSession: { __typename?: 'GmSession', sessionId: string, appId: string, name: string | null, status: string, createdByUserId: string | null, currentTurnUserId: string | null, metadataJson: string } };

export type GameModelJoinSessionMutationVariables = Exact<{
  input: JoinSessionInput;
}>;


export type GameModelJoinSessionMutation = { __typename?: 'Mutation', gameModelJoinSession: { __typename?: 'GmSessionParticipant', sessionId: string, userId: string, role: string } };

export type GameModelSetSessionTurnMutationVariables = Exact<{
  input: SetSessionTurnInput;
}>;


export type GameModelSetSessionTurnMutation = { __typename?: 'Mutation', gameModelSetSessionTurn: { __typename?: 'GmSession', sessionId: string, appId: string, name: string | null, status: string, createdByUserId: string | null, currentTurnUserId: string | null, metadataJson: string } };

export type GameModelCreateContainerMutationVariables = Exact<{
  input: CreateContainerInput;
}>;


export type GameModelCreateContainerMutation = { __typename?: 'Mutation', gameModelCreateContainer: { __typename?: 'GmContainer', containerId: string, appId: string, sessionId: string | null, typeName: string, displayName: string, description: string | null, ownerUserId: string | null, metadataJson: string } };

export type GameModelSetPropertyMutationVariables = Exact<{
  input: SetContainerPropertyInput;
}>;


export type GameModelSetPropertyMutation = { __typename?: 'Mutation', gameModelSetProperty: { __typename?: 'GmContainer', containerId: string, appId: string, sessionId: string | null, typeName: string, displayName: string, description: string | null, ownerUserId: string | null, metadataJson: string } };

export type GameModelAddEdgeMutationVariables = Exact<{
  input: AddEdgeInput;
}>;


export type GameModelAddEdgeMutation = { __typename?: 'Mutation', gameModelAddEdge: { __typename?: 'GmEdge', edgeId: string, fromContainerId: string, toContainerId: string, relationshipType: string, weight: number | null } };

export type GameModelInvokeMutationVariables = Exact<{
  input: InvokeFunctionInput;
}>;


export type GameModelInvokeMutation = { __typename?: 'Mutation', gameModelInvoke: { __typename?: 'GmInvokeResult', eventId: string, functionName: string, success: boolean, returnValueJson: string | null, errorMessage: string | null, mutationsApplied: Array<{ __typename?: 'GmMutationApplied', containerId: string, key: string, valueType: string, oldValueJson: string | null, newValueJson: string | null }> } };

export type GameModelContainerQueryVariables = Exact<{
  appId: Scalars['BigInt']['input'];
  containerId: Scalars['String']['input'];
}>;


export type GameModelContainerQuery = { __typename?: 'Query', gameModelContainer: { __typename?: 'GmContainer', containerId: string, appId: string, sessionId: string | null, typeName: string, displayName: string, description: string | null, ownerUserId: string | null, metadataJson: string } };

export type GameModelContainersQueryVariables = Exact<{
  appId: Scalars['BigInt']['input'];
  typeName?: InputMaybe<Scalars['String']['input']>;
  sessionId?: InputMaybe<Scalars['String']['input']>;
}>;


export type GameModelContainersQuery = { __typename?: 'Query', gameModelContainers: Array<{ __typename?: 'GmContainer', containerId: string, appId: string, sessionId: string | null, typeName: string, displayName: string, description: string | null, ownerUserId: string | null, metadataJson: string }> };

export type GameModelContainerStateQueryVariables = Exact<{
  appId: Scalars['BigInt']['input'];
  containerId: Scalars['String']['input'];
}>;


export type GameModelContainerStateQuery = { __typename?: 'Query', gameModelContainerState: { __typename?: 'GmContainerState', containerId: string, appId: string, sessionId: string | null, typeName: string, displayName: string, ownerUserId: string | null, propertiesJson: string } };

export type GameModelTraverseQueryVariables = Exact<{
  appId: Scalars['BigInt']['input'];
  rootId: Scalars['String']['input'];
  relationshipType: Scalars['String']['input'];
  depth?: InputMaybe<Scalars['Int']['input']>;
}>;


export type GameModelTraverseQuery = { __typename?: 'Query', gameModelTraverse: { __typename?: 'GmTraverseResult', rootId: string, nodes: Array<{ __typename?: 'GmContainer', containerId: string, appId: string, sessionId: string | null, typeName: string, displayName: string, description: string | null, ownerUserId: string | null, metadataJson: string }>, edges: Array<{ __typename?: 'GmEdge', edgeId: string, fromContainerId: string, toContainerId: string, relationshipType: string, weight: number | null }> } };

export type GameModelSessionQueryVariables = Exact<{
  appId: Scalars['BigInt']['input'];
  sessionId: Scalars['String']['input'];
}>;


export type GameModelSessionQuery = { __typename?: 'Query', gameModelSession: { __typename?: 'GmSession', sessionId: string, appId: string, name: string | null, status: string, createdByUserId: string | null, currentTurnUserId: string | null, metadataJson: string } };

export type GameModelSessionsQueryVariables = Exact<{
  appId: Scalars['BigInt']['input'];
  status?: InputMaybe<Scalars['String']['input']>;
}>;


export type GameModelSessionsQuery = { __typename?: 'Query', gameModelSessions: Array<{ __typename?: 'GmSession', sessionId: string, appId: string, name: string | null, status: string, createdByUserId: string | null, currentTurnUserId: string | null, metadataJson: string }> };

export type GameModelEventsQueryVariables = Exact<{
  appId: Scalars['BigInt']['input'];
  sessionId?: InputMaybe<Scalars['String']['input']>;
  selfContainerId?: InputMaybe<Scalars['String']['input']>;
  functionName?: InputMaybe<Scalars['String']['input']>;
  success?: InputMaybe<Scalars['Boolean']['input']>;
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
}>;


export type GameModelEventsQuery = { __typename?: 'Query', gameModelEvents: Array<{ __typename?: 'GmEvent', eventId: string, sessionId: string | null, functionName: string, selfContainerId: string | null, callerUserId: string | null, paramsJson: string, mutationsAppliedJson: string, returnValueJson: string | null, success: boolean, errorMessage: string | null, executedAt: string }> };

export type GmFunctionFieldsFragment = { __typename?: 'GmFunction', functionId: string, appId: string, name: string, containerTypeName: string | null, description: string | null, returnType: string | null, invokeScope: string, invokePolicyJson: string | null, returnExpression: string | null, warnings: Array<string>, parameters: Array<{ __typename?: 'GmFunctionParam', name: string, valueType: string, required: boolean, defaultValueJson: string | null, description: string | null, sortOrder: number }>, mutations: Array<{ __typename?: 'GmFunctionMutation', target: string, property: string, expression: string }> };

export type GmPropertyDefFieldsFragment = { __typename?: 'GmPropertyDef', appId: string, containerTypeName: string, key: string, valueType: string, defaultValueJson: string | null, visibility: string, writable: string, description: string | null };

export type GameModelSeedMutationVariables = Exact<{
  input: SeedGameModelInput;
}>;


export type GameModelSeedMutation = { __typename?: 'Mutation', gameModelSeed: { __typename?: 'GmSeedResult', containerTypesCreated: number, propertyDefinitionsCreated: number, functionsCreated: number, containersCreated: number, edgesCreated: number, warnings: Array<string>, idMapJson: string } };

export type GameModelUpsertContainerTypeMutationVariables = Exact<{
  input: UpsertContainerTypeInput;
}>;


export type GameModelUpsertContainerTypeMutation = { __typename?: 'Mutation', gameModelUpsertContainerType: { __typename?: 'GmContainerType', appId: string, typeName: string, displayName: string, description: string | null, instantiableBy: string, defaultPropertyVisibility: string, metadataJson: string } };

export type GameModelUpsertPropertyDefMutationVariables = Exact<{
  input: UpsertPropertyDefInput;
}>;


export type GameModelUpsertPropertyDefMutation = { __typename?: 'Mutation', gameModelUpsertPropertyDef: { __typename?: 'GmPropertyDef', appId: string, containerTypeName: string, key: string, valueType: string, defaultValueJson: string | null, visibility: string, writable: string, description: string | null } };

export type GameModelUpsertFunctionMutationVariables = Exact<{
  input: UpsertFunctionInput;
}>;


export type GameModelUpsertFunctionMutation = { __typename?: 'Mutation', gameModelUpsertFunction: { __typename?: 'GmFunction', functionId: string, appId: string, name: string, containerTypeName: string | null, description: string | null, returnType: string | null, invokeScope: string, invokePolicyJson: string | null, returnExpression: string | null, warnings: Array<string>, parameters: Array<{ __typename?: 'GmFunctionParam', name: string, valueType: string, required: boolean, defaultValueJson: string | null, description: string | null, sortOrder: number }>, mutations: Array<{ __typename?: 'GmFunctionMutation', target: string, property: string, expression: string }> } };

export type GameModelDeleteFunctionMutationVariables = Exact<{
  appId: Scalars['BigInt']['input'];
  name: Scalars['String']['input'];
}>;


export type GameModelDeleteFunctionMutation = { __typename?: 'Mutation', gameModelDeleteFunction: boolean };

export type GameModelDefineFeatureMutationVariables = Exact<{
  input: DefineAppFeatureInput;
}>;


export type GameModelDefineFeatureMutation = { __typename?: 'Mutation', gameModelDefineFeature: { __typename?: 'GmAppFeature', appId: string, featureKey: string, description: string | null } };

export type GameModelGrantTierFeatureMutationVariables = Exact<{
  input: GrantTierFeatureInput;
}>;


export type GameModelGrantTierFeatureMutation = { __typename?: 'Mutation', gameModelGrantTierFeature: { __typename?: 'GmTierFeature', appId: string, tierId: string, featureKey: string } };

export type GameModelSetPolicyMutationVariables = Exact<{
  input: SetGameModelPolicyInput;
}>;


export type GameModelSetPolicyMutation = { __typename?: 'Mutation', gameModelSetPolicy: { __typename?: 'GmAppPolicy', appId: string, sessionCreationPolicy: string, defaultParticipantRole: string } };

export type GameModelTypeSchemaQueryVariables = Exact<{
  appId: Scalars['BigInt']['input'];
  typeName: Scalars['String']['input'];
}>;


export type GameModelTypeSchemaQuery = { __typename?: 'Query', gameModelTypeSchema: { __typename?: 'GmTypeSchema', typeName: string, propertyDefinitions: Array<{ __typename?: 'GmPropertyDef', appId: string, containerTypeName: string, key: string, valueType: string, defaultValueJson: string | null, visibility: string, writable: string, description: string | null }>, functions: Array<{ __typename?: 'GmFunction', functionId: string, appId: string, name: string, containerTypeName: string | null, description: string | null, returnType: string | null, invokeScope: string, invokePolicyJson: string | null, returnExpression: string | null, warnings: Array<string>, parameters: Array<{ __typename?: 'GmFunctionParam', name: string, valueType: string, required: boolean, defaultValueJson: string | null, description: string | null, sortOrder: number }>, mutations: Array<{ __typename?: 'GmFunctionMutation', target: string, property: string, expression: string }> }> } };

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

export type PlatformConfigQueryVariables = Exact<{ [key: string]: never; }>;


export type PlatformConfigQuery = { __typename?: 'Query', platformConfig: { __typename?: 'PlatformConfig', sharedGameApiUrl: string | null, sharedGameApiWsUrl: string | null, freeAppsPerOrg: number } };

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

export type AddTeamMemberMutationVariables = Exact<{
  groupId: Scalars['BigInt']['input'];
  userId: Scalars['BigInt']['input'];
}>;


export type AddTeamMemberMutation = { __typename?: 'Mutation', addTeamMember: { __typename?: 'GroupMember', groupMemberId: string, groupId: string, userId: string, status: string, createdAt: string, roles: Array<{ __typename?: 'GroupRole', groupRoleId: string, roleName: string, rank: number, isSystem: boolean, permissions: Array<string> }> } };

export type CreateTeamMutationVariables = Exact<{
  input: CreateTeamInput;
}>;


export type CreateTeamMutation = { __typename?: 'Mutation', createTeam: { __typename?: 'Group', groupId: string, appId: string, groupType: string, name: string, description: string | null, ownerUserId: string | null, membershipPolicy: string, status: string, defaultRoleId: string | null, createdAt: string } };

export type CreateTeamRoleMutationVariables = Exact<{
  input: CreateGroupRoleInput;
}>;


export type CreateTeamRoleMutation = { __typename?: 'Mutation', createTeamRole: { __typename?: 'GroupRole', groupRoleId: string, groupId: string, roleName: string, rank: number, isSystem: boolean, permissions: Array<string>, createdAt: string } };

export type DeleteTeamMutationVariables = Exact<{
  groupId: Scalars['BigInt']['input'];
  idempotencyKey?: InputMaybe<Scalars['String']['input']>;
}>;


export type DeleteTeamMutation = { __typename?: 'Mutation', deleteTeam: boolean };

export type DeleteTeamRoleMutationVariables = Exact<{
  groupRoleId: Scalars['BigInt']['input'];
}>;


export type DeleteTeamRoleMutation = { __typename?: 'Mutation', deleteTeamRole: boolean };

export type JoinTeamMutationVariables = Exact<{
  groupId: Scalars['BigInt']['input'];
}>;


export type JoinTeamMutation = { __typename?: 'Mutation', joinTeam: { __typename?: 'GroupMember', groupMemberId: string, groupId: string, userId: string, status: string, createdAt: string, roles: Array<{ __typename?: 'GroupRole', groupRoleId: string, roleName: string, rank: number, isSystem: boolean, permissions: Array<string> }> } };

export type LeaveTeamMutationVariables = Exact<{
  groupId: Scalars['BigInt']['input'];
  idempotencyKey?: InputMaybe<Scalars['String']['input']>;
}>;


export type LeaveTeamMutation = { __typename?: 'Mutation', leaveTeam: boolean };

export type MyTeamsQueryVariables = Exact<{
  appId: Scalars['BigInt']['input'];
}>;


export type MyTeamsQuery = { __typename?: 'Query', myTeams: Array<{ __typename?: 'GroupMembership', permissions: Array<string>, joinedAt: string, group: { __typename?: 'Group', groupId: string, appId: string, groupType: string, name: string, description: string | null, ownerUserId: string | null, membershipPolicy: string, status: string, defaultRoleId: string | null, createdAt: string }, roles: Array<{ __typename?: 'GroupRole', groupRoleId: string, roleName: string, rank: number, isSystem: boolean, permissions: Array<string> }> }> };

export type RemoveTeamMemberMutationVariables = Exact<{
  groupId: Scalars['BigInt']['input'];
  userId: Scalars['BigInt']['input'];
}>;


export type RemoveTeamMemberMutation = { __typename?: 'Mutation', removeTeamMember: boolean };

export type RequestToJoinTeamMutationVariables = Exact<{
  groupId: Scalars['BigInt']['input'];
}>;


export type RequestToJoinTeamMutation = { __typename?: 'Mutation', requestToJoinTeam: { __typename?: 'GroupMember', groupMemberId: string, groupId: string, userId: string, status: string, createdAt: string, roles: Array<{ __typename?: 'GroupRole', groupRoleId: string, roleName: string, rank: number, isSystem: boolean, permissions: Array<string> }> } };

export type SetTeamMemberRolesMutationVariables = Exact<{
  input: SetMemberRolesInput;
}>;


export type SetTeamMemberRolesMutation = { __typename?: 'Mutation', setTeamMemberRoles: { __typename?: 'GroupMember', groupMemberId: string, groupId: string, userId: string, status: string, createdAt: string, roles: Array<{ __typename?: 'GroupRole', groupRoleId: string, roleName: string, rank: number, isSystem: boolean, permissions: Array<string> }> } };

export type SetTeamPolicyMutationVariables = Exact<{
  input: SetTeamPolicyInput;
}>;


export type SetTeamPolicyMutation = { __typename?: 'Mutation', setTeamPolicy: { __typename?: 'AppGroupPolicy', appId: string, groupType: string, creationPolicy: string, defaultMembershipPolicy: string, maxMembers: number | null, maxGroupsPerUser: number | null } };

export type TeamQueryVariables = Exact<{
  groupId: Scalars['BigInt']['input'];
}>;


export type TeamQuery = { __typename?: 'Query', team: { __typename?: 'Group', groupId: string, appId: string, groupType: string, name: string, description: string | null, ownerUserId: string | null, membershipPolicy: string, status: string, defaultRoleId: string | null, createdAt: string } };

export type TeamMembersQueryVariables = Exact<{
  groupId: Scalars['BigInt']['input'];
}>;


export type TeamMembersQuery = { __typename?: 'Query', teamMembers: Array<{ __typename?: 'GroupMember', groupMemberId: string, groupId: string, userId: string, status: string, createdAt: string, roles: Array<{ __typename?: 'GroupRole', groupRoleId: string, roleName: string, rank: number, isSystem: boolean, permissions: Array<string> }> }> };

export type TeamPolicyQueryVariables = Exact<{
  appId: Scalars['BigInt']['input'];
}>;


export type TeamPolicyQuery = { __typename?: 'Query', teamPolicy: { __typename?: 'AppGroupPolicy', appId: string, groupType: string, creationPolicy: string, defaultMembershipPolicy: string, maxMembers: number | null, maxGroupsPerUser: number | null } };

export type TeamRolesQueryVariables = Exact<{
  groupId: Scalars['BigInt']['input'];
}>;


export type TeamRolesQuery = { __typename?: 'Query', teamRoles: Array<{ __typename?: 'GroupRole', groupRoleId: string, groupId: string, roleName: string, rank: number, isSystem: boolean, permissions: Array<string>, createdAt: string }> };

export type TeamsQueryVariables = Exact<{
  appId: Scalars['BigInt']['input'];
}>;


export type TeamsQuery = { __typename?: 'Query', teams: Array<{ __typename?: 'Group', groupId: string, appId: string, groupType: string, name: string, description: string | null, ownerUserId: string | null, membershipPolicy: string, status: string, defaultRoleId: string | null, createdAt: string }> };

export type UpdateTeamMutationVariables = Exact<{
  input: UpdateTeamInput;
}>;


export type UpdateTeamMutation = { __typename?: 'Mutation', updateTeam: { __typename?: 'Group', groupId: string, appId: string, groupType: string, name: string, description: string | null, ownerUserId: string | null, membershipPolicy: string, status: string, defaultRoleId: string | null, createdAt: string } };

export type UpdateTeamRoleMutationVariables = Exact<{
  input: UpdateGroupRoleInput;
}>;


export type UpdateTeamRoleMutation = { __typename?: 'Mutation', updateTeamRole: { __typename?: 'GroupRole', groupRoleId: string, groupId: string, roleName: string, rank: number, isSystem: boolean, permissions: Array<string>, createdAt: string } };

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

export const GmSessionFieldsFragmentDoc = {"kind":"Document","definitions":[{"kind":"FragmentDefinition","name":{"kind":"Name","value":"GmSessionFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"GmSession"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"sessionId"}},{"kind":"Field","name":{"kind":"Name","value":"appId"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"createdByUserId"}},{"kind":"Field","name":{"kind":"Name","value":"currentTurnUserId"}},{"kind":"Field","name":{"kind":"Name","value":"metadataJson"}}]}}]} as unknown as DocumentNode<GmSessionFieldsFragment, unknown>;
export const GmContainerFieldsFragmentDoc = {"kind":"Document","definitions":[{"kind":"FragmentDefinition","name":{"kind":"Name","value":"GmContainerFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"GmContainer"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"containerId"}},{"kind":"Field","name":{"kind":"Name","value":"appId"}},{"kind":"Field","name":{"kind":"Name","value":"sessionId"}},{"kind":"Field","name":{"kind":"Name","value":"typeName"}},{"kind":"Field","name":{"kind":"Name","value":"displayName"}},{"kind":"Field","name":{"kind":"Name","value":"description"}},{"kind":"Field","name":{"kind":"Name","value":"ownerUserId"}},{"kind":"Field","name":{"kind":"Name","value":"metadataJson"}}]}}]} as unknown as DocumentNode<GmContainerFieldsFragment, unknown>;
export const GmInvokeResultFieldsFragmentDoc = {"kind":"Document","definitions":[{"kind":"FragmentDefinition","name":{"kind":"Name","value":"GmInvokeResultFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"GmInvokeResult"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"eventId"}},{"kind":"Field","name":{"kind":"Name","value":"functionName"}},{"kind":"Field","name":{"kind":"Name","value":"success"}},{"kind":"Field","name":{"kind":"Name","value":"returnValueJson"}},{"kind":"Field","name":{"kind":"Name","value":"errorMessage"}},{"kind":"Field","name":{"kind":"Name","value":"mutationsApplied"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"containerId"}},{"kind":"Field","name":{"kind":"Name","value":"key"}},{"kind":"Field","name":{"kind":"Name","value":"valueType"}},{"kind":"Field","name":{"kind":"Name","value":"oldValueJson"}},{"kind":"Field","name":{"kind":"Name","value":"newValueJson"}}]}}]}}]} as unknown as DocumentNode<GmInvokeResultFieldsFragment, unknown>;
export const GmFunctionFieldsFragmentDoc = {"kind":"Document","definitions":[{"kind":"FragmentDefinition","name":{"kind":"Name","value":"GmFunctionFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"GmFunction"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"functionId"}},{"kind":"Field","name":{"kind":"Name","value":"appId"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"containerTypeName"}},{"kind":"Field","name":{"kind":"Name","value":"description"}},{"kind":"Field","name":{"kind":"Name","value":"returnType"}},{"kind":"Field","name":{"kind":"Name","value":"invokeScope"}},{"kind":"Field","name":{"kind":"Name","value":"invokePolicyJson"}},{"kind":"Field","name":{"kind":"Name","value":"returnExpression"}},{"kind":"Field","name":{"kind":"Name","value":"warnings"}},{"kind":"Field","name":{"kind":"Name","value":"parameters"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"valueType"}},{"kind":"Field","name":{"kind":"Name","value":"required"}},{"kind":"Field","name":{"kind":"Name","value":"defaultValueJson"}},{"kind":"Field","name":{"kind":"Name","value":"description"}},{"kind":"Field","name":{"kind":"Name","value":"sortOrder"}}]}},{"kind":"Field","name":{"kind":"Name","value":"mutations"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"target"}},{"kind":"Field","name":{"kind":"Name","value":"property"}},{"kind":"Field","name":{"kind":"Name","value":"expression"}}]}}]}}]} as unknown as DocumentNode<GmFunctionFieldsFragment, unknown>;
export const GmPropertyDefFieldsFragmentDoc = {"kind":"Document","definitions":[{"kind":"FragmentDefinition","name":{"kind":"Name","value":"GmPropertyDefFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"GmPropertyDef"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"appId"}},{"kind":"Field","name":{"kind":"Name","value":"containerTypeName"}},{"kind":"Field","name":{"kind":"Name","value":"key"}},{"kind":"Field","name":{"kind":"Name","value":"valueType"}},{"kind":"Field","name":{"kind":"Name","value":"defaultValueJson"}},{"kind":"Field","name":{"kind":"Name","value":"visibility"}},{"kind":"Field","name":{"kind":"Name","value":"writable"}},{"kind":"Field","name":{"kind":"Name","value":"description"}}]}}]} as unknown as DocumentNode<GmPropertyDefFieldsFragment, unknown>;
export const ActorDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"Actor"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"uuid"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"actor"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"uuid"},"value":{"kind":"Variable","name":{"kind":"Name","value":"uuid"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"uuid"}},{"kind":"Field","name":{"kind":"Name","value":"appId"}},{"kind":"Field","name":{"kind":"Name","value":"userId"}},{"kind":"Field","name":{"kind":"Name","value":"avatarId"}},{"kind":"Field","name":{"kind":"Name","value":"chunk"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"x"}},{"kind":"Field","name":{"kind":"Name","value":"y"}},{"kind":"Field","name":{"kind":"Name","value":"z"}}]}},{"kind":"Field","name":{"kind":"Name","value":"privateState"}},{"kind":"Field","name":{"kind":"Name","value":"publicState"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}}]}}]}}]} as unknown as DocumentNode<ActorQuery, ActorQueryVariables>;
export const ActorsDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"Actors"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"filter"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"ActorFilterInput"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"actors"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"filter"},"value":{"kind":"Variable","name":{"kind":"Name","value":"filter"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"uuid"}},{"kind":"Field","name":{"kind":"Name","value":"appId"}},{"kind":"Field","name":{"kind":"Name","value":"userId"}},{"kind":"Field","name":{"kind":"Name","value":"avatarId"}},{"kind":"Field","name":{"kind":"Name","value":"chunk"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"x"}},{"kind":"Field","name":{"kind":"Name","value":"y"}},{"kind":"Field","name":{"kind":"Name","value":"z"}}]}},{"kind":"Field","name":{"kind":"Name","value":"privateState"}},{"kind":"Field","name":{"kind":"Name","value":"publicState"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}}]}}]}}]} as unknown as DocumentNode<ActorsQuery, ActorsQueryVariables>;
export const BatchLookupActorsDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"BatchLookupActors"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"input"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"BatchActorLookupInput"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"batchLookupActors"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"input"},"value":{"kind":"Variable","name":{"kind":"Name","value":"input"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"uuid"}},{"kind":"Field","name":{"kind":"Name","value":"appId"}},{"kind":"Field","name":{"kind":"Name","value":"userId"}},{"kind":"Field","name":{"kind":"Name","value":"avatarId"}},{"kind":"Field","name":{"kind":"Name","value":"chunk"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"x"}},{"kind":"Field","name":{"kind":"Name","value":"y"}},{"kind":"Field","name":{"kind":"Name","value":"z"}}]}},{"kind":"Field","name":{"kind":"Name","value":"privateState"}},{"kind":"Field","name":{"kind":"Name","value":"publicState"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}}]}}]}}]} as unknown as DocumentNode<BatchLookupActorsQuery, BatchLookupActorsQueryVariables>;
export const CreateActorDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"CreateActor"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"input"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"CreateActorInput"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"createActor"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"input"},"value":{"kind":"Variable","name":{"kind":"Name","value":"input"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"uuid"}},{"kind":"Field","name":{"kind":"Name","value":"appId"}},{"kind":"Field","name":{"kind":"Name","value":"userId"}},{"kind":"Field","name":{"kind":"Name","value":"avatarId"}},{"kind":"Field","name":{"kind":"Name","value":"chunk"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"x"}},{"kind":"Field","name":{"kind":"Name","value":"y"}},{"kind":"Field","name":{"kind":"Name","value":"z"}}]}},{"kind":"Field","name":{"kind":"Name","value":"privateState"}},{"kind":"Field","name":{"kind":"Name","value":"publicState"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}}]}}]}}]} as unknown as DocumentNode<CreateActorMutation, CreateActorMutationVariables>;
export const DeleteActorDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"DeleteActor"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"uuid"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"idempotencyKey"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"deleteActor"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"uuid"},"value":{"kind":"Variable","name":{"kind":"Name","value":"uuid"}}},{"kind":"Argument","name":{"kind":"Name","value":"idempotencyKey"},"value":{"kind":"Variable","name":{"kind":"Name","value":"idempotencyKey"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"uuid"}},{"kind":"Field","name":{"kind":"Name","value":"appId"}},{"kind":"Field","name":{"kind":"Name","value":"userId"}}]}}]}}]} as unknown as DocumentNode<DeleteActorMutation, DeleteActorMutationVariables>;
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
export const AppDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"App"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"appId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"BigInt"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"app"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"appId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"appId"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"appId"}},{"kind":"Field","name":{"kind":"Name","value":"orgId"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"slug"}},{"kind":"Field","name":{"kind":"Name","value":"description"}},{"kind":"Field","name":{"kind":"Name","value":"visibility"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"metadata"}},{"kind":"Field","name":{"kind":"Name","value":"splitMode"}},{"kind":"Field","name":{"kind":"Name","value":"deploymentTarget"}},{"kind":"Field","name":{"kind":"Name","value":"runtimeStatus"}},{"kind":"Field","name":{"kind":"Name","value":"runtimeDenialReason"}},{"kind":"Field","name":{"kind":"Name","value":"gameApiUrl"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}},{"kind":"Field","name":{"kind":"Name","value":"org"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"orgId"}},{"kind":"Field","name":{"kind":"Name","value":"slug"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}}]}}]}}]} as unknown as DocumentNode<AppQuery, AppQueryVariables>;
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
export const GameModelCreateSessionDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"GameModelCreateSession"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"input"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"CreateSessionInput"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"gameModelCreateSession"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"input"},"value":{"kind":"Variable","name":{"kind":"Name","value":"input"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"GmSessionFields"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"GmSessionFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"GmSession"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"sessionId"}},{"kind":"Field","name":{"kind":"Name","value":"appId"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"createdByUserId"}},{"kind":"Field","name":{"kind":"Name","value":"currentTurnUserId"}},{"kind":"Field","name":{"kind":"Name","value":"metadataJson"}}]}}]} as unknown as DocumentNode<GameModelCreateSessionMutation, GameModelCreateSessionMutationVariables>;
export const GameModelJoinSessionDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"GameModelJoinSession"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"input"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"JoinSessionInput"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"gameModelJoinSession"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"input"},"value":{"kind":"Variable","name":{"kind":"Name","value":"input"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"sessionId"}},{"kind":"Field","name":{"kind":"Name","value":"userId"}},{"kind":"Field","name":{"kind":"Name","value":"role"}}]}}]}}]} as unknown as DocumentNode<GameModelJoinSessionMutation, GameModelJoinSessionMutationVariables>;
export const GameModelSetSessionTurnDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"GameModelSetSessionTurn"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"input"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"SetSessionTurnInput"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"gameModelSetSessionTurn"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"input"},"value":{"kind":"Variable","name":{"kind":"Name","value":"input"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"GmSessionFields"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"GmSessionFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"GmSession"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"sessionId"}},{"kind":"Field","name":{"kind":"Name","value":"appId"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"createdByUserId"}},{"kind":"Field","name":{"kind":"Name","value":"currentTurnUserId"}},{"kind":"Field","name":{"kind":"Name","value":"metadataJson"}}]}}]} as unknown as DocumentNode<GameModelSetSessionTurnMutation, GameModelSetSessionTurnMutationVariables>;
export const GameModelCreateContainerDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"GameModelCreateContainer"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"input"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"CreateContainerInput"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"gameModelCreateContainer"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"input"},"value":{"kind":"Variable","name":{"kind":"Name","value":"input"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"GmContainerFields"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"GmContainerFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"GmContainer"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"containerId"}},{"kind":"Field","name":{"kind":"Name","value":"appId"}},{"kind":"Field","name":{"kind":"Name","value":"sessionId"}},{"kind":"Field","name":{"kind":"Name","value":"typeName"}},{"kind":"Field","name":{"kind":"Name","value":"displayName"}},{"kind":"Field","name":{"kind":"Name","value":"description"}},{"kind":"Field","name":{"kind":"Name","value":"ownerUserId"}},{"kind":"Field","name":{"kind":"Name","value":"metadataJson"}}]}}]} as unknown as DocumentNode<GameModelCreateContainerMutation, GameModelCreateContainerMutationVariables>;
export const GameModelSetPropertyDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"GameModelSetProperty"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"input"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"SetContainerPropertyInput"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"gameModelSetProperty"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"input"},"value":{"kind":"Variable","name":{"kind":"Name","value":"input"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"GmContainerFields"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"GmContainerFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"GmContainer"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"containerId"}},{"kind":"Field","name":{"kind":"Name","value":"appId"}},{"kind":"Field","name":{"kind":"Name","value":"sessionId"}},{"kind":"Field","name":{"kind":"Name","value":"typeName"}},{"kind":"Field","name":{"kind":"Name","value":"displayName"}},{"kind":"Field","name":{"kind":"Name","value":"description"}},{"kind":"Field","name":{"kind":"Name","value":"ownerUserId"}},{"kind":"Field","name":{"kind":"Name","value":"metadataJson"}}]}}]} as unknown as DocumentNode<GameModelSetPropertyMutation, GameModelSetPropertyMutationVariables>;
export const GameModelAddEdgeDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"GameModelAddEdge"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"input"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"AddEdgeInput"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"gameModelAddEdge"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"input"},"value":{"kind":"Variable","name":{"kind":"Name","value":"input"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"edgeId"}},{"kind":"Field","name":{"kind":"Name","value":"fromContainerId"}},{"kind":"Field","name":{"kind":"Name","value":"toContainerId"}},{"kind":"Field","name":{"kind":"Name","value":"relationshipType"}},{"kind":"Field","name":{"kind":"Name","value":"weight"}}]}}]}}]} as unknown as DocumentNode<GameModelAddEdgeMutation, GameModelAddEdgeMutationVariables>;
export const GameModelInvokeDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"GameModelInvoke"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"input"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"InvokeFunctionInput"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"gameModelInvoke"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"input"},"value":{"kind":"Variable","name":{"kind":"Name","value":"input"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"GmInvokeResultFields"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"GmInvokeResultFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"GmInvokeResult"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"eventId"}},{"kind":"Field","name":{"kind":"Name","value":"functionName"}},{"kind":"Field","name":{"kind":"Name","value":"success"}},{"kind":"Field","name":{"kind":"Name","value":"returnValueJson"}},{"kind":"Field","name":{"kind":"Name","value":"errorMessage"}},{"kind":"Field","name":{"kind":"Name","value":"mutationsApplied"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"containerId"}},{"kind":"Field","name":{"kind":"Name","value":"key"}},{"kind":"Field","name":{"kind":"Name","value":"valueType"}},{"kind":"Field","name":{"kind":"Name","value":"oldValueJson"}},{"kind":"Field","name":{"kind":"Name","value":"newValueJson"}}]}}]}}]} as unknown as DocumentNode<GameModelInvokeMutation, GameModelInvokeMutationVariables>;
export const GameModelContainerDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"GameModelContainer"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"appId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"BigInt"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"containerId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"gameModelContainer"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"appId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"appId"}}},{"kind":"Argument","name":{"kind":"Name","value":"containerId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"containerId"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"GmContainerFields"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"GmContainerFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"GmContainer"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"containerId"}},{"kind":"Field","name":{"kind":"Name","value":"appId"}},{"kind":"Field","name":{"kind":"Name","value":"sessionId"}},{"kind":"Field","name":{"kind":"Name","value":"typeName"}},{"kind":"Field","name":{"kind":"Name","value":"displayName"}},{"kind":"Field","name":{"kind":"Name","value":"description"}},{"kind":"Field","name":{"kind":"Name","value":"ownerUserId"}},{"kind":"Field","name":{"kind":"Name","value":"metadataJson"}}]}}]} as unknown as DocumentNode<GameModelContainerQuery, GameModelContainerQueryVariables>;
export const GameModelContainersDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"GameModelContainers"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"appId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"BigInt"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"typeName"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"sessionId"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"gameModelContainers"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"appId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"appId"}}},{"kind":"Argument","name":{"kind":"Name","value":"typeName"},"value":{"kind":"Variable","name":{"kind":"Name","value":"typeName"}}},{"kind":"Argument","name":{"kind":"Name","value":"sessionId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"sessionId"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"GmContainerFields"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"GmContainerFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"GmContainer"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"containerId"}},{"kind":"Field","name":{"kind":"Name","value":"appId"}},{"kind":"Field","name":{"kind":"Name","value":"sessionId"}},{"kind":"Field","name":{"kind":"Name","value":"typeName"}},{"kind":"Field","name":{"kind":"Name","value":"displayName"}},{"kind":"Field","name":{"kind":"Name","value":"description"}},{"kind":"Field","name":{"kind":"Name","value":"ownerUserId"}},{"kind":"Field","name":{"kind":"Name","value":"metadataJson"}}]}}]} as unknown as DocumentNode<GameModelContainersQuery, GameModelContainersQueryVariables>;
export const GameModelContainerStateDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"GameModelContainerState"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"appId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"BigInt"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"containerId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"gameModelContainerState"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"appId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"appId"}}},{"kind":"Argument","name":{"kind":"Name","value":"containerId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"containerId"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"containerId"}},{"kind":"Field","name":{"kind":"Name","value":"appId"}},{"kind":"Field","name":{"kind":"Name","value":"sessionId"}},{"kind":"Field","name":{"kind":"Name","value":"typeName"}},{"kind":"Field","name":{"kind":"Name","value":"displayName"}},{"kind":"Field","name":{"kind":"Name","value":"ownerUserId"}},{"kind":"Field","name":{"kind":"Name","value":"propertiesJson"}}]}}]}}]} as unknown as DocumentNode<GameModelContainerStateQuery, GameModelContainerStateQueryVariables>;
export const GameModelTraverseDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"GameModelTraverse"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"appId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"BigInt"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"rootId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"relationshipType"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"depth"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"Int"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"gameModelTraverse"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"appId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"appId"}}},{"kind":"Argument","name":{"kind":"Name","value":"rootId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"rootId"}}},{"kind":"Argument","name":{"kind":"Name","value":"relationshipType"},"value":{"kind":"Variable","name":{"kind":"Name","value":"relationshipType"}}},{"kind":"Argument","name":{"kind":"Name","value":"depth"},"value":{"kind":"Variable","name":{"kind":"Name","value":"depth"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"rootId"}},{"kind":"Field","name":{"kind":"Name","value":"nodes"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"GmContainerFields"}}]}},{"kind":"Field","name":{"kind":"Name","value":"edges"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"edgeId"}},{"kind":"Field","name":{"kind":"Name","value":"fromContainerId"}},{"kind":"Field","name":{"kind":"Name","value":"toContainerId"}},{"kind":"Field","name":{"kind":"Name","value":"relationshipType"}},{"kind":"Field","name":{"kind":"Name","value":"weight"}}]}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"GmContainerFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"GmContainer"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"containerId"}},{"kind":"Field","name":{"kind":"Name","value":"appId"}},{"kind":"Field","name":{"kind":"Name","value":"sessionId"}},{"kind":"Field","name":{"kind":"Name","value":"typeName"}},{"kind":"Field","name":{"kind":"Name","value":"displayName"}},{"kind":"Field","name":{"kind":"Name","value":"description"}},{"kind":"Field","name":{"kind":"Name","value":"ownerUserId"}},{"kind":"Field","name":{"kind":"Name","value":"metadataJson"}}]}}]} as unknown as DocumentNode<GameModelTraverseQuery, GameModelTraverseQueryVariables>;
export const GameModelSessionDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"GameModelSession"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"appId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"BigInt"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"sessionId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"gameModelSession"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"appId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"appId"}}},{"kind":"Argument","name":{"kind":"Name","value":"sessionId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"sessionId"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"GmSessionFields"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"GmSessionFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"GmSession"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"sessionId"}},{"kind":"Field","name":{"kind":"Name","value":"appId"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"createdByUserId"}},{"kind":"Field","name":{"kind":"Name","value":"currentTurnUserId"}},{"kind":"Field","name":{"kind":"Name","value":"metadataJson"}}]}}]} as unknown as DocumentNode<GameModelSessionQuery, GameModelSessionQueryVariables>;
export const GameModelSessionsDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"GameModelSessions"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"appId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"BigInt"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"status"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"gameModelSessions"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"appId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"appId"}}},{"kind":"Argument","name":{"kind":"Name","value":"status"},"value":{"kind":"Variable","name":{"kind":"Name","value":"status"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"GmSessionFields"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"GmSessionFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"GmSession"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"sessionId"}},{"kind":"Field","name":{"kind":"Name","value":"appId"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"createdByUserId"}},{"kind":"Field","name":{"kind":"Name","value":"currentTurnUserId"}},{"kind":"Field","name":{"kind":"Name","value":"metadataJson"}}]}}]} as unknown as DocumentNode<GameModelSessionsQuery, GameModelSessionsQueryVariables>;
export const GameModelEventsDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"GameModelEvents"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"appId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"BigInt"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"sessionId"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"selfContainerId"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"functionName"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"success"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"Boolean"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"limit"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"Int"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"offset"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"Int"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"gameModelEvents"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"appId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"appId"}}},{"kind":"Argument","name":{"kind":"Name","value":"sessionId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"sessionId"}}},{"kind":"Argument","name":{"kind":"Name","value":"selfContainerId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"selfContainerId"}}},{"kind":"Argument","name":{"kind":"Name","value":"functionName"},"value":{"kind":"Variable","name":{"kind":"Name","value":"functionName"}}},{"kind":"Argument","name":{"kind":"Name","value":"success"},"value":{"kind":"Variable","name":{"kind":"Name","value":"success"}}},{"kind":"Argument","name":{"kind":"Name","value":"limit"},"value":{"kind":"Variable","name":{"kind":"Name","value":"limit"}}},{"kind":"Argument","name":{"kind":"Name","value":"offset"},"value":{"kind":"Variable","name":{"kind":"Name","value":"offset"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"eventId"}},{"kind":"Field","name":{"kind":"Name","value":"sessionId"}},{"kind":"Field","name":{"kind":"Name","value":"functionName"}},{"kind":"Field","name":{"kind":"Name","value":"selfContainerId"}},{"kind":"Field","name":{"kind":"Name","value":"callerUserId"}},{"kind":"Field","name":{"kind":"Name","value":"paramsJson"}},{"kind":"Field","name":{"kind":"Name","value":"mutationsAppliedJson"}},{"kind":"Field","name":{"kind":"Name","value":"returnValueJson"}},{"kind":"Field","name":{"kind":"Name","value":"success"}},{"kind":"Field","name":{"kind":"Name","value":"errorMessage"}},{"kind":"Field","name":{"kind":"Name","value":"executedAt"}}]}}]}}]} as unknown as DocumentNode<GameModelEventsQuery, GameModelEventsQueryVariables>;
export const GameModelSeedDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"GameModelSeed"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"input"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"SeedGameModelInput"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"gameModelSeed"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"input"},"value":{"kind":"Variable","name":{"kind":"Name","value":"input"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"containerTypesCreated"}},{"kind":"Field","name":{"kind":"Name","value":"propertyDefinitionsCreated"}},{"kind":"Field","name":{"kind":"Name","value":"functionsCreated"}},{"kind":"Field","name":{"kind":"Name","value":"containersCreated"}},{"kind":"Field","name":{"kind":"Name","value":"edgesCreated"}},{"kind":"Field","name":{"kind":"Name","value":"warnings"}},{"kind":"Field","name":{"kind":"Name","value":"idMapJson"}}]}}]}}]} as unknown as DocumentNode<GameModelSeedMutation, GameModelSeedMutationVariables>;
export const GameModelUpsertContainerTypeDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"GameModelUpsertContainerType"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"input"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"UpsertContainerTypeInput"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"gameModelUpsertContainerType"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"input"},"value":{"kind":"Variable","name":{"kind":"Name","value":"input"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"appId"}},{"kind":"Field","name":{"kind":"Name","value":"typeName"}},{"kind":"Field","name":{"kind":"Name","value":"displayName"}},{"kind":"Field","name":{"kind":"Name","value":"description"}},{"kind":"Field","name":{"kind":"Name","value":"instantiableBy"}},{"kind":"Field","name":{"kind":"Name","value":"defaultPropertyVisibility"}},{"kind":"Field","name":{"kind":"Name","value":"metadataJson"}}]}}]}}]} as unknown as DocumentNode<GameModelUpsertContainerTypeMutation, GameModelUpsertContainerTypeMutationVariables>;
export const GameModelUpsertPropertyDefDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"GameModelUpsertPropertyDef"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"input"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"UpsertPropertyDefInput"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"gameModelUpsertPropertyDef"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"input"},"value":{"kind":"Variable","name":{"kind":"Name","value":"input"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"GmPropertyDefFields"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"GmPropertyDefFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"GmPropertyDef"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"appId"}},{"kind":"Field","name":{"kind":"Name","value":"containerTypeName"}},{"kind":"Field","name":{"kind":"Name","value":"key"}},{"kind":"Field","name":{"kind":"Name","value":"valueType"}},{"kind":"Field","name":{"kind":"Name","value":"defaultValueJson"}},{"kind":"Field","name":{"kind":"Name","value":"visibility"}},{"kind":"Field","name":{"kind":"Name","value":"writable"}},{"kind":"Field","name":{"kind":"Name","value":"description"}}]}}]} as unknown as DocumentNode<GameModelUpsertPropertyDefMutation, GameModelUpsertPropertyDefMutationVariables>;
export const GameModelUpsertFunctionDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"GameModelUpsertFunction"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"input"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"UpsertFunctionInput"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"gameModelUpsertFunction"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"input"},"value":{"kind":"Variable","name":{"kind":"Name","value":"input"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"GmFunctionFields"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"GmFunctionFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"GmFunction"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"functionId"}},{"kind":"Field","name":{"kind":"Name","value":"appId"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"containerTypeName"}},{"kind":"Field","name":{"kind":"Name","value":"description"}},{"kind":"Field","name":{"kind":"Name","value":"returnType"}},{"kind":"Field","name":{"kind":"Name","value":"invokeScope"}},{"kind":"Field","name":{"kind":"Name","value":"invokePolicyJson"}},{"kind":"Field","name":{"kind":"Name","value":"returnExpression"}},{"kind":"Field","name":{"kind":"Name","value":"warnings"}},{"kind":"Field","name":{"kind":"Name","value":"parameters"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"valueType"}},{"kind":"Field","name":{"kind":"Name","value":"required"}},{"kind":"Field","name":{"kind":"Name","value":"defaultValueJson"}},{"kind":"Field","name":{"kind":"Name","value":"description"}},{"kind":"Field","name":{"kind":"Name","value":"sortOrder"}}]}},{"kind":"Field","name":{"kind":"Name","value":"mutations"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"target"}},{"kind":"Field","name":{"kind":"Name","value":"property"}},{"kind":"Field","name":{"kind":"Name","value":"expression"}}]}}]}}]} as unknown as DocumentNode<GameModelUpsertFunctionMutation, GameModelUpsertFunctionMutationVariables>;
export const GameModelDeleteFunctionDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"GameModelDeleteFunction"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"appId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"BigInt"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"name"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"gameModelDeleteFunction"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"appId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"appId"}}},{"kind":"Argument","name":{"kind":"Name","value":"name"},"value":{"kind":"Variable","name":{"kind":"Name","value":"name"}}}]}]}}]} as unknown as DocumentNode<GameModelDeleteFunctionMutation, GameModelDeleteFunctionMutationVariables>;
export const GameModelDefineFeatureDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"GameModelDefineFeature"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"input"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"DefineAppFeatureInput"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"gameModelDefineFeature"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"input"},"value":{"kind":"Variable","name":{"kind":"Name","value":"input"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"appId"}},{"kind":"Field","name":{"kind":"Name","value":"featureKey"}},{"kind":"Field","name":{"kind":"Name","value":"description"}}]}}]}}]} as unknown as DocumentNode<GameModelDefineFeatureMutation, GameModelDefineFeatureMutationVariables>;
export const GameModelGrantTierFeatureDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"GameModelGrantTierFeature"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"input"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"GrantTierFeatureInput"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"gameModelGrantTierFeature"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"input"},"value":{"kind":"Variable","name":{"kind":"Name","value":"input"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"appId"}},{"kind":"Field","name":{"kind":"Name","value":"tierId"}},{"kind":"Field","name":{"kind":"Name","value":"featureKey"}}]}}]}}]} as unknown as DocumentNode<GameModelGrantTierFeatureMutation, GameModelGrantTierFeatureMutationVariables>;
export const GameModelSetPolicyDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"GameModelSetPolicy"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"input"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"SetGameModelPolicyInput"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"gameModelSetPolicy"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"input"},"value":{"kind":"Variable","name":{"kind":"Name","value":"input"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"appId"}},{"kind":"Field","name":{"kind":"Name","value":"sessionCreationPolicy"}},{"kind":"Field","name":{"kind":"Name","value":"defaultParticipantRole"}}]}}]}}]} as unknown as DocumentNode<GameModelSetPolicyMutation, GameModelSetPolicyMutationVariables>;
export const GameModelTypeSchemaDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"GameModelTypeSchema"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"appId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"BigInt"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"typeName"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"gameModelTypeSchema"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"appId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"appId"}}},{"kind":"Argument","name":{"kind":"Name","value":"typeName"},"value":{"kind":"Variable","name":{"kind":"Name","value":"typeName"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"typeName"}},{"kind":"Field","name":{"kind":"Name","value":"propertyDefinitions"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"GmPropertyDefFields"}}]}},{"kind":"Field","name":{"kind":"Name","value":"functions"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"GmFunctionFields"}}]}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"GmFunctionFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"GmFunction"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"functionId"}},{"kind":"Field","name":{"kind":"Name","value":"appId"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"containerTypeName"}},{"kind":"Field","name":{"kind":"Name","value":"description"}},{"kind":"Field","name":{"kind":"Name","value":"returnType"}},{"kind":"Field","name":{"kind":"Name","value":"invokeScope"}},{"kind":"Field","name":{"kind":"Name","value":"invokePolicyJson"}},{"kind":"Field","name":{"kind":"Name","value":"returnExpression"}},{"kind":"Field","name":{"kind":"Name","value":"warnings"}},{"kind":"Field","name":{"kind":"Name","value":"parameters"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"valueType"}},{"kind":"Field","name":{"kind":"Name","value":"required"}},{"kind":"Field","name":{"kind":"Name","value":"defaultValueJson"}},{"kind":"Field","name":{"kind":"Name","value":"description"}},{"kind":"Field","name":{"kind":"Name","value":"sortOrder"}}]}},{"kind":"Field","name":{"kind":"Name","value":"mutations"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"target"}},{"kind":"Field","name":{"kind":"Name","value":"property"}},{"kind":"Field","name":{"kind":"Name","value":"expression"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"GmPropertyDefFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"GmPropertyDef"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"appId"}},{"kind":"Field","name":{"kind":"Name","value":"containerTypeName"}},{"kind":"Field","name":{"kind":"Name","value":"key"}},{"kind":"Field","name":{"kind":"Name","value":"valueType"}},{"kind":"Field","name":{"kind":"Name","value":"defaultValueJson"}},{"kind":"Field","name":{"kind":"Name","value":"visibility"}},{"kind":"Field","name":{"kind":"Name","value":"writable"}},{"kind":"Field","name":{"kind":"Name","value":"description"}}]}}]} as unknown as DocumentNode<GameModelTypeSchemaQuery, GameModelTypeSchemaQueryVariables>;
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
export const PlatformConfigDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"PlatformConfig"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"platformConfig"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"sharedGameApiUrl"}},{"kind":"Field","name":{"kind":"Name","value":"sharedGameApiWsUrl"}},{"kind":"Field","name":{"kind":"Name","value":"freeAppsPerOrg"}}]}}]}}]} as unknown as DocumentNode<PlatformConfigQuery, PlatformConfigQueryVariables>;
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
export const AddTeamMemberDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"AddTeamMember"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"groupId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"BigInt"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"userId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"BigInt"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"addTeamMember"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"groupId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"groupId"}}},{"kind":"Argument","name":{"kind":"Name","value":"userId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"userId"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"groupMemberId"}},{"kind":"Field","name":{"kind":"Name","value":"groupId"}},{"kind":"Field","name":{"kind":"Name","value":"userId"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"roles"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"groupRoleId"}},{"kind":"Field","name":{"kind":"Name","value":"roleName"}},{"kind":"Field","name":{"kind":"Name","value":"rank"}},{"kind":"Field","name":{"kind":"Name","value":"isSystem"}},{"kind":"Field","name":{"kind":"Name","value":"permissions"}}]}}]}}]}}]} as unknown as DocumentNode<AddTeamMemberMutation, AddTeamMemberMutationVariables>;
export const CreateTeamDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"CreateTeam"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"input"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"CreateTeamInput"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"createTeam"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"input"},"value":{"kind":"Variable","name":{"kind":"Name","value":"input"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"groupId"}},{"kind":"Field","name":{"kind":"Name","value":"appId"}},{"kind":"Field","name":{"kind":"Name","value":"groupType"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"description"}},{"kind":"Field","name":{"kind":"Name","value":"ownerUserId"}},{"kind":"Field","name":{"kind":"Name","value":"membershipPolicy"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"defaultRoleId"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}}]}}]}}]} as unknown as DocumentNode<CreateTeamMutation, CreateTeamMutationVariables>;
export const CreateTeamRoleDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"CreateTeamRole"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"input"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"CreateGroupRoleInput"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"createTeamRole"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"input"},"value":{"kind":"Variable","name":{"kind":"Name","value":"input"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"groupRoleId"}},{"kind":"Field","name":{"kind":"Name","value":"groupId"}},{"kind":"Field","name":{"kind":"Name","value":"roleName"}},{"kind":"Field","name":{"kind":"Name","value":"rank"}},{"kind":"Field","name":{"kind":"Name","value":"isSystem"}},{"kind":"Field","name":{"kind":"Name","value":"permissions"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}}]}}]}}]} as unknown as DocumentNode<CreateTeamRoleMutation, CreateTeamRoleMutationVariables>;
export const DeleteTeamDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"DeleteTeam"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"groupId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"BigInt"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"idempotencyKey"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"deleteTeam"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"groupId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"groupId"}}},{"kind":"Argument","name":{"kind":"Name","value":"idempotencyKey"},"value":{"kind":"Variable","name":{"kind":"Name","value":"idempotencyKey"}}}]}]}}]} as unknown as DocumentNode<DeleteTeamMutation, DeleteTeamMutationVariables>;
export const DeleteTeamRoleDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"DeleteTeamRole"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"groupRoleId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"BigInt"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"deleteTeamRole"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"groupRoleId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"groupRoleId"}}}]}]}}]} as unknown as DocumentNode<DeleteTeamRoleMutation, DeleteTeamRoleMutationVariables>;
export const JoinTeamDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"JoinTeam"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"groupId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"BigInt"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"joinTeam"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"groupId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"groupId"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"groupMemberId"}},{"kind":"Field","name":{"kind":"Name","value":"groupId"}},{"kind":"Field","name":{"kind":"Name","value":"userId"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"roles"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"groupRoleId"}},{"kind":"Field","name":{"kind":"Name","value":"roleName"}},{"kind":"Field","name":{"kind":"Name","value":"rank"}},{"kind":"Field","name":{"kind":"Name","value":"isSystem"}},{"kind":"Field","name":{"kind":"Name","value":"permissions"}}]}}]}}]}}]} as unknown as DocumentNode<JoinTeamMutation, JoinTeamMutationVariables>;
export const LeaveTeamDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"LeaveTeam"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"groupId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"BigInt"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"idempotencyKey"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"leaveTeam"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"groupId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"groupId"}}},{"kind":"Argument","name":{"kind":"Name","value":"idempotencyKey"},"value":{"kind":"Variable","name":{"kind":"Name","value":"idempotencyKey"}}}]}]}}]} as unknown as DocumentNode<LeaveTeamMutation, LeaveTeamMutationVariables>;
export const MyTeamsDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"MyTeams"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"appId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"BigInt"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"myTeams"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"appId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"appId"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"group"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"groupId"}},{"kind":"Field","name":{"kind":"Name","value":"appId"}},{"kind":"Field","name":{"kind":"Name","value":"groupType"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"description"}},{"kind":"Field","name":{"kind":"Name","value":"ownerUserId"}},{"kind":"Field","name":{"kind":"Name","value":"membershipPolicy"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"defaultRoleId"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}}]}},{"kind":"Field","name":{"kind":"Name","value":"roles"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"groupRoleId"}},{"kind":"Field","name":{"kind":"Name","value":"roleName"}},{"kind":"Field","name":{"kind":"Name","value":"rank"}},{"kind":"Field","name":{"kind":"Name","value":"isSystem"}},{"kind":"Field","name":{"kind":"Name","value":"permissions"}}]}},{"kind":"Field","name":{"kind":"Name","value":"permissions"}},{"kind":"Field","name":{"kind":"Name","value":"joinedAt"}}]}}]}}]} as unknown as DocumentNode<MyTeamsQuery, MyTeamsQueryVariables>;
export const RemoveTeamMemberDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"RemoveTeamMember"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"groupId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"BigInt"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"userId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"BigInt"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"removeTeamMember"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"groupId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"groupId"}}},{"kind":"Argument","name":{"kind":"Name","value":"userId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"userId"}}}]}]}}]} as unknown as DocumentNode<RemoveTeamMemberMutation, RemoveTeamMemberMutationVariables>;
export const RequestToJoinTeamDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"RequestToJoinTeam"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"groupId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"BigInt"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"requestToJoinTeam"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"groupId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"groupId"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"groupMemberId"}},{"kind":"Field","name":{"kind":"Name","value":"groupId"}},{"kind":"Field","name":{"kind":"Name","value":"userId"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"roles"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"groupRoleId"}},{"kind":"Field","name":{"kind":"Name","value":"roleName"}},{"kind":"Field","name":{"kind":"Name","value":"rank"}},{"kind":"Field","name":{"kind":"Name","value":"isSystem"}},{"kind":"Field","name":{"kind":"Name","value":"permissions"}}]}}]}}]}}]} as unknown as DocumentNode<RequestToJoinTeamMutation, RequestToJoinTeamMutationVariables>;
export const SetTeamMemberRolesDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"SetTeamMemberRoles"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"input"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"SetMemberRolesInput"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"setTeamMemberRoles"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"input"},"value":{"kind":"Variable","name":{"kind":"Name","value":"input"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"groupMemberId"}},{"kind":"Field","name":{"kind":"Name","value":"groupId"}},{"kind":"Field","name":{"kind":"Name","value":"userId"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"roles"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"groupRoleId"}},{"kind":"Field","name":{"kind":"Name","value":"roleName"}},{"kind":"Field","name":{"kind":"Name","value":"rank"}},{"kind":"Field","name":{"kind":"Name","value":"isSystem"}},{"kind":"Field","name":{"kind":"Name","value":"permissions"}}]}}]}}]}}]} as unknown as DocumentNode<SetTeamMemberRolesMutation, SetTeamMemberRolesMutationVariables>;
export const SetTeamPolicyDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"SetTeamPolicy"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"input"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"SetTeamPolicyInput"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"setTeamPolicy"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"input"},"value":{"kind":"Variable","name":{"kind":"Name","value":"input"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"appId"}},{"kind":"Field","name":{"kind":"Name","value":"groupType"}},{"kind":"Field","name":{"kind":"Name","value":"creationPolicy"}},{"kind":"Field","name":{"kind":"Name","value":"defaultMembershipPolicy"}},{"kind":"Field","name":{"kind":"Name","value":"maxMembers"}},{"kind":"Field","name":{"kind":"Name","value":"maxGroupsPerUser"}}]}}]}}]} as unknown as DocumentNode<SetTeamPolicyMutation, SetTeamPolicyMutationVariables>;
export const TeamDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"Team"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"groupId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"BigInt"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"team"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"groupId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"groupId"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"groupId"}},{"kind":"Field","name":{"kind":"Name","value":"appId"}},{"kind":"Field","name":{"kind":"Name","value":"groupType"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"description"}},{"kind":"Field","name":{"kind":"Name","value":"ownerUserId"}},{"kind":"Field","name":{"kind":"Name","value":"membershipPolicy"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"defaultRoleId"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}}]}}]}}]} as unknown as DocumentNode<TeamQuery, TeamQueryVariables>;
export const TeamMembersDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"TeamMembers"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"groupId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"BigInt"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"teamMembers"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"groupId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"groupId"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"groupMemberId"}},{"kind":"Field","name":{"kind":"Name","value":"groupId"}},{"kind":"Field","name":{"kind":"Name","value":"userId"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"roles"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"groupRoleId"}},{"kind":"Field","name":{"kind":"Name","value":"roleName"}},{"kind":"Field","name":{"kind":"Name","value":"rank"}},{"kind":"Field","name":{"kind":"Name","value":"isSystem"}},{"kind":"Field","name":{"kind":"Name","value":"permissions"}}]}}]}}]}}]} as unknown as DocumentNode<TeamMembersQuery, TeamMembersQueryVariables>;
export const TeamPolicyDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"TeamPolicy"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"appId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"BigInt"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"teamPolicy"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"appId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"appId"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"appId"}},{"kind":"Field","name":{"kind":"Name","value":"groupType"}},{"kind":"Field","name":{"kind":"Name","value":"creationPolicy"}},{"kind":"Field","name":{"kind":"Name","value":"defaultMembershipPolicy"}},{"kind":"Field","name":{"kind":"Name","value":"maxMembers"}},{"kind":"Field","name":{"kind":"Name","value":"maxGroupsPerUser"}}]}}]}}]} as unknown as DocumentNode<TeamPolicyQuery, TeamPolicyQueryVariables>;
export const TeamRolesDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"TeamRoles"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"groupId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"BigInt"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"teamRoles"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"groupId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"groupId"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"groupRoleId"}},{"kind":"Field","name":{"kind":"Name","value":"groupId"}},{"kind":"Field","name":{"kind":"Name","value":"roleName"}},{"kind":"Field","name":{"kind":"Name","value":"rank"}},{"kind":"Field","name":{"kind":"Name","value":"isSystem"}},{"kind":"Field","name":{"kind":"Name","value":"permissions"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}}]}}]}}]} as unknown as DocumentNode<TeamRolesQuery, TeamRolesQueryVariables>;
export const TeamsDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"Teams"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"appId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"BigInt"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"teams"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"appId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"appId"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"groupId"}},{"kind":"Field","name":{"kind":"Name","value":"appId"}},{"kind":"Field","name":{"kind":"Name","value":"groupType"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"description"}},{"kind":"Field","name":{"kind":"Name","value":"ownerUserId"}},{"kind":"Field","name":{"kind":"Name","value":"membershipPolicy"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"defaultRoleId"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}}]}}]}}]} as unknown as DocumentNode<TeamsQuery, TeamsQueryVariables>;
export const UpdateTeamDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"UpdateTeam"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"input"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"UpdateTeamInput"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"updateTeam"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"input"},"value":{"kind":"Variable","name":{"kind":"Name","value":"input"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"groupId"}},{"kind":"Field","name":{"kind":"Name","value":"appId"}},{"kind":"Field","name":{"kind":"Name","value":"groupType"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"description"}},{"kind":"Field","name":{"kind":"Name","value":"ownerUserId"}},{"kind":"Field","name":{"kind":"Name","value":"membershipPolicy"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"defaultRoleId"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}}]}}]}}]} as unknown as DocumentNode<UpdateTeamMutation, UpdateTeamMutationVariables>;
export const UpdateTeamRoleDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"UpdateTeamRole"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"input"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"UpdateGroupRoleInput"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"updateTeamRole"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"input"},"value":{"kind":"Variable","name":{"kind":"Name","value":"input"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"groupRoleId"}},{"kind":"Field","name":{"kind":"Name","value":"groupId"}},{"kind":"Field","name":{"kind":"Name","value":"roleName"}},{"kind":"Field","name":{"kind":"Name","value":"rank"}},{"kind":"Field","name":{"kind":"Name","value":"isSystem"}},{"kind":"Field","name":{"kind":"Name","value":"permissions"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}}]}}]}}]} as unknown as DocumentNode<UpdateTeamRoleMutation, UpdateTeamRoleMutationVariables>;
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