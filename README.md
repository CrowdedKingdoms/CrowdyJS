# CrowdyJS

The official browser-first TypeScript SDK for **Crowded Kingdoms**. CrowdyJS gives you typed clients for auth, the world/replication GraphQL API, and the UDP proxy subscription stream. As of **v7** it follows the Overworld two-token model: an identity **session token** for the Management API, and short-lived **app-scoped tokens** for gameplay via `client.portal` (see [Overworld portals & app-scoped tokens (v7)](#overworld-portals--app-scoped-tokens-v7)).

## Install

```bash
npm install @crowdedkingdoms/crowdyjs
```

> **Renamed package, same version line.** This SDK moved to the `@crowdedkingdoms` npm org but **kept its v6 version line**. `@crowdedkingdoms/crowdyjs@6.1.1` continues directly from the former `@crowdedkingdomstudios/crowdyjs@6.1.0` — same code, new package name. (Two interim `1.0.x` publishes during the org move reset the version by mistake; they remain on npm but are superseded by `6.1.1`, which is `latest`.) See [MIGRATION.md](MIGRATION.md).

CrowdyJS v4 targets browsers by default and uses native `fetch`, `WebSocket`, `crypto`, `btoa`, and `atob`. Node tools can still use the SDK, but must provide browser-compatible globals when opening realtime connections.

> **Server compatibility:** v5.2+ targets environments on release **v0.1.19 or later** (`cks-game-api >= v0.10.3`, `cks-management-api >= v0.1.70`). The destructive mutations send an `idempotencyKey` argument that older servers don't define. v6.1's `client.gameApps.deleteGrid` additionally requires release **v0.1.33+** (`cks-game-api >= v0.12.3`). The game-model **permission effects** fields (`permissionEffects` on `gameModel.upsertFunction`/`seed`, `permissionEffectsAppliedJson` on events) require a `cks-game-api` build with the `2026-07-17-model-permission-effects` migration (v0.13.11+); older servers reject queries/mutations that include them (omit the fields and everything else keeps working). The **permission-read** surface (the `has_grid_permission`/`grid_at`/`has_chunk_permission` expression builtins the kit's `chunkPermission` locks compile to, and selector `*PermissionWhere` predicates) additionally requires `cks-game-api` **v0.13.12+**. Older `cks-game-api` builds report game-model **invoke policy denials** as `FORBIDDEN` GraphQL errors instead of resolving with `success: false`; as of this version the kit's invoke helpers map that error onto the documented `{ success: false, errorMessage }` result, so kit callers behave identically against both server generations. v8.6's **`client.compute`** (Compute Modules — server-side Rust/WASM logic) requires a `cks-game-api` build with the compute surface (the `compute*` root fields, v0.13.13+ dev line); older servers reject these operations with a GraphQL validation error, and everything else keeps working. v8.9's **realtime + live-ops surfaces** (`kit.abilities`/`movement`/`territory`/`racing`/`liveops`/`moderation`/`telemetry`, the loot engine path, `client.compute.deployTemplate` + `kit.deploy({engines})`, and the type-94..98 event parsers) complete the 30-abstraction catalog; v8.8's **session-genre engine surfaces** (`kit.instances`/`director`/`matchmaking`/`minigames`, the engine paths on matches/decks/leaderboards, `economy.orderBook`, and the type-91/92/93 event parsers) talk to the Wave 2 engine templates; capability detection keeps model-only deployments on today's behavior. v8.7's **engine kit surfaces** (`kit.mobs`, `kit.pets`, `kit.combat.attackRouted`, `kit.worldsim.forecast`, and the `kit/wire` pose/lane registry) talk to compute-module game engines built on the Wave 0/1 `cks-game-api` dev line (`crowdy-game-kit` crates); capability detection makes them degrade gracefully — model-only deployments keep today's behavior.

## Standalone builds and schema refresh

CrowdyJS is a standalone public package: a clean clone builds with
`npm install && npm run build` using the schema artifacts committed to this
repo — no other repositories and no network access required:

- `schema.gql` — merged Management API + Game API SDL.
- `src/generated/graphql.ts` — generated TypeScript operation types.

Schema refresh (maintainers) is explicit, from the published SDLs
([management-api.graphql](https://docs.crowdedkingdoms.com/schema/management-api.graphql),
[game-api.graphql](https://docs.crowdedkingdoms.com/schema/game-api.graphql)):

```bash
npm run schema:sync:prod
npm run codegen
```

(`npm run schema:sync:paths -- --management <file-or-url> --game <file-or-url>`
accepts explicit sources.) Commit `schema.gql` and `src/generated/graphql.ts`
together whenever the public GraphQL surface changes; `npm run check:schema`
detects drift in CI/release work.

## Quick start

```ts
import {
  BrowserLocalStorageTokenStore,
  createCrowdyClient,
} from '@crowdedkingdoms/crowdyjs';

const client = createCrowdyClient({
  // Game API (world data + UDP proxy)
  httpUrl: 'https://game.example.com',
  wsUrl: 'wss://game.example.com',
  // Management API (passwordless sign-in, profile)
  managementUrl: 'https://management.example.com',
  tokenStore: new BrowserLocalStorageTokenStore(),
  realtime: {
    retryAttempts: 8,
    waitTimeoutMs: 5000,
  },
});

// Restore a previous session if there is one, otherwise sign in (passwordless).
await client.session.restore();
if (!client.session.getToken()) {
  // Magic link: email a one-time link, then complete with the token from it.
  await client.auth.requestLoginLink({ email: 'player@example.com', redirectUri });
  await client.auth.completeLoginLink(tokenFromLink);
  // Or social/OIDC: socialLoginStart('google', redirectUri) -> socialLoginComplete({ provider, code, state })
  // Or dev/test only (server has DEV_AUTH_BYPASS): client.auth.devLogin('player@example.com')
}

// Passwordless sign-in returns an identity SESSION token (Management API only);
// the account is created on first sign-in. Identity reads run on it:
const me = await client.users.me();
console.log(me.email);
```

**Gameplay needs an app-scoped token, not the session token.** Mint one per app and
drive the Game API world/UDP surface (including `gameClientBootstrap`) from a
per-game client — see [Overworld portals & app-scoped tokens (v7)](#overworld-portals--app-scoped-tokens-v7).

If `managementUrl` is omitted, the SDK falls back to `httpUrl` for backwards-compat with the single-endpoint deployment.

## Sub-clients at a glance

**Game-client surface** (end-user, browser-safe):

| Sub-client | What it does |
|---|---|
| `client.auth` | Passwordless sign-in (magic link, social/OIDC, dev bypass), log out, and linked identities (`myIdentities`, `linkIdentity`/`unlinkIdentity`). |
| `client.users` | `me`, `updateGamertag`, profile reads. |
| `client.session` | Token store, `restore()`, `getToken()`, manual `setToken()`. |
| `client.serverStatus` | `gameClientBootstrap(appId)` — per-app version info, UDP status, spatial limits. |
| `client.chunks`, `client.voxels`, `client.actors`, `client.avatars`, `client.state` | World data reads + writes. |
| `client.host` | Game-host election (`get`, `amIHost`) + actor liveness `heartbeat`. `amIHost` is UI convenience only — authoritative host gating uses `gameModelInvoke`'s `is_host` policy. |
| `client.teleport` | Teleport requests. |
| `client.channels`, `client.teams` | Messaging channels and app-scoped player teams (membership + roles). |
| `client.gameModel` | Abstract game model: containers, properties, functions (incl. model-driven `notify_*` effects), sessions, and **automations / NPCs** (`upsertAutomation`, `runAutomation`, `automationRuns`, `automationStats`, …). |
| `client.compute` | **Compute Modules** — server-side Rust/WASM logic: author + deploy source (`upsertModule`, `deployVersion`, `waitForCompile`), triggers + policy, synchronous `invoke`, and monitoring (`moduleRuns`, `moduleStats`, `moduleLogs`, `appDiagnostics`). Modules run server-only; see [Compute Modules docs](https://docs.crowdedkingdoms.com/game-api/compute-modules). |
| `client.udp` | UDP proxy subscriptions + spatial mutations (`sendActorUpdate`, `sendVoxelUpdate`, `sendAudioPacket`, `sendTextPacket`, `sendClientEvent`). |
| `client.realtime` | Connection status, manual `connect()` / `disconnect()`, `onStatus()` listener. |
| `client.world(appId)` | Higher-level helpers for browser games (`actor.join`, `actor.sendState`, `actor.sendText`). |
| `createWorldSession(client, appId, config)` (from `@crowdedkingdoms/crowdyjs/stores`) | World Stores: opt-in, SDK-managed game state — typed codecs (`structCodec` binary DSL), your own actor with a 5 Hz send loop (`session.self`), a remote-actor registry with lanes/history/staleness (`session.actors`), attributed send errors (`session.errors`), a chunk/voxel cache with realtime merge + worldgen write-back (`session.chunks`), channel/direct-message inboxes + a typed event router, host tracking, typed save/avatar state, and a game-model container mirror. Only configured stores exist (compile-time + runtime); unimported stores tree-shake away. |
| `client.kit(appId)` | Game Kit: ready-made mappings of game concepts onto the game model — `kit.inventory`, `kit.objects` (lockable doors/chests with custom permissions), `kit.npcs`, `kit.plots` (buy/rent land with transactional, replication-enforced grid grants), and the genre layers `kit.economy` (wallets/shops/trades/market), `kit.progression` (xp/skills/achievements/rating), `kit.loot`, `kit.quests`, `kit.combat`, `kit.matches` (session lobbies/turns/scores with notify-to-pull channels), `kit.decks` (hidden hands), `kit.worldsim` (clock/nodes/crops/waves), `kit.social` (parties/guilds/chat over teams+channels), `kit.leaderboards`, `kit.features` (tier gates), and the engine-aware helpers `kit.mobs` (refereed attacks, defs/slots, contact-damage parsing), `kit.pets` (adopt/summon/dismiss/rename), `kit.instances` (private world slices, seeded runs), `kit.director` (encounter runs), `kit.matchmaking` (queues/proposals/rating), `kit.minigames` (invoke-loop wrapper), `kit.economy.orderBook` (escrowed bid/ask market), engine paths on `kit.matches`/`kit.decks`/`kit.leaderboards`, `kit.quests` tutorial sequencing, `kit.engines` (compute capability detection) with `kit/wire` (the engine pose codec, `engineLanes()`, and the 77/90/91/92/93 event parsers) — plus blueprint builders + `kit.deploy(...)` for the admin "load the rules" step. |

**Studio-admin surface** (privileged; drive with a server-side / studio token, grouped under `client.admin`):

| Sub-client | What it does |
|---|---|
| `client.organizations` | Orgs, members, RBAC roles, org API tokens. |
| `client.apps` | App discovery + routing (`createApp` etc. via the management API directly). |
| `client.appAccess` | Access tiers + per-user grants. |
| `client.billing` | Org wallet + per-app spend budgets. |
| `client.payments` | Payment checkouts (wallet top-ups, plan purchases). |
| `client.quotas` | Usage quotas at the org/app scope. |
| `client.environments` | Dedicated environments: quote, provision, scale, deploy, link apps. |
| `client.usage` | Replication + GraphQL usage reporting. |
| `client.sharedEnvironment` | Publish to shared, runtime gating, spend caps, auto-billing. |
| `client.gameApps` | App grids (`createGrid` / `deleteGrid`) + grid runtime-permission administration. |

**Operator surface** (platform operations; requires `is_operator`):

| Sub-client | What it does |
|---|---|
| `client.operator` | Control plane: cross-org environments, change orders, secrets, release management, audit. |

Auth, user reads, and the studio-admin / operator surfaces target `managementUrl` and use the **identity session token**; the game-client world/UDP surfaces target `httpUrl` / `wsUrl` and require an **app-scoped token** for that app. Use one identity client plus a per-game client (see [Overworld portals & app-scoped tokens (v7)](#overworld-portals--app-scoped-tokens-v7)); each client's `AuthState` carries its token to its own endpoints, so HTTP and WebSocket auth never drift within a client.

## Game-loop lifecycle

1. Sign in (passwordless) on the identity client with `client.auth` — `requestLoginLink`/`completeLoginLink` (magic link), `socialLoginStart`/`socialLoginComplete` (social/OIDC), or `devLogin` (dev/test only) — or `client.session.restore()`. This yields the **session token** (Management API only).
2. Mint an **app-scoped token** for the app (`identity.portal.mintAppToken(appId)`, or the PKCE portal flow across origins) and build a per-game client holding it (`game.setToken(token)`). The gameplay steps below run on that **game** client.
3. Subscribe to UDP proxy notifications with `game.udp.subscribe(handlers, appId)` — `appId` is **required** (the SDK opens the realtime socket on demand and scopes it to that app).
4. Join a chunk by sending an initial actor update.
5. Send actor, voxel, text, audio, and client-event updates through `game.udp` or the higher-level `game.world(appId)` helpers.
6. Call `game.udp.disconnect()` when leaving the world; `game.portal.refresh()` before the token expires to keep playing.
7. Call `client.close()` (and `game.close()`) when disposing the SDK instances.

## Per-app routing

When a player is about to join an app, query its routing fields on the management API first:

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

`gameApiUrl` is populated for **both** dedicated (`splitMode`) and shared
(`deploymentTarget: "shared"`) apps. When it's set, build a **second**
`CrowdyClient` with `httpUrl: gameApiUrl` (and the matching `wsUrl`) holding that
app's **app-scoped token** (`identity.portal.mintAppToken(appId)` — do **not**
reuse the identity client's session token store), then drive gameplay through that
client. In practice `mintAppToken` already returns `gameApiUrl` / `gameApiWsUrl`,
so you rarely need this separate routing query. Apps with no `gameApiUrl` keep
working against the default `httpUrl` you configured.

## Realtime notifications

`subscribe` takes the handlers **and a required `appId`** (second argument). The
Game API scopes the realtime session to that app and rejects an app-agnostic
subscription with a `RealtimeConnectionEvent` (`code: 'APP_ID_REQUIRED'`). It also
rejects an identity session token (`APP_TOKEN_REQUIRED`) or a token scoped to a
different app (`APP_SCOPE_MISMATCH`). Run one client per app (each holding that
app's app-scoped token) when a player is in multiple apps at once.

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

### Actor-to-actor messages

```ts
// Delivered only to the actor whose UUID matches `targetUuid`; you must know
// that actor's current chunk. Fire-and-forget — the sender gets no echo, so
// there is no `AndWait` variant. The target receives a
// `SingleActorMessageNotification` on its subscription.
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

The world helpers are thin wrappers over `client.udp.*` with the appId pre-bound — convenient for browser games. Advanced callers can always use `client.udp.*` with the generated GraphQL input types directly.

## World Stores

The core client is a thin transport; the **World Stores** layer
(`@crowdedkingdoms/crowdyjs/stores`, 8.4+) adds the source-of-truth data
structures every game otherwise hand-writes: actor registries, chunk/voxel
caches, error attribution, message inboxes, host tracking, and typed
durable-state wrappers — all driven by ONE shared `udpNotifications`
subscription and ONE scheduler.

```ts
import {
  createWorldSession, structCodec, f32, u8, jsonCodec, workerTicker,
} from '@crowdedkingdoms/crowdyjs/stores';

// Describe your replication state ONCE (48-byte binary layouts, declaratively):
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

Land sale closes the permission loop end to end (requires game-api v0.13.11+ for
effects, v0.13.12+ for the chunk-permission reads):

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

As of 8.3.0 the kit covers the common genre staples end to end — every layer
is a blueprint builder + typed runtime helper:

| Layer | Builder → helper | Highlights |
| --- | --- | --- |
| Economy | `economyBlueprint` → `kit.economy` | multi-currency wallets, atomic shop buys, escrow trades, player market, restock automation |
| Progression | `progressionBlueprint` → `kit.progression` | xp/levels via the `fn:` curve helper, skill prerequisite chains, achievements, host-gated rating |
| Loot | `lootBlueprint` → `kit.loot` | weighted tables unrolled into seed-driven expressions, atomic single-claim, event-triggered drops |
| Quests | `questsBlueprint` → `kit.quests` | event-automation progress, atomic claim into stack+wallet, cron daily resets |
| Combat | `combatBlueprint` → `kit.combat` | server-side damage/death, status-effect tick automation (selector join), `turnBased`/`hostSynced` |
| Matches | `matchesBlueprint` → `kit.matches` | session lobbies/rounds/turns/scores, per-match channel + `onMatchChanged` (notify-to-pull) |
| Decks | `decksBlueprint` → `kit.decks` | hidden hands via owner-visibility `card_id`, shuffle-by-position automation |
| World sim | `worldsimBlueprint` → `kit.worldsim` | day/night clock with spatial notify, node regen + atomic gather, crops, wave counters |
| Social | `guildBlueprint` → `kit.social` | parties/guilds/chat over teams+channels, grid territory grants, guild hall + bank composite |
| Leaderboards | `leaderboardsBlueprint` → `kit.leaderboards` | trusted keep-best submits, client-side ranking, cron seasons |
| Monetization | `featureGate` → `kit.features` | feature keys, tier grants, `*policyExtra` gating on builders |

See the docs guides [Modeling game concepts](https://docs.crowdedkingdoms.com/game-api/modeling-game-concepts)
(the underlying model + genre map) and [Game Kit](https://docs.crowdedkingdoms.com/crowdyjs/game-kit)
(the SDK surface + the simulation-tier / notify-to-pull / timer / hidden-info
/ anti-cheat patterns).

## Errors

Transport and protocol failures throw structured error classes:

- `CrowdyHttpError` — non-2xx response from a GraphQL endpoint.
- `CrowdyGraphQLError` — preserves every GraphQL error including `path` and `extensions.code`.
- `CrowdyNetworkError` — network-level failure (DNS, TLS, connection refused).
- `CrowdyTimeoutError` — request or `AndWait` timed out.
- `CrowdyRealtimeError` — realtime subscription couldn't be established or was dropped.
- `CrowdyProtocolError` — server response failed schema validation.

GraphQL errors carry a stable `extensions.code` (e.g. `UNAUTHENTICATED`, `SCOPE_MISSING`, `FORBIDDEN`, `IDEMPOTENCY_CONFLICT`) plus, where applicable, `extensions.remediation` and `extensions.requiredPermission`. Branch on `error.extensions?.code` rather than parsing messages.

## Idempotent retries

Destructive game-client mutations accept an optional **idempotency key**. Pass a stable key (e.g. `crypto.randomUUID()`) and a network retry replays the first result instead of applying the side effect twice. Reusing a key with different arguments throws a `CrowdyGraphQLError` with `extensions.code === 'IDEMPOTENCY_CONFLICT'`. Keys expire server-side after 24h.

```ts
const key = crypto.randomUUID();
await client.actors.delete(uuid, key);          // first call deletes
await client.actors.delete(uuid, key);          // retry → replays the first result
await client.teams.remove(groupId, key);        // deleteTeam
await client.teams.leave(groupId, key);         // leaveTeam
await client.voxels.rollback({ ...input, idempotencyKey: key }); // input field
```

The key parameter is optional and trailing, so it's safe to omit. Requires a server on release v0.1.19+ (see Server compatibility above).

## Auth notes

- Use `client.auth.setToken(token)` if you need to seed a token externally (e.g. when restoring auth from a non-default storage).
- `client.session.restore()` reads from the configured `tokenStore`. `BrowserLocalStorageTokenStore` is provided; bring your own for SSR or Node usage.
- Each client's `AuthState` is observed by both its HTTP client and its realtime socket, so HTTP and WebSocket auth never drift within a client. Hold the **identity session token** on the management/identity client and an **app-scoped token** on each per-game client (`client.portal` — see the [v7 section](#overworld-portals--app-scoped-tokens-v7)).

## Overworld portals & app-scoped tokens (v7)

As of v7 gameplay requires an **app-scoped token**, not the session token.
Passwordless sign-in returns an **identity session token** (Management API only —
account, studio admin, and minting); each game is entered with a short-lived token
confined to that one app, so a game stack never receives the player's full session.

Use two clients: an Overworld/identity client (session token) and a per-game
client (app token), sharing only the Management URL.

```ts
// Overworld/identity client
const overworld = createCrowdyClient({ managementUrl, tokenStore: new BrowserLocalStorageTokenStore('crowdyjs:session') });
// Passwordless sign-in (magic link, social/OIDC, or dev bypass) yields the session token.
await overworld.auth.requestLoginLink({ email, redirectUri });
await overworld.auth.completeLoginLink(tokenFromLink);

// Native / same-origin: mint directly, then build a game client.
const t = await overworld.portal.mintAppToken(appId);
const game = createCrowdyClient({ httpUrl: t.gameApiUrl!, wsUrl: t.gameApiWsUrl!, managementUrl,
  tokenStore: new BrowserLocalStorageTokenStore('crowdyjs:app:' + appId) });
game.setToken(t.token);
game.world(appId).subscribe({ actorUpdate: (n) => { /* ... */ } });
```

Browser cross-origin handoff is OAuth2 Authorization Code + PKCE — the verifier
never leaves the game origin:

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
// Keep playing past expiry without re-portaling (same app):
await game.portal.refresh();
```

Game-to-game routes through the Overworld for a fresh per-game token. New
realtime codes: `APP_TOKEN_REQUIRED`, `APP_SCOPE_MISMATCH`; new `UdpErrorCode`:
`TOKEN_EXPIRED`. See [MIGRATION.md](MIGRATION.md) for the full v7 breaking guide.

## Surface scope & security

As of v6 (completed in v6.1), CrowdyJS wraps the **full** management-api + game-api
public surface, not just the game-client subset — every non-deprecated public root
field has a typed method, with Relay `*Connection` cursor-pagination variants
alongside the legacy offset lists. The surfaces are namespaced by audience:

- **Game-client** (`client.auth`, `client.users`, `client.udp`, `client.world(...)`,
  `client.chunks`/`voxels`/`actors`/`avatars`/`state`/`teleport`/`channels`/`teams`/
  `gameModel`/`host`) — safe for untrusted browser clients with an end-user token.
- **Studio-admin** (`client.admin.*` — also reachable at the top level, e.g.
  `client.billing`) — privileged organization/app administration. Drive these from a
  **studio backend** with an org-scoped or admin token, **not** from an untrusted
  browser; the server still enforces the relevant org/app permission on every call.
- **Operator** (`client.operator`) — platform control-plane operations that require
  `users.is_operator`. For internal operator tooling only.

The SDK never relaxes server-side authorization — exposing an operation here just
gives you a typed wrapper; the caller still needs the right token and permission. For
any brand-new server field not yet wrapped, the low-level escape hatch
(`client.graphql.request(...)` / `client.management.request(...)`) always works.

## Low-level GraphQL access

Game-client methods are first-class, but generated operation documents are also available through a transport escape hatch:

```ts
import { VersionInfoDocument } from '@crowdedkingdoms/crowdyjs/generated';

const data = await client.graphql.request(VersionInfoDocument);
```

Most consumers should prefer the typed methods on `client.auth`, `client.users`, `client.udp`, `client.serverStatus`, and `client.world()`.

## Migration

See [MIGRATION.md](MIGRATION.md) for breaking changes between SDK majors.

## License

MIT
