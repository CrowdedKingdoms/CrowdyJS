# AGENTS

CrowdyJS is the browser-first TypeScript SDK for **Crowded Kingdoms**: it wraps
the one GraphQL API — management and game surfaces alike — and the UDP
replication service (reached through that API's GraphQL UDP proxy). Games built on it have no limit on
player concurrency because all realtime traffic is spatially routed by chunk.

Read [README.md](README.md) first (install, quick start, sub-client tables,
token model, error classes). [MIGRATION.md](MIGRATION.md) covers breaking
changes between majors. This file adds what the README does not: **how to map
game concepts onto the API surface**. (Patterns below reference *Blocks with
Friends*, the Minecraft-style voxel MMO built on this SDK — playable at
crowdy.games; its source is not public, so every pattern is described
self-contained here or in the public docs.)

## Repo orientation

- `src/domains/` — one file per sub-client (`udp.ts`, `gameModel.ts`,
  `chunks.ts`, `voxels.ts`, `host.ts`, `portal.ts`, `teams.ts`, `channels.ts`,
  `gameApps.ts`, `state.ts`, `avatars.ts`, `teleport.ts`, `serverStatus.ts`, …).
  Doc comments in these files are the most precise concept→API notes in the repo.
- `src/operations/<domain>/*.graphql` — the GraphQL documents behind each
  method (e.g. `gameModel/GameModelAutomations.graphql`, `udp/UdpNotifications.graphql`).
- `src/world.ts` — `client.world(appId)` facade: `actor().join/sendState/sendText/sendToActor`.
- `src/stores/` — the **World Stores** layer (`@crowdedkingdoms/crowdyjs/stores`
  subpath; core client never imports it): `createWorldSession(client, appId,
  config)` opens ONE `udpNotifications` subscription and constructs only the
  configured stores — `self` (LocalActorStore: persisted uuid, typed state,
  5 Hz send loop with dedup + keyframes, lastSent/lastAck/status), `actors`
  (RemoteActorStore: decode-once lanes, sample history, read-time staleness),
  `errors` (GenericErrorResponse attributed to tracked sends), `chunks`
  (ChunkStore: byDistance loading + voxelStates hydration, realtime merge,
  optimistic setVoxel, worldgen write-back), `channelInbox`/`actorInbox`/
  `events` (typed messaging), `host` (heartbeat tracker), `save`/`avatar`
  (typed durable blobs), `model` (ContainerMirror, notify-to-pull channel
  binding). Typed via `StateCodec` (json/text/raw/`structCodec` binary DSL);
  timers ride a `Ticker` (`workerTicker()` = background-tab-throttling
  exempt). Conditional session typing: unconfigured stores don't exist on
  the type.
- `src/kit/` — `client.kit(appId)` Game Kit facade over `gameModel` (plus
  `channels`/`teams`/`udp` for the social/match layers): blueprint builders in
  `src/kit/blueprints/` (`inventoryBlueprint` / `lockBlueprint` /
  `npcBlueprint` / `plotBlueprint` and the genre builders `economyBlueprint` /
  `progressionBlueprint` / `lootBlueprint` / `questsBlueprint` /
  `combatBlueprint` / `matchesBlueprint` / `decksBlueprint` /
  `worldsimBlueprint` / `guildBlueprint` / `leaderboardsBlueprint`) +
  `kit.deploy(...)` for admin seeding, and runtime helpers `kit.inventory`,
  `kit.objects`, `kit.npcs`, `kit.plots`, `kit.economy`, `kit.progression`,
  `kit.loot`, `kit.quests`, `kit.combat`, `kit.matches`, `kit.decks`,
  `kit.worldsim`, `kit.social`, `kit.leaderboards`, `kit.features`. Locks
  support a `chunkPermission` authority (`has_chunk_permission` policy); NPC
  selectors support grid-permission predicates (`KitSelectorSpec`); trusted
  mutations use the shared `KitTrustedAuthority` shape (`server`/`host`/
  `automation`); `featureGate` + `*policyExtra` options monetization-gate
  builders.
- `schema.gql` + `src/generated/graphql.ts` — committed schema artifacts; the
  build must never depend on other repositories or network access. Refresh
  from the published SDLs with `npm run schema:sync:prod` + `npm run codegen`,
  commit both together, and use `npm run check:schema` to detect drift (see
  README "Standalone builds").
- `test/unit`, `test/e2e` — e2e suites (two-client, gamer-journey, audio,
  voxel, channel) double as usage examples.

## Core mental model: one endpoint, two tokens, two clients

1. Passwordless sign-in (`client.auth.requestLoginLink`/`completeLoginLink`,
   `socialLoginStart`/`socialLoginComplete`, or dev-only `devLogin`) yields an
   **identity session token** — good for account, studio admin and minting, and
   rejected for gameplay.
2. Gameplay requires a short-lived **app-scoped token** per game:
   `portal.mintAppToken(appId)` same-origin, or the PKCE portal flow
   (`portal.beginEntry` → Overworld `portal.handleAuthorizeRequest` →
   `portal.completeEntry`, then `portal.refresh()` to keep playing).
3. Build one identity client and one client per game. `mintAppToken` /
   `completeEntry` return `gameApiUrl`/`gameApiWsUrl` — when set, point the
   game client at them. All world/UDP calls run on the game client.
4. `udp.subscribe(handlers, appId)` requires the appId and an app-scoped
   token; one realtime subscription per app.

## Game concept → API surface

| Game concept | API surface |
|---|---|
| Player presence & movement | `udp.subscribe` + `udp.sendActorUpdate` (chunk-addressed, base64 `state` blob, `distance` fan-out); `world(appId)` helpers; SDK-managed: World Stores `session.self` (send loop) + `session.actors` (typed registry) |
| Client-side game-state bookkeeping (actor registries, chunk caches, codecs, inboxes) | `createWorldSession` from `@crowdedkingdoms/crowdyjs/stores` — opt-in typed stores over one shared subscription |
| Persistent terrain / world | `chunks.get` / `chunks.byDistance` / `chunks.update` (durable) + `udp.sendVoxelUpdate` (realtime edits) |
| Per-block metadata | app-defined blob conventions inside chunk `voxelStates` (e.g. compact JSON→base64 with orientation/growth/power/container-link fields); type it with a `StateCodec` on the ChunkStore's `voxelStateCodec` |
| Server-side rules & data (inventory, stats, crafting, NPCs) | `gameModel` containers / properties / functions with invoke policies — schema admin-seeded before play |
| App-wide active gameplay-session count | `gameModel.activePlayerCount(appId)` snapshot + `gameModel.activePlayerCountChanged({ appId }, handlers)` best-effort transitions |
| World life with no client online | `gameModel` automations (schedules/triggers invoking `autonomousInvocable` functions) — admin-seeded before play |
| Ready-made inventory / lockable objects / NPC mappings | `kit(appId)` — blueprints deployed with `kit.deploy` (admin), runtime via `kit.inventory` / `kit.objects` / `kit.npcs` |
| Economy / progression / loot / quests / combat / matches / decks / world sim / leaderboards | `kit(appId)` genre layers — one blueprint builder + runtime helper each (`kit.economy`, `kit.progression`, `kit.loot`, `kit.quests`, `kit.combat`, `kit.matches`, `kit.decks`, `kit.worldsim`, `kit.leaderboards`) |
| Parties / guild halls / chat rooms / tier gates | `kit.social` (teams + channels + udp in game terms), `guildBlueprint` composite, `kit.features` + `featureGate` |
| Smooth client-side simulation authority | `host.heartbeat` election + `is_host` invoke policy for authoritative gating |
| Proximity voice chat | `udp.sendAudioPacket` + `audio` handler; `use_voice_chat` grid permission |
| Chat | proximity: `udp.sendTextPacket`; app-wide rooms: `channels.*` + `udp.sendChannelMessage` |
| Guilds / parties | `teams.*` (app-scoped groups with roles, join policies) |
| Land claims / zoning | `gameApps.createGrid` / `grantPermissions` / `nearbyPermissions` (+ model containers for claim metadata) |
| Direct player-to-player messages | `udp.sendSingleActorMessage` (target uuid + its chunk) |
| Save games / settings | `state.getOne` / `state.update` (per-user per-app blob) |
| Characters | `avatars.mine` / `create` / `updateAppState` |
| Teleport | `teleport.request` |
| Version / capability check | `serverStatus.gameClientBootstrap(appId)` |

### Spatial replication (the platform's flagship feature)

Everything realtime is addressed to a **chunk** (16×16×16 world cube) and
fanned out to subscribers within `distance` chunks. Actors join a world by
sending their first actor update; movement is a periodic `sendActorUpdate`
with an app-defined base64 `state` payload (keep it compact — BWF packs a
48-byte pose). Handlers on `udp.subscribe`: `actorUpdate`,
`actorUpdateResponse`, `voxelUpdate`, `text`, `audio`, `clientEvent`,
`serverEvent`, `singleActorMessage`, `genericError`, `connectionEvent`,
`error`. Use the `*AndWait` variants when you need the echo/ack; plain sends
are fire-and-forget. Payload budget is ~1.1 KB per spatial packet.

### Chunk & voxel storage

GraphQL `chunks.*` is the durable store (bulk load with `chunks.byDistance`,
persist with `chunks.update`); `udp.sendVoxelUpdate` is the realtime edit path
that also notifies nearby players. A proven worldgen pattern (BWF):
deterministic shared generation — chunks the server has never stored are
generated client-side and written back via `chunks.update`, so the world grows
as players explore and stays identical for everyone. Voxel edits require the
`update_voxel_data` permission on both the access tier and a covering grid.
Moderation: `voxels.history` / `voxels.rollback`.

### Game Model API (`client.gameModel`)

Server-authoritative rules without running a server. Three primitives:

- **Container types + containers** — typed instances (`createContainer`,
  `containers`, `containerState`), optionally player-owned (`ownerUserId`,
  `instantiableBy: member`). JSON crosses the wire as `*Json` strings.
- **Properties** — typed key/values with defaults and visibility.
- **Functions** — transactional mutations with expressions, invoked via
  `gameModel.invoke({ appId, functionName, selfContainerId, paramsJson })`.
  **Invoke policies** are the authority model: `owner_of_self`, `condition`
  expressions, `is_host`, `is_current_turn`, `allow`, and `and`/`or` combinators.

**The model must be seeded by an admin before players can use it.** Container
types, property definitions, functions, and policies do not exist until a
studio-admin token (a user with `manage_apps` on the app) writes them — plan a
seed script as part of any game build, and run it before the game client ships.
Author the schema with `kit.deploy([...blueprints])` (preferred: one
transactional `gameModel.seed` + automation upserts from plain-data
blueprints) or `gameModel.seed` directly, plus `upsertContainerType` /
`upsertPropertyDef` / `upsertFunction` / `setPolicy` for incremental changes;
runtime ops (`createContainer`, `invoke`, reads) then run with a player's app
token against the seeded schema. The proven seed shape (used by Blocks with
Friends): an idempotent, re-runnable Node script that mints an admin app
token, deploys the schema through `kit.deploy` (kit blueprints for plots /
locks / NPCs plus one hand-authored blueprint for the game-specific
remainder), seeds definition containers, and versions migrations via a
`World.version` property compared against the model JSON's schema version.
Sessions (`createSession` / `joinSession` / `setSessionTurn`) support
match/turn structures; model-driven `notify_*` effects push updates to
subscribed clients.

App-scoped player counts use a player's app token:
`gameModel.activePlayerCount(appId)` counts active gameplay sessions (not
distinct users or actors), and an abandoned session may remain for about 120
seconds. Only `FRESH` is complete; never interpret `PARTIAL` or `UNAVAILABLE`
as authoritative zero. `activePlayerCountChanged({ appId }, handlers)` requires
`wsUrl`, sends no initial event, and is best-effort: establish the stream, query
the snapshot, deduplicate by decimal-string `revision`, and requery after
reconnects or revision gaps.

### Automations API (NPCs & world ticks)

Automations invoke model functions server-side on a schedule or event trigger —
NPC wander, trader restock, mob spawn ticks, crop growth — with **no client
connected**. Target functions must declare `autonomousInvocable: true`.
Like the model schema, automations are **admin-authored ahead of play**: the
same seed script that writes the model should upsert the automation policy and
definitions (`kit.deploy` upserts blueprint automations automatically; BWF
registers all of its automations this way); game clients only read
diagnostics. Surface: `gameModel.upsertAutomation` (name,
`functionName`, `targetMode` + `targetTypeName`, `triggerType: schedule` +
`intervalMs`, selector with `where`/`limit`), `upsertAutomationTrigger`
(event-driven), `setAutomationPolicy` (enable + budgets: `minIntervalMs`,
`maxFanout`, `maxCascadeDepth`, runs-per-minute), `runAutomation` (manual
kick), `automationRuns` / `automationStats` (diagnostics).

### Host election (client-side simulation)

The platform elects one host **user** per app (longest-connected actor's
user). `host.heartbeat(appId)` (~3s) keeps you eligible and returns the
current host; `host.get` / `host.amIHost` are reads. Election is
**informational** — for authoritative gating put `is_host` in the invoke
policy of host-only model functions. Pattern: the elected host client runs
smooth AI locally (mobs, growth ticks) and broadcasts flagged actor updates,
while durable state syncs at low frequency through model functions.

### Voice chat

Push-to-talk proximity voice = spatial audio packets: capture mic → downsample
(BWF: 8 kHz mono mu-law, ~120 ms frames ≈ 960 bytes) → base64 →
`udp.sendAudioPacket({ appId, chunk, uuid, audioData, distance })`. Receive on
the `audio` handler; apply per-speaker jitter buffering and distance gain.
The server enforces the `use_voice_chat` grid permission.

## Reference patterns: Blocks with Friends

The most complete CrowdyJS consumer is *Blocks with Friends*, a Minecraft-style
voxel MMO (playable via the Overworld at crowdy.games; source not public). As
of CrowdyJS 8.4 it runs almost entirely on SDK-managed layers, so every one of
its patterns maps to a public surface you can adopt directly:

| Pattern | SDK surface |
|---|---|
| One shared session over one `udpNotifications` subscription | `createWorldSession(client, appId, config)` from `@crowdedkingdoms/crowdyjs/stores` |
| Actor replication (5 Hz send loop, 48-byte binary pose, stable uuid) | `session.self` with a `structCodec` pose; remote players/mobs via `session.actors` lanes |
| Chunk streaming, hydration, realtime merge, deterministic write-back worldgen | `session.chunks` (`ensureAround`, `onMissing` → seed with optional `writeBack: false`, `setVoxel`); custom dense layouts via `voxelIndex` |
| Per-voxel metadata (orientation, growth, power, chest links) | a typed `voxelStateCodec` on the ChunkStore (compact JSON→base64 blob) |
| Send-error attribution | `session.errors.onError` |
| Host-gated simulation (mobs, growth ticks) | `session.host` (heartbeat + `isHost`), authoritative gating via the `is_host` invoke policy |
| Save state | `session.save` (typed durable blob over `state.*`) |
| Sellable land, permission-gated doors, server-driven NPCs | `plotBlueprint` / `lockBlueprint` / `npcBlueprint` deployed with `kit.deploy`; runtime `kit.plots` / `kit.objectsFor(...)` / `kit.npcs` |
| Game-specific rules (mining/placing validation, stats, crafting, quests) | hand-authored `KitBlueprint` (plain data) deployed alongside the builders |
| Mu-law push-to-talk proximity voice | `udp.sendAudioPacket` + the `audio` handler (8 kHz mono mu-law, ~120 ms frames) |
| Guilds, channel chat, claims | `teams.*`, `channels.*`, `gameApps.createGrid`/`grantPermissions` |

Note on host authority: gating simulation client-side on the host heartbeat
with open (`allow`-policy) model functions is acceptable for a co-op sandbox;
use the `is_host` invoke policy when the server must enforce host authority.
The [build-a-game tutorial](https://docs.crowdedkingdoms.com/build-a-game/intro)
walks the same patterns end to end with public code.

## Docs

Canonical docs: <https://docs.crowdedkingdoms.com> (agent index:
[/llms.txt](https://docs.crowdedkingdoms.com/llms.txt); published SDLs at
`/schema/game-api.graphql` for the whole schema, `/schema/management-api.graphql`
for the management surface alone, `/schema/crowdyjs.graphql`).

- [Overview for AI agents](https://docs.crowdedkingdoms.com/overview/for-ai-agents)
- [CrowdyJS guides](https://docs.crowdedkingdoms.com/crowdyjs/intro)
- [Portals & app-scoped tokens](https://docs.crowdedkingdoms.com/management-api/portals-and-app-tokens)
- [GraphQL UDP proxy (spatial replication)](https://docs.crowdedkingdoms.com/game-api/graphql-udp-proxy-api)
- [Game Models](https://docs.crowdedkingdoms.com/game-api/game-models)
- [Autonomous processes (Automations)](https://docs.crowdedkingdoms.com/game-api/autonomous-processes)
- [Grids & permissions](https://docs.crowdedkingdoms.com/game-api/grids-and-permissions)
- [Teams](https://docs.crowdedkingdoms.com/game-api/teams) · [Channels](https://docs.crowdedkingdoms.com/game-api/channels)
- [Host discovery](https://docs.crowdedkingdoms.com/game-api/host-discovery)
- [Native UDP wire protocol (Buddy)](https://docs.crowdedkingdoms.com/replication-api/intro)
- [Build-a-game tutorial](https://docs.crowdedkingdoms.com/build-a-game/intro)

## Working in this repo

- This repo has three long-lived branches — **`dev`**, **`test`**, **`prod`**
  (`prod` is the default branch); `main` is frozen history. Pull the latest
  branch you are targeting (usually `dev`) before creating a feature branch;
  commit with descriptive messages. Every branch push runs the test workflow.
- **Publishing is triggered by an environment-prefixed tag**, never by a merge.
  Bump the version (`npm version patch|minor|major`, which also syncs the
  exported `VERSION`), merge to the tier branch, then tag `<tier>/vX.Y.Z` —
  `dev/v14.2.0`, `test/v14.2.0`, `prod/v14.2.0`. The tag's commit must be
  contained in the branch the tag names or the run fails
  (`scripts/ci/resolve-release-tier.sh`), and the tag's version must equal
  `package.json`'s version or the run fails.
- **What each tier publishes.** npm accepts a version string exactly once, so
  the same X.Y.Z cannot be published three times. Each tier gets its own
  artifact and dist-tag, published with provenance via Trusted Publishing:

  | tag | npm version | dist-tag | install |
  |---|---|---|---|
  | `dev/v14.2.0` | `14.2.0-dev.N` | `dev` | `npm i @crowdedkingdoms/crowdyjs@dev` |
  | `test/v14.2.0` | `14.2.0-test.N` | `test` | `npm i @crowdedkingdoms/crowdyjs@test` |
  | `prod/v14.2.0` | `14.2.0` | `latest` | `npm i @crowdedkingdoms/crowdyjs` |

  `N` is the next free ordinal for that base version, read from the registry
  (`scripts/ci/resolve-npm-publish-version.mjs`). `-dev.N` is a semver
  PRE-release, so it sorts below `14.2.0` and a consumer on a caret range will
  never resolve to one by accident. Consumers (Crowdy-Games, external games)
  pick up a release by bumping their npm dependency range and redeploying.
- Never hand-edit `src/generated/graphql.ts`. When the public GraphQL surface
  changes: `npm run schema:sync:*` → `npm run codegen` → commit `schema.gql`
  and `src/generated/graphql.ts` together.
- `npm install && npm run build` must succeed in a clean clone of this repo
  alone (no other repositories, no network schema fetch).
- Public-surface changes are held to the platform's API agent-readiness
  standard: every public field/argument carries a schema description
  (authored server-side and regenerated into `schema.gql` and the
  [docs reference](https://docs.crowdedkingdoms.com/crowdyjs/reference/graphql)),
  and SDK methods carry TSDoc mirroring those semantics.
