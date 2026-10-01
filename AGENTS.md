# AGENTS

CrowdyJS is the browser-first TypeScript SDK for **Crowded Kingdoms**. It wraps
**one GraphQL API** (management and game surfaces) and the UDP replication
service (via that API's GraphQL UDP proxy).

**Current package:** `package.json` is **18.1.0** (18.0.0 was published only as
`18.0.0-dev.1`; 18.0.1 is the first 18.x meant to leave dev). Whether that is *published* is
not answerable from this page, and the paragraph this replaces proved it: it read
"nothing is published at that number yet" for a day after 15.1.0 shipped.
`package.json` and the registry disagreeing IS the normal state between a merge
and a release, and prose cannot tell you which state you are in. Ask:
`npm view @crowdedkingdoms/crowdyjs dist-tags`.

**RULE: THE SDK IS FOR NORMAL CLIENTS, AND IT IS DESIGNED FOR PRODUCTION (operator decision,
2026-09-28).** It may carry org-admin features — there will be many org-admins — but NEVER a
wrapper for something only a super-admin or a platform operator can call, and no testing
helper. Platform tooling and test helpers live in our own repos as scripts that call GraphQL
directly. So, before adding a wrapper:

- Read the field's resolver in cks-game-api. `@RequiresSuperAdmin()`, `@RequiresOperator()`,
  `OperatorGuard`, or a body that refuses everyone but a super-admin means it does not belong
  here. A field with an org-admin path and a super-admin path (quotas: `setQuota` /
  `deleteQuota` without an org or app are platform-global) is wrapped for the org-admin path
  only, and the SDK refuses the other (`quotas.set` needs an `appId` or an `orgId`).
- `test/unit/sdk-audience.test.mjs` fails when any operation document names a root field on
  its platform-only list, or one whose schema description says operator- or super-admin-only.
  When cks-game-api adds such a field, add it to that list; do not wrap it.
- 18.0.1 removed the last ones (MIGRATION.md lists them). A published release tag is never
  moved: a change after `dev/vX.Y.Z` shipped is a new version (operator, 2026-09-28). The per-release default origin
  (`src/default-origin.ts`) is unaffected: the operator chose to keep it.

**18.1.0: open grids, and where a connect token may go (the W5 review's SDK follow-ups,
2026-10-01).** `client.gameApps.setOpenPermissions` / `openPermissions` wrap cks-game-api #436's
`setGridOpenPermissions` / `gridOpenPermissions` (ck-api `dev/v2.31.0`, `manage_apps`): since
#436 a zone everyone may build in must grant `update_voxel_data` itself. `client.exec.connect`
and `connectAsDeveloper` dial only a gateway `execGatewayRefusal(gameApiUrl, gatewayUrl)` passes
(`wss:` under an `https:` game API, the game API's estate or the default origin's, loopback for
a loopback game API; the cases are `test/unit/fixtures/exec-gateway-cases.json`, which
CrowdyCPP copies). Under Node's `ws` a gateway's `HTTP 401` is `Denied` with its body as the
reason (`unexpected-response`), and 4401 still is; a browser cannot read a refused upgrade.
`test/e2e/open-grid-and-exec-gateway.test.mjs` runs both against a tier as a throwaway org admin
(`CROWDY_E2E_THROWAWAY_OWNER=1`). The schema is cks-game-api `dev`'s after #436.

**18.0.4: `ChunkStore` drops a refused write-back (P3 W5 review B, 2026-09-29).** `updateChunk`
refuses a visitor on someone else's plot or a closed wilderness, so a store that retried forever
would hammer the API for the rest of the session. The store drops a refusal at once, retries
what can clear five times with backoff, and reports both through `onWriteBackFailed`;
`flush()` resolves with what it dropped. Also `App.wildernessWritesOpen` (cks-game-api #434) on
the app reads and `apps.update`.

**18.0.3 lets a player take back a CLIENT half (OI-2026-09-28-001, 2026-09-29).**
`exec.revokeClientModConsent` / `revokeAuthorTrust` wrap cks-game-api #431 (ck-api
`dev/v2.28.0`); `ExecClientHalves.revoke(modId)` and `forgetAuthor(authorId)` stop what runs and
take the agreement back (a trusted half's revoke drops the trust and re-consents the author's
other running halves). A game puts both controls beside each running CLIENT half.

**18.0.2 is the P3 W5 client security review (2026-09-29; MIGRATION.md has the list).** A
CLIENT half is someone else's code in the player's browser, so the page holds it to rules its
consent never waived: `createGridHostCalls` answers `grid_permission_check` only for the four
code-permission keys (`GRID_PERMISSION_CHECK_KEYS`, OI-2026-09-28-004) and refuses any other
key, sends a half's spatial and channel messages as `clientHalfActorUuid(gridId, name)` (never
a uuid the half names), and takes `voxel_set` voxels 0-15 of type 0-255; the broker refuses a
chunk named a second way (`chunk`, `chunk_x`, …); the glue caps what it copies out of a module
(`GLUE_HOST_CALL_REQUEST_MAX_BYTES`, `GLUE_STATE_MAX_BYTES`, `GLUE_INVOKE_REPLY_MAX_BYTES`);
the agent's `studio.draftTest` needs the page-side `confirmLiveDeploy` (`mode: 'draft'`),
because on ck-exec a draft test deploys the mod to the grid like a live deploy. A game router
must route on the fields the broker checks (`x`/`y`/`z`, `chunkX`/`chunkY`/`chunkZ`).

**18.0.0 removes the legacy engines' SDK surface (P3 W2, HS-42, 2026-09-28): it lands on `dev`
with the game API's deletion (cks-game-api #417, ck-api `dev/v2.27.0`).** Gone:
`client.gameModel`, `client.compute`, `client.playerModel`, **`client.playerCompute`** (its
CLIENT module path too), **`client.operator`** (it held only the compute ceilings) and
`playerWallet`'s WASM policies; the Game Kit's blueprints, `kit.deploy`, engines and
model-backed helpers (`client.kit(appId)` keeps `social`; `kit/wire.ts` and
`runOptimisticAction` stay); World Stores' `model` mirror; Studio's model lint; `GridScope`'s
`sessions`, `model` and `compute`; the marketplace's player-code listings and grid attachments
(`gridClientMods`, `consentGridClientMod`, `trustGridAuthor`, `clientArtifact(Bytes)`); and
Crowdy Studio's `'player-compute'` engine for both targets (`mods` is required; `serverEngine`,
`playerCompute`, the Runs panel, `state.usage` and the pairing control are gone). Each
replacement is ck-exec's: hubs and spokes, mods, and a mod's CLIENT half (MIGRATION.md has the
map; the docs' [from the legacy engines](https://docs.dev.crowdedkingdoms.com/exec/from-the-legacy-engines)
page the reasoning). **The player runtime runs CLIENT
halves only:** `PlayerCodeBroker` needs `artifactHash`, `fuelPerDispatch` and
`consentedHostCalls`, the allowlist is `EXEC_CLIENT_HOST_CALLS` (`ALLOWED_HOST_CALLS` is gone),
the glue refuses a module without the `ck_fuel` meter and offers only `EXEC_CLIENT_ABI_IMPORTS`.
**New in 18.0.0 (the P3 W1 review's findings):** a CLIENT half's `crowdy::log` lines reach
`onLog` (broker, `ExecClientHalves`, `startGridMod`; 20 a second, 1,000 characters, Studio's
Logs shows its preview's), the page can call its `handle_invoke` (`invoke`), and
`createGridHostCalls` answers `avatar_state_get` and `grid_permission_check` from the game's
knowledge (`local.avatarChunk`, `local.gridPermissionKeys` + `userId`). **Kept, because the game
API keeps their fields:** tier features (in `client.appAccess`), grid claims and the app-admin
marketplace fields. It needs ck-api `v2.24.0` for exec (as 17.14.0) and `v2.25.1` for Studio's
CLIENT projects. The embedded authoring index is cks-game-api `dev`'s after #417 (`ckx-sdk`
and `crowdy-client-sdk`, 338 symbols); the host catalog is unchanged. **The release's
`schema.gql` is cks-game-api `dev`'s after #417** (`schema:sync:paths`); a 17.x SDK against
`v2.27.0` fails every legacy call as a GraphQL validation error. [MIGRATION.md](MIGRATION.md).

**17.14.0 adds ck-exec CLIENT halves (cks-game-api #422, P3 W1, HS-40, 2026-09-27).** A mod
may carry browser WASM from one `crowdy-client-sdk` crate, which its grid serves to visitors who
consent to it or trust its author. `client.exec`: `modClientBuild` (a build of `kind` `client`,
polled with `modBuildStatus`), `modClientDeploy` / `modClientDelete`, `gridClientMods` (both
capability summaries parsed beside their JSON), `consentClientMod`, `trustAuthor`,
`modClientArtifact` and `modClientArtifactBytes` (recomputes the SHA-256 with WebCrypto and
refuses bytes that differ from `digest`, or a CLIENT ABI other than 0, as `CrowdyProtocolError`).
`ExecBuild.kind`, the artifacts' capability fields and the listings' `client*` fields are in
the shared fragments, **so 17.14.0 needs an API with #422 for every exec build and listing
call**: deploy the API first. `ExecClientHalves` (`src/grid-mods/exec-client-halves.ts`) is the
game-side runner, the exec twin of the-construct's `runConsentedGridMod` + `ClientModLifecycle`:
keyed by `modId` + `digest` + `capabilityHash` (+ tick interval), one prompt per author or per
mod, a module cache by digest, `NOT_FOUND` / `RATE_LIMITED` backoff. `PlayerCodeBroker({ engine:
'ck-exec' })` allows exactly `EXEC_CLIENT_HOST_CALLS` (the client catalog less the `model`
group, `sessions_list` and `grid_state_*`, what crowdy-client-sdk calls) and the glue offers
exactly `EXEC_CLIENT_ABI_IMPORTS` and requires the `ck_fuel` meter; the broker also refuses
calls outside `consentedHostCalls` (the served summary's `hostFunctions`, required with
ck-exec), since the build derives the summary by a byte scan that a name assembled at run time
escapes. The default engine, `'player-compute'`, keeps the legacy catalog until 18.0. Crowdy Studio's CLIENT target runs on
ck-exec with `serverEngine: 'ck-exec'`: a crowdy-client-sdk starter, `modClientBuild`, attach to
the project's mod, consent as its author, and a preview from the served artifact; a CLIENT-only
project rides the mod named for its CLIENT module and deploys the mod starter under that name
when the player has none (and says so in the build log). The legacy client-mod methods in
`marketplace.ts` and `GridScope.compute.clientMods` are `@deprecated` (superseded). The schema
is cks-game-api `dev`'s after #422 merged (`schema:sync:paths`).
`test/unit/exec-client-runtime.test.mjs` runs a real CLIENT half when `CROWDY_EXEC_CLIENT_WASM`
names one (Studio's starter built with cargo, `instrument` and `wasm-opt`, as the API builds it).
**The Studio authoring index is generated in cks-game-api**
(`compute-toolchain/scripts/generate-authoring-index.mjs`) and embedded here byte for byte
(`authoring-index:drift -- --source ... --write`, then `authoring-index:generate`); 17.14.0's
still held only the legacy compute SDK and game kit, and 18.0.0 embeds the one #417 generated
from `ckx-sdk` and `crowdy-client-sdk`. [MIGRATION.md](MIGRATION.md).

**17.13.0 adds ck-exec observability to `client.exec` (ck-api `v2.22.0`, 2026-09-26).**
`endpointStats(appId, { nodeType, sinceMinutes })` (`execEndpointStats`: calls per endpoint by
outcome, latency over `timedCalls`), the `flow` filter on `logs` and `flow` on each
`ExecLogLine` (32 lowercase hex, null outside a call), and `manifestJson` plus a parsed
`manifest` on `versions`. `CrowdyExecError` gained `rateLimited` and `retryAfterMs`: a gateway
refuses a player's calls over 120 per 10 s per app and host as `Busy` with "rate limited: …;
retry in N ms". The SDK retries only a closed connection or `Moved`, never `Busy`. The
schema came from the dev game API (`schema:sync:paths` with cks-game-api `dev`'s
`schema.gql`), so these fields exist only in a `-dev.N` build until ck-api promotes them.

**17.13.0 also runs Crowdy Studio's SERVER target on ck-exec by default
(2026-09-26, P2 W9, #186).** The embed's `serverEngine` defaults to `'ck-exec'` when the client has
`exec`; the controller and `mountCrowdyStudio` take `serverEngine` too (default `'ck-exec'`
with `mods`, else `'player-compute'`, which stays selectable until the legacy deletion).
On ck-exec, `createProject` starts the SERVER target from `mods.modStarter` (`execModStarter`)
instead of the `crowdy-compute-sdk` crate, Invoke calls the mod over an exec connection, Logs
read `modLogs`, and Runs and a SERVER-only project's usage no longer read player compute.
`CrowdyStudioMods` grew `modStarter`, `modLogs` and `connect`. The CLIENT target stayed on
legacy player compute in 17.13.0 (`playerComputeDeploy` target CLIENT, `playerComputeArtifact`,
refused with `ENGINE_SWITCHED_OFF` where player compute is off); 17.14.0 moved it to ck-exec
CLIENT halves, and `serverEngine: 'player-compute'` still keeps both targets legacy.
[MIGRATION.md](MIGRATION.md).

**17.12.0 adds ck-exec mods to `client.exec` (dev-tier preview, 2026-09-25, P2 W7).** A mod is
a player's code on a grid they own, the node type `mod:<name>` (`execModType`) keyed by the
grid id, which players call through an `ExecConnection` like any node. `modBuild` /
`modBuildStatus` / `waitForModBuild` build one crate (one build at a time per player,
`write_server_code` in the app); `modDeploy`, `modSetEnabled` (on needs `run_server_code` and
the app's code admission), `modDelete`, `mods(appId, gridId)`, `myMods` and `modLogs` are the
owner's; `modPublish`, `modListings`, `modUnpublish` and `modInstall` are the marketplace
without payments. For developers: `appMods`, `modSwitches` and `modSetSwitch` (the kill
ladder, `ExecModScope`). The schema came from the game API's mods branch (`schema:sync:local`,
cks-game-api #406). Crowdy Studio's SERVER target can run as a mod: the controller's `mods`
option (the embed's `serverEngine: 'ck-exec'`, which passes `client.exec`) builds the project's
server crate with `modBuild`, deploys it to the grid and enables it, with no client pairing;
the server module name must be a mod name. Without it the SERVER target stays on legacy player
compute (the default until W9 switches it off); the CLIENT target is unchanged.

**17.11.0 adds ck-exec builds to `client.exec` (dev-tier preview, 2026-09-25, P2 W6).**
`starters(appId)` wraps `execStarters`: the four starter crates (world tick, matchmaker,
sessions, NPCs and mobs) and a parsed `manifest` whose types name their crate. `build(appId,
crates)` wraps `execBuild` (each crate's `files` as a path map or the starters' file list),
`buildStatus` wraps `execBuildStatus`, and `waitForBuild` polls it until the build succeeds or
fails. `deploy` takes a `buildId`, and a type may name a `crate` of it instead of passing
`wasm`. `starters` and `build` need `manage_compute`; `buildStatus` needs
`view_compute_diagnostics`. The schema came from the dev game API (`schema:sync:local`, ck-api
`v2.18.0`).

**17.10.0 adds ck-exec operations to `client.exec` (dev-tier preview, 2026-09-25, P2 W5).**
`connectAsDeveloper(appId, { nodeType, key })` (and `developerEndpoint`) wraps
`execConnectAsDeveloper`. It needs your own session with the org's `manage_compute`, not an app
token, and its calls reach any node type as `Caller::Developer`; it reconnects like `connect`.
Also `logs(appId, { nodeType, key, maxLevel, before, limit })`, `instances`, `versions` and
`status` (`view_compute_diagnostics`), and `activateVersion(appId, version)` and
`setEnabled(appId, enabled, nodeType?)` (`manage_compute`). The schema came from the dev game
API again (`schema:sync:local`, ck-api `v2.17.0`).

**17.9.0 adds `client.exec`, ck-exec's client (dev-tier preview, 2026-09-25).**
`src/domains/exec.ts`: `connect(appId, { nodeType, key })` calls `execConnect` with the app
token and opens a WebSocket to the host's gateway; `ExecConnection` does calls, subscriptions
and pings in the binary client protocol of ck-exec's `ckx-proto/src/client.rs`, MessagePack
payloads (`@msgpack/msgpack`, a new dependency), reconnects with a fresh `execConnect` when the
socket closes and renews subscriptions, and retries a call once after a lost connection or a
`Moved` reply. `deploy({ appId, root, types })` wraps `execDeploy`. The schema sync came from
the dev game API (`schema:sync:local`), so `execConnect` / `execDeploy` exist only in a
`-dev.N` build until ck-api promotes them. `test/unit/fixtures/exec-client-frames.json` is a
copy of ck-exec's `crates/ckx-proto/tests/client-frames.json`: a protocol change updates both.

**17.6.0 tracks Buddy `v0.30.0` (2026-09-20): one HMAC per downlink bundle, opt-in.**
The binary relay sends `CLIENT_CAPABILITIES` (29; `serializeClientCapabilities`, the
long-spatial layout with a `u32` flags word at offset 68) on every `ready` and every
15 s after (`advertiseCapabilities` / `capabilitiesIntervalMs` on `BinaryRelayConfig`;
the repeat covers a token refresh or a relay-side Buddy migration, both of which reset
the server's per-slot record silently). A Buddy at v0.30.0+ then sends
`MESSAGE_BUNDLE_SIGNED` (30): the bundle framing, members with `containsAuth = 0`, and
one trailing 32-byte HMAC over the datagram. `parseRelayFrame` strips the tail and
walks; this SDK does not verify downlink HMACs (it never did). Older Buddies ignore 29
and keep sending per-member forms, which still parse. Tests count frames: the
bundling tests set `advertiseCapabilities: false`; the capability frame has its own.

**17.5.0 tracks the bulk-container release (ck-api v2.6.0, PRs #346–#349, 2026-09-16):**
`containers()` pages for real (omitted `limit` = 200, max 1,000, `BAD_REQUEST`
above; the document now forwards `bindingKey`), `containerStates({ appId,
containerIds })` is the bulk twin of `containerState` (max 500), `seed` carries a
per-container `bindingKey` (admin-instantiable or bind-policied types; an existing
row is adopted only if its owner matches) and a per-type `scope: 'session' | 'app'`,
`createSession({ seedFromApp })` stamps the app's keyed template rows into the new
session (template types must be admin-instantiable or bind-policied; max 2,000
rows; `GmSession.seededContainerCount` on the create response only), and
`kit.matches.create({ seedFromApp })` forwards it. Seeded copies of an ended
session are dropped by the server after the tier's retention window (7 days on
every tier since 2026-09-16; only the stamped copies, never hand-made rows).
[MIGRATION.md](MIGRATION.md).

**17.4.0 exposes the game-model session system (ck-api PR #319 on top of v2.3.0, 2026-09-14):**
`client.gameModel` gains `leaveSession`, `setSessionAdmission`,
`transferSessionHost`, `endSession`, `sessionSnapshot`, `sessionEvents`,
`sessionInspect` and the `sessionChanged` subscription; `GmSession` carries
`admission` / `maxParticipants` / `participantCount` / `hostUserId` / `hostTerm` /
`revision` / `endedAt` / `endReason`, and the join result is the roster row
(`state`, `incarnation`, `actorUuid`, ...). Two rules a caller must know:
`leaveSession` REQUIRES the `incarnation` the join returned (a superseded client
cannot remove the one that took over), and **presence is the player's Buddy
actor** -- a participant with no fresh actor in the app after the join grace
window is expired by the server, and an empty session is abandoned after its
timeout. Pass `actorUuid` on join only with the uuid the client actually
replicates with (`session.self.uuid`), never the match kit's channel-ping uuid.
A session created with `presence: 'none'` opts out of the rule (its exits are
leave, end and the empty timeout); `kit.matches` creates with it, because a kit
match never replicates an actor, and therefore owns those exits itself:
`kit.matches.leave(match)` (incarnation remembered from create/join) and
`finish()` ending the backing session are new in 17.4.0 (`finish()` reports the
session end as `sessionEnd: 'ended' | 'already_ended' | 'forbidden'` rather than
throwing on a caller `end_match` admitted but the session did not).
Wrappers are thin: branch on `CrowdyGraphQLError.code` (`SESSION_FULL`,
`SESSION_LOCKED`, `SESSION_CLOSED`, `SESSION_ENDED`, `SESSION_NOT_PARTICIPANT`,
`SESSION_TARGET_NOT_PARTICIPANT`, `SESSION_INCARNATION_STALE`,
`SESSION_HOST_TERM_STALE`). The `sessionChanged` push is per datacenter; the
events table (`sessionEvents`) is the record. `schema.gql` matches ck-api
v2.4.0, which is on all three tiers as of 2026-09-15 (published SDL on every
docs host). Numbered 17.4.0 because #158 took 17.3.0 while this was open.
**Known gap (2026-09-15):** `kit.matches.create` makes its match channel with
no `membershipPolicy`, so it inherits the app's channel default, which is
`invite`; a second player's `kit.matches.join` then fails at `channels.join`
("This group is invite-only"). Pre-existing; the kit e2e only passes on an app
whose channel default is `open` (the tier sandboxes were set so). Fix in the
kit (`membershipPolicy: 'open'` on the match channel), mirrored in CrowdyCPP.
[MIGRATION.md](MIGRATION.md).

**17.2.0 adds third-party hosting on Crowdy Games (ck-api `v2.1.0`, 2026-09-14):**
`client.hosting` (claim a slug, publish a bundle, list) plus the Node subpath
`@crowdedkingdoms/crowdyjs/hosting` (`publishDirectory`), and `EmbeddedHost` -- the
bridge `portal.signIn` uses when a hosted game runs inside the Crowdy Games shell's
iframe (`src/domains/embedded-host.ts`; the shell is Crowdy-Games `shell/`, protocol
v1 mirrored in its `src/protocol.ts`). The bridge trusts only `window.parent`, only
a `returnUrl` on the hello's own https origin, and posts `navigate` only to that
origin; the shell in turn honours only Studio `/authorize`. **The verifier never
leaves the game origin and the shell never holds a token** -- keep it that way.
`test/unit/embedded-host.test.mjs` is the offline proof. Hosting mutations are
identity-session only; `the-construct`'s `scripts/publish.mjs` is the reference
caller. [MIGRATION.md](MIGRATION.md).

**17.3.0 (ck-api v2.3.0) adds the guided "Create repository on GitHub" path:** `githubNewRepositoryUrl` / `githubRepositorySlug`, `controller.createGitHubRepository()` (prefilled `/new`, bind input prefilled, PUSH_PROJECT default), `status.repositorySelection`. The App still cannot create a repository itself. Additive.

**17.0.0 tracks ck-api `v2.0.0`: a bound GitHub repository is the working tree, and
GitHub stays optional.** `CrowdyStudioProject.source` is `STUDIO` until the owner
binds a repository (`crowdyStudioGitHub.bind({ initial: 'PUSH_PROJECT' | 'TAKE_REPOSITORY' })`)
and `GITHUB` while bound; `files` are then the server's mirror at `github.sha` and
`client.crowdyStudio.saveProject` commits each changed file (`putFile` /
`deleteFile` with `expectedCommitSha`) — the controller never learns which path
ran. Push / Pull / autosave-push and the SDK's own `crowdy.json` parse are gone
(`layout()` is the grammar). `playerCompute.deploy` takes `projectId` (+
`commitSha` for GITHUB); `sourceFilesJson` is gone — no client body is compiled.
Bridge protocol v3 carries `source` / `githubSha`. **Token rule for games:** the
default `client.crowdyStudioGitHub` is the app-token client that plays; the API
scopes every GitHub field to that user's own projects, so a game needs no identity
session for GitHub and a third-party game must never read one. Only hosted
first-party Studio passes the embed's `github:` option. [MIGRATION.md](MIGRATION.md).

**16.2.0 completes the ck-api `v1.100.x` sync that 16.1.0 started:**
`AppPlayerUsageRow.chargedMicrousd` is selected, `playerWallet.appMarkupAccruedMicrousd()`
wraps `appPlayerMarkupAccruedMicrousd` (`appMarkupAccrued()` is deprecated —
cents truncate), and `schema.gql` matches ck-api `dev` exactly. 16.1.0's
snapshot predated the review-fix commit that added those two fields.

**16.1.0 tracks ck-api `v1.100.x` (lossless billing ledger):** org and player
wallets expose `balanceMicrousd` / `holdsMicrousd`, transactions
`amountMicrousd` / `balanceAfterMicrousd` (the cents fields stay, deprecated —
they are the micro-USD rounded down, not what was charged). Schema sync and
codegen only; no runtime behaviour change.

**16.0.0 replaces Crowdy Agent with the DeepSeek Harness in-browser pane (`crowdy-dsh`):**
The bespoke ck-api orchestrator transport (`client.crowdyStudioAgent`,
`@crowdedkingdoms/crowdyjs/agent`), the Crowdy Agent dock (`agent-dom-shell.ts`),
and the lease-based game control machinery (`PlayerControlGate`,
`AgentControlBanner`, `AgentControlLeaseManager`, browser tool handlers) are
removed. Crowdy Studio mounts the in-browser DeepSeek Harness via the `dsh`
option on `createCrowdyStudioEmbed` and `mountCrowdyStudio`. The harness runs
in a Web Worker in the player's browser, edits the open project through the
game API (or the bound GitHub repo), and calls the metered model endpoint
(`POST /v1/model/chat/completions`) with the player's own app token. New entry
`@crowdedkingdoms/crowdyjs/crowdy-dsh` exposes `CrowdyStudioDshPane`,
`StudioDshBridge`, `CrowdyStudioDshTransport`, and the bridge protocol.
`@crowdedkingdoms/crowdyjs/player-host` is retained as an observation-only
contract (`PlayerHostAdapterV1.observe`).

**15.12.0 drops paid player-code commerce and grid sales from the SDK.**
`client.marketplace` keeps free publish / acquire / install / consent / claim.
`purchaseGrid`, `createGridListing`, `gridListings`, `setListingPricing`,
renew/top-up/refund, seller onboarding/payouts, and the risk queue are gone
with the GraphQL documents — the schema no longer has those fields.

**15.11.0 tracks ck-api `v1.96.0` (Crowdy Studio GitHub repos):** `client.crowdyStudioGitHub`
is a transport on the ONE session (`status`, `connectUrl`, `repos`, `bind`, `unbind`,
`setAutosave`, `tree`, `getFile`, `putFile`); reads and writes carry only
`(appId, projectId)` and the API resolves the bound repository. The Studio settings
pane grows a "GitHub repository" card (Connect, Bind `owner/repo@branch`, Unbind,
Push, Pull, Refresh, and an "Also push autosaves" toggle that is **off by default**).
Pull is always explicit and refuses over unsaved edits. No second endpoint, no
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
policy writes). Package version stays bare (`15.12.1`) — the publish tag adds
`-dev.N` / `-test.N`.

**15.12.1** is a dependency-only patch: DOMPurify 3.4.15, `ws` 8.21.3,
`graphql-ws` 6.2.1. `web-tree-sitter` stays on 0.26.11 (0.27 breaks the Monaco
worker). No API change.

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
`CrowdyCPP/package.json`, and CrowdyPy's is `[tool.crowdypy.crowdyjs]` in
`CrowdyPy/pyproject.toml` — read them there, not from this page. Both SDKs follow
this one's public surface under a strict parity gate, so a surface change here is
ported in CrowdyCPP and then CrowdyPy (which vendors CrowdyCPP's native core).

`dev/vX.Y.Z` / `test/vX.Y.Z` publish
`X.Y.Z-dev.N` / `X.Y.Z-test.N` to the `@dev` / `@test` dist-tags; only a `prod/`
tag moves `latest`. Consumers pin the EXACT prerelease for their tier — never a
caret, which cannot match a prerelease at all. `GameClientBootstrap` selects
`gameApiUrl`, `gameApiWsUrl` and `discoveryUrl`.

**TIER ALIGNMENT (hard rule for consumers).** A consumer branch may only
reference CrowdyJS artifacts from the **same** tier: Crowdy-Games / CrowdyCPP /
CrowdyPy `dev` → `@dev` / the `dev/` tag’s commit; `test` → `@test`; `prod` → `latest`.
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
- `src/kit/` — `client.kit(appId).social`, the wire codecs (`kit/wire.ts`) and
  `runOptimisticAction`. The model-backed kit went in 18.0.0.
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

  **Promote with the tool:** `infra-control-plane/scripts/ops/promote.mjs --repo CrowdyJS --from <tier> --to <tier>`
  regenerates this file for the destination tier (`--only crowdyjs`, so the
  CrowdyCPP checkout is never touched), resyncs `schema.gql` from `cks-game-api`
  at `origin/<to>`, runs codegen and `check:default-origin` as the PR will judge
  it, and opens the PR. The paragraphs below explain what it does and why; they
  stay true, and the gate stays the backstop.

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
| Server-side rules and state (inventory, stats, NPCs, sessions) | ck-exec hubs: `exec.connect` + `call` / `subscribe`; built and deployed with `exec.starters` / `build` / `deploy` (`manage_compute`) |
| World life between requests | hub timers (`ctx.timer_every`, `ctx.timer_after`) — see the presence rule below |
| Parties, guilds, chat rooms | `kit(appId).social` |
| Client-side simulation authority | `host.heartbeat`; the hub decides from its caller |
| Tier-gated features | `appAccess.defineFeature` / `grantTierFeature`; a hub reads `players.features` |
| Voice / chat / guilds | `udp.sendAudioPacket`; `udp.sendTextPacket`; `channels.*`; `teams.*` |
| Land claims | `gameApps.createGrid` / `grantPermissions` |
| Players' code on their grids | ck-exec mods (`exec.modBuild` / `modDeploy`) and their CLIENT halves (`exec.modClientBuild` / `modClientDeploy`); visitors run a grid's with `ExecClientHalves` (`PlayerCodeBroker`, `createGridHostCalls`) |
| Direct player-to-player | `udp.sendSingleActorMessage` |
| Save / characters / teleport | `state.*`; `avatars.*`; `teleport.request` |
| Version / capability | `serverStatus.gameClientBootstrap(appId)` |

Everything realtime is addressed to a **chunk** and fanned out within
`distance` chunks. GraphQL `chunks.*` is the durable store;
`udp.sendVoxelUpdate` is the live edit path. An app's hubs must be deployed by a
developer with `manage_compute` before players can call them. Host election is
informational; a hub decides host-only actions from its caller.

**Nothing runs for an app with no player in it.** A hub's timers fire only while
the hub runs, and a pending timer keeps an idle hub running only while players
are present; a repeating timer's missed runs are not made up, and a one-shot
timer that came due while the hub was stopped fires once when it starts again.

Write timers so they are **idempotent in elapsed time**: advance the world by
`now - lastTick` rather than by one fixed step per tick, and store expiries as
timestamps rather than as remaining-tick counters. Code that assumes a cadence
will silently stall while nobody is playing.

Blocks with Friends (crowdy.games, source not public) is the complete
consumer of these surfaces: World Stores + ck-exec hubs + a hand-authored
remainder. **The public consumer is
[`CrowdedKingdoms/the-construct`](https://github.com/CrowdedKingdoms/the-construct)**
(2026-09-07): an engine-agnostic starter over this SDK with two renderers, the
Crowdy Studio embed with mods and their CLIENT halves, ck-exec hubs, and an in-app org → app
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
Push a branch, open the PR and merge it yourself on `dev` — no approval is
required there. `test` and `prod` need an admin to perform the merge, and a PR
touching `/.github/` or `/scripts/` needs the code owner. `GH013: Repository rule
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
