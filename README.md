# CrowdyJS SDK

Client SDK for the Crowded Kingdoms GraphQL API with UDP proxy support.
Handles authentication, real-time subscriptions, and all repilcation-server
communication through a single `CrowdyClient` instance. Users should still 
directly access the CK GraphQL API for other functions beyond replication.

## Links 

- [NPM](https://www.npmjs.com/package/@crowdedkingdomstudios/crowdyjs)  
- [GitHub](https://github.com/CrowdedKingdoms/CrowdyJS)  
- [Discord](https://discord.gg/crowdedkingdoms)
- [YouTube](https://www.youtube.com/@CrowdedKingdoms)


## Installation

```bash
npm install @crowdedkingdomstudios/crowdyjs
```

### Node.js

The SDK uses the browser-native `WebSocket` API. In Node.js you need a
polyfill such as the `ws` package:

```bash
npm install ws
```

```javascript
import WebSocket from 'ws';
globalThis.WebSocket = WebSocket;
```

Place this **before** importing `CrowdyClient`.

### Browser

No extra setup needed -- the SDK uses the built-in `WebSocket`.

## Quick Start

```javascript
import { CrowdyClient } from '@crowdedkingdomstudios/crowdyjs';

const client = new CrowdyClient({
  graphqlEndpoint: 'https://your-server.com/graphql',
  wsEndpoint: 'wss://your-server.com/graphql',
});
```

If omitted, both endpoints default to `localhost:3000/graphql`.

## Connection Lifecycle

The SDK follows a four-step lifecycle that matches the server protocol:

```
1. Login         -->  obtain a game token
2. Subscribe     -->  auto-opens UDP proxy session
3. Register      -->  tell the game server your chunk position
4. Send updates  -->  replicated to other clients in range
```

### 1. Login

```javascript
const auth = await client.login('user@example.com', 'password');
// auth.token      -- 64-char hex game token (set automatically)
// auth.user.email -- logged-in user
```

Or register a new account:

```javascript
const auth = await client.register('user@example.com', 'password', 'MyGamertag');
```

### 2. Subscribe to Notifications

Register one or more notification handlers. The first handler automatically
opens a WebSocket subscription and a UDP proxy session to the game server --
no explicit `connectUdpProxy()` call is needed.

```javascript
const unsub = client.onActorUpdate((notification) => {
  console.log('Actor:', notification.uuid);
  console.log('State:', notification.state);
  console.log('Chunk:', notification.chunkX, notification.chunkY, notification.chunkZ);
  console.log('Time:', notification.epochMillis);
});
```

Handlers are unsubscribed by calling the returned function:

```javascript
unsub(); // stop receiving ActorUpdateNotification
```

When all handlers are removed the WebSocket is closed automatically.

### 3. Register in a Chunk

Before other clients can see you, send an initial actor update so the game
server knows which chunk you occupy. Use a minimal base64 payload (the
server requires a non-empty `state`).

#### Generating a UUID

Every client must create its own UUID as a **random 32-byte UTF-8 string**.
This ensures each client produces a globally unique identifier without
relying on a central registry.

```javascript
// Node.js
const MY_UUID = crypto.randomBytes(32).toString('hex').slice(0, 32);

// Browser
const MY_UUID = Array.from(crypto.getRandomValues(new Uint8Array(16)))
  .map((b) => b.toString(16).padStart(2, '0'))
  .join('');
```

```javascript
await client.sendActorUpdate({
  appId: 0,
  chunk: { x: 0, y: 0, z: 0 },
  distance: 8,
  uuid: MY_UUID,
  state: 'AA==',            // minimal base64 payload for registration
  sequenceNumber: 1,
});
```

Every actor in every client must do this. After registration, the game
server fans out subsequent updates to all registered clients in range.

### 4. Send Actor Updates

```javascript
// Build your binary state and base64-encode it
const stateBuffer = new ArrayBuffer(96);
const view = new DataView(stateBuffer);
view.setFloat32(0, posX, true);
view.setFloat32(4, posY, true);
view.setFloat32(8, posZ, true);
// ... fill remaining fields

const base64State = btoa(String.fromCharCode(...new Uint8Array(stateBuffer)));

await client.sendActorUpdate({
  appId: 0,
  chunk: { x: 0, y: 0, z: 0 },
  distance: 8,
  decayRate: 0,
  uuid: MY_UUID,
  state: base64State,
  sequenceNumber: 2,
});
```

### 5. Disconnect

```javascript
await client.disconnectUdpProxy(); // release the UDP session
client.close();                    // close WebSocket + clear state
```

Unsubscribing from notifications stops delivery but does **not** release
the UDP session. Call `disconnectUdpProxy()` explicitly, or the server
will release it after 30 seconds of inactivity.

## Subscription Handlers

All spatial notification types share a uniform header:

| Field | Type | Description |
|-------|------|-------------|
| `appId` | `string` | App ID (tenant / world identifier) |
| `chunkX` | `string` | Chunk X coordinate |
| `chunkY` | `string` | Chunk Y coordinate |
| `chunkZ` | `string` | Chunk Z coordinate |
| `distance` | `number` | Replication distance (0-8) |
| `decayRate` | `number` | Delivery decay (0-5) |
| `uuid` | `string` | Random 32-byte UTF-8 sender UUID |
| `sequenceNumber` | `number` | uint8 (0-255), wraps |
| `epochMillis` | `string` | Server UTC timestamp in ms |

Each handler receives a fully-typed notification object:

```javascript
client.onActorUpdate((n) => { /* n: ActorUpdateNotification -- adds: state */ });
client.onActorUpdateResponse((n) => { /* n: ActorUpdateResponse */ });
client.onVoxelUpdate((n) => { /* n: VoxelUpdateNotification -- adds: voxelX/Y/Z, voxelType, voxelState */ });
client.onVoxelUpdateResponse((n) => { /* n: VoxelUpdateResponse */ });
client.onClientAudio((n) => { /* n: ClientAudioNotification -- adds: audioData */ });
client.onClientText((n) => { /* n: ClientTextNotification -- adds: text */ });
client.onClientEvent((n) => { /* n: ClientEventNotification -- adds: eventType, state */ });
client.onServerEvent((n) => { /* n: ServerEventNotification -- adds: eventType, state */ });
client.onGenericError((e) => { /* e: GenericErrorResponse -- sequenceNumber, errorCode only */ });
```

`GenericErrorResponse` is the only type without the spatial header; it has
just `sequenceNumber` and `errorCode`.

## Input Parameters

### Common fields

All mutation inputs share these fields:

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `appId` | `number` | yes | -- | App ID (tenant / world identifier) |
| `chunk` | `{ x, y, z }` | yes | -- | Chunk coordinates (numbers) |
| `uuid` | `string` | yes | -- | Random 32-byte UTF-8 string (see [Generating a UUID](#generating-a-uuid)) |
| `distance` | `number` | no | `8` | Replication range (0-8 chunks, Chebyshev) |
| `decayRate` | `number` | no | `0` | Delivery decay (see table below) |
| `sequenceNumber` | `number` | no | `0` | uint8 (0-255) for correlation |

### `decayRate` values

| Value | Name | Behavior |
|-------|------|----------|
| 0 | None | All clients within `distance` receive every message |
| 1 | Exponential | Each ring receives half the messages of the previous ring |
| 2 | Linear 50% | Furthest ring receives 50% of messages |
| 3 | Linear 25% | Furthest ring receives 25% of messages |
| 4 | Linear 10% | Furthest ring receives 10% of messages |
| 5 | Linear 5% | Furthest ring receives 5% of messages |

### `sendActorUpdate`

| Field | Type | Description |
|-------|------|-------------|
| `state` | `string` | Base64-encoded binary state (must be non-empty) |

### `sendVoxelUpdate`

| Field | Type | Description |
|-------|------|-------------|
| `voxel` | `{ x, y, z }` | Voxel position within the chunk |
| `voxelType` | `number` | Voxel type ID |
| `voxelState` | `string` | Base64-encoded voxel state |

### `sendAudioPacket`

| Field | Type | Description |
|-------|------|-------------|
| `audioData` | `string` | Base64-encoded compressed audio |

### `sendTextPacket`

| Field | Type | Description |
|-------|------|-------------|
| `text` | `string` | Chat message text |

### `sendClientEvent`

| Field | Type | Description |
|-------|------|-------------|
| `eventType` | `number` | Custom event type ID |
| `state` | `string` | Base64-encoded event state |

## Complete Example

```javascript
import WebSocket from 'ws';
globalThis.WebSocket = WebSocket;

import { CrowdyClient } from '@crowdedkingdomstudios/crowdyjs';

const client = new CrowdyClient({
  graphqlEndpoint: 'https://your-server.com/graphql',
  wsEndpoint: 'wss://your-server.com/graphql',
});

const MY_UUID = crypto.randomBytes(32).toString('hex').slice(0, 32);

// 1. Login
await client.login('user@example.com', 'password');

// 2. Subscribe (auto-opens UDP proxy session)
const unsubActors = client.onActorUpdate((n) => {
  console.log(`Actor ${n.uuid} at chunk (${n.chunkX},${n.chunkY},${n.chunkZ})`);
  console.log(`  state=${n.state} seq=${n.sequenceNumber} t=${n.epochMillis}`);
});

const unsubErrors = client.onGenericError((e) => {
  console.error(`Error: ${e.errorCode} (seq ${e.sequenceNumber})`);
});

// 3. Register in chunk
await client.sendActorUpdate({
  appId: 0,
  chunk: { x: 0, y: 0, z: 0 },
  distance: 8,
  uuid: MY_UUID,
  state: 'AA==',
  sequenceNumber: 1,
});

// 4. Send updates in a loop
let seq = 2;
const interval = setInterval(async () => {
  const buf = new Uint8Array(96);
  crypto.getRandomValues(buf);
  const state = btoa(String.fromCharCode(...buf));

  await client.sendActorUpdate({
    appId: 0,
    chunk: { x: 0, y: 0, z: 0 },
    distance: 8,
    uuid: MY_UUID,
    state,
    sequenceNumber: seq++ % 256,
  });
}, 100);

// 5. Cleanup
clearInterval(interval);
unsubActors();
unsubErrors();
await client.disconnectUdpProxy();
client.close();
```

## API Reference

### Constructor

```typescript
new CrowdyClient(config?: CrowdyClientConfig)
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `graphqlEndpoint` | `string` | `http://localhost:3000/graphql` | HTTP endpoint for mutations/queries |
| `wsEndpoint` | `string` | `ws://localhost:3000/graphql` | WebSocket endpoint for subscriptions |
| `timeout` | `number` | `60000` | HTTP request timeout in ms |

### Authentication

| Method | Returns | Description |
|--------|---------|-------------|
| `login(email, password)` | `Promise<AuthResponse>` | Login and store the game token |
| `register(email, password, gamertag?)` | `Promise<AuthResponse>` | Register and store the game token |
| `getAuthToken()` | `string \| null` | Get the current game token |

### UDP Proxy

| Method | Returns | Description |
|--------|---------|-------------|
| `connectUdpProxy()` | `Promise<UdpProxyConnectionStatus>` | Explicitly open a UDP session (optional) |
| `disconnectUdpProxy()` | `Promise<boolean>` | Release the UDP session |
| `getConnectionStatus()` | `Promise<UdpProxyConnectionStatus>` | Check if a UDP session is active |

### Mutations

| Method | Returns | Description |
|--------|---------|-------------|
| `sendActorUpdate(input)` | `Promise<boolean>` | Send an actor state update |
| `sendVoxelUpdate(input)` | `Promise<boolean>` | Modify a voxel in a chunk |
| `sendAudioPacket(input)` | `Promise<boolean>` | Send voice audio data |
| `sendTextPacket(input)` | `Promise<boolean>` | Send chat text |
| `sendClientEvent(input)` | `Promise<boolean>` | Send a custom event |

### Subscriptions

| Method | Handler receives | Description |
|--------|-----------------|-------------|
| `onActorUpdate(handler)` | `ActorUpdateNotification` | Another client's actor state |
| `onActorUpdateResponse(handler)` | `ActorUpdateResponse` | Server ack for your actor update |
| `onVoxelUpdate(handler)` | `VoxelUpdateNotification` | A voxel was modified |
| `onVoxelUpdateResponse(handler)` | `VoxelUpdateResponse` | Server ack for your voxel update |
| `onClientAudio(handler)` | `ClientAudioNotification` | Voice audio from another client |
| `onClientText(handler)` | `ClientTextNotification` | Chat text from another client |
| `onClientEvent(handler)` | `ClientEventNotification` | Custom event from another client |
| `onServerEvent(handler)` | `ServerEventNotification` | Event from the game server |
| `onGenericError(handler)` | `GenericErrorResponse` | Error from the server |

All subscription methods return an `UnsubscribeFn` -- call it to remove
the handler.

### Cleanup

| Method | Description |
|--------|-------------|
| `close()` | Close the WebSocket, remove all handlers, clear auth state |

## Domain APIs

In addition to the replication-focused methods documented above, the
client exposes a set of typed *domain wrappers* that cover the rest of
the Crowded Kingdoms GraphQL API. Each wrapper is mounted on the
`CrowdyClient` instance and uses the same auth token / base URL as the
replication API. Operation inputs and return shapes are generated from
the live `schema.gql` via `graphql-codegen`, so they stay in lockstep
with the server.

```javascript
const client = new CrowdyClient({ graphqlEndpoint: '...' });
await client.auth.login({ email, password });
```

### `client.auth` -- authentication & session lifecycle

```javascript
await client.auth.register({ email, password, gamertag });
await client.auth.login({ email, password });
await client.auth.confirmEmail('...token...');
await client.auth.requestPasswordReset('user@example.com');
await client.auth.resetPassword({ token: '...', newPassword: '...' });
await client.auth.resendConfirmationEmail('user@example.com');
await client.auth.changePassword('old', 'new');
await client.auth.logout();
await client.auth.logoutAllDevices();
```

The legacy shortcuts `client.login(email, password)` and
`client.register(email, password, gamertag?)` are kept for backwards
compatibility and delegate to `client.auth`.

### `client.users` -- user directory & profile

```javascript
const me   = await client.users.me();
const u    = await client.users.byId('123');
const all  = await client.users.list();
const list = await client.users.byGamertag('Gandalf');
const list2 = await client.users.byEmail('a@b.c');

await client.users.updateGamertag({ gamertag: 'Newname', disambiguation: '0001' });
await client.users.updateUserState({ state: 'base64...' });
```

### `client.orgs` -- organizations / studios

```javascript
const org = await client.orgs.create({ name: 'Acme', slug: 'acme' });
const byId   = await client.orgs.byId(org.orgId);
const bySlug = await client.orgs.bySlug('acme');
const members = await client.orgs.members(org.orgId);

await client.orgs.inviteMember({ orgId: org.orgId, userId: '42' });
const token = await client.orgs.createOrgToken({ orgId: org.orgId, label: 'CI' });
```

### `client.appAccess` -- app access tiers and grants

```javascript
const tiers = await client.appAccess.listTiers(appId);
const mine  = await client.appAccess.myAccess(appId);

await client.appAccess.createTier({ appId, name: 'Pro', isFree: false, tierOrder: 2 });
await client.appAccess.grant({ appId, userId: '42', tierId });
await client.appAccess.revoke(appId, '42');
```

### `client.billing` -- wallets & app budgets

```javascript
const wallet = await client.billing.balance(orgId);
const txns   = await client.billing.transactions({ orgId, limit: 50, offset: 0 });
const budget = await client.billing.appBudget(orgId, appId);

await client.billing.setAppBudget({ orgId, appId, monthlyLimitCents: '5000' });
```

### `client.quotas` -- per-org / per-app service quotas

```javascript
const orgQ = await client.quotas.byOrg(orgId);
const appQ = await client.quotas.byApp(appId);

const q = await client.quotas.set({
  orgId,
  appId,
  metric: 'voxel_updates',
  limitValue: '1000000',
  period: 'month',
});
await client.quotas.delete(q.quotaId);
```

### `client.chunks` -- chunk + LOD queries and admin mutations

```javascript
const chunk    = await client.chunks.get({ appId, coordinates: { x: '0', y: '0', z: '0' } });
const lods     = await client.chunks.getLods({ appId, coordinates, lodLevels: [0, 1, 2] });
const nearby   = await client.chunks.byDistance({ appId, centerCoordinate: coordinates, maxDistance: 4 });
const voxels   = await client.chunks.voxelList({ appId, coordinates });

await client.chunks.update({ appId, coordinates, voxels: '...base64...' });
await client.chunks.updateState({ appId, coordinates, chunkState: '...' });
await client.chunks.updateLods({ appId, coordinates, lods: [{ level: 0, data: '...' }] });
```

### `client.voxels` -- voxel queries, history, rollback

```javascript
await client.voxels.list({ appId, coordinates });
await client.voxels.listByDistance({ appId, centerCoordinate: coordinates, maxDistance: 2 });
await client.voxels.update({ appId, coordinates, location, voxelType: 5, state: '...' });
await client.voxels.history({ appId, userId: '42', limit: 100 });
await client.voxels.rollback({ appId, userId: '42', from, to, dryRun: true });
```

### `client.actors` -- persisted actors (CRUD)

```javascript
const a = await client.actors.create({
  appId, uuid: '...', chunk: { x: '0', y: '0', z: '0' },
});
await client.actors.get(a.uuid);
await client.actors.list({ appId });
await client.actors.batchLookup({ uuids: [a.uuid] });
await client.actors.update(a.uuid, { publicState: '...' });
await client.actors.updateState(a.uuid, { publicState: '...' });
await client.actors.delete(a.uuid);
```

For high-frequency replication, continue to use the existing
`client.sendActorUpdate(...)` UDP path -- it is unchanged.

### `client.teleport`

```javascript
const result = await client.teleport.request({
  appId,
  chunkAddress: { x: '0', y: '0', z: '0' },
  voxelAddress: { x: 0, y: 0, z: 0 },
  UUID: '...',
});
```

### `client.state` -- per-user, per-app state

```javascript
await client.state.update({ appId, state: 'base64...' });
await client.state.getOne(appId);
await client.state.getAll();
await client.state.delete(appId);
```

### `client.serverStatus`

```javascript
await client.serverStatus.serverWithLeastClients();
await client.serverStatus.listAll();
await client.serverStatus.listActiveGraphqlServers();
await client.serverStatus.versionInfo();
```

### `client.groups`

```javascript
const g = await client.groups.create({ name: 'Mages' });
await client.groups.list();
await client.groups.byId(g.groupId);
await client.groups.memberships(g.groupId);
await client.groups.userMemberships('42');
await client.groups.update(g.groupId, { name: 'Wizards' });
```

### `client.apps`

The current schema does not expose direct CRUD for the App entity --
apps are provisioned out of band. `client.apps` exists as a stable
namespace for future additions; in the meantime use `client.appAccess`,
`client.state`, `client.billing`, `client.chunks`, and `client.voxels`
for app-scoped functionality.

## Codegen

Operations live as `.graphql` files under `src/operations/<domain>/`.
After editing them or pulling a new schema, regenerate the typed
documents:

```bash
npm run codegen        # one-shot
npm run codegen:watch  # watch mode
```

`npm run build` runs codegen automatically via `prebuild`.

## TypeScript

The SDK is written in TypeScript and ships type declarations. All
notification interfaces, input types, and handler signatures are fully
typed for IDE autocomplete and compile-time safety. Schema-derived
input/output types (e.g. `CreateOrganizationInput`, `Organization`,
`AppBudget`) are re-exported from the package root.

## License

MIT
