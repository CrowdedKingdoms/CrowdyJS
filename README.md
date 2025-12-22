# CrowdyJS SDK

Client SDK for Crowded Kingdoms GraphQL API with UDP proxy support.

## Installation

```bash
npm install crowdyjs
```

For local development:
```bash
npm link crowdyjs
```

## Usage

### Basic Setup

```javascript
import { CrowdyClient } from 'crowdyjs';

const client = new CrowdyClient({
  graphqlEndpoint: 'http://localhost:3000/graphql',
  wsEndpoint: 'ws://localhost:3000/graphql',
});
```

### Authentication

```javascript
// Login
const authResponse = await client.login(email, password);
console.log('Logged in as:', authResponse.user.email);

// Register
const authResponse = await client.register(email, password, gamertag);
```

### UDP Proxy Connection

```javascript
// Connect to UDP proxy
const status = await client.connectUdpProxy();
console.log('Connected to server:', status.serverIp6);

// Check connection status
const status = await client.getConnectionStatus();

// Disconnect
await client.disconnectUdpProxy();
```

### Sending Actor Updates

```javascript
// Create 96-byte binary state (position, rotation, velocity, etc.)
const stateBuffer = new ArrayBuffer(96);
const view = new DataView(stateBuffer);
view.setFloat32(0, x, true); // position x
view.setFloat32(4, y, true); // position y
// ... populate rest of state

// Convert to base64
const base64State = btoa(String.fromCharCode(...new Uint8Array(stateBuffer)));

// Send update
await client.sendActorUpdate({
  mapId: '1',
  modId: '0',
  chunk: { x: '0', y: '0', z: '0' },
  uuid: 'your-32-byte-uuid',
  state: base64State,
});
```

### Type-Specific Subscription Handlers

The SDK provides type-specific handlers so you don't need to switch on `__typename`:

```javascript
// Actor update notifications
const unsubscribe1 = client.onActorUpdate((notification) => {
  // notification is typed as ActorUpdateNotification
  console.log('Actor updated:', notification.uuid);
});

// Actor update responses (from your own requests)
const unsubscribe2 = client.onActorUpdateResponse((response) => {
  // response is typed as ActorUpdateResponse
  if (response.errorCode === 'NO_ERROR') {
    console.log('Update successful');
  }
});

// Voxel updates
const unsubscribe3 = client.onVoxelUpdate((notification) => {
  // notification is typed as VoxelUpdateNotification
});

// Client audio (voice chat)
const unsubscribe4 = client.onClientAudio((notification) => {
  // notification is typed as ClientAudioNotification
});

// Client text (chat messages)
const unsubscribe5 = client.onClientText((notification) => {
  // notification is typed as ClientTextNotification
});

// Client events
const unsubscribe6 = client.onClientEvent((notification) => {
  // notification is typed as ClientEventNotification
});

// Server events
const unsubscribe7 = client.onServerEvent((notification) => {
  // notification is typed as ServerEventNotification
});

// Unsubscribe when done
unsubscribe1();
unsubscribe2();
// ... etc
```

### Complete Example

```javascript
import { CrowdyClient } from 'crowdyjs';

const client = new CrowdyClient({
  graphqlEndpoint: 'http://localhost:3000/graphql',
  wsEndpoint: 'ws://localhost:3000/graphql',
});

// Login
await client.login('user@example.com', 'password');

// Connect to UDP proxy
await client.connectUdpProxy();

// Subscribe to actor updates
const unsubscribe = client.onActorUpdate((notification) => {
  console.log('Actor update:', notification.uuid);
  // Handle the update...
});

// Send actor updates
setInterval(async () => {
  await client.sendActorUpdate({
    mapId: '1',
    modId: '0',
    chunk: { x: '0', y: '0', z: '0' },
    uuid: 'your-uuid',
    state: 'base64-state-data',
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
- `connectUdpProxy(): Promise<UdpProxyConnectionStatus>`
- `disconnectUdpProxy(): Promise<boolean>`
- `getConnectionStatus(): Promise<UdpProxyConnectionStatus>`

**Sending Updates:**
- `sendActorUpdate(input: ActorUpdateRequestInput): Promise<boolean>`
- `sendVoxelUpdate(input: VoxelUpdateRequestInput): Promise<boolean>`
- `sendAudioPacket(input: ClientAudioPacketInput): Promise<boolean>`
- `sendTextPacket(input: ClientTextPacketInput): Promise<boolean>`
- `sendClientEvent(input: ClientEventNotificationInput): Promise<boolean>`

**Subscriptions:**
- `onActorUpdate(handler: ActorUpdateHandler): UnsubscribeFn`
- `onActorUpdateResponse(handler: ActorUpdateResponseHandler): UnsubscribeFn`
- `onVoxelUpdate(handler: VoxelUpdateHandler): UnsubscribeFn`
- `onVoxelUpdateResponse(handler: VoxelUpdateResponseHandler): UnsubscribeFn`
- `onClientAudio(handler: ClientAudioHandler): UnsubscribeFn`
- `onClientText(handler: ClientTextHandler): UnsubscribeFn`
- `onClientEvent(handler: ClientEventHandler): UnsubscribeFn`
- `onServerEvent(handler: ServerEventHandler): UnsubscribeFn`

**Cleanup:**
- `close(): void` - Closes all subscriptions and cleans up

## TypeScript Support

The SDK is written in TypeScript and includes full type definitions. All notification types are properly typed, so you get full IDE autocomplete and type safety.

## License

MIT
