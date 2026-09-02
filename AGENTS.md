# AGENTS

CrowdyJS is the browser-first TypeScript SDK for **Crowded Kingdoms**. It wraps
**one GraphQL API** (management and game surfaces) and the UDP replication
service (via that API's GraphQL UDP proxy).

**Current package:** `package.json` is **15.3.0**. Whether that is *published* is
not answerable from this page, and the paragraph this replaces proved it: it read
"nothing is published at that number yet" for a day after 15.1.0 shipped.
`package.json` and the registry disagreeing IS the normal state between a merge
and a release, and prose cannot tell you which state you are in. Ask:
`npm view @crowdedkingdoms/crowdyjs dist-tags`.

**15.3.0 adds** the ck-api v1.67 surface (`channel_name` on channel
notifications, the two `NOTIFICATION_CHANNEL_*` lint codes,
`NOTIFICATION_UNDELIVERABLE`, the two notification counters on
`GmAppDiagnostics`), the `kit/notifications.ts` builders, and a `quarantine`
field on `CrowdyModelRefusal`. **15.2.0** was the release before it.

**Do not hardcode consumer SDK pins here — they rot.** Ask
`npm view @crowdedkingdoms/crowdyjs dist-tags` for what npm serves, and in
Crowdy-Games use `scripts/ci/check-sdk-pins.mjs` /
`grep '"@crowdedkingdoms/crowdyjs"' */package.json` for what each game actually
pins. CrowdyCPP's parity pin is `crowdyjsParityTarget` in
`CrowdyCPP/package.json` — read it there, not from this page.

`dev/vX.Y.Z` / `test/vX.Y.Z` publish
`X.Y.Z-dev.N` / `X.Y.Z-test.N` to the `@dev` / `@test` dist-tags; only a `prod/`
tag moves `latest`. Consumers pin the EXACT prerelease for their tier — never a
caret, which cannot match a prerelease at all. `GameClientBootstrap` selects
`gameApiUrl`, `gameApiWsUrl` and `discoveryUrl`.

**TIER ALIGNMENT (hard rule for consumers).** A consumer branch may only
reference CrowdyJS artifacts from the **same** tier: Crowdy-Games / CrowdyCPP
`dev` → `@dev` / the `dev/` tag’s commit; `test` → `@test`; `prod` → `latest`.
Publishing `prod/vX.Y.Z` does **not** authorize bumping Games-`dev` or
CPP-`dev` to that plain version — those ladders promote separately
(`test`↔`test`, `prod`↔`prod`).

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
v14. The `cks-management-api` GitHub repo still exists (**archived**) but is
not a running service and is not a schema source; gameplay data lives in
**PostgreSQL + Citus** via `cks-game-api`, not galaxy.

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
  `CROWDY_HTTP_URL` at the **tier's public origin** — the same value
  `CROWDY_DEFAULT_HTTP_ORIGIN` in `src/default-origin.ts` carries, e.g.
  `https://ck.dev.crowdedkingdoms.com` — and not at a single datacenter.
  This used to say `ck.<tier>.v7.cks-env.com`, the FLEET root. That was the same
  host on every tier until dev's root moved on 2026-08-25, and it was never the
  name a client is supposed to hold: an SDK test that dials an origin no
  customer is given proves the wrong thing works.

  **`CROWDY_HTTP_URL` ALONE IS NOT ENOUGH AGAINST A TIER, and the suite does not
  say so — it fails as if the server were broken.** Five things are required, and
  three of them have defaults or fallbacks that are right for the local smoke
  stack and wrong for every deployed tier:

  | variable | against a tier |
  |---|---|
  | `CROWDY_HTTP_URL` | `https://ck.<tier>.crowdedkingdoms.com` |
  | `CROWDY_OWNER_EMAIL` / `_PASSWORD` | `infra-cp/<tier>/org-admin/crowdedkingdomstudios` |
  | `CROWDY_OPERATOR_EMAIL` / `_PASSWORD` | `infra-cp/<tier>/admin/ck-operator` |
  | `CROWDY_TEST_APP_ID` | a real app id — **never leave this unset** |

  plus the app's Studio-agent policy, which a rebuilt tier leaves fail-closed:
  `infra-control-plane/scripts/ops/enable-studio-agent.sh --tier <tier> --app-id <id>`.

  WHY THE TABLE IS WORTH THE SPACE. `CROWDY_TEST_APP_ID` defaults to `'1'`, and no
  deployed tier has an app numbered 1 — ids are Snowflake53 and sixteen digits
  long. Unset, the suite asks about an app nobody owns, and the answer is
  `Missing app permission 'manage_access_tiers'`, which reads as a broken
  permission model rather than a missing variable. On 2026-08-26 that presented as
  19 of 34 failing on dev and 21 on test, and survived a from-scratch tier rebuild
  — which is exactly the evidence that argues "it must be the server". With all
  five set, both tiers pass 33 with 1 skip.

  **ON A COLD-STARTED TIER THE OWNER AND THE OPERATOR ARE THE SAME ACCOUNT.** The
  org-admin secret survives a rebuild but names an account the dropped database
  took with it, so `infra-cp/<tier>/org-admin/*` will not authenticate until it is
  re-provisioned. Point both pairs at `infra-cp/<tier>/admin/ck-operator` and use
  an app that account owns. Prod after its 2026-08-27 rebuild: **38 pass, 1 skip.**

  **THE ONE SKIP IS `payments: ORG_WALLET_TOPUP checkout`, AND ON PROD IT MUST
  STAY SKIPPED.** It is gated behind `CROWDY_TEST_PAYMENTS=1` and is sandbox-only.
  Prod's `paypalEnv` is `live`, so setting that variable there moves real money. A
  skip normally deserves the same scrutiny as a failure; this is the case where the
  skip is the correct answer, which is why it says so in its own name.

- **`src/default-origin.ts` IS GENERATED PER BRANCH — NEVER HAND-EDIT IT.**
  `dev` carries the dev origin, `test` test's, `prod` prod's. Regenerate with
  `infra-control-plane/scripts/ops/sync-client-origins.mjs --write --tier <tier>`;
  `check-sdk-default-origin.mjs` refuses a file naming the wrong tier.

  **EVERY MERGE RESOLVES THIS FILE SILENTLY AND CAN GO EITHER WAY.** A back-merge
  from prod put `tier = 'prod'` on `dev`, and both promotions in the 2026-08-27
  cycle carried the source branch's origin onto the destination with **no
  conflict**. The published artifact was fine throughout — the BRANCH had drifted
  from what it had published. After any merge between branches, regenerate for the
  DESTINATION tier and run the gate. The SDK pins in `Crowdy-Games` are the same
  hazard for the same reason: git has no idea these files are per-branch.

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
| World life between requests | `gameModel` automations (`autonomousInvocable` functions) — see the presence rule below |
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

**Nothing runs for an app with no player in it** (platform change 2026-09-01).
Compute modules tick only while the app has at least one player connected
somewhere in the fleet, and `alwaysOn` is retired — `computeUpsertModule` refuses
`true`. Scheduled work (cron and interval automations, `gm_timers`) that comes due
while an app is empty is skipped silently and rescheduled from the moment a player
returns; missed runs are never made up.

This row used to read "world life with no client online", which was true and is
not. Write automations so they are **idempotent in elapsed time**: advance the
world by `now - lastTick` rather than by one fixed step per tick, and store
expiries as timestamps rather than as remaining-tick counters. A blueprint that
assumes a cadence will silently stall while nobody is playing.

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
