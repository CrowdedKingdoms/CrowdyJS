# CrowdyJS v15 — the dev auth bypass is gone (breaking)

`client.auth.devLogin()` is **removed**, and so is the `devToken` field on
`requestLoginLink`. Neither is deprecated or disabled — the server-side feature
they called is deleted from every tier, so a wrapper for it could only produce a
GraphQL validation error.

**Why it went.** `devLogin` returned an identity session for any email address
with no proof of ownership whatsoever. It was gated on a server flag the control
plane derived as `tier !== 'prod'`, so it was live on dev and test, and if the
address happened to belong to a super admin then so did the session. `devToken`
was the same hole in a smaller shape: it put the emailed one-time magic-link
token in the response body, readable by any unauthenticated caller who knew an
address.

**What replaces them: `login` and `register`, which are new here and are not new
to the server.** Email + password has been first-class in the API throughout;
only this SDK claimed the product was passwordless, and that gap is what pushed
automated clients onto the bypass in the first place.

```diff
-await client.auth.devLogin('player@example.com');
+await client.auth.login({ email: 'player@example.com', password });
+// or, for an address that has never been seen:
+await client.auth.register({ email: 'player@example.com', password });
```

```diff
 const link = await client.auth.requestLoginLink({ email });
-if (link.devToken) await client.auth.completeLoginLink(link.devToken);
+// The token arrives only by email now. An automated caller should register an
+// account it holds the password to instead of reading one out of the response.
```

**Also new:** `client.auth.checkAuthMethod(email)` for email-first adaptive
login, and two error predicates, because these two conditions are **not**
distinguishable by GraphQL error code:

- `isAlreadyRegisteredError(e)` — `register` refused because the address already
  has an account. The server raises a `ConflictException` and it arrives as
  `INTERNAL_SERVER_ERROR`, so a caller keying on `CONFLICT` matches nothing.
- `isPasswordUnconfirmedError(e)` — `login` refused because the password is real
  but unconfirmed on an account with another verified sign-in method. The remedy
  is the emailed link, not a different password.

**One behaviour worth knowing before you write a retry loop:** `register` returns
a session only for an address it is **creating**. An address that already has an
account gets the password attached *pending email confirmation* and no token.
Registering and signing in are therefore not interchangeable.

---

# CrowdyJS v14 — one endpoint (breaking)

v13 made the two GraphQL origins optional-but-supported. v14 removes the second
one entirely, because `cks-management-api` has been retired: the management
surface is served by the unified API, and there is nothing else to point at.

**What changed**

- **`managementUrl` and `managementGraphqlEndpoint` removed** from
  `CrowdyClientConfig`. Passing either now **throws** rather than being ignored —
  a JavaScript caller that kept the old option would otherwise have its identity
  calls silently redirected to `httpUrl`, or nowhere at all if `managementUrl`
  was the only URL it set.
- **`client.management` removed.** Use `client.graphql`; it reaches every
  surface. `MarketplaceAPI` also collapsed from two transports to one.

**What did not change:** the two-**token** model. An identity session token is
still rejected for gameplay, and you still mint a short-lived app-scoped token
per app. Keep using two clients — one per token — they just no longer need a
shared management URL.

**Upgrading**

```diff
 const client = createCrowdyClient({
-  httpUrl: 'https://game.example.com',
-  wsUrl: 'wss://game.example.com',
-  managementUrl: 'https://management.example.com',
+  httpUrl: 'https://api.example.com/graphql',
+  wsUrl: 'wss://api.example.com/graphql',
 });

-await client.management.request(SomeDocument);
+await client.graphql.request(SomeDocument);
```

If you configured both to the same origin under v13, delete the `managementUrl`
line and you are done.

**One thing worth getting right:** the per-game client should use the
`gameApiUrl` / `gameApiWsUrl` that `mintAppToken` returns, not a hardcoded host.
An app lives in a single datacenter, and those fields name it. The identity
client can stay on the shared origin.

# CrowdyJS v13 — unified API (breaking)

The platform merged the Management API and Game API into ONE server. v13
landed on the galaxy database; **gameplay has since moved to PostgreSQL +
Citus** via `cks-game-api` (galaxy is not the game DB). v13 resyncs the
committed schema from the unified SDL and removes the surfaces the platform
retired:

- **`client.environments` (and `client.admin.environments`) removed.**
  Dedicated customer environments no longer exist; every app runs on the
  shared platform. `mintAppToken` still returns `gameApiUrl`/`gameApiWsUrl`
  (they resolve to the shared host), so portal routing code keeps working.
- **`client.operator` reduced to platform compute ceilings**
  (`computePlatformCeilings` / `setComputePlatformCeilings`). Infrastructure
  operations (environments, change orders, secrets, releases, audit) moved to
  the separate infra-control-plane service, which has its own auth, GraphQL
  API, and operator console — not this SDK.
- **`client.usage`**: the per-environment rollups (`environmentSummary`,
  `orgByEnvironment`, `environmentByApp`) are gone; org/app-scoped reporting
  (`appSummary`, `appGraphqlOperations`, `playerPulse`) stays.
- **`client.billing`**: the per-environment capacity tier catalogs
  (`buddyTiers`, `graphqlTiers`, `postgresTiers`) are gone; wallets, budgets
  and transactions stay.
- **Endpoints**: `managementUrl` and `httpUrl` may now be the SAME origin
  (e.g. `https://ck.test.cks-env.com`); configuring both remains supported
  and the two-token model (session vs app-scoped) is unchanged.

Everything game-client (auth, users, world/UDP, stores, kit, game model,
compute, player compute/model, marketplace, Crowdy Studio + agent) is
unchanged — the merged schema is a superset for those surfaces.

# CrowdyJS v12.1 — Crowdy Studio embed kit (additive)

Version 12.1 ships the reusable game-embed chrome that previously lived only
in Blocks with Friends. Nothing breaks; games that already hand-roll a shell
can adopt incrementally.

New from `@crowdedkingdoms/crowdyjs/crowdy-studio`:

- `createCrowdyStudioEmbed(options)` / `CrowdyStudioEmbed` — responsive
  dock/fullscreen panel with focus trap, Escape/close-key semantics, compact
  header, on-demand Context drawer (grid bounds, permission cards, optional
  HUD preview), loading/error/retry chrome, and assembly of the full
  `mountCrowdyStudio` call (agent block included when the client exposes
  `crowdyStudioAgent` and the game passes `playerHost`).
- `CrowdyStudioEmbedDock` — accessible game/studio splitter with persisted
  width under `ck:crowdy-studio:embed:dock-width:v1`.
- `CrowdyStudioTextHud` — text-only presentation sink for CLIENT-mod
  `hud_set` payloads plus the drawer preview mount.
- `CROWDY_STUDIO_EMBED_STYLES` / `ensureCrowdyStudioEmbedStyles()` — injected
  `ck-crowdy-studio-embed-*` styling; the docked panel sets
  `--ck-game-right-inset` on `document.body` for game HUD insets.

New from `@crowdedkingdoms/crowdyjs/player-host`:

- `PlayerControlGate` — the synchronous human-takeover seam (capture-phase
  keyboard/pointer preemption, offline Stop, page-hide/visibility handling),
  parameterized on a `clearAgentIntent` hook.
- `AgentControlBanner` — the always-visible-on-control Pause/Stop safety
  region with self-injected `ck-agent-control-*` styles.

New package subpath:

- `@crowdedkingdoms/crowdyjs/player-glue-worker` — the self-starting tokenless
  CLIENT-mod glue worker entry. Bundle it as a same-origin module worker (for
  example Vite's `?worker&url`) instead of copying a worker wrapper into the
  game.

Migrating from the Blocks with Friends copies: `CrowdyStudioPanel` →
`CrowdyStudioEmbed`, `CrowdyStudioDock` → `CrowdyStudioEmbedDock`,
`ModHudLayer` → `CrowdyStudioTextHud`, `bwf-crowdy-studio-*` CSS →
`ck-crowdy-studio-embed-*`, `bwf-agent-control-*` → `ck-agent-control-*`,
`--bwf-game-right-inset` → `--ck-game-right-inset`. The persisted dock width
key changes from `bwf:crowdy-studio:dock-width:v1` to the `ck:` key above
(previous widths reset once).

# CrowdyJS v12 — Agentic Crowdy Studio contract (BREAKING)

Version 12 establishes the greenfield public contracts
`crowdy.studio-agent/1`, `crowdy.agent-tools/1`, and
`crowdy.player-host/1`. The major bump reserves their authority, event,
descriptor, and browser-control semantics before rollout; changing those
semantics later requires another major contract version.

New package subpaths:

- `@crowdedkingdoms/crowdyjs/agent` — immutable descriptor registry, bounded
  JSON-schema validator, stable errors, injectable durable transport,
  ordered/reconnecting session controller, exact approvals, and execute-once
  browser dispatch.
- `@crowdedkingdoms/crowdyjs/player-host` — generic host capability,
  observation, command, and result contracts plus the revocable Play lease
  manager/gate.
- `@crowdedkingdoms/crowdyjs/crowdy-studio` re-exports both surfaces and adds
  the integrated Ask/Build/Play dock.

The reconciled Game API SDL and generated agent operations are now committed.
`client.crowdyStudioAgent` is a production `CrowdyAgentGraphQLTransport`
implementing every `CrowdyStudioAgentTransportV1` query, Relay connection,
mutation, heartbeat, and typed event subscription. Tests and non-GraphQL hosts
may still inject the interface; do not add a generic raw-GraphQL callback.

Creation now carries optional `providerDataConsent`; attach carries a stable
`clientInstanceId` and consumes `replayAfterSeq`; the public transport
`message` maps to Game API `content`; cancellation requires the exact run id;
and nested browser results map to `AgentToolResultEnvelopeInput`. PLAY sends a
two-second heartbeat only while attached, active, and visible, stopping and
clearing local authority on pause, disconnect, stale epoch, kill, or destroy.
Descriptor builds verify the full registry and canonical 28-tool Game API
follow-up subset (14 mandatory game plus 14 Studio/diagnostic/runtime tools)
against the copied digest fixture.

Mode changes now consume the server-repinned registry/policy/context fields.
BUILD mounts derive `projectId` from the selected saved Studio project after
initialization; callers should no longer guess it. An existing session for a
different project fails closed, and project switches require a new session
until Game API adds an explicit set-project mutation.

BUILD workspace leases renew every ten seconds through agent heartbeat and
stop on human edit, project/context change, revocation, disconnect, or destroy.
Backend-advertised draft/live/stop/invoke tools execute through the headless
Studio controller, with exact approval for live work. Run events now preserve
typed code/error details, aborted handlers clear local intent, and inner
`OUTCOME_UNKNOWN` can no longer be wrapped as outer success.

Runtime draft/live calls now require an exact full-project target plan. Live
execution also binds the post-autosave revision, content/module hash, and
pairing preference; mismatches fail before any compile/deploy. Invoke verifies
the running DRAFT/LIVE environment and export, while stop remains an
all-project safety action.

Existing manual mounts continue to work:

```ts
await mountCrowdyStudio(host, existingOptions);
```

To enable the agent dock, inject the transport and either an existing session
or create-session input:

```ts
await mountCrowdyStudio(host, {
  ...existingOptions,
  agent: {
    transport: game.crowdyStudioAgent,
    sessionId,
    playerHost, // optional; required for generic Play tools
  },
});
```

`CrowdyStudioHandle` now exposes `agent` and `controlLeaseManager` (both `null`
when agent mode is not configured). `CrowdyStudioController.testDraft()` and
`deployLive()` now resolve typed `CrowdyStudioDeployResult` values; code that
ignored their previous `void` result remains valid.

Headless integrations should adopt:

- `prepareForAgentWork()` before sending a turn;
- `applyAtomicPatch()` / `synchronizeProject()` for complete revision-fenced
  project updates;
- `CrowdyStudioSynchronizationProvider` for durable checkpoint list, atomic
  patch, and approved restore hooks;
- `state.runtimeSync` instead of inferring saved-versus-running status from the
  display phase.

Game integrations implement `PlayerHostAdapterV1`, route commands through the
same intent services as human input, and call
`AgentControlLeaseManager.preempt(reason)` synchronously on human input,
Escape, Stop, death, disconnect, or context/target changes. Do not adapt the
agent through DOM events, raw UDP/GraphQL/CrowdyJS methods,
`PlayerCodeBroker`, or client-mod `host_call`.

The current Game API pilot advertises its canonical 28-tool follow-up subset,
including all 14 mandatory game tools. CrowdyJS dispatches the game tools
through `PlayerHostAdapterV1`;
BWF Play still requires the concrete BWF adapter/shared-intent integration and
matching host/app policy.

The browser package contains no provider client or key. Provider routing,
policy, budgets, durable approvals, and server tools remain Game API
responsibilities.

# CrowdyJS v11.1 — responsive Crowdy Studio embedding

Crowdy Studio now sizes to its host instead of imposing a 680-pixel minimum
height. The mount observes host element resizes and relayouts Monaco, while its
explorer and settings panes respond to the host's container width rather than
the browser viewport.

Embedding hosts should provide an explicit width and height for the mount
element. No project, autosave, deploy, pairing, worker-security, or GraphQL
behavior changed.

# CrowdyJS v11 — Crowdy Studio rename (BREAKING)

Version 11 removes the previous Mod Studio names completely. There are no
compatibility exports, client properties, package subpaths, GraphQL operations,
schema types, or CSS aliases.

Rename imports and API access:

- `@crowdedkingdoms/crowdyjs/mod-studio` →
  `@crowdedkingdoms/crowdyjs/crowdy-studio`
- `mountModStudio` → `mountCrowdyStudio`
- `ModStudioController` → `CrowdyStudioController`
- `MountModStudioOptions` → `MountCrowdyStudioOptions`
- `ModStudioHandle` → `CrowdyStudioHandle`
- every other public `ModStudio*` model, error, diagnostic, and editor type →
  its `CrowdyStudio*` equivalent
- `modStudioFileKey`, `modStudioFileUri`, and `normalizeModStudioPath` →
  `crowdyStudioFileKey`, `crowdyStudioFileUri`, and
  `normalizeCrowdyStudioPath`
- `client.playerCodeProjects` → `client.crowdyStudio`
- `PlayerCodeProjectsAPI` → `CrowdyStudioAPI`
- CSS classes under `ck-mod-studio*` → `ck-crowdy-studio*`

The matching Game API schema is required. Its project roots changed from
`playerCodeProjects`, `playerCodeProject`, `playerCodeProjectCreate`,
`playerCodeProjectSave`, `playerCodeLibraryFiles`, `playerCodeLibrarySave`,
`playerCodeCommonFiles`, and `playerCodeProjectImportFile` to the corresponding
`crowdyStudio*` roots. Project, library, common-file, input, and enum schema
types likewise use `CrowdyStudio` in place of `PlayerCode`.

```ts
import { mountCrowdyStudio } from '@crowdedkingdoms/crowdyjs/crowdy-studio';

const studio = await mountCrowdyStudio(host, {
  projectProvider: game.crowdyStudio,
  playerCompute: game.playerCompute,
  playerWallet: identity.playerWallet,
  appId,
  gridId,
  grid,
  workerUrl: playerCodeGlueWorkerUrl,
  onHostCall,
});
```

Provider behavior, optimistic saves, target permissions, the credential-free
worker, full-stack deploy ordering, and stop semantics are unchanged.

# CrowdyJS v10 — project-first authoring (historical)

Version 10 replaced the session-only live-coding API with cloud projects. It
removed `mountLiveCodingIDE`, `mountLiveCoding`, `LiveCodingController`,
`MountLiveCodingOptions`, `PLAYER_CODE_TEMPLATES`, `templateById`, the
`moduleName` and `draftByDefault` mount options, and the
`@crowdedkingdoms/crowdyjs/live-coding` package subpath.

Projects introduced one shared optimistic revision for SERVER and CLIENT files,
project metadata and module names, personal-library/common-file imports, atomic
autosave, and explicit **Test draft**, **Deploy live**, and **Stop project**
actions. Full-stack deployment was ordered CLIENT compile → SERVER compile →
`setRequires` → SERVER enable → exact-version CLIENT artifact hot-swap.

The browser Rust worker remained credential-free and server-free. Monaco used
target-prefixed URIs for cross-file language features and retained the
target/file-aware textarea fallback.

# CrowdyJS v8.10 Notes

## Added

- `inventoryBlueprint({ recipes, barters })` generates atomic Model
  transactions; `kit.inventory.craft(...)` and `.barter(...)` invoke them.
- Competitive inventory posture:
  `stackInstantiableBy: 'admin'`, `grantAuthority: 'server'`, plus matching
  runtime `ownerIdKind` for legacy string-owner worlds.
- Compute SDK default `0.1.3`, including transactional `model_invoke` and
  explicitly owned module-created containers.

This release is additive. The default inventory posture remains
member-created/owner-grant for compatibility; competitive games should opt
into the hardened posture and provide a trusted stack bootstrap.

# CrowdyJS v8.9 Notes

## Added

**Realtime + live-ops surfaces** — the Wave 3 close-out of the game-kit
catalog. Additive; capability-detected; model-only deployments unchanged.

- **`kit.abilities`** (new) — `defineAbility` (admin), `cast(abilityId,
  targetX, targetZ)` (your position is your live pose — unspoofable),
  `loadout`, `book` (resource + cooldowns), type-94 cast/impact parsing.
- **`kit.movement`** (new) — the movement-warden (observe/flag):
  `violations`, `config`, `defineConfig` (admin), type-95 parsing. The
  warden never corrects; client prediction stays yours.
- **`kit.territory`** (new) — `points` (live capture state), `factions`,
  admin map CRUD (`defineFaction`/`enroll`/`definePoint`), type-96 parsing.
- **`kit.racing`** (new) — `defineCourse` (admin), `enter`, `raceStatus`,
  `best`, `ghostPlay` (record replay on the actor lane), type-97 parsing;
  plus the possession ball: `joinMatch`/`claim`/`pass`/`shoot`/`matchState`.
- **`kit.liveops`** (new) + `liveopsBlueprint` — event windows (scheduler-
  aware `activeWindows`), seasons with battle-pass composition
  (`pass_track` + `pass_features`), type-98 zone-change parsing.
- **`kit.moderation`** (new) + `moderationBlueprint` — reports, the admin
  escalation queue, resolve dispositions, personal mutes.
- **`kit.telemetry`** (new) + `telemetryBlueprint` — `track(name, props)`
  fire-and-forget over sampled counters.
- **`kit.loot` engine path** — `engineAvailable`/`enginePull`/`enginePity`/
  `engineAudit` route big-table pity rolls through a loot module; the
  blueprint's weighted model rolls stay for small tables.
- **`client.compute.templates()` / `deployTemplate()`** — the platform's
  server-side engine-template registry (`computeDeployTemplate`): deploy a
  canonical engine by name, no client-held Rust.
- **`kit.deploy({ engines: [...] })`** — blueprints + engine templates in
  one call (`'template'` or `'template:moduleName'` entries).
- **`kit/wire`** — reserved event types 94 (ability), 95 (movement
  violation), 96 (control point), 97 (race timing), 98 (zone change) with
  parsers.

## Server compatibility

The new surfaces need a `cks-game-api` from the Wave 3 dev line (engine
event types 94–98, `computeDeployTemplate`). Without the engines deployed,
`engineAvailable()` is false everywhere and 8.8 behavior is unchanged.

# CrowdyJS v8.8 Notes

## Added

**Session-genre engine surfaces** — client counterparts of the Wave 2
`crowdy-game-kit` engines. Additive; no breaking changes; everything is
capability-detected and degrades to the blueprint behavior.

- **`kit.matches`** — `engineReady` / `engineSubmitMove` / `engineForfeit` /
  `engineStatus` (server-driven turn order, timeouts, authoritative
  scoring) + `findByProposal` (the matchmaking handoff).
- **`kit.decks`** — `engineNewTable` / `engineHand` (caller-scoped: hidden
  hands never replicate) / `engineDraw` / `enginePlay` / `engineTakeZone` /
  `engineTable`.
- **`kit.instances`** (new) — open/join/complete/state over the
  instance-engine (per-run seeds, disjoint chunk volumes).
- **`kit.director`** (new) — `defineEncounter` (admin), `startRun`,
  `reportKill`, `reportBossHp`, `skipWave`, `runState`.
- **`kit.matchmaking`** (new) — `queueJoin` (party blocks, optional
  explicit rating), `queueLeave`, `queueStatus`, `accept`, `reportResult`
  (Elo-lite).
- **`kit.economy.orderBook`** (new) — escrowed order-book market:
  `depositCoins`/`depositItems`, `bid`/`ask` (maker-price fills), `cancel`,
  `book`, `account`, `withdraw`.
- **`kit.leaderboards`** — `engineTop` (server-ranked pages with tie-aware
  ranks + percentiles), `engineRankOf`, `engineSubmitSelf`,
  `engineSeasons`.
- **`kit.minigames`** (new) — thin invoke wrapper for invoke-loop games
  (the `minigame` scaffold pattern); denials resolve, never throw.
- **`kit.quests`** — FTUE tutorial sequencing: `defineTutorial` (admin),
  `tutorial(owner)` (ordered steps as locked/active/complete),
  `acceptNextTutorialStep`.
- **`kit/wire`** — reserved engine event types 91 (turn), 92 (score),
  93 (proposal) + `parseTurnEvent` / `parseScoreEvent` /
  `parseProposalEvent`.

## Server compatibility

Engine surfaces need the Wave 2 engines deployed on a `cks-game-api` from
the compute dev line; without them `engineAvailable()` is false and the
blueprint paths behave exactly as in 8.7.

# CrowdyJS v8.7 Notes

## Added

**Engine kit surfaces** — client counterparts of the `crowdy-game-kit`
compute-module engines (Wave 1). Additive; no breaking changes.

- **`kit/wire`** (exported from the package root): the engine actor wire
  registry mirroring the server's `kit-core::wire` — `POSE_BYTES`, the
  `FLAG_GROUNDED`/`FLAG_MOB`/`FLAG_NPC` flag bits, `encodeEnginePose` /
  `decodeEnginePose` (+ container-id `suffix` extraction), `enginePoseCodec`
  (a `StateCodec` for World Stores), `engineLanes()` (ready-made
  players/mobs/npcs lane predicates for `createWorldSession`), and the
  server-event parsers `parseContactDamage` (type 77) / `parseWeatherEvent`
  (type 90).
- **`kit.mobs`** — mob-engine helpers: `attack(containerId, amount)` through
  the server referee (`{success, health, killed, reason}`), `defs()` /
  `slots()` durable reads, `status()`, `parseContactDamage`.
- **`kit.pets`** — npc-engine pets: `adopt`, `list`, `summon` / `dismiss` /
  `rename` (owner-validated engine-side).
- **`kit.combat.attackRouted`** — one attack call for both deployments:
  routes through the compute referee when the engine is present
  (capability-detected), else today's model attack function.
- **`kit.worldsim`** — `engineAvailable()`, `forecast()` (current front +
  day phase from a world engine), `parseWeather`.
- **`kit.npcs`** — `engineAvailable()` + `overlayLivePoses(npcs, lane)` (the
  live-pose overlay pattern for engine-driven NPCs).
- **`kit.engines`** — the shared `EngineDetector` (per-session cached module
  probes + the `{success, reason}` invoke envelope).

Capability detection degrades gracefully: on model-only deployments every
engine-aware helper reports `engineAvailable() === false` and the model paths
behave exactly as in 8.6.

## Server compatibility

Engine helpers need engines deployed on a `cks-game-api` from the Wave 0/1
compute dev line; without them the helpers fall back as described above.

# CrowdyJS v8.6 Notes

## Added

**`client.compute` — Compute Modules** (server-side Rust/WebAssembly logic on
the Game API). Additive; no breaking changes.

- Authoring: `upsertModule`, `deployVersion({ appId, moduleName, sourceFiles })`
  (stringifies the source map and defaults the SDK/ABI pins), `waitForCompile`
  (polls the newest version until the compile settles), `setModuleEnabled`,
  `deleteModule`, `upsertTrigger` (tick / event / invoke), `deleteTrigger`,
  `setPolicy`.
- Invoke: `invoke({ appId, moduleName, exportName, paramsJson })` — synchronous
  RPC to a module's client-callable export.
- Monitoring: `modules`, `module`, `moduleVersions`, `moduleTriggers`,
  `modulePolicy`, `moduleRuns`, `moduleStats`, `moduleLogs`, `appDiagnostics`.
- Exports: `ComputeAPI`, `COMPUTE_SDK_VERSION`, `COMPUTE_ABI_VERSION`.

Modules execute **server-only**; the SDK manages, invokes, and observes them.
Guide: https://docs.crowdedkingdoms.com/game-api/compute-modules

## Server compatibility

Requires a `cks-game-api` build that serves the `compute*` root fields
(v0.13.13+ dev line). Older servers reject compute operations with a GraphQL
validation error; every other sub-client is unaffected.

# CrowdyJS v8 — Passwordless & federated sign-in (BREAKING)

> **SUPERSEDED BY 15.0.0 — do not follow this section as current product.**
> Email + password sign-in came BACK in 15.0.0: `auth.login` and
> `auth.register` exist, and the `devLogin` bypass was removed from every tier
> on 2026-08-20. What is still true from v8 is that magic link and social
> sign-in are supported; what is false is that they are the ONLY options.
> This section is kept as the record of the v8 break. See the 15.0.0 notes at
> the top of this file.

**At v8, Crowded Kingdoms was passwordless.** Email + password login was removed
in that version. The v8 migration was to one of:

- **Magic link (email):**
  ```ts
  await client.auth.requestLoginLink({ email, redirectUri }); // emails a one-time link
  // on the landing page (token from the URL):
  const { user } = await client.auth.completeLoginLink(tokenFromUrl);
  ```
- **Social (federated / OIDC):**
  ```ts
  const providers = await client.auth.availableLoginProviders(); // e.g. ['google']
  const { authorizeUrl, state } = await client.auth.socialLoginStart('google', callbackUrl);
  location.assign(authorizeUrl);
  // on the callback page:
  await client.auth.socialLoginComplete({ provider: 'google', code, state });
  ```
- **Dev bypass (development only):** `await client.auth.devLogin(email)` — works only
  when the server has `DEV_AUTH_BYPASS` enabled. **Removed in 15.0.0 — see below.**

**Removed:** `client.auth.login`, `register`, `confirmEmail`, `requestPasswordReset`,
`resetPassword`, `resendConfirmationEmail`, `changePassword` (and the
`LoginUserInput` / `RegisterUserInput` / `ResetPasswordInput` types).
**`login` and `register` came back in 15.0.0**; the rest did not.

**New:** `requestLoginLink`, `completeLoginLink`, `socialLoginStart`,
`socialLoginComplete`, `devLogin`, `availableLoginProviders`, `myIdentities`,
`linkIdentity`, `unlinkIdentity`. Each sign-in still returns an identity session
token, stored on the shared session automatically (account is created on first
sign-in).

**Portal consent + connected apps (new on `client.portal`):** `getConsent(appId)`,
`authorizeApp(appId)`, `revokeAppAuthorization(appId)`, `myAuthorizedApps()`,
`setAppClientSettings({ appId, redirectUris, clientType, launchUrl })`.
`handleAuthorizeRequest` now enforces consent: untrusted apps throw
`PortalConsentRequiredError` unless you pass `{ grantConsent: true }` (call after
the user approves on the consent screen). Trusted/first-party apps (the Overworld,
app 1) skip consent. Browser portal entry now requires the destination app's
`redirect_uris` to be registered (`setAppClientSettings`).

Everything else from v7 (the two-client pattern, `client.portal` minting/PKCE,
app-scoped tokens) is unchanged.

---

# CrowdyJS v7 — Overworld portals & app-scoped tokens (BREAKING)

v7 splits the single app-agnostic game token into two credentials and makes
gameplay require an **app-scoped token**. This is a breaking change requiring
servers on the matching release (management-api + game-api + Buddy with the
app-scoped-token feature).

**The two credential kinds**

- **Identity SESSION token** — returned by `client.auth.login()` / `register()`.
  It talks to the **Management API only** (account, studio admin, and minting
  app tokens). It is **no longer valid for gameplay**: the Game API and Buddy
  reject it. Never hand it to a game stack.
- **App-scoped GAMEPLAY token** — short-lived (default ~30 min), confined to one
  app. Minted from a session token via the portal flow; used against that app's
  Game API + realtime surface.

**What breaks**

- Driving `client.udp`, `client.world(appId)`, `serverWithLeastClients`,
  `connectUdpProxy`, world reads/writes, etc. with a plain login token now fails
  (`APP_TOKEN_REQUIRED` on `udpNotifications`; `FORBIDDEN`/`SCOPE_MISSING` on
  HTTP). You must obtain an app token first.
- A single client can no longer be both your identity client and your game
  client. Use the two-client pattern: an Overworld/identity client (holds the
  session token) and a per-game client (holds that game's app token).

**New: `client.portal`**

```ts
// Native / same-origin: mint directly with the session token.
const appToken = await overworld.portal.mintAppToken(appId);
const game = createCrowdyClient({ httpUrl: appToken.gameApiUrl!, wsUrl: appToken.gameApiWsUrl!,
  managementUrl, tokenStore: new BrowserLocalStorageTokenStore('crowdyjs:token:' + appId) });
game.setToken(appToken.token);

// Browser cross-origin handoff (OAuth2 Authorization Code + PKCE):
//   game origin, on "enter":
const url = await game.portal.beginEntry({ appId, authorizeUrl: 'https://overworld.example.com/authorize',
  redirectUri: location.origin + location.pathname });
location.assign(url);
//   Overworld /authorize page (holds the session token):
location.assign(await overworld.portal.handleAuthorizeRequest());
//   game origin, on callback boot:
const token = await game.portal.completeEntry(); // exchanges code+verifier, stores app token
//   keep playing past expiry without re-portaling:
await game.portal.refresh();
```

The session token never reaches the game origin — only the app token does. New
realtime `RealtimeConnectionEvent` codes: `APP_TOKEN_REQUIRED`,
`APP_SCOPE_MISMATCH`. New `UdpErrorCode`: `TOKEN_EXPIRED`.

---

# CrowdyJS — npm org rename (v6 version line kept)

The package moved to the **`@crowdedkingdoms`** npm organization. The version line
is **unchanged** — it continues the v6 series:

- **Old:** `@crowdedkingdomstudios/crowdyjs@6.1.0`
- **New:** `@crowdedkingdoms/crowdyjs@6.1.1` — **identical code**, new package name.

> During the org move the version was briefly reset to `1.0.0` / `1.0.1`. That was a
> versioning mistake: the docs and the rest of the platform track the v6 line, so the
> published SDK was restored to it. `6.1.1` (which is `latest`) supersedes the `1.0.x`
> publishes — those remain installable but are the *same code* as `6.1.1`.

To upgrade, change your install and imports:

```bash
npm uninstall @crowdedkingdomstudios/crowdyjs
npm install @crowdedkingdoms/crowdyjs
```

```ts
// before: import { createCrowdyClient } from '@crowdedkingdomstudios/crowdyjs';
import { createCrowdyClient } from '@crowdedkingdoms/crowdyjs';
// generated docs export likewise: '@crowdedkingdoms/crowdyjs/generated'
```

No API, behavior, or type changes vs `@crowdedkingdomstudios/crowdyjs@6.1.0`. The
old package is deprecated and points here. The notes below (kept for history)
describe the feature set as of the 6.x line, which `6.1.1` ships as-is.

# CrowdyJS v6.1 Notes

v6.1 is **additive** — new methods and fields only, no breaking changes. It
completes the "full-surface" goal so every non-deprecated public root field on
both APIs now has a typed SDK method, and adds Relay cursor-pagination variants
alongside the existing offset list methods.

## Added

- **Grids**: `client.gameApps.deleteGrid(input)` (also `client.admin.grids.deleteGrid`)
  — delete a studio-created peer grid (game-api `deleteGrid`, requires
  `cks-game-api >= v0.12.3`).
- **Game model (studio reads + revoke)**: `client.gameModel.containerTypes`,
  `propertyDefs`, `getFunction`, `functions`, `features`, `tierFeatures`,
  `policy`, and `revokeTierFeature`.
- **Management admin reads/mutations**: `client.users.{get, paginated, setOperator,
  setSuperAdmin, setEarlyAccessOverride, updateType, forceLogout, updateState,
  freePlayWindow}`; `client.organizations.memberRoles`;
  `client.appAccess.{runtimePermissions, grantMemberCandidates, claimFree, grantMine}`;
  `client.apps.marketplace`; `client.billing.{buddyTiers, graphqlTiers,
  postgresTiers}`; `client.environments.updateBillingTiers`;
  `client.payments.{capturePaypal, events}`; `client.usage.playerPulse`.
- **Relay `*Connection` variants** (preferred over the deprecated offset lists):
  `client.actors.listConnection`, `client.voxels.historyConnection`,
  `client.gameModel.eventsConnection`, `client.users.listConnection`,
  `client.apps.marketplaceConnection`, `client.appAccess.usersByAppConnection`,
  `client.billing.walletTransactionsConnection`,
  `client.payments.{mineConnection, allConnection, eventsConnection}`.
- **New fields on existing operations**: `environmentQuote` /
  `orgEnvironment(s)` now return `environmentClass` + `singleBoxFlavor`;
  `appUsageSummary` now returns `automationRuns` / `automationInvocations` /
  `automationComputeUnits`.

## Server compatibility

`deleteGrid` requires a server on release **v0.1.33+** (`cks-game-api >= v0.12.3`).
The new management fields require `cks-management-api` recent enough to expose them.
All additions are backward compatible at the SDK API level.

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
- Import generated operation documents from `@crowdedkingdoms/crowdyjs/generated`.

## API Field Renames

- `CreateGridInput.app_id` is now `CreateGridInput.appId`.
- `TeleportRequestInput.UUID` is now `TeleportRequestInput.uuid`.
- `connectUdpProxy` takes no input.

## Error Handling

GraphQL failures now throw `CrowdyGraphQLError`, preserving every GraphQL error
including `path` and `extensions.code`. Realtime failures use
`CrowdyRealtimeError` and subscription-level `RealtimeConnectionEvent` payloads.
