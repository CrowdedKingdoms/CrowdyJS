# AGENTS

CrowdyJS is the browser-first TypeScript SDK for **Crowded Kingdoms**: it wraps
the Management API, the Game API, and the UDP replication service (reached
through the Game API's GraphQL UDP proxy). Games built on it have no limit on
player concurrency because all realtime traffic is spatially routed by chunk.

Read [README.md](README.md) first (install, quick start, sub-client tables,
token model, error classes). [MIGRATION.md](MIGRATION.md) covers breaking
changes between majors. This file adds what the README does not: **how to map
game concepts onto the API surface**, with the Blocks with Friends game as the
worked reference.

## Repo orientation

- `src/domains/` — one file per sub-client (`udp.ts`, `gameModel.ts`,
  `chunks.ts`, `voxels.ts`, `host.ts`, `portal.ts`, `teams.ts`, `channels.ts`,
  `gameApps.ts`, `state.ts`, `avatars.ts`, `teleport.ts`, `serverStatus.ts`, …).
  Doc comments in these files are the most precise concept→API notes in the repo.
- `src/operations/<domain>/*.graphql` — the GraphQL documents behind each
  method (e.g. `gameModel/GameModelAutomations.graphql`, `udp/UdpNotifications.graphql`).
- `src/world.ts` — `client.world(appId)` facade: `actor().join/sendState/sendText/sendToActor`.
- `src/kit/` — `client.kit(appId)` Game Kit facade over `gameModel`: blueprint
  builders (`inventoryBlueprint` / `lockBlueprint` / `npcBlueprint`) +
  `kit.deploy(...)` for admin seeding, and runtime helpers `kit.inventory`,
  `kit.objects`, `kit.npcs`.
- `schema.gql` + `src/generated/graphql.ts` — committed schema artifacts; the
  build must never depend on sibling API repos. Refresh with
  `npm run schema:sync:*` + `npm run codegen`, commit both together, and use
  `npm run check:schema` to detect drift (see README "Standalone builds").
- `test/unit`, `test/e2e` — e2e suites (two-client, gamer-journey, audio,
  voxel, channel) double as usage examples.

## Core mental model: two tokens, two clients

1. Passwordless sign-in (`client.auth.requestLoginLink`/`completeLoginLink`,
   `socialLoginStart`/`socialLoginComplete`, or dev-only `devLogin`) yields an
   **identity session token** — valid only for the Management API (account,
   studio admin, minting).
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
| Player presence & movement | `udp.subscribe` + `udp.sendActorUpdate` (chunk-addressed, base64 `state` blob, `distance` fan-out); `world(appId)` helpers |
| Persistent terrain / world | `chunks.get` / `chunks.byDistance` / `chunks.update` (durable) + `udp.sendVoxelUpdate` (realtime edits) |
| Per-block metadata | app-defined blob conventions inside chunk `voxelStates` (see BWF `voxelState.ts`) |
| Server-side rules & data (inventory, stats, crafting, NPCs) | `gameModel` containers / properties / functions with invoke policies — schema admin-seeded before play |
| World life with no client online | `gameModel` automations (schedules/triggers invoking `autonomousInvocable` functions) — admin-seeded before play |
| Ready-made inventory / lockable objects / NPC mappings | `kit(appId)` — blueprints deployed with `kit.deploy` (admin), runtime via `kit.inventory` / `kit.objects` / `kit.npcs` |
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
Author the schema with `gameModel.seed` (idempotent: container types, property
defs, functions in one call) plus `upsertContainerType` / `upsertPropertyDef` /
`upsertFunction` / `setPolicy` for incremental changes; runtime ops
(`createContainer`, `invoke`, reads) then run with a player's app token against
the seeded schema. BWF's `scripts/seed-blocks-world.mjs` is the reference: an
idempotent, re-runnable Node script that mints an admin app token, seeds the
schema and definition containers, and versions migrations via a
`World.version` property compared against the model JSON's schema version.
Sessions (`createSession` / `joinSession` / `setSessionTurn`) support
match/turn structures; model-driven `notify_*` effects push updates to
subscribed clients.

### Automations API (NPCs & world ticks)

Automations invoke model functions server-side on a schedule or event trigger —
NPC wander, trader restock, mob spawn ticks, crop growth — with **no client
connected**. Target functions must declare `autonomousInvocable: true`.
Like the model schema, automations are **admin-authored ahead of play**: the
same seed script that writes the model should upsert the automation policy and
definitions (BWF registers all four of its automations there); game clients
only read diagnostics. Surface: `gameModel.upsertAutomation` (name,
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

## Reference implementation: Blocks with Friends

The most complete CrowdyJS example is the Minecraft-style voxel MMO in the
Crowdy-Games repo (sibling checkout in the CKS wrapper:
`../Crowdy-Games/blocks-with-friends/`; not on npm). Its README has a
systems→platform table. Where each pattern lives:

| Pattern | File(s) |
|---|---|
| Client bootstrap, portal entry, per-app routing, token refresh | `src/network/NetworkManager.ts` |
| One shared `udp.subscribe` fanned out to game systems | `src/network/NetworkManager.ts` |
| Actor replication loop (200 ms) + binary pose codec | `src/session/ActorSender.ts`, `src/session/actorCodec.ts` |
| Chunk streaming + deterministic write-back worldgen | `src/world/WorldStreamer.ts`, `src/world/worldgen.shared.mjs` |
| Per-voxel metadata blob (orientation, growth, chest links) | `src/world/voxelState.ts` |
| Model schema: 17 container types, 25 functions with policies, 4 automations | `src/model/blocks-model.json` |
| Typed wrapper over `gameModel.*` (catalog, inventory, stats, mobs) | `src/model/GameModel.ts` |
| Host-driven mob simulation over open `mob_update`/`damage_mob` functions | `src/mmo/MobService.ts`, `src/mmo/HostService.ts` |
| Mu-law push-to-talk proximity voice | `src/audio/VoiceChat.ts` |
| Guilds (teams), channel chat, claims (grids + model) | `src/mmo/SocialService.ts`, `src/mmo/ClaimService.ts` |
| Save state, avatars | `src/mmo/WorldSession.ts`, `src/mmo/CharacterService.ts` |
| Idempotent admin seed (schema, defs, automations, launch chunks, grids) | `scripts/seed-blocks-world.mjs` |
| Public-API smoke walk (bootstrap → model → replication → state) | `scripts/smoke-mmo.mjs` |

Notes when copying from BWF: it gates mob simulation **client-side** on the
host heartbeat and leaves `mob_update` open (`allow` policy) — acceptable for
a co-op sandbox; use the `is_host` invoke policy when you need the server to
enforce host authority. Its seed script drives the studio-admin GraphQL
surface directly with a minted admin app token; `client.gameModel.seed` /
`upsertAutomation` are the SDK equivalents.

## Docs

Canonical docs: <https://docs.crowdedkingdoms.com> (agent index:
[/llms.txt](https://docs.crowdedkingdoms.com/llms.txt); published SDLs at
`/schema/management-api.graphql`, `/schema/game-api.graphql`,
`/schema/crowdyjs.graphql`).

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

- Pull the latest `main` (this repo's canonical branch) before creating a
  feature branch; commit with descriptive messages.
- Never hand-edit `src/generated/graphql.ts`. When the public GraphQL surface
  changes: `npm run schema:sync:*` → `npm run codegen` → commit `schema.gql`
  and `src/generated/graphql.ts` together.
- `npm install && npm run build` must succeed in a clean external clone (no
  sibling repos, no network schema fetch).
- Public-surface changes are held to the wrapper repo's
  `api-agent-readiness-checklist.md` — GraphQL descriptions live in the API
  repos' NestJS decorators and regenerate into `schema.gql` and the cks-docs
  reference.
