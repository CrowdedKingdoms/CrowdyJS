# AGENTS

CrowdyJS is the browser-first TypeScript SDK for **Crowded Kingdoms**. It wraps
**one GraphQL API** (management and game surfaces) and the UDP replication
service (via that API's GraphQL UDP proxy).

**Current package:** `package.json` is **14.2.0**. npm `latest` is still
**14.1.0** until `prod/v14.2.0`. `dev/v14.2.0` / `test/v14.2.0` publish
`14.2.0-dev.N` / `14.2.0-test.N`. `GameClientBootstrap` selects `gameApiUrl`,
`gameApiWsUrl`, and `discoveryUrl`.

Read [README.md](README.md) first. [MIGRATION.md](MIGRATION.md) covers breaking
changes. This file is the game-concept → API map the README does not repeat.

There is **one origin**. `managementUrl` / `client.management` were removed in
v14. The `cks-management-api` GitHub repo still exists (unarchived) but is
not a running service; gameplay data lives in **PostgreSQL + Citus** via
`cks-game-api`, not galaxy.

## Repo orientation

- `src/domains/` — one file per sub-client. Doc comments there are the precise
  concept→API notes.
- `src/operations/<domain>/*.graphql` — GraphQL documents behind each method.
- `src/world.ts` — `client.world(appId)` facade.
- `src/stores/` — World Stores (`@crowdedkingdoms/crowdyjs/stores`); the core
  client never imports it. See the README.
- `src/kit/` — `client.kit(appId)` Game Kit over `gameModel`.
- `schema.gql` + `src/generated/graphql.ts` — committed artifacts. Refresh from
  the published SDL (`npm run schema:sync:prod` + `npm run codegen`); never
  depend on sibling repos at build time.
- `test/e2e` — live suites; they skip without `CROWDY_*`. Point
  `CROWDY_HTTP_URL` at the **shared entry origin** (`ck.<tier>.v7.cks-env.com`),
  not a single datacenter.

## Core mental model: one endpoint, two tokens, two clients

1. Passwordless sign-in yields an **identity session token** — account, studio
   admin, minting. Rejected for gameplay.
2. Gameplay needs a short-lived **app-scoped token** per game
   (`portal.mintAppToken` or the PKCE portal flow).
3. Build one identity client and one client per game. When `mintAppToken`
   returns `gameApiUrl` / `gameApiWsUrl`, point the game client at them.
4. `udp.subscribe(handlers, appId)` requires the appId and an app-scoped token.

## Game concept → API surface

| Game concept | API surface |
|---|---|
| Player presence & movement | `udp.subscribe` + `udp.sendActorUpdate`; `world(appId)`; World Stores `session.self` / `session.actors` |
| Client-side bookkeeping | `createWorldSession` from `@crowdedkingdoms/crowdyjs/stores` |
| Persistent terrain | `chunks.*` (durable) + `udp.sendVoxelUpdate` (realtime) |
| Server-side rules (inventory, stats, NPCs) | `gameModel` containers / properties / functions with invoke policies — **admin-seeded before play** |
| World life with no client online | `gameModel` automations (`autonomousInvocable` functions) |
| Ready-made genre mappings | `kit(appId)` blueprints + runtime helpers |
| Client-side simulation authority | `host.heartbeat` + `is_host` invoke policy |
| Voice / chat / guilds | `udp.sendAudioPacket`; `udp.sendTextPacket`; `channels.*`; `teams.*` |
| Land claims | `gameApps.createGrid` / `grantPermissions` |
| Direct player-to-player | `udp.sendSingleActorMessage` |
| Save / characters / teleport | `state.*`; `avatars.*`; `teleport.request` |
| Version / capability | `serverStatus.gameClientBootstrap(appId)` |

Everything realtime is addressed to a **chunk** and fanned out within
`distance` chunks. GraphQL `chunks.*` is the durable store;
`udp.sendVoxelUpdate` is the live edit path. The model must be seeded by a
studio-admin token (`manage_apps`) before players can invoke it — `kit.deploy`
or `gameModel.seed`. Host election is informational unless you put `is_host`
on the invoke policy.

Blocks with Friends (crowdy.games, source not public) is the complete
consumer of these surfaces: World Stores + kit blueprints + a hand-authored
remainder. The [build-a-game tutorial](https://docs.crowdedkingdoms.com/build-a-game/intro)
walks the same patterns with public code.

## Docs

Canonical: <https://docs.crowdedkingdoms.com> ([/llms.txt](https://docs.crowdedkingdoms.com/llms.txt)).
Published SDLs: `/schema/game-api.graphql` (whole schema),
`/schema/management-api.graphql` (management surface **derived** from that
schema — not a second source repo), `/schema/crowdyjs.graphql`.

## Working in this repo

GitHub default branch is **`prod`** (verified 2026-08-13). Long-lived trunks
are **`dev`**, **`test`**, **`prod`**. Work lands on `dev`. `main` still
exists and is not the default.

Publishing is an environment-prefixed tag (`dev/v14.2.0`, `test/v14.2.0`,
`prod/v14.2.0`); npm accepts a version once, so only `prod/` publishes the
bare `14.2.0` under `latest`. The tag's commit must be contained in the
branch it names (`scripts/ci/resolve-release-tier.sh`).

Never hand-edit `src/generated/graphql.ts`. `npm install && npm run build`
must succeed in a clean clone of this repo alone.
