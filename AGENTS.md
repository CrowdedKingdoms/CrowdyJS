# AGENTS

CrowdyJS is the browser-first TypeScript SDK for **Crowded Kingdoms**. It wraps
**one GraphQL API** (management and game surfaces) and the UDP replication
service (via that API's GraphQL UDP proxy).

**Current package:** `package.json` is **15.12.0**. Whether that is *published* is
not answerable from this page, and the paragraph this replaces proved it: it read
"nothing is published at that number yet" for a day after 15.1.0 shipped.
`package.json` and the registry disagreeing IS the normal state between a merge
and a release, and prose cannot tell you which state you are in. Ask:
`npm view @crowdedkingdoms/crowdyjs dist-tags`.

**15.12.0 drops paid player-code commerce and grid sales from the SDK.**
`client.marketplace` keeps free publish / acquire / install / consent / claim.
`purchaseGrid`, `createGridListing`, `gridListings`, `setListingPricing`,
renew/top-up/refund, seller onboarding/payouts, and the risk queue are gone
with the GraphQL documents — the schema no longer has those fields.

**This branch makes GitHub the Crowdy Studio working tree.** Bound Monaco persist
is `crowdyStudioGitHubPutFile` (a GitHub commit). Deploy/Test draft send `commitSha`
(or `pinBranchHead`), not a Postgres file dump. Layout comes from
`crowdyStudioGitHubLayout` — do not copy a local `crowdy.json` grammar. Create is
`crowdyStudioGitHubCreateMod`. Pull, Push, and “also push autosaves” are gone.
`client.crowdyStudioGitHub` is identity-session only; play app-tokens receive
`SCOPE_MISSING`. `CrowdyStudioEmbed` accepts `github:` for the identity transport.

**15.11.0 tracks ck-api `v1.96.0` (Crowdy Studio GitHub repos):** `client.crowdyStudioGitHub`
is a transport on the ONE session (`status`, `connectUrl`, `repos`, `bind`, `unbind`,
`setAutosave`, `tree`, `getFile`, `putFile`). 15.11 dual-wrote Studio saves to
Postgres and optionally pushed; this branch does not. No second endpoint, no
second session, no `loginStudioLocal`. Card hides when the tier has no App.

**15.10.0 (no ck-api dependency):** `portal.completeEntry` returns `null` when
the query carries `github` / `installation_id` / `setup_action` — a GitHub App
callback is never spent as an Overworld portal code. `CrowdyStudioAgentController`
resumes the last matching BUILD session on Studio mount instead of creating an
empty one each time (`session-resume.ts`, `sessionMemory` option). Agent error
redaction, trailing-slash strip, and starter module slug are linear scans
(CodeQL `js/polynomial-redos`). No GitHub or DSH surface ships in this
version; see the wrapper `studio-github-program/` design before adding one.

**15.9.0 tracks ck-api `v1.93.0`:** `gameApps.nearbyGrids` (player-safe bounds),
codegen for `player_joined` / seed upsert / `now()`, and Studio ops select
`bindPolicyJson` on container types (authoring surface; no live Titan Assault
policy writes). Package version stays bare (`15.12.0`) — the publish tag adds
`-dev.N` / `-test.N`.

**15.8.0 papercuts:** `ChunkStore.setVoxel` without `state` omits
`voxelState` (no more `''`); starter `Cargo.toml` includes `serde_json`;
`refreshGameplayToken` waits for in-flight `sendActorUpdate` and new UDP
sends wait for an in-flight rotation. CLIENT `on_tick` still needs
`tickIntervalMs` — the README minimal example now sets it.

**15.7.0 tracks ck-api `v1.89.0`: invoke policies apply to app admins.**
`gameModel.invoke` gains the optional administrative `bypassPolicy` input and the
`policyBypassed` result field; nothing else changed. Until v1.89.0 a `manage_apps`
holder skipped every invoke policy implicitly, so a developer testing with their
own account saw policies that looked unenforced. GM tooling that depended on that
must now pass `bypassPolicy: true` (refused with `NOT_ALLOWED` without
`manage_apps`).

**15.6.0 adds hosted sign-in** (ck-api `v1.88.0`): `portal.signIn` /
`portal.handleSignInCallback`, `defaultHostedSignInUrl`,
`isHostedSignInRequiredError`, and the README's sign-in story rewritten around
"where does your code run". Nothing was removed; `auth.*` is unchanged for
first-party and non-browser callers. See the mental-model section below.

**15.5.0 added** webcam video and the server-announced departure (Buddy `v0.25.x`,
ck-api `v1.87.x`): `udp.sendVideoPacket` / `udp.sendVideoFrame`, the `video` and
`actorLeft` handlers, `ClientVideoNotification` / `ActorLeftNotification`, the pure
`media/video-frames.ts` (6-byte fragment header, `fragmentFrame`,
`VideoFrameAssembler`; the seven fixtures CrowdyCPP mirrors), and
`RemoteActorStore.remove` wired to `actorLeft` so `onLeave` fires the moment the
server says so rather than after the 12 s reap. Video is gated by `use_video_chat`
(bit 9), opt-in on the app's tier; the world grid follows the tier for it since
ck-api `v1.87.1`. On the GraphQL proxy a frame is a mutation PER FRAGMENT -- use
`binaryTransport` for live video. The wire contract is published under "Wire
formats" on docs.crowdedkingdoms.com.

**15.3.0 added** the ck-api v1.67 surface (`channel_name` on channel
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
  conflict**. After any merge between branches, regenerate for the
  DESTINATION tier and run the gate. The SDK pins in `Crowdy-Games` are the same
  hazard for the same reason: git has no idea these files are per-branch.

  **AND IT DOES REACH THE REGISTRY — THIS PARAGRAPH USED TO SAY OTHERWISE.** It
  read "the published artifact was fine throughout; the BRANCH had drifted from
  what it had published," which held for 2026-08-27 and then stopped being the
  general rule. `15.4.0` was tagged while `dev` and `test` still carried prod's
  origin, so `@dev` and `@test` **published** artifacts declaring
  `ck.prod.crowdedkingdoms.com`, and every consumer of either tag that built a
  client with no explicit origin dialled production. Fixing the branches did not
  fix that; only `15.4.1` did. Do not read branch drift as harmless — a release
  cut during the drift window ships it.

  **THE PROMOTION THAT DOES NOT CONFLICT IS THE DANGEROUS ONE.** On 2026-09-02
  this hit CrowdyJS and CrowdyCPP on the same day, in the same release, both
  silently, both times putting `tier = 'test'` on `prod` — the tier where it costs
  the most, since `latest` is what an unconfigured production consumer resolves.
  Both were caught only by re-reading the file after a merge that reported no
  conflict.

  **The mechanism, measured in a scratch repository rather than reasoned about,
  because the reasoning here was wrong for a day.** This paragraph used to say the
  carry happens because resolving the `dev` → `test` conflict leaves `test` as the
  only side that touched the file. That is not it, and a lab reproduction says so:
  a promotion rewrites this file silently whenever **the merge base already holds
  the DESTINATION's value and the destination has not re-committed it while the
  source has.** One side changed, so git resolves it trivially and reports
  success. The wrong explanation mattered because it implied the risk lives at one
  particular rung; it does not.

  That measurement also killed the tidier-looking fix, twice over. **A
  `.gitattributes` merge driver cannot help.** Git never consults a merge driver
  for a one-sided change, and one-sided *is* the dangerous case — the driver
  logged zero invocations while the carry happened. And `.gitattributes` can
  *name* a driver but cannot ship it: `merge.<name>.driver` is local config, so a
  fresh clone reads it as unset and git falls back to its default silently. A CI
  runner has no driver at all.

  So it has to be an assertion, and now it is one. `npm run check:default-origin`
  runs on every push and pull request, judging the PR **base** so a promotion is
  refused before the merge rather than after; the same check runs in
  `publish.yml`'s `guard` against the tier the **tag** names, before anything is
  built; and after `npm publish` the workflow packs the dist-tag back down and
  reads what the registry actually serves. Reading the file by hand after a
  promotion is still a good habit, but it is no longer the only thing standing
  between a promotion and a wrong-tier release.

  One footgun in the generator itself: `sync-client-origins.mjs --write --tier X`
  writes **both** SDK working trees, CrowdyJS and CrowdyCPP, with no regard for
  which branch either one has checked out. Regenerating CrowdyJS for `test` will
  happily stamp `test` onto a CrowdyCPP checkout sitting on `dev`. Check
  `git status` in the sibling too, and revert what you did not mean to change.

## Core mental model: one endpoint, two tokens, two clients

1. Sign-in (`auth.login` / `auth.register`, magic link, or social/OIDC) yields an
   **identity session token** — account, studio
   admin, minting. Rejected for gameplay.
2. Gameplay needs a short-lived **app-scoped token** per game
   (`portal.mintAppToken` or the PKCE portal flow).
3. Build one identity client and one client per game. When `mintAppToken`
   returns `gameApiUrl` / `gameApiWsUrl`, point the game client at them.
4. `udp.subscribe(handlers, appId)` requires the appId and an app-scoped token.

**A BROWSER GAME ON ITS OWN DOMAIN NEVER CALLS `auth.*` (ck-api v1.88.0,
2026-09-08).** Step 1 is served only to first-party browser origins (Studio,
the crowdy.games host) and to non-browser callers (no `Origin` header). From
any other browser origin the API answers `HOSTED_SIGN_IN_REQUIRED`
(`isHostedSignInRequiredError`). A customer's game does steps 1 and 2 in one
hop with **`portal.signIn({ appId, redirectUri })`** -> Studio `/authorize` ->
**`portal.handleSignInCallback()`**, which stores an app token; the player's
password is typed into Studio, never into the game. `signIn` derives the hosted
page from the API host (`ck.<tier>.` -> `studio.<tier>.`, `localhost:3000` ->
`:3001`; `defaultHostedSignInUrl`); the game's origin must be in the app's
`redirect_uris`, which is also what admits it to CORS. `beginEntry` /
`completeEntry` / `handleAuthorizeRequest` are the underlying steps and stay
(Studio's own `/authorize` page uses `handleAuthorizeRequest`). Do not write a
README example that calls `auth.login` from a game page; the-construct is the
reference consumer of the hosted flow.

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
remainder. **The public consumer is
[`CrowdedKingdoms/the-construct`](https://github.com/CrowdedKingdoms/the-construct)**
(2026-09-07): an engine-agnostic starter over this SDK with two renderers, the
Crowdy Studio embed with CLIENT mods, kit-seeded model, and an in-app org → app
→ tier → seed wizard, verified end to end on dev by a third-party account. It
pins the tier's exact prerelease per branch and its `AGENTS.md` lists the
platform facts it depends on. It is also the
[build-a-game tutorial](https://docs.crowdedkingdoms.com/build-a-game/intro)'s
companion since 2026-09-07; `simple-web-demo` (the June 2026 companion with a
`file:` SDK dependency) was deleted the same day.

The Construct papercuts from 2026-09-07 (`voxelState: ''`, starter
`serde_json`, in-flight `actorUpdate` across `refreshGameplayToken`, and
the omitted `tickIntervalMs` in the minimal CLIENT example) are fixed in
`15.8.0`. `PlayerCodeBroker` still ticks only when `tickIntervalMs`
is set — that is the contract, not a bug; the README example now sets it.

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

## Security review on the identity surface (2026-09-08)

A PR that touches `src/domains/auth.ts`, `src/domains/portal.ts`, `src/pkce.ts`, `src/session.ts` or `src/auth-state.ts` runs the Cursor **`security-review`** subagent
against the branch before it is opened, and the PR body carries its findings
(or "security-review: no findings"). CODEOWNERS requests the code owner on
the same paths. This is the process half of the lesson from the v1.87.2
`register` account takeover: two individually correct pieces composed into a
takeover, and nothing in the pipeline was positioned to notice. `security.yml`
(gitleaks, dependency audit, SAST) is the mechanical half and runs on every PR.
