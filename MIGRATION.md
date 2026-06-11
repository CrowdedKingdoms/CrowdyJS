# CrowdyJS v5 Migration Notes

CrowdyJS v5 makes the realtime subscription **app-scoped** to fix a cross-app
notification leak: a single game token is app-agnostic and one UDP proxy
session is shared by every subscription on that token, so a token reused across
apps (e.g. a player in multiple tabs/apps) used to receive other apps' spatial
fan-out.

## Breaking change

- `client.udp.subscribe(handlers, appId)` — **`appId` is now required**. The
  game-api fences `udpNotifications` by app and **rejects app-agnostic
  subscriptions** with a `RealtimeConnectionEvent` `code = 'APP_ID_REQUIRED'`.

  ```ts
  // Before (v4):
  client.udp.subscribe({ actorUpdate });
  // After (v5):
  client.udp.subscribe({ actorUpdate }, '1');
  // Or use the world helper, which passes its appId automatically:
  client.world('1').subscribe({ actorUpdate });
  ```

  Run one client per app (sharing the same `tokenStore`) when a player is in
  multiple apps at once.

- Requires a game-api that enforces the app fence (`cks-game-api >= v0.9.0`).

---

# CrowdyJS v3 Migration Notes

CrowdyJS v3 is a breaking rewrite focused on browser game clients.

## Main Changes

- Use `createCrowdyClient()` or `new CrowdyClient()` with `httpUrl` and `wsUrl`.
- Use `client.auth.login({ email, password })` instead of `client.login(email, password)`.
- Use `client.udp.subscribe({ actorUpdate })` instead of `client.onActorUpdate(...)`.
- Use `client.udp.sendActorUpdate(...)` or `client.udp.sendActorUpdateAndWait(...)` instead of root-level send methods.
- Use `client.udp.disconnect()` instead of `client.disconnectUdpProxy()`.
- Use `client.session` for token restore, manual token injection, and token persistence.
- Use `client.realtime.onStatus()` for connection state and reconnect visibility.
- Import generated operation documents from `@crowdedkingdomstudios/crowdyjs/generated`.

## API Field Renames

- `CreateGridInput.app_id` is now `CreateGridInput.appId`.
- `TeleportRequestInput.UUID` is now `TeleportRequestInput.uuid`.
- `connectUdpProxy` takes no input.

## Error Handling

GraphQL failures now throw `CrowdyGraphQLError`, preserving every GraphQL error
including `path` and `extensions.code`. Realtime failures use
`CrowdyRealtimeError` and subscription-level `RealtimeConnectionEvent` payloads.
