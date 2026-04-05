# CrowdyJS SDK

Client SDK for Crowded Kingdoms GraphQL API with UDP proxy support.

## Installation

```bash
npm install @crowdedkingdomstudios/crowdyjs
```

For local development:
```bash
npm link @crowdedkingdomstudios/crowdyjs
```

## Usage

### Basic Setup

```javascript
import { CrowdyClient } from '@crowdedkingdomstudios/crowdyjs';

const client = new CrowdyClient({
  graphqlEndpoint: 'http://localhost:3000/graphql',
  wsEndpoint: 'ws://localhost:3000/graphql',
});
```

### Authentication

```javascript
const authResponse = await client.login(email, password);
console.log('Logged in as:', authResponse.user.email);

// Or register a new account
const authResponse = await client.register(email, password, gamertag);
```

### Subscribe to Notifications

Subscribing to any notification type automatically opens a UDP proxy session
to the game server -- no explicit `connectUdpProxy()` call is needed.

```javascript
const unsubActorUpdate = client.onActorUpdate((notification) => {
  console.log('Actor update from:', notification.uuid);
  console.log('  state:', notification.state);
  console.log('  sequenceNumber:', notification.sequenceNumber);
  console.log('  epochMillis:', notification.epochMillis);
});

const unsubError = client.onGenericError((error) => {
  console.error('Error:', error.errorCode);
});
```

### Register in a Chunk

Before other clients can receive your updates, you must send at least one
actor update so the game server knows your chunk position. Use a minimal
base64 payload (the server requires a non-empty `state`):

```javascript
const MY_UUID = 'aaaaaaaabbbbccccddddeeeeeeeeeeee'; // 32 bytes UTF-8

await client.sendActorUpdate({
  mapId: 0,
  chunk: { x: 0, y: 0, z: 0 },
  distance: 8,
  uuid: MY_UUID,
  state: 'AA==',              // minimal base64 payload for registration
  sequenceNumber: 1,
});
```

### Send Actor Updates

```javascript
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

### Type-Specific Subscription Handlers

The SDK provides type-specific handlers so you don't need to switch on `__typename`.
All spatial notifications include the uniform header fields: `mapId`, `chunkX`,
`chunkY`, `chunkZ`, `distance`, `decayRate`, `uuid`, `sequenceNumber`, `epochMillis`.

```javascript
const unsub1 = client.onActorUpdate((n) => { /* ActorUpdateNotification */ });
const unsub2 = client.onActorUpdateResponse((n) => { /* ActorUpdateResponse */ });
const unsub3 = client.onVoxelUpdate((n) => { /* VoxelUpdateNotification */ });
const unsub4 = client.onVoxelUpdateResponse((n) => { /* VoxelUpdateResponse */ });
const unsub5 = client.onClientAudio((n) => { /* ClientAudioNotification */ });
const unsub6 = client.onClientText((n) => { /* ClientTextNotification */ });
const unsub7 = client.onClientEvent((n) => { /* ClientEventNotification */ });
const unsub8 = client.onServerEvent((n) => { /* ServerEventNotification */ });
const unsub9 = client.onGenericError((e) => { /* GenericErrorResponse */ });

// Unsubscribe when done
unsub1();
```

### Complete Example

```javascript
import { CrowdyClient } from '@crowdedkingdomstudios/crowdyjs';

const client = new CrowdyClient({
  graphqlEndpoint: 'http://localhost:3000/graphql',
  wsEndpoint: 'ws://localhost:3000/graphql',
});

const MY_UUID = 'aaaaaaaabbbbccccddddeeeeeeeeeeee';

// 1. Login
await client.login('user@example.com', 'password');

// 2. Subscribe (auto-opens UDP proxy session)
const unsubscribe = client.onActorUpdate((notification) => {
  console.log('Actor update:', notification.uuid, notification.epochMillis);
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

// 4. Send updates
let seq = 2;
setInterval(async () => {
  await client.sendActorUpdate({
    mapId: 0,
    chunk: { x: 0, y: 0, z: 0 },
    distance: 8,
    uuid: MY_UUID,
    state: 'base64-state-data',
    sequenceNumber: seq++ % 256,
  });
}, 100);

// Cleanup
unsubscribe();
await client.disconnectUdpProxy();
client.close();
```

## API Reference

### CrowdyClient

Main client class for interacting with the API.

#### Constructor

```typescript
new CrowdyClient(config?: CrowdyClientConfig)
```

**Config options:**
- `graphqlEndpoint?: string` - GraphQL HTTP endpoint (default: `http://localhost:3000/graphql`)
- `wsEndpoint?: string` - WebSocket endpoint (default: `ws://localhost:3000/graphql`)
- `timeout?: number` - Request timeout in ms (default: `60000`)

#### Methods

**Authentication:**
- `login(email: string, password: string): Promise<AuthResponse>`
- `register(email: string, password: string, gamertag?: string): Promise<AuthResponse>`
- `getAuthToken(): string | null`

**UDP Proxy:**
- `connectUdpProxy(): Promise<UdpProxyConnectionStatus>` -- optional; subscriptions and mutations auto-open the session
- `disconnectUdpProxy(): Promise<boolean>`
- `getConnectionStatus(): Promise<UdpProxyConnectionStatus>`

**Sending Updates:**
- `sendActorUpdate(input: ActorUpdateRequestInput): Promise<boolean>`
- `sendVoxelUpdate(input: VoxelUpdateRequestInput): Promise<boolean>`
- `sendAudioPacket(input: ClientAudioPacketInput): Promise<boolean>`
- `sendTextPacket(input: ClientTextPacketInput): Promise<boolean>`
- `sendClientEvent(input: ClientEventNotificationInput): Promise<boolean>`

**Subscriptions:**
- `onActorUpdate(handler): UnsubscribeFn`
- `onActorUpdateResponse(handler): UnsubscribeFn`
- `onVoxelUpdate(handler): UnsubscribeFn`
- `onVoxelUpdateResponse(handler): UnsubscribeFn`
- `onClientAudio(handler): UnsubscribeFn`
- `onClientText(handler): UnsubscribeFn`
- `onClientEvent(handler): UnsubscribeFn`
- `onServerEvent(handler): UnsubscribeFn`
- `onGenericError(handler): UnsubscribeFn`

**Cleanup:**
- `close(): void` - Closes all subscriptions and cleans up

## TypeScript Support

The SDK is written in TypeScript and includes full type definitions. All notification types are properly typed, so you get full IDE autocomplete and type safety.

## License

MIT
