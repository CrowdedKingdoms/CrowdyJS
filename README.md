# CrowdyJS SDK

Client SDK for the Crowded Kingdoms GraphQL API with UDP proxy support.
Handles authentication, real-time subscriptions, and all repilcation-server
communication through a single `CrowdyClient` instance. Users should still 
directly access the CK GraphQL API for other functions beyond replication.

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
  mapId: 0,
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
  mapId: 0,
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
| `mapId` | `string` | Map / chunk-W coordinate |
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
| `mapId` | `number` | yes | -- | Map / chunk-W coordinate |
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
  mapId: 0,
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
    mapId: 0,
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

## TypeScript

The SDK is written in TypeScript and ships type declarations. All
notification interfaces, input types, and handler signatures are fully
typed for IDE autocomplete and compile-time safety.

## License

MIT
