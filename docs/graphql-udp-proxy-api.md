# GraphQL UDP Proxy API -- Client SDK Guide

The web API acts as a UDP proxy between GraphQL clients and the game server.
Clients interact entirely through GraphQL (HTTP mutations + WebSocket
subscriptions); the API handles UDP sockets, HMAC authentication, and
serialization internally.

## Authentication

Every request uses a **game token** -- a 64-character hex string returned by
the `login` mutation.  Pass it as `Authorization: Bearer <token>` on both HTTP
requests and WebSocket connections.

```graphql
mutation {
  login(loginUserInput: { email: "user@example.com", password: "..." }) {
    token          # 64-char hex -- use this for all subsequent requests
    gameTokenId    # numeric ID (informational)
    user { userId email }
  }
}
```

## Connection lifecycle

### 1. Subscribe to notifications (WebSocket)

Open a WebSocket with the `graphql-transport-ws` subprotocol and send
`connection_init` with the token:

```json
{ "type": "connection_init", "payload": { "Authorization": "Bearer <token>" } }
```

After `connection_ack`, subscribe:

```graphql
subscription {
  udpNotifications {
    __typename
    ... on ActorUpdateNotification  { mapId chunkX chunkY chunkZ distance decayRate uuid state sequenceNumber epochMillis }
    ... on VoxelUpdateNotification  { mapId chunkX chunkY chunkZ distance decayRate uuid voxelX voxelY voxelZ voxelType voxelState sequenceNumber epochMillis }
    ... on GenericErrorResponse     { sequenceNumber errorCode }
    ... on ActorUpdateResponse      { mapId chunkX chunkY chunkZ distance decayRate uuid sequenceNumber epochMillis }
    ... on VoxelUpdateResponse      { mapId chunkX chunkY chunkZ distance decayRate uuid sequenceNumber epochMillis }
    ... on ClientAudioNotification  { mapId chunkX chunkY chunkZ distance decayRate uuid audioData sequenceNumber epochMillis }
    ... on ClientTextNotification   { mapId chunkX chunkY chunkZ distance decayRate uuid text sequenceNumber epochMillis }
    ... on ClientEventNotification  { mapId chunkX chunkY chunkZ distance decayRate uuid eventType state sequenceNumber epochMillis }
    ... on ServerEventNotification  { mapId chunkX chunkY chunkZ distance decayRate uuid eventType state sequenceNumber epochMillis }
  }
}
```

All spatial types include the full header fields (`mapId`, `chunkX/Y/Z`,
`distance`, `decayRate`, `uuid`), plus `sequenceNumber` and `epochMillis`
(server-generated UTC timestamp in milliseconds since epoch).  Only
`GenericErrorResponse` has a minimal 3-field format (no spatial header).

Subscribing automatically opens a UDP proxy session to the game server if one
does not already exist.  The server picks the game server with the fewest
clients.

### 2. Register your actor in a chunk

Before another client can receive your updates, **you must send at least one
actor update** so the game server knows your chunk position.  This is the
"registration" step:

```graphql
mutation {
  sendActorUpdate(input: {
    mapId: 0
    chunk: { x: 0, y: 0, z: 0 }
    distance: 8
    uuid: "<your-32-byte-uuid>"
    state: ""                     # empty state for registration
    sequenceNumber: 1
  })
}
```

Every client in the same chunk must do this.  After registration, the game
server fans out subsequent updates to all other registered clients in range.

### 3. Send actor updates

```graphql
mutation {
  sendActorUpdate(input: {
    mapId: 0
    chunk: { x: 0, y: 0, z: 0 }
    distance: 8
    decayRate: 0
    uuid: "<your-32-byte-uuid>"
    state: "<base64-encoded-binary-state>"
    sequenceNumber: 2
  })
}
```

The mutation returns `true` when the UDP packet is sent.  Other clients in the
same chunk will receive an `ActorUpdateNotification` on their
`udpNotifications` subscription.

### 4. Receive notifications

Notifications arrive as `next` messages on the WebSocket subscription:

```json
{
  "id": "s1",
  "type": "next",
  "payload": {
    "data": {
      "udpNotifications": {
        "__typename": "ActorUpdateNotification",
        "mapId": "0",
        "chunkX": "0",
        "chunkY": "0",
        "chunkZ": "0",
        "distance": 8,
        "decayRate": 0,
        "uuid": "abc123...",
        "state": "aGVsbG8=",
        "sequenceNumber": 2,
        "epochMillis": "1712345678000"
      }
    }
  }
}
```

### 5. Disconnect

```graphql
mutation { disconnectUdpProxy }
```

Unsubscribing from `udpNotifications` stops delivery but does **not** release
the UDP session.  Call `disconnectUdpProxy` explicitly, or the server will
release it after 30 seconds of inactivity.

## Complete flow (two clients)

```
Client A                          Web API                    Game Server
────────                          ───────                    ───────────
login ─────────────────────────▶  token A
subscribe udpNotifications ─────▶  (opens UDP proxy session)
                                   ◀── P2P Token Authorization (HMAC) ──▶
                                   ◀── wait for session load ──▶

sendActorUpdate (seq=1, empty) ──▶  UDP ACTOR_UPDATE_REQUEST ──▶  registers A in chunk

Client B                          Web API                    Game Server
────────                          ───────                    ───────────
login ─────────────────────────▶  token B
subscribe udpNotifications ─────▶  (opens UDP proxy session)
sendActorUpdate (seq=1, empty) ──▶  UDP ACTOR_UPDATE_REQUEST ──▶  registers B in chunk

sendActorUpdate (seq=2, state) ──▶  UDP ACTOR_UPDATE_REQUEST ──▶
                                                                  ◀── fan-out
                                   ◀── UDP ACTOR_UPDATE_NOTIFICATION
                                   ─── WebSocket next ──▶ Client A receives B's update
```

## Important notes

- **`state` must be base64-encoded binary**, not JSON.
- **`uuid` must be exactly 32 bytes** when UTF-8 encoded.
- **`sequenceNumber`** is a uint8 (0-255) that wraps.  Present on all spatial
  types.  In responses it echoes the request's sequence for correlation; in
  notifications it is the original sender's sequence.
- **`epochMillis`** is a server-generated UTC timestamp (milliseconds since
  epoch).  Present on all spatial types (notifications and responses).  Use it
  for ordering and synchronization.
- **`distance`** (0-8) controls how many chunks away the update replicates.
  Use 8 for maximum range.  The server clamps values to the 0-8 range using
  Chebyshev distance.
- **`decayRate`** controls how message delivery drops off with distance:

  | Value | Name | Behavior |
  |-------|------|----------|
  | 0 | None | All clients within `distance` receive every message. |
  | 1 | Exponential | Each distance ring receives half the messages of the previous ring. |
  | 2 | Linear 50% | Linear decay; the furthest ring receives 50% of messages. |
  | 3 | Linear 25% | Linear decay; the furthest ring receives 25% of messages. |
  | 4 | Linear 10% | Linear decay; the furthest ring receives 10% of messages. |
  | 5 | Linear 5% | Linear decay; the furthest ring receives 5% of messages. |

- **`mapId`** is `chunk W` in the wire format -- the first of four chunk
  coordinates.
- The proxy auto-reconnects to the game server if no traffic is seen for 30s.
  The subscription stays open but notifications pause until reconnection.
- Error responses (e.g., invalid token, bad map) arrive as
  `GenericErrorResponse` on the subscription.

## Other mutations

| Mutation | Description |
|---|---|
| `sendVoxelUpdate` | Modify a voxel in a chunk |
| `sendAudioPacket` | Send voice audio data |
| `sendTextPacket` | Send chat text |
| `sendClientEvent` | Send a custom event |
| `connectUdpProxy` | Explicitly open a UDP session (optional -- mutations and subscription auto-open) |
| `disconnectUdpProxy` | Release the UDP session |

## Queries

| Query | Description |
|---|---|
| `udpProxyConnectionStatus` | Check if a UDP session is active |
