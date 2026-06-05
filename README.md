# CrowdyJS

The official browser-first TypeScript SDK for **Crowded Kingdoms**. CrowdyJS gives you one typed client that handles auth, the world/replication GraphQL API, and the UDP proxy subscription stream behind a single shared session.

## Install

```bash
npm install @crowdedkingdomstudios/crowdyjs
```

CrowdyJS v4 targets browsers by default and uses native `fetch`, `WebSocket`, `crypto`, `btoa`, and `atob`. Node tools can still use the SDK, but must provide browser-compatible globals when opening realtime connections.

## Quick start

```ts
import {
  BrowserLocalStorageTokenStore,
  createCrowdyClient,
} from '@crowdedkingdomstudios/crowdyjs';

const client = createCrowdyClient({
  // Game API (world data + UDP proxy)
  httpUrl: 'https://game.example.com',
  wsUrl: 'wss://game.example.com',
  // Management API (login, register, profile)
  managementUrl: 'https://management.example.com',
  tokenStore: new BrowserLocalStorageTokenStore(),
  realtime: {
    retryAttempts: 8,
    waitTimeoutMs: 5000,
  },
});

// Restore a previous session if there is one, otherwise log in.
await client.session.restore();
if (!client.session.getToken()) {
  await client.auth.login({ email: 'player@example.com', password: 'secret' });
}

// Fetch the per-app bootstrap (version requirements, UDP availability, spatial limits).
const bootstrap = await client.serverStatus.gameClientBootstrap('1');
console.log(bootstrap.versionInfo.minimumClientVersion);
```

Both endpoints share a single `AuthState`, so once `client.auth.login()` returns, every subsequent SDK call (against either endpoint) carries the bearer token automatically.

If `managementUrl` is omitted, the SDK falls back to `httpUrl` for backwards-compat with the single-endpoint deployment.

## Sub-clients at a glance

| Sub-client | What it does |
|---|---|
| `client.auth` | Register, log in, log out, password reset, email confirmation. |
| `client.users` | `me`, `updateGamertag`, profile reads. |
| `client.session` | Token store, `restore()`, `getToken()`, manual `setToken()`. |
| `client.serverStatus` | `gameClientBootstrap(appId)` — per-app version info, UDP status, spatial limits. |
| `client.chunks`, `client.voxels`, `client.actors`, `client.avatars`, `client.state` | World data reads + writes. |
| `client.teleport` | Teleport requests. |
| `client.udp` | UDP proxy subscriptions + spatial mutations (`sendActorUpdate`, `sendVoxelUpdate`, `sendAudioPacket`, `sendTextPacket`, `sendClientEvent`). |
| `client.realtime` | Connection status, manual `connect()` / `disconnect()`, `onStatus()` listener. |
| `client.world(appId)` | Higher-level helpers for browser games (`actor.join`, `actor.sendState`, `actor.sendText`). |

Auth and user reads always target `managementUrl`. Everything else targets `httpUrl` / `wsUrl`.

## Game-loop lifecycle

1. Authenticate with `client.auth.login()` or restore a previous token through `client.session.restore()`.
2. Subscribe to UDP proxy notifications with `client.udp.subscribe()` (the SDK will open the realtime socket on demand).
3. Join a chunk by sending an initial actor update.
4. Send actor, voxel, text, audio, and client-event updates through `client.udp` or the higher-level `client.world(appId)` helpers.
5. Call `client.udp.disconnect()` when leaving the world.
6. Call `client.close()` when disposing the SDK instance.

## Per-app routing

When a player is about to join an app, query its routing fields on the management API first:

```graphql
query AppForRouting($id: BigInt!) {
  app(id: $id) {
    appId
    splitMode
    gameApiUrl
  }
}
```

If `splitMode && gameApiUrl`, the app lives behind its own Game API deployment. Build a **second** `CrowdyClient` with `httpUrl: gameApiUrl` (and the matching `wsUrl`) **sharing the same `tokenStore` as the first client**, then drive gameplay through that client. Apps without `splitMode` keep working against the default `httpUrl` you configured.

## Realtime notifications

```ts
const unsubscribe = client.udp.subscribe({
  actorUpdate: (event) => {
    console.log(event.uuid, event.state);
  },
  voxelUpdate: (event) => { /* ... */ },
  clientText: (event) => { /* ... */ },
  clientAudio: (event) => { /* ... */ },
  clientEvent: (event) => { /* ... */ },
  serverEvent: (event) => { /* ... */ },
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

// Later:
unsubscribe();
```

The SDK uses the `graphql-transport-ws` protocol through `graphql-ws`, reconnects with backoff, re-reads the current token before reconnecting, and resubscribes automatically.

## Spatial sends

```ts
const response = await client.udp.sendActorUpdateAndWait({
  appId: '1',
  chunk: { x: '0', y: '0', z: '0' },
  uuid: '0123456789abcdef0123456789abcdef',
  state: 'AA==',           // base64-encoded payload
  distance: 8,
  decayRate: 1,
});

console.log(response.__typename, response.sequenceNumber);
```

The plain `sendActorUpdate`, `sendVoxelUpdate`, `sendAudioPacket`, `sendTextPacket`, and `sendClientEvent` methods return the GraphQL mutation result immediately. The `AndWait` variants allocate a `sequenceNumber` when one is missing and wait for either a matching notification or `GenericErrorResponse`.

## World helpers

```ts
const world = client.world('1');
const actor = world.actor();

await actor.join({ x: '0', y: '0', z: '0' });
await actor.sendState('AA==');
await actor.sendText('hello nearby players');
```

The world helpers are thin wrappers over `client.udp.*` with the appId pre-bound — convenient for browser games. Advanced callers can always use `client.udp.*` with the generated GraphQL input types directly.

## Errors

Transport and protocol failures throw structured error classes:

- `CrowdyHttpError` — non-2xx response from a GraphQL endpoint.
- `CrowdyGraphQLError` — preserves every GraphQL error including `path` and `extensions.code`.
- `CrowdyNetworkError` — network-level failure (DNS, TLS, connection refused).
- `CrowdyTimeoutError` — request or `AndWait` timed out.
- `CrowdyRealtimeError` — realtime subscription couldn't be established or was dropped.
- `CrowdyProtocolError` — server response failed schema validation.

## Auth notes

- Use `client.auth.setToken(token)` if you need to seed a token externally (e.g. when restoring auth from a non-default storage).
- `client.session.restore()` reads from the configured `tokenStore`. `BrowserLocalStorageTokenStore` is provided; bring your own for SSR or Node usage.
- A single `AuthState` is observed by both the HTTP client and the realtime socket, so HTTP and WebSocket auth can never drift.

## What's NOT in CrowdyJS

CrowdyJS focuses on the **game-client surface**: auth, world data, UDP proxy, profile reads. The following operations are **not** exposed by the SDK and should be called against the management GraphQL API directly (with a server-side token, typically from a studio backend):

- Org / app / billing / payments / quotas operations
- Access-tier and runtime-permission administration
- Game-token issuance / revocation
- Marketplace and catalog management

The SDK is intentionally scoped to client-side, end-user-facing flows.

## Low-level GraphQL access

Game-client methods are first-class, but generated operation documents are also available through a transport escape hatch:

```ts
import { VersionInfoDocument } from '@crowdedkingdomstudios/crowdyjs/generated';

const data = await client.graphql.request(VersionInfoDocument);
```

Most consumers should prefer the typed methods on `client.auth`, `client.users`, `client.udp`, `client.serverStatus`, and `client.world()`.

## Migration

See [MIGRATION.md](MIGRATION.md) for breaking changes between SDK majors.

## License

MIT
