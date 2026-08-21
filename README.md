# CrowdyJS

The official browser-first TypeScript SDK for **Crowded Kingdoms**. CrowdyJS
gives you typed clients for the whole platform: identity and
studio administration (the Management surface), world data and the abstract
game model (the Game surface), and the UDP proxy realtime stream — all over
one unified GraphQL API.

Authentication follows a two-token model: an identity **session token** for
account and admin operations, and short-lived **app-scoped tokens** for
gameplay, minted per app through `client.portal`.

Start here:

- [SDK guide](https://docs.crowdedkingdoms.com/crowdyjs/readme) — the canonical
  walkthrough of everything in this README.
- [Build a game](https://docs.crowdedkingdoms.com/build-a-game/intro) — a
  hands-on tutorial from sign-in to a playable voxel game.
- [Platform overview](https://docs.crowdedkingdoms.com/overview/client-workflow)
  — how a client session flows through the platform.

## Install

```bash
npm install @crowdedkingdoms/crowdyjs
```

CrowdyJS targets browsers by default and uses native `fetch`, `WebSocket`,
`crypto`, `btoa`, and `atob`. Node tools can still use the SDK, but must
provide browser-compatible globals when opening realtime connections (e.g.
pass `webSocketImpl` on Node ≤ 21 for subscriptions).

## Quick start

```ts
import {
  BrowserLocalStorageTokenStore,
  createCrowdyClient,
} from '@crowdedkingdoms/crowdyjs';

const client = createCrowdyClient({
  // One API: identity, studio admin, world data and the UDP proxy.
  httpUrl: 'https://api.example.com/graphql',
  wsUrl: 'wss://api.example.com/graphql',
  tokenStore: new BrowserLocalStorageTokenStore(),
  realtime: {
    retryAttempts: 8,
    waitTimeoutMs: 5000,
  },
});

// Restore a previous session if there is one, otherwise sign in.
await client.session.restore();
if (!client.session.getToken()) {
  // Email + password:
  await client.auth.login({ email: 'player@example.com', password });
  // ...or create the account: client.auth.register({ email, password })
  // Or magic link: email a one-time link, then complete with the token from it.
  await client.auth.requestLoginLink({ email: 'player@example.com', redirectUri });
  await client.auth.completeLoginLink(tokenFromLink);
  // Or social/OIDC: socialLoginStart('google', redirectUri) -> socialLoginComplete({ provider, code, state })
}

// Every sign-in returns an identity SESSION token (rejected for gameplay).
// Identity reads run on it:
const me = await client.users.me();
console.log(me.email);
```

There is one endpoint. `managementUrl` was removed in v14 — see
[MIGRATION.md](MIGRATION.md).

**Gameplay needs an app-scoped token, not the session token.** Mint one per
app and drive the world/UDP surface from a per-game client — see
[Authentication](#authentication-session-token-vs-app-scoped-tokens).

## Authentication: session token vs app-scoped tokens

Sign-in returns an **identity session token** good for account,
studio admin and token minting, and **rejected for gameplay**. Each game is
entered with a short-lived **app-scoped token** confined to that one app, so a
game stack never receives the player's full session.

Use two clients: an Overworld/identity client (session token) and a per-game
client (app token). They never share a token store, and they need not share a
URL — `mintAppToken` returns the endpoint for the app's own datacenter.

```ts
// Overworld/identity client
const overworld = createCrowdyClient({
  httpUrl: apiUrl,
  tokenStore: new BrowserLocalStorageTokenStore('crowdyjs:session'),
});
// Sign-in (email + password via auth.login / auth.register, magic link, or social/OIDC)
// yields the session token. There is no dev bypass: devLogin was removed in 15.0.0.
await overworld.auth.requestLoginLink({ email, redirectUri });
await overworld.auth.completeLoginLink(tokenFromLink);

// Native / same-origin: mint directly, then build a game client.
const t = await overworld.portal.mintAppToken(appId);
const game = createCrowdyClient({
  httpUrl: t.gameApiUrl!,
  wsUrl: t.gameApiWsUrl!,
  tokenStore: new BrowserLocalStorageTokenStore('crowdyjs:app:' + appId),
});
game.setToken(t.token);
game.world(appId).subscribe({ actorUpdate: (n) => { /* ... */ } });
```

Browser cross-origin handoff is OAuth2 Authorization Code + PKCE — the
verifier never leaves the game origin:

```ts
// Game origin, on "enter": redirect to the Overworld authorize page.
location.assign(await game.portal.beginEntry({
  appId, authorizeUrl: 'https://overworld.example.com/authorize',
  redirectUri: location.origin + location.pathname,
}));

// Overworld /authorize page (holds the session token):
location.assign(await overworld.portal.handleAuthorizeRequest());

// Game origin, on callback boot: exchange code+verifier -> app token (stored).
const entered = await game.portal.completeEntry();
```

Game-to-game routes through the Overworld for a fresh per-game token.

Notes:

- `portal.mintAppToken(appId)` returns the token plus `gameApiUrl` /
  `gameApiWsUrl` / `expiresAt`; it does **not** store the token on the identity
  client — set it on the per-game client.
- Each client's `AuthState` is observed by both its HTTP client and its
  realtime socket, so HTTP and WebSocket auth never drift within a client.
- `client.session.restore()` reads from the configured `tokenStore`.
  `BrowserLocalStorageTokenStore` is provided; bring your own `TokenStore` for
  SSR or Node. PKCE state uses `BrowserSessionPkceStore` by default.
- Use `client.auth.setToken(token)` to seed a token externally (e.g. when
  restoring auth from a non-default storage).

Deeper reading: [Portals & app-scoped tokens](https://docs.crowdedkingdoms.com/management-api/portals-and-app-tokens)
and [Sign in](https://docs.crowdedkingdoms.com/management-api/authentication).

### Token refresh during gameplay

Before an app token expires, call `game.refreshGameplayToken()` while gameplay
is active. It closes the old-token UDP proxy, refreshes and stores the token,
and opens the new-token proxy while existing realtime handlers resubscribe in
place. It deliberately stops on the first failed stage: if the old proxy cannot
confirm disconnect, no refresh is attempted; if refresh fails, the old token is
retained; if the new proxy connect fails, the fresh token remains stored —
surface the error and retry `game.udp.connect()` instead of rotating again.

`game.portal.refresh()` remains available for clients with no active UDP
lifecycle to preserve.

## Game-loop lifecycle

1. Sign in on the identity client with `client.auth` (`login` / `register`), or
   restore a stored session with `client.session.restore()`. This yields the
   **session token**, which gameplay rejects.
2. Mint an **app-scoped token** for the app (`identity.portal.mintAppToken(appId)`,
   or the PKCE portal flow across origins) and build a per-game client holding
   it (`game.setToken(token)`). The gameplay steps below run on that **game**
   client.
3. Subscribe to UDP proxy notifications with `game.udp.subscribe(handlers, appId)`
   — `appId` is **required** (the SDK opens the realtime socket on demand and
   scopes it to that app).
4. Join a chunk by sending an initial actor update.
5. Send actor, voxel, text, audio, and client-event updates through `game.udp`
   or the higher-level `game.world(appId)` helpers.
6. Before the app token expires, call `game.refreshGameplayToken()`.
7. Call `client.close()` (and `game.close()`) when disposing the SDK instances.

## Sub-clients at a glance

**Game-client surface** (end-user, browser-safe):

| Sub-client | What it does |
|---|---|
| `client.auth` | Sign-in: `login` / `register` (email + password), magic link, social/OIDC. Log out, and linked identities (`myIdentities`, `linkIdentity`/`unlinkIdentity`). **No dev bypass** — `devLogin` was removed in 15.0.0 and `DEV_AUTH_BYPASS` is gone from every tier. |
| `client.users` | `me`, `updateGamertag`, profile reads. |
| `client.session` | Token store, `restore()`, `getToken()`, manual `setToken()`. |
| `client.portal` | App-scoped token minting (`mintAppToken`) and the cross-origin PKCE entry flow (`beginEntry` / `handleAuthorizeRequest` / `completeEntry` / `refresh`). |
| `client.platform` | Public platform configuration (`config()`). |
| `client.serverStatus` | `gameClientBootstrap(appId)` — per-app version info, UDP status, spatial limits. |
| `client.chunks`, `client.voxels`, `client.actors`, `client.avatars`, `client.state` | World data reads + writes: terrain/LODs, voxel edit + history/rollback, durable actors, avatars, per-user app state blobs. |
| `client.host` | Game-host election (`get`, `amIHost`) + actor liveness `heartbeat`. `amIHost` is UI convenience only — authoritative host gating uses `gameModelInvoke`'s `is_host` policy. |
| `client.teleport` | Teleport requests. |
| `client.channels`, `client.teams` | Messaging channels and app-scoped player teams (membership + roles). |
| `client.gameModel` | Abstract game model: containers, properties, functions (incl. model-driven `notify_*` effects), sessions, app-scoped active-session counts (`activePlayerCount`, `activePlayerCountChanged`), container-change push (`containerChanged`), flow-correlation timelines (`flow`), automations / NPCs (`upsertAutomation`, `runAutomation`, `automationRuns`, `automationStats`, …), and one-shot timers (`scheduleInvoke`, `cancelTimer`, `timers`). |
| `client.compute` | Compute Modules — server-side Rust/WASM logic: author + deploy source (`upsertModule`, `deployVersion`, `deployTemplate`, `waitForCompile`), triggers + policy, synchronous `invoke`, and monitoring (`moduleRuns`, `moduleStats`, `moduleLogs`, `appDiagnostics`). See [Compute Modules](https://docs.crowdedkingdoms.com/game-api/compute-modules). |
| `client.playerCompute` | Player-authored SERVER/CLIENT Rust/WASM bound to player-owned grids: deploy source, activate/deactivate, list modules/versions, delete self-authored modules. |
| `client.playerModel` | Player-owned flexible model containers and grid-confined automations (`containers`, `createContainer`, `setProperty`, `automations`, `createAutomation`, …). |
| `client.playerWallet` | Player spend: balance, spend caps, card setup, policy, charges. |
| `client.marketplace` | Player-code store/install/consent flows plus player-authorized grid claims (`claimGridOwnership`, `claimGridChunk`, `releaseClaimedGrid`) and client-mod artifact fetches. |
| `client.crowdyStudio` | Cloud project, personal-library, and common-file APIs for Crowdy Studio: target-scoped files, metadata/module names, optimistic revisions, copy-by-value imports, atomic saves. |
| `client.crowdyStudioAgent` | Generated, app-token Game API transport for durable agent sessions: history/session pages, descriptors/budgets, approvals, tool results, heartbeat, control mutations, ordered event subscriptions. |
| `client.udp` | UDP proxy subscriptions + spatial mutations (`sendActorUpdate`, `sendVoxelUpdate`, `sendAudioPacket`, `sendTextPacket`, `sendClientEvent`, `sendSingleActorMessage`, `sendChannelMessage`). |
| `client.realtime` | Connection status, manual `connect()` / `disconnect()`, `onStatus()` listener. |
| `client.refreshGameplayToken()` | Safely rotates an active game client's app token (see [Token refresh](#token-refresh-during-gameplay)). |
| `client.world(appId)` | Higher-level helpers for browser games (`actor.join`, `actor.sendState`, `actor.sendText`, `actor.sendToActor`). |
| `client.kit(appId)` | Game Kit: ready-made mappings of game concepts onto the game model — see [Game Kit](#game-kit). |
| `createWorldSession(client, appId, config)` | World Stores: opt-in, SDK-managed game state from the `@crowdedkingdoms/crowdyjs/stores` subpath — see [World Stores](#world-stores). |

**Studio-admin surface** (privileged; drive with a server-side / studio token,
grouped under `client.admin` and mirrored at the top level):

| Sub-client | What it does |
|---|---|
| `client.organizations` | Orgs, members, RBAC roles, org API tokens. |
| `client.apps` | App registry, discovery + routing (`create`, `routeFor`, `marketplace`), visibility, and player-code admission mode / allow-list administration. |
| `client.appAccess` | Access tiers + per-user grants. |
| `client.billing` | Org wallet + per-app spend budgets. |
| `client.payments` | Payment checkouts (wallet top-ups, plan purchases). |
| `client.quotas` | Usage quotas at the org/app scope. |
| `client.usage` | Replication + GraphQL usage reporting. |
| `client.sharedEnvironment` | Publish to shared, runtime gating, spend caps, auto-billing. |
| `client.gameApps` | App grids (`createGrid` / `deleteGrid`), first-class grid ownership (`ownership` / `assignOwnership` / `transferOwnership`), and grid runtime-permission administration. |

**Operator surface** (platform operations; requires `is_operator`):

| Sub-client | What it does |
|---|---|
| `client.operator` | Platform compute ceilings (`computePlatformCeilings`, `setComputePlatformCeilings`). Infrastructure operations live in the separate infra-control-plane service, not this SDK. |

Auth, user reads and the studio-admin / operator surfaces use the **identity
session token**; the world/UDP surfaces require an **app-scoped token** for that
app. Both go to the same endpoint.

CrowdyJS wraps the full public API surface — every
non-deprecated public root field has a typed method, with Relay `*Connection`
cursor-pagination variants alongside the legacy offset lists. The SDK never
relaxes server-side authorization: exposing an operation here just gives you a
typed wrapper; the caller still needs the right token and permission. Drive
privileged surfaces from a studio backend with an org-scoped or admin token,
not from an untrusted browser.

## Per-app routing

`mintAppToken` returns `gameApiUrl` / `gameApiWsUrl`, so you rarely need a
separate routing query. When you do (e.g. pre-flight discovery), query the
app's routing fields:

```graphql
query AppForRouting($appId: BigInt!) {
  app(appId: $appId) {
    appId
    splitMode
    deploymentTarget
    gameApiUrl
  }
}
```

`gameApiUrl` is populated for both dedicated (`splitMode`) and shared
(`deploymentTarget: "shared"`) apps. When it's set, build a second
`CrowdyClient` with `httpUrl: gameApiUrl` (and the matching `wsUrl`) holding
that app's app-scoped token, then drive gameplay through that client. Apps
with no `gameApiUrl` keep working against the default `httpUrl` you
configured. See [Loading an app's Game API](https://docs.crowdedkingdoms.com/crowdyjs/shared-environment-routing).

## Realtime notifications

`subscribe` takes the handlers **and a required `appId`** (second argument).
The Game API scopes the realtime session to that app and rejects an
app-agnostic subscription with a `RealtimeConnectionEvent`
(`code: 'APP_ID_REQUIRED'`); a missing or invalid gameplay token is rejected
with `AUTH_REQUIRED`. Run one client per app (each holding that app's
app-scoped token) when a player is in multiple apps at once.

```ts
const appId = '1';

const unsubscribe = client.udp.subscribe(
  {
    actorUpdate: (event) => {
      console.log(event.uuid, event.state);
    },
    voxelUpdate: (event) => { /* ... */ },
    text: (event) => { /* ... */ },
    audio: (event) => { /* ... */ },
    clientEvent: (event) => { /* ... */ },
    serverEvent: (event) => { /* ... */ },
    singleActorMessage: (event) => {
      // A direct actor-to-actor message addressed to you.
      console.log(event.uuid, event.payload); // payload is base64
    },
    channelMessage: (event) => {
      // A message broadcast on a channel you're subscribed to.
      console.log(event.channelId, event.payload); // payload is base64
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
  },
  appId,
);

// Or use the world helper, which passes its appId automatically:
//   client.world(appId).subscribe(handlers);

client.realtime.onStatus((status) => {
  console.log('realtime:', status);
});

// Later:
unsubscribe();
```

The SDK uses the `graphql-transport-ws` protocol through `graphql-ws`,
reconnects with backoff, re-reads the current token before reconnecting, and
resubscribes automatically. `RealtimeConnectionEvent` carries a `retryable`
flag: `UDP_PROXY_CONNECTION_FAILED` is transient (back off and resubscribe),
while `AUTH_REQUIRED` / `APP_ID_REQUIRED` must be fixed by the caller first.
Unsubscribing stops delivery only; call `client.udp.disconnect()` to close the
UDP proxy session.

### Surviving the loss of an instance (direct connect)

**If your environment uses direct connect, set `realtime.discoveryUrl`.** Under
direct connect `mintAppToken` hands the client ONE api instance, and without a way
to ask for another the client cannot leave it: it re-dials a dead host until its
retries run out and then sits there, connected to nothing.

```ts
const bootstrap = await client.udp.gameClientBootstrap(appId);

const client = createCrowdyClient({
  httpUrl: bootstrap.gameApiUrl,
  wsUrl: bootstrap.gameApiWsUrl,
  realtime: {
    // The LOAD BALANCER, not the instance above. A discovery URL that dies with
    // the instance it exists to replace is worse than none.
    discoveryUrl: bootstrap.discoveryUrl,
  },
});
```

That is the whole integration — the SDK builds re-discovery from the URL itself,
so recovery does not depend on every game remembering to write a callback. Pass an
explicit `realtime.rediscover` only to override it (e.g. `createMintRediscover`
when you hold an identity client and would rather re-mint than reuse a token near
expiry).

**Requires 13.9.0 or later, and the version matters more than it looks.** Before
13.9.0 the escalation to re-discovery was reachable only by a client that had
NEVER connected: a session that was working and then lost its instance re-dialled
one dead address forever, logging only `Binary relay socket error`. Setting
`discoveryUrl` on an older build therefore changes nothing in the case you set it
for. `ck-api` must be v1.20.0+ to return `discoveryUrl` at all.

**Pass a `logger`.** Everything the SDK knows about losing an instance it says
through that logger, including an explicit warning when it cannot move. With none
wired, a client that failed to re-discover and one that never tried look
identical.

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

The plain `sendActorUpdate`, `sendVoxelUpdate`, `sendAudioPacket`,
`sendTextPacket`, and `sendClientEvent` methods return the GraphQL mutation
result immediately. The `AndWait` variants allocate a `sequenceNumber` when
one is missing and wait for either a matching notification or
`GenericErrorResponse`. `sendChannelMessage` broadcasts an opaque payload on a
channel.

### Actor-to-actor messages

```ts
// Delivered only to the actor whose UUID matches `targetUuid`; you must know
// that actor's current chunk. Fire-and-forget — the sender gets no echo. The
// target receives a `SingleActorMessageNotification` on its subscription.
await client.udp.sendSingleActorMessage({
  appId: '1',
  chunk: { x: '7', y: '1', z: '2' }, // the TARGET actor's chunk
  targetUuid: '0123456789abcdef0123456789abcdef',
  payload: 'aGVsbG8=', // base64; embed sender identity here if you need it
});
```

## World helpers

```ts
const world = client.world('1');
const actor = world.actor();

await actor.join({ x: '0', y: '0', z: '0' });
await actor.sendState('AA==');
await actor.sendText('hello nearby players');

// Direct message to one other actor (you supply its UUID + current chunk):
await actor.sendToActor(
  '0123456789abcdef0123456789abcdef',
  'aGVsbG8=', // base64 payload
  { x: '7', y: '1', z: '2' },
);
```

The world helpers are thin wrappers over `client.udp.*` with the appId
pre-bound — convenient for browser games. Advanced callers can always use
`client.udp.*` with the generated GraphQL input types directly.

## World Stores

The core client is a thin transport; the **World Stores** layer
(`@crowdedkingdoms/crowdyjs/stores`) adds the source-of-truth data structures
every game otherwise hand-writes: actor registries, chunk/voxel caches, error
attribution, message inboxes, host tracking, and typed durable-state wrappers
— all driven by ONE shared `udpNotifications` subscription and ONE scheduler.

```ts
import {
  createWorldSession, structCodec, f32, u8, jsonCodec, workerTicker,
} from '@crowdedkingdoms/crowdyjs/stores';

// Describe your replication state ONCE (binary layouts, declaratively):
const poseCodec = structCodec({
  x: f32(), y: f32(), z: f32(), yaw: f32(),
  flags: u8(), held: u8(),
});

const session = createWorldSession(game, appId, {
  ticker: workerTicker(), // keep 5 Hz sends even in backgrounded tabs
  self:   { codec: poseCodec, initialState: { x: 0, y: 0, z: 0, yaw: 0, flags: 0, held: 0 } },
  actors: { codec: poseCodec, staleAfterMs: 12_000, historySize: 2 },
  errors: true,
  chunks: { voxelStateCodec: jsonCodec<MyVoxelMeta>() },
});

// Your actor: uuid minted + persisted, presence sent at 5 Hz with
// send-on-change dedup; just update the typed state from your game loop.
await session.self.join({ x: '0', y: '0', z: '0' });
session.self.patchState({ x: 12.5, yaw: 1.57 });
console.log(session.self.status, session.self.lastAck?.state);

// Everyone else: typed, self-filtered, staleness-managed — render from it.
for (const actor of session.actors.list()) {
  render(actor.uuid, actor.state, actor.samples); // samples → interpolation
}

// Terrain: cached, hydrated, realtime-merged, optimistically editable.
await session.chunks.ensureAround({ x: 0, y: 0, z: 0 }, 3);
await session.chunks.setVoxel({ chunk: { x: 0, y: 0, z: 0 }, x: 1, y: 2, z: 3, voxelType: 7 });

// Server-reported send errors, attributed to what you sent:
session.errors.onError((e) => console.warn(e.errorCode, e.send?.kind));

session.dispose();
```

The available stores are `self` (your actor + send loop), `actors` (remote
actor registry with lanes/history/staleness), `errors` (attributed send
errors), `chunks` (chunk/voxel cache with realtime merge + worldgen
write-back), `channelInbox` / `actorInbox` (message inboxes), `events` (typed
event router), `host` (host tracking), `save` / `avatar` (typed durable
state), and `model` (game-model container mirror).

Every store is **opt-in twice over**: only configured stores are constructed
(and only they exist on the session's TYPE — `session.host` without
`host: ...` in the config is a compile error), and the layer lives behind the
`./stores` subpath with `"sideEffects": false`, so unimported stores never
reach your bundle. Reads are synchronous snapshots and writes happen on
WebSocket events (not `requestAnimationFrame`), so render loops read freely
and a backgrounded tab keeps ingesting updates; pass `workerTicker()` to also
keep timer-driven sends at full rate while hidden. See the
[World Stores guide](https://docs.crowdedkingdoms.com/crowdyjs/stores).

## Game Kit

`client.kit(appId)` maps traditional game concepts onto the abstract game
model + automations API. Studios **deploy blueprints** (the admin "load the
state/rules" step, requires `manage_apps`); game clients then use the typed
runtime helpers. Everything composes `client.gameModel` — no new server
surface.

```ts
// Studio setup (admin context):
import { inventoryBlueprint, lockBlueprint, npcBlueprint } from '@crowdedkingdoms/crowdyjs';

await admin.kit(appId).deploy([
  inventoryBlueprint(),
  lockBlueprint({ objectTypeName: 'Door', authority: { kind: 'key' } }),
  npcBlueprint({
    behaviors: [{
      name: 'npc-wander',
      role: 'wanderer',
      trigger: { intervalMs: 60000 },
      mutations: [
        { target: 'self', property: 'x', expression: 'self.x + rand_int(-2, 2)' },
        { target: 'self', property: 'z', expression: 'self.z + rand_int(-2, 2)' },
      ],
    }],
  }),
]);

// Game client (player token):
const kit = game.kit(appId);
const bag = await kit.inventory.ensure(me.userId);
const result = await kit.objects.open(doorId, { keyId });
if (!result.success) console.warn('locked:', result.errorMessage);
```

Land sale closes the permission loop end to end:

```ts
// Studio: sell a plot over a grid; doors on it honor the purchase automatically.
await admin.kit(appId).deploy([
  plotBlueprint({ rentable: true }),
  lockBlueprint({ objectTypeName: 'PlotDoor',
    authority: { kind: 'chunkPermission', key: 'access', mode: 'smallest' } }),
]);

// Game client: buying spends gold AND grants enforced grid access atomically.
const buy = await kit.plots.buy(plotId, walletId);
if (buy.success) await kit.objects.open(doorId); // has_chunk_permission passes now
```

NPC blueprints can target by permissions too — e.g. a guard automation whose
selector has `candidatePermissionWhere: [{ userFrom: { property: 'owner_user_id' },
op: 'lacks', key: 'access', grid: { property: 'grid_id' } }]` reacts only to
intruders.

The kit covers the common genre staples end to end — each layer is a blueprint
builder plus a typed runtime helper:

| Layer | Builder → helper | Highlights |
| --- | --- | --- |
| Inventory | `inventoryBlueprint` → `kit.inventory` | bags/stacks, grant/consume/transfer, craft, barter |
| Objects | `lockBlueprint` → `kit.objects` | lockable doors/chests with key or permission authority |
| NPCs | `npcBlueprint` → `kit.npcs` | automation-driven NPC instances (spawn, runNow, enable) |
| Plots | `plotBlueprint` → `kit.plots` | buy/rent land with transactional, replication-enforced grid grants |
| Economy | `economyBlueprint` → `kit.economy` | multi-currency wallets, atomic shop buys, escrow trades, player market, escrowed order book (`kit.economy.orderBook`) |
| Progression | `progressionBlueprint` → `kit.progression` | xp/levels via the `fn:` curve helper, skill prerequisite chains, achievements, host-gated rating |
| Loot | `lootBlueprint` → `kit.loot` | weighted tables unrolled into seed-driven expressions, atomic single-claim, event-triggered drops |
| Quests | `questsBlueprint` → `kit.quests` | event-automation progress, atomic claim into stack+wallet, cron daily resets, tutorial sequencing |
| Combat | `combatBlueprint` → `kit.combat` | server-side damage/death, status-effect tick automation, `turnBased`/`hostSynced`, routed attacks |
| Matches | `matchesBlueprint` → `kit.matches` | session lobbies/rounds/turns/scores, per-match channel + `onMatchChanged` (notify-to-pull) |
| Decks | `decksBlueprint` → `kit.decks` | hidden hands via owner-visibility `card_id`, shuffle-by-position automation |
| World sim | `worldsimBlueprint` → `kit.worldsim` | day/night clock with spatial notify, node regen + atomic gather, crops, wave counters, forecasts |
| Social | `guildBlueprint` → `kit.social` | parties/guilds/chat over teams+channels, grid territory grants, guild hall + bank composite |
| Leaderboards | `leaderboardsBlueprint` → `kit.leaderboards` | trusted keep-best submits, client-side ranking, cron seasons |
| Live ops | `liveopsBlueprint` → `kit.liveops` | timed event windows and seasons |
| Moderation | `moderationBlueprint` → `kit.moderation` | reports, queues, mutes |
| Telemetry | `telemetryBlueprint` → `kit.telemetry` | counters and lightweight event tracking |
| Monetization | `featureGate` → `kit.features` | feature keys, tier grants, `*policyExtra` gating on builders |
| Abilities | — → `kit.abilities` | ability definitions, casts, loadouts |
| Movement | — → `kit.movement` | movement warden configs + violation parsing |
| Territory | — → `kit.territory` | control points, factions, enrollment |
| Racing | — → `kit.racing` | courses, entries, possession (claim/pass/shoot) |

Engine-aware layers talk to compute-module game engines when they are
deployed, and degrade gracefully on model-only apps via capability detection
(`kit.engines`): `kit.mobs` (refereed attacks, defs/slots, contact-damage
parsing), `kit.pets` (adopt/summon/dismiss/rename), `kit.instances` (private
world slices, seeded runs), `kit.director` (encounter runs),
`kit.matchmaking` (queues/proposals/rating), `kit.minigames` (invoke-loop
wrapper), plus engine paths on `kit.matches` / `kit.decks` /
`kit.leaderboards` and the `kit/wire` pose codec + event parsers. Deploy
engines alongside blueprints with `kit.deploy(blueprints, { engines })`.

See the docs guides [Modeling game concepts](https://docs.crowdedkingdoms.com/game-api/modeling-game-concepts)
(the underlying model + genre map) and [Game Kit](https://docs.crowdedkingdoms.com/crowdyjs/game-kit)
(the SDK surface + the simulation-tier / notify-to-pull / timer / hidden-info
/ anti-cheat patterns).

## Crowdy Studio

Crowdy Studio is the in-game SERVER/CLIENT Rust authoring surface for player
code: cloud projects with target-scoped files, optimistic-concurrency
autosave, draft/live/stop orchestration, and a Monaco editor backed by a local
Rust language worker. The worker receives source files and the embedded
platform index only — never a credential and never a server connection.
Compiled CLIENT artifacts run through `PlayerCodeBroker`, which keeps tokens
on the page, allow-lists host calls, and locally clamps chunk-targeted effects
to the owned grid before the normal SDK path reaches server authorization.

Most games embed the ready-made shell rather than hand-rolling window chrome
around `mountCrowdyStudio`:

```ts
import { createCrowdyStudioEmbed } from '@crowdedkingdoms/crowdyjs/crowdy-studio';
// Self-starting glue worker for CLIENT mods (Vite shown; any bundler that
// packages module workers works):
import workerUrl from '@crowdedkingdoms/crowdyjs/player-glue-worker?worker&url';

const studio = createCrowdyStudioEmbed({
  client: game, // CrowdyClient: crowdyStudio, playerCompute, playerWallet, crowdyStudioAgent
  appId,
  gameName: 'My Game',
  suppressGameplayInput: () => pauseInput(),
  onLayoutChange: () => resizeCanvas(),
});

// Per open (for example after the player claims a grid):
studio.toggle({
  gridId,
  targetPermissions: {
    SERVER: { canWrite: true, canRun: true },
    CLIENT: { canWrite: false, canRun: false }, // SERVER-only embeds omit workerUrl
  },
});
```

The embed renders a resizable right dock on desktop and a focus-trapped
fullscreen modal on narrow screens, and mounts the agent dock automatically
when the client exposes `crowdyStudioAgent` and the game passes a
`playerHost`. For custom chrome, call `mountCrowdyStudio(host, options)`
directly; for a headless integration, use `new CrowdyStudioController(options)`.
New games should start SERVER-only. Untrusted HUD payloads always render as
text, never HTML.

See [Crowdy Studio & player client mods](https://docs.crowdedkingdoms.com/crowdyjs/player-client-mods)
and [Embed Crowdy Studio in your game](https://docs.crowdedkingdoms.com/crowdyjs/crowdy-studio-embed).

### Agentic Crowdy Studio

The agent surface adds an Ask/Build/Play AI dock on top of Crowdy Studio,
built from three browser contracts (`crowdy.studio-agent/1`,
`crowdy.agent-tools/1`, `crowdy.player-host/1`):

- `@crowdedkingdoms/crowdyjs/agent` exports `CrowdyStudioAgentController` (the
  durable session client: contiguous event ordering, replay/gap fill,
  attach-epoch fencing, exact approval hashes, budgets, pause/resume/stop) and
  `CROWDY_AGENT_TOOL_REGISTRY_V1`, an immutable digest-pinned registry of
  bounded, schema-validated tools. There is deliberately no raw GraphQL
  executor, DOM driver, `fetch`, shell, or unrestricted SDK bridge in these
  surfaces.
- `client.crowdyStudioAgent` is the production GraphQL transport for durable
  agent sessions; pass it (plus a `playerHost` adapter) to the Studio mount's
  `agent` option to get the integrated dock.
- `@crowdedkingdoms/crowdyjs/player-host` exports the generic game
  observation/control contract: implement `PlayerHostAdapterV1` over your
  game's typed intent methods, and the exported `AgentControlLeaseManager`,
  `PlayerControlGate`, and `AgentControlBanner` enforce scoped leases, TTLs,
  synchronous human preemption, and always-visible Pause/Stop chrome.

```ts
import { CrowdyStudioAgentController } from '@crowdedkingdoms/crowdyjs/agent';

const agent = new CrowdyStudioAgentController({
  transport: game.crowdyStudioAgent,
  createSession: {
    appId, projectId, gridId,
    mode: 'BUILD',
    providerDataConsent: true,
    idempotencyKey: crypto.randomUUID(),
  },
});
await agent.initialize(); // attach epoch → durable replay/gap fill → live tail
```

See [Agentic Crowdy Studio](https://docs.crowdedkingdoms.com/crowdyjs/agentic-crowdy-studio)
for the full session, lease, and approval model.

## Errors

Transport and protocol failures throw structured error classes:

- `CrowdyHttpError` — non-2xx response from a GraphQL endpoint.
- `CrowdyGraphQLError` — preserves every GraphQL error including `path` and `extensions.code`.
- `CrowdyNetworkError` — network-level failure (DNS, TLS, connection refused).
- `CrowdyTimeoutError` — request or `AndWait` timed out.
- `CrowdyRealtimeError` — realtime subscription couldn't be established or was dropped.
- `CrowdyProtocolError` — server response failed schema validation.

GraphQL errors carry a stable `extensions.code` (e.g. `UNAUTHENTICATED`,
`SCOPE_MISSING`, `FORBIDDEN`, `IDEMPOTENCY_CONFLICT`, `RATE_LIMITED`) plus,
where applicable, `extensions.remediation` and `extensions.requiredPermission`.
Branch on `error.extensions?.code` rather than parsing messages.

## Idempotent retries

Destructive game-client mutations accept an optional **idempotency key**. Pass
a stable key (e.g. `crypto.randomUUID()`) and a network retry replays the
first result instead of applying the side effect twice. Reusing a key with
different arguments throws a `CrowdyGraphQLError` with
`extensions.code === 'IDEMPOTENCY_CONFLICT'`. Keys expire server-side after 24h.

```ts
const key = crypto.randomUUID();
await client.actors.delete(uuid, key);          // first call deletes
await client.actors.delete(uuid, key);          // retry → replays the first result
await client.teams.remove(groupId, key);        // deleteTeam
await client.teams.leave(groupId, key);         // leaveTeam
await client.voxels.rollback({ ...input, idempotencyKey: key }); // input field
```

The key parameter is optional and trailing, so it's safe to omit.

## Low-level GraphQL access

Typed sub-client methods are first-class, but generated operation documents
are also available through a transport escape hatch, `client.graphql`:

```ts
import { VersionInfoDocument } from '@crowdedkingdoms/crowdyjs/generated';

const data = await client.graphql.request(VersionInfoDocument);
```

For any brand-new server field not yet wrapped, `client.graphql.request(...)`
always works. (`client.management` was removed in v14 along with the second
endpoint; `client.graphql` reaches every surface.)

## Maintainers: running the e2e suite

`npm run test:e2e` drives a real deployed stack, and the suites self-skip when
the environment is not configured, so they are safe to leave in `npm test`.

```bash
CROWDY_HTTP_URL='https://ck.<tier>.v7.cks-env.com' \
CROWDY_WS_URL='wss://ck.<tier>.v7.cks-env.com/graphql' \
CROWDY_OWNER_EMAIL='owner@example.com' \
CROWDY_TEST_APP_ID='78221653114368' \
  npm run test:e2e
```

**`CROWDY_HTTP_URL` is the ENTRY origin, not the gameplay origin.** Point it at
the shared multivalue name (`ck.<tier>…`), the same one a cold client resolves.
The harness then does what the SDK is built to do: sign in and mint against the
entry origin, and build every gameplay client on the `gameApiUrl` /
`gameApiWsUrl` the mint returns, threading `discoveryUrl` into `realtime` so
instance loss is recoverable.

Do not point it at a single datacenter to "make the tests pass". That was the
old behaviour and it hid two things. A suite pinned to one datacenter never
exercises residency at all, so a placement regression cannot fail it. And a
suite that ran *gameplay* against the shared origin was testing a configuration
no client is ever in: the origin resolves to every datacenter's load balancer,
so consecutive requests from one client can be answered by different instances,
and because the UDP proxy connection is per-instance a subscription opened on
one and a mutation sent to the other never meet. That produced failures in tests
as simple as self-echo, which has a single client and cannot have a placement
problem.

`test/e2e/app-residency.test.mjs` is the suite that asserts the contract every
other suite now depends on — that `discovery.apps()` and `mintAppToken` name the
same datacenter, and that gameplay works against it. On a single-datacenter
environment its cross-datacenter assertions self-skip and say so, rather than
passing quietly.

Two endpoint shapes are both correct and are not interchangeable:
`appDiscovery` answers with the datacenter's load balancer (`ck-<dc>.<zone>`),
while `mintAppToken` under direct connect hands back one instance
(`ck-api-<dc>-<n>.<zone>`). They agree on the datacenter, not on the host, which
is why the mint also returns `discoveryUrl`.

## Maintainers: schema artifacts and fixtures

CrowdyJS is a standalone public package: a clean clone builds with
`npm install && npm run build` using the artifacts committed to this repo —
no other repositories and no network access required:

- `schema.gql` — the unified API SDL (management and game surfaces).
- `src/generated/graphql.ts` — generated TypeScript operation types.

Schema refresh is explicit, from the published
[SDL](https://docs.crowdedkingdoms.com/schema/game-api.graphql):

```bash
npm run schema:sync:prod
npm run codegen
```

(`npm run schema:sync:paths -- --schema <file-or-url>` accepts an explicit
source, and `npm run schema:sync:local` reads `../cks-game-api/schema.gql`.) Commit `schema.gql` and `src/generated/graphql.ts`
together whenever the public GraphQL surface changes; `npm run check:schema`
detects drift in CI/release work.

Two more committed fixtures follow the same boundary — the build validates
them locally and never reads a sibling checkout; coordinated maintainers
refresh them from an explicitly supplied source:

- The browser Rust authoring index:
  `npm run authoring-index:drift -- --source <exporter-json> [--write]`, then
  `npm run authoring-index:generate`.
- The agent tool-descriptor fixture:
  `npm run agent-descriptors:drift -- --source <game-api-fixture>`; every
  build re-checks the digests.

## Migration

See [MIGRATION.md](MIGRATION.md) for breaking changes between SDK majors.

## License

MIT
