# CrowdyJS v6 Notes

v6 is **additive** at the SDK API level (new sub-clients only) but is a **scope
change**: CrowdyJS now wraps the **full** public management-api + game-api surface
instead of just the game-client subset. Existing sub-clients (`auth`, `users`,
`udp`, `world`, `chunks`/`voxels`/`actors`/`avatars`/`state`/`teleport`/`channels`/
`teams`/`gameModel`) are unchanged — no migration needed for existing code.

## Added

- **Studio-admin sub-clients** (target `managementUrl`): `client.organizations`,
  `client.appAccess`, `client.billing`, `client.payments`, `client.quotas`,
  `client.environments`, `client.usage`, `client.sharedEnvironment`, and
  `client.gameApps` (grid admin, game-api). All are also grouped under a
  `client.admin` facade for discoverability (`client.admin.organizations`, …,
  `client.admin.grids`).
- **Operator surface**: `client.operator` (control plane — environments, change
  orders, secrets, release management, audit). Requires `users.is_operator`.
- **Game-side**: `client.avatars` (durable avatars + per-app avatar state — the
  README previously referenced this before it existed) and `client.host`
  (game-host election + actor `heartbeat`).

## Security note

These admin/operator operations are **privileged**. The SDK only provides typed
wrappers; the server still enforces the org/app permission (or `is_operator`) on
every call. Drive `client.admin.*` from a studio backend with an org-scoped/admin
token and `client.operator` from internal tooling — **not** from an untrusted
browser. The game-client surface remains browser-safe with an end-user token.

---

# CrowdyJS v5.2.1 Notes

v5.2.1 is **documentation-only** — no API, type, or behavior changes.

## Changed

- Comprehensive TSDoc across the entire public surface (every sub-client class
  and method, the error classes, the realtime types, the token store, and the
  config). Descriptions mirror the GraphQL schema's field semantics and add
  SDK-specific notes — auth/permission requirements, the stable
  `extensions.code`s each call can throw, encoding/units conventions (`BigInt`
  as decimal strings, base64 blobs, 32-char actor ids, chunk-unit distances),
  idempotency-key replay/`IDEMPOTENCY_CONFLICT` behavior, and realtime
  `...AndWait` echo/timeout semantics. These now show up on hover in your IDE
  and in the published `.d.ts`.
- Two doc-accuracy fixes: `...AndWait` echo timeouts reject with
  `CrowdyRealtimeError` (`code === 'UDP_SEQUENCE_TIMEOUT'`), not
  `CrowdyTimeoutError`; and only actor/voxel sends echo to the sender, so the
  audio/text/event `...AndWait` variants are documented as fire-and-forget-with-error-wait.

---

# CrowdyJS v5.2 Notes

v5.2 is additive at the SDK API level (new optional parameters only) and
refreshes the bundled schema, but it **raises the minimum server version**.

## Added

- **Idempotency keys on destructive mutations.** The four destructive
  game-client mutations now accept an optional idempotency key. Replaying the
  same call with the same key returns the first result instead of re-applying
  the side effect; the same key with different arguments returns an
  `IDEMPOTENCY_CONFLICT` error. Keys expire server-side after 24h.

  ```ts
  const key = crypto.randomUUID();
  await client.actors.delete(uuid, key);   // first call deletes
  await client.actors.delete(uuid, key);   // retry replays the first result
  await client.teams.remove(groupId, key);
  await client.teams.leave(groupId, key);
  await client.voxels.rollback({ ...input, idempotencyKey: key }); // input field
  ```

  All four parameters are optional and trailing, so existing call sites are
  unchanged.

- **Refreshed bundled schema.** Re-synced against `cks-management-api` and
  `cks-game-api` so generated types now include the new Relay-style `*Connection`
  queries (offset `limit`/`offset` args are now marked `@deprecated`), the
  machine-readable `@requiresPermission` directive metadata, and the enumerated
  error codes. `CrowdyGraphQLError` already surfaces these via `extensions.code`,
  `extensions.remediation`, and `extensions.requiredPermission` — no new error
  class is needed.

## Requires

- `cks-game-api >= v0.10.3` and `cks-management-api >= v0.1.70`. The destructive
  mutation documents now send the `idempotencyKey` argument, so those four
  operations require a server that defines it. Point the SDK at an environment
  running release **v0.1.19** or later.

---

# CrowdyJS v5.1 Notes

v5.1 is additive and non-breaking.

## Added

- **`client.teams`** — the Teams API is now a first-class sub-client, mirroring
  `client.channels`. Create / update / delete teams, manage membership and
  roles, set the per-app team policy, and read `mine` (`myTeams`), `list`
  (`teams`), `get`, `members`, `roles`, and `policy`. Teams are app-scoped
  player groups with roles and delegated management (no realtime messaging
  path — that is Channels).

  ```ts
  const team = await client.teams.create({ appId: '1', name: 'Red Squad' });
  await client.teams.join(team.groupId);
  const mine = await client.teams.mine('1');
  ```

## Removed

- The `gameModelEventStream` GraphQL subscription has been removed from the Game
  API and the bundled schema. It was never wrapped by a CrowdyJS method, so no
  SDK call sites change. To react to game-model changes, have the mutating
  client send a lightweight notification over the realtime UDP path — a channel
  message (`client.udp.sendChannelMessage`, recommended) or a spatial client
  event (`client.udp.sendClientEvent`) — and have peers re-pull authoritative
  state via `client.gameModel.containerState(...)` / `client.gameModel.events(...)`.

---

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
