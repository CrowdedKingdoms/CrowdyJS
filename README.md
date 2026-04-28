# CrowdyJS SDK

Browser-first SDK for Crowded Kingdoms game clients. CrowdyJS wraps the GraphQL
API, the UDP proxy subscription, auth/session state, and spatial send helpers in
one typed client.

## Install

```bash
npm install @crowdedkingdomstudios/crowdyjs
```

CrowdyJS v3 targets browsers by default and uses native `fetch`, `WebSocket`,
`crypto`, `btoa`, and `atob`. Node tools can still use the SDK, but must provide
browser-compatible globals when they open realtime connections.

## Quick Start

```ts
import {
  BrowserLocalStorageTokenStore,
  createCrowdyClient,
} from '@crowdedkingdomstudios/crowdyjs';

const client = createCrowdyClient({
  httpUrl: 'https://api.example.com/graphql',
  wsUrl: 'wss://api.example.com/graphql',
  tokenStore: new BrowserLocalStorageTokenStore(),
  realtime: {
    retryAttempts: 8,
    waitTimeoutMs: 5000,
  },
});

await client.session.restore();

if (!client.session.getToken()) {
  await client.auth.login({ email: 'player@example.com', password: 'secret' });
}

const bootstrap = await client.serverStatus.gameClientBootstrap('1');
console.log(bootstrap.versionInfo.minimumClientVersion);
```

## Game Loop Lifecycle

1. Authenticate with `client.auth.login()` or restore a previous token through
   `client.session.restore()`.
2. Subscribe to UDP proxy notifications with `client.udp.subscribe()` or
   `client.realtime.connect()`.
3. Join a chunk by sending an initial actor update.
4. Send actor, voxel, text, audio, and client-event updates through `client.udp`
   or the higher-level `client.world(appId)` helpers.
5. Call `client.udp.disconnect()` when leaving the world, then `client.close()`
   when disposing the SDK instance.

## Realtime Notifications

```ts
const unsubscribe = client.udp.subscribe({
  actorUpdate: (event) => {
    console.log(event.uuid, event.state);
  },
  genericError: (event) => {
    console.warn(event.sequenceNumber, event.errorCode);
  },
  connectionEvent: (event) => {
    console.warn(event.code, event.message);
  },
  error: (error) => {
    console.error(error.code, error.message);
  },
});

client.realtime.onStatus((status) => {
  console.log('realtime:', status);
});
```

The SDK uses the `graphql-transport-ws` protocol through `graphql-ws`, reconnects
with backoff, re-reads the current token before reconnecting, and resubscribes to
the generated `UdpNotifications` document.

## Raw UDP Sends

```ts
const response = await client.udp.sendActorUpdateAndWait({
  appId: '1',
  chunk: { x: '0', y: '0', z: '0' },
  uuid: '0123456789abcdef0123456789abcdef',
  state: 'AA==',
  distance: 8,
  decayRate: 1,
});

console.log(response.__typename, response.sequenceNumber);
```

The plain `sendActorUpdate`, `sendVoxelUpdate`, `sendAudioPacket`,
`sendTextPacket`, and `sendClientEvent` methods return the GraphQL mutation
result immediately. The `AndWait` variants allocate a `sequenceNumber` when one
is missing and wait for either a matching notification or `GenericErrorResponse`.

## World Helpers

```ts
const world = client.world('1');
const actor = world.actor();

await actor.join({ x: '0', y: '0', z: '0' });
await actor.sendState('AA==');
await actor.sendText('hello nearby players');
```

The world helpers are convenience wrappers for browser games. Advanced callers
can always use `client.udp.*` with generated GraphQL input types.

## Errors

Transport and protocol failures use structured error classes:

- `CrowdyHttpError`
- `CrowdyGraphQLError`
- `CrowdyNetworkError`
- `CrowdyTimeoutError`
- `CrowdyRealtimeError`
- `CrowdyProtocolError`

`CrowdyGraphQLError` preserves every GraphQL error, including `path` and
`extensions.code`.

## Low-Level GraphQL Access

Game-client methods are first-class, but generated operations are still
available through the transport escape hatch:

```ts
import { VersionInfoDocument } from '@crowdedkingdomstudios/crowdyjs/generated';

const data = await client.graphql.request(VersionInfoDocument);
```

Most consumers should prefer the methods on `client.auth`, `client.udp`,
`client.serverStatus`, `client.users`, `client.apps`, and `client.world()`.

## Development

```bash
npm install
npm run codegen
npm run build
npm test
```

`npm run codegen` syncs `../cks-graphql-api/schema.gql` when the API repo is
checked out beside this SDK. `npm run check:schema` fails if the committed SDL or
generated types drift from the API schema.
