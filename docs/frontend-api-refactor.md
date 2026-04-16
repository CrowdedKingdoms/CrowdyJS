# Frontend Migration Guide: Multi-Tenancy API Changes

This document covers all breaking changes to the GraphQL and UDP APIs. Every `mapId` field has been renamed to `appId` across the entire API surface. There are also new API endpoints for organizations, billing, quotas, and app access.

## Quick Summary

- Every `mapId` field is now `appId` (same type: `BigInt`)
- Error codes `MAP_NOT_FOUND`, `MAP_NOT_LOADED`, `INVALID_MAP_ID` are now `APP_NOT_FOUND`, `APP_NOT_LOADED`, `INVALID_APP_ID`
- `userMapState` / `userMapStates` queries are now `userAppState` / `userAppStates`
- `updateUserMapState` / `deleteUserMapState` mutations are now `updateUserAppState` / `deleteUserAppState`
- The `User` type has new nullable fields: `orgId`, `externalId`, `userType`
- The `GameToken` type has new nullable fields: `appId`, `orgId`
- UDP wire format: the 8-byte field at offset 1 in spatial headers is the same binary layout, just semantically renamed from map ID to app ID

---

## Field Renames: mapId to appId

### Chunk Operations

All chunk inputs now use `appId` instead of `mapId`:

```graphql
# Before
input GetChunkInput {
  mapId: BigInt!
  coordinates: ChunkCoordinatesInput!
}

# After
input GetChunkInput {
  appId: BigInt!
  coordinates: ChunkCoordinatesInput!
}
```

Affected inputs:
- `GetChunkInput.appId`
- `GetChunkLodsInput.appId`
- `GetChunksByDistanceInput.appId`
- `GetVoxelListInput.appId`
- `ChunkUpdateInput.appId`
- `UpdateChunkStateInput.appId`
- `UpdateChunkLodsInput.appId`

Affected output types:
- `Chunk.appId` (was `mapId`)
- `ChunkLodsResponse.appId` (was `mapId`)

### Voxel Operations

```graphql
# Before
input UpdateVoxelInput {
  mapId: BigInt!
  ...
}

# After
input UpdateVoxelInput {
  appId: BigInt!
  ...
}
```

Affected inputs:
- `UpdateVoxelInput.appId`
- `ListVoxelsInput.appId`
- `ListVoxelUpdatesByDistanceInput.appId`
- `RollbackVoxelUpdatesInput.appId`

Affected output types:
- `Voxel.appId`
- `VoxelUpdateHistoryEvent.appId`
- `RollbackVoxelEventResult.appId`

The `voxelUpdateHistory` query argument is also renamed:
```graphql
# Before
voxelUpdateHistory(mapId: BigInt!, ...): [VoxelUpdateHistoryEvent!]!

# After
voxelUpdateHistory(appId: BigInt!, ...): [VoxelUpdateHistoryEvent!]!
```

### Actor Operations

```graphql
# Before
input CreateActorInput {
  mapId: BigInt!
  ...
}

# After
input CreateActorInput {
  appId: BigInt!
  ...
}
```

Affected inputs:
- `CreateActorInput.appId`
- `UpdateActorInput.appId` (optional)
- `ActorFilterInput.appId` (optional)

Affected output types:
- `Actor.appId`

### Teleport

```graphql
# Before
input TeleportRequestInput {
  mapId: BigInt!
  ...
}

# After
input TeleportRequestInput {
  appId: BigInt!
  ...
}
```

### User App State (was User Map State)

Queries and mutations have been renamed:

```graphql
# Before
userMapState(mapId: BigInt!): UserMapState
userMapStates: [UserMapState!]!
updateUserMapState(input: CreateUserMapStateInput!): UserMapState!
deleteUserMapState(mapId: BigInt!): UserMapState!

# After
userAppState(appId: BigInt!): UserAppState
userAppStates: [UserAppState!]!
updateUserAppState(input: CreateUserAppStateInput!): UserAppState!
deleteUserAppState(appId: BigInt!): UserAppState!
```

The type itself changed:
```graphql
# Before
type UserMapState {
  userId: ID!
  mapId: ID!
  state: String
  createdAt: DateTime!
  updatedAt: DateTime!
}

# After
type UserAppState {
  userId: ID!
  appId: ID!
  state: String
  createdAt: DateTime!
  updatedAt: DateTime!
}
```

### Grid Operations

The `Grid` type no longer has a `map_id` field:

```graphql
# Before
type Grid {
  grid_id: BigInt!
  app_id: BigInt!
  map_id: BigInt!
  low_chunk: ChunkCoordinates!
  high_chunk: ChunkCoordinates!
  created_at: DateTime!
}

# After
type Grid {
  grid_id: BigInt!
  app_id: BigInt!
  low_chunk: ChunkCoordinates!
  high_chunk: ChunkCoordinates!
  created_at: DateTime!
}
```

---

## Error Code Renames

| Old Value | New Value | Numeric Code |
|-----------|-----------|-------------|
| `MAP_NOT_FOUND` | `APP_NOT_FOUND` | 6 |
| `MAP_NOT_LOADED` | `APP_NOT_LOADED` | 8 |
| `INVALID_MAP_ID` | `INVALID_APP_ID` | 18 |

Update any error handling code that matches on these string values.

---

## UDP Proxy API Changes

All UDP proxy input types now use `appId`:

```graphql
# All of these inputs now use appId instead of mapId:
input ActorUpdateRequestInput {
  appId: BigInt!       # was mapId
  chunk: ChunkCoordinatesInput!
  uuid: String!
  state: String!
  distance: Int
  decayRate: Int
  sequenceNumber: Int
}

input VoxelUpdateRequestInput {
  appId: BigInt!       # was mapId
  chunk: ChunkCoordinatesInput!
  ...
}

input ClientAudioPacketInput {
  appId: BigInt!       # was mapId
  ...
}

input ClientTextPacketInput {
  appId: BigInt!       # was mapId
  ...
}

input ClientEventNotificationInput {
  appId: BigInt!       # was mapId
  ...
}
```

All UDP notification types received via the `udpNotifications` subscription also use `appId`:

- `ActorUpdateResponse.appId`
- `ActorUpdateNotification.appId`
- `VoxelUpdateResponse.appId`
- `VoxelUpdateNotification.appId`
- `ClientAudioNotification.appId`
- `ClientTextNotification.appId`
- `ClientEventNotification.appId`
- `ServerEventNotification.appId`

### UDP Binary Wire Format

The binary layout is unchanged. The 8-byte little-endian BigInt at byte offset 1 in spatial message headers now represents the app ID (previously called map ID). The value is the same -- if your app used map ID 1, you now use app ID 1 (after database migration). No binary protocol changes are needed.

---

## New Types on Existing Objects

### User Type

```graphql
type User {
  userId: BigInt!
  email: String          # now nullable (shadow users have no email)
  gamertag: String
  disambiguation: String
  state: String
  isConfirmed: Boolean!
  createdAt: DateTime!
  grantEarlyAccess: Boolean!
  grantEarlyAccessOverride: Boolean!
  orgId: BigInt           # NEW - org that owns this user (null for direct users)
  externalId: String      # NEW - studio-assigned ID (null for direct users)
  userType: String!       # NEW - 'direct' or 'studio_managed'
}
```

### GameToken Type

```graphql
type GameToken {
  gameTokenId: ID!
  userId: ID!
  token: String!
  appId: ID              # NEW - which app this token is scoped to
  orgId: ID              # NEW - which org issued this token
  createdByOrgTokenId: ID # NEW - which org token created this
  createdAt: DateTime!
}
```

---

## New API Endpoints

These are entirely new queries and mutations added by the multi-tenancy system.

### Organizations

```graphql
# Queries
organization(id: BigInt!): Organization
organizationBySlug(slug: String!): Organization
orgMembers(orgId: BigInt!): [OrgMember!]!

# Mutations
createOrganization(input: CreateOrganizationInput!): Organization!
createOrgToken(input: CreateOrgTokenInput!): OrgToken!
inviteOrgMember(input: InviteOrgMemberInput!): OrgMember!
```

### App Access & Tiers

```graphql
# Queries
appAccessTiers(appId: BigInt!): [AppAccessTier!]!
myAppAccess(appId: BigInt!): AppUserAccess

# Mutations
createAccessTier(input: CreateAccessTierInput!): AppAccessTier!
grantAppAccess(input: GrantAppAccessInput!): AppUserAccess!
revokeAppAccess(appId: BigInt!, userId: BigInt!): AppUserAccess!
```

### Billing & Wallets

```graphql
# Queries
walletBalance(orgId: BigInt!): OrgWallet!
walletTransactions(orgId: BigInt!, limit: Int, offset: Int): [WalletTransaction!]!
appBudget(orgId: BigInt!, appId: BigInt!): AppBudget

# Mutations
setAppBudget(orgId: BigInt!, appId: BigInt!, monthlyLimitCents: BigInt!): AppBudget!
```

### Service Quotas

```graphql
# Queries
quotasForOrg(orgId: BigInt!): [ServiceQuota!]!
quotasForApp(appId: BigInt!): [ServiceQuota!]!

# Mutations
setQuota(input: SetQuotaInput!): ServiceQuota!
deleteQuota(quotaId: BigInt!): Boolean!
```

---

## Search-and-Replace Checklist

For a mechanical migration, run these replacements across your client codebase:

| Find | Replace |
|------|---------|
| `mapId` | `appId` |
| `MapId` | `AppId` |
| `map_id` | `app_id` |
| `MAP_NOT_FOUND` | `APP_NOT_FOUND` |
| `MAP_NOT_LOADED` | `APP_NOT_LOADED` |
| `INVALID_MAP_ID` | `INVALID_APP_ID` |
| `userMapState` | `userAppState` |
| `userMapStates` | `userAppStates` |
| `updateUserMapState` | `updateUserAppState` |
| `deleteUserMapState` | `deleteUserAppState` |
| `UserMapState` | `UserAppState` |
| `CreateUserMapStateInput` | `CreateUserAppStateInput` |

After replacing, verify that any GraphQL codegen is re-run to pick up the new schema types.
