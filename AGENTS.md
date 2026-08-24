# AGENTS

CrowdyJS is the browser-first TypeScript SDK for **Crowded Kingdoms**. It wraps
**one GraphQL API** (management and game surfaces) and the UDP replication
service (via that API's GraphQL UDP proxy).

**Current package:** `package.json` is **15.1.0** and **15.1.0 is published** —
`latest`, `@dev` and `@test` all moved to it on 2026-08-22. This paragraph said
"nothing is published at that number yet" for a day afterwards, which is the
version-in-prose hazard: `package.json` and the registry disagreeing IS the
normal state between a merge and a release, and a page cannot tell you which
state you are in. Ask: `npm view @crowdedkingdoms/crowdyjs dist-tags`.

**No consumer has adopted 15.1.0**, and none needs to — all nine Crowdy-Games
projects are still on the 15.0.0 line and CrowdyCPP's parity pin is 15.0.0.
Nothing downstream does password management, which is what 15.1.0 adds. That is
a deliberate state, not lag.

`dev/vX.Y.Z` / `test/vX.Y.Z` publish
`X.Y.Z-dev.N` / `X.Y.Z-test.N` to the `@dev` / `@test` dist-tags; only a `prod/`
tag moves `latest`. Consumers pin the EXACT prerelease for their tier — never a
caret, which cannot match a prerelease at all. `GameClientBootstrap` selects
`gameApiUrl`, `gameApiWsUrl` and `discoveryUrl`.

**15.0.0 IS A BREAKING MAJOR, AND THIS FILE DESCRIBED THE PREVIOUS ONE FOR A
DAY.** It **removed `devLogin`** and added **`auth.login` / `auth.register`**.
The SDK is **not passwordless**, and "dev bypass" is not a sign-in route on any
tier — `DEV_AUTH_BYPASS` is gone from all three. If you find either phrase still
written anywhere in this repo or in `cks-docs`, it is stale; the published SDK
pages were the last to be corrected. [MIGRATION.md](MIGRATION.md) is the
accurate account. Do not quote a version out of this paragraph:
`npm view @crowdedkingdoms/crowdyjs version`.

**15.1.0 finished that job one method deeper.** `login` and `register` were
wrapped and password MANAGEMENT was not, so the SDK could get a player a session
and then had no way to let them set or change the password behind it —
`requestPasswordReset`, `resetPassword`, `changePassword` and
`setInitialPassword` were all served by the API and wrapped by nothing, and the
surface test asserted two of them were absent. All four are wrapped now. They
are four rather than one because each is defined by what the caller has
**proven** (an emailed token, the current password, or the session);
`setInitialPassword` refusing an account that already has a password is the
load-bearing part, not an inconvenience.

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

1. Sign-in (`auth.login` / `auth.register`, magic link, or social/OIDC) yields an
   **identity session token** — account, studio
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
are **`dev`**, **`test`**, **`prod`**, and nothing else. Work lands on `dev`.
`main` was deleted on the remote in every repo on 2026-08-21.

**You cannot push to any of the three.** A branch policy applied on 2026-08-22
requires a pull request everywhere, for every identity including the admin's.
Push a branch, open the PR and merge it yourself — no approval is required on
`dev` or `test`. `prod` needs an admin to perform the merge, and a PR touching
`/.github/` or `/scripts/` needs the code owner. `GH013: Repository rule
violations found` is the rule working, not a credential problem.

Publishing is an environment-prefixed tag (`dev/v15.0.0`, `test/v15.0.0`,
`prod/v15.0.0`); npm accepts a version once, so only `prod/` publishes the
bare `15.0.0` under `latest`. The examples use the CURRENT major deliberately:
written with 14.x they invited a copy that cannot resolve, since a caret never
matches a prerelease. The tag's commit must be contained in the
branch it names (`scripts/ci/resolve-release-tier.sh`).

Never hand-edit `src/generated/graphql.ts`. `npm install && npm run build`
must succeed in a clean clone of this repo alone.
