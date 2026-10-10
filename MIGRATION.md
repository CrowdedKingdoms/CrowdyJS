# CrowdyJS v18 — the legacy engines are gone

**Breaking.** The game API deleted its legacy developer-code engines on dev (cks-game-api #417,
ck-api `v2.27.0`): Studio compute, the game model and its automations, player compute (its
browser CLIENT modules too) and the player model. `18.0.0` removes their SDK surface. Their
code moves to ck-exec (`client.exec`): an app's server code as hubs and spokes, a player's grid
code as mods, and a mod's browser code as its CLIENT half. Nothing is migrated for you; port the
code, then upgrade.

**Which 18.** 18.0.0 was published only on the `dev` channel (`18.0.0-dev.1`). **18.0.1 is the
first 18.x a client on the production channel will see**, and it carries everything on this page:
the legacy engines' removal (18.0.0) and the platform-administration removal
([below](#platform-administration-is-not-in-the-sdk), 18.0.1).

**What it needs.** 18.0.0 calls nothing the legacy engines served, so it runs against any API
with ck-exec CLIENT halves (ck-api `v2.24.0`, as 17.14.0 did). **Crowdy Studio's CLIENT
projects need ck-api `v2.25.1` or later:** `v2.24.0` and `v2.25.0` refuse to save a
`crowdy-client-sdk` crate in a Studio project (`CROWDY_STUDIO_MANIFEST_INVALID`, cks-game-api
#425). The other way round, a 17.x SDK against `v2.27.0` fails every call into a deleted field
as a GraphQL validation error.

| 17.x | 18.0 |
| --- | --- |
| `client.gameModel` (containers, properties, functions, `invoke`, sessions, events, timers, automations, `seed`, lint, the player-count feed) | A hub's own state and endpoints: `client.exec.connect(appId, { nodeType, key })`, then `call` / `subscribe`; timers are `ctx.timer_after` / `ctx.timer_every` in the hub; sessions are a keyed hub (the `session` starter) |
| `gameModel.defineFeature`, `grantTierFeature`, `revokeTierFeature`, `features`, `tierFeatures` | `client.appAccess.defineFeature`, `grantTierFeature`, `revokeTierFeature`, `features(appId)`, `tierFeatures(appId, tierId?)` (same fields; a hub reads them with `players.features`) |
| `client.compute` (modules, `invoke`, templates, runs, logs) | `client.exec.starters` / `build` / `waitForBuild` / `deploy`, `logs`, `instances`, `versions`, `activateVersion`, `setEnabled`; manual calls through `connectAsDeveloper` |
| `client.playerModel` (containers, automations) | A mod's own state and timers |
| `client.playerCompute` SERVER side (`deploy` with `target: SERVER`, `setEnabled`, `setRequires`, `invoke`, `runs`, `logs`) | Mods: `client.exec.modBuild` / `waitForModBuild` / `modDeploy` / `modSetEnabled`, calls through `connect(appId, { nodeType: execModType(name), key: gridId })`, `modLogs` |
| `client.playerCompute` CLIENT modules (`deploy`, `versions`, `artifact`, `artifactBytes`, `usage`, `myModules`, `delete`, `setSwitch`, `switches`) | A mod's CLIENT half: `client.exec.modClientBuild` (polled with `modBuildStatus` / `waitForModBuild`), `modClientDeploy` / `modClientDelete`, `modClientArtifactBytes`; its kill ladder is the mod's, `modSetSwitch` |
| `marketplace.gridClientMods`, `consentGridClientMod`, `trustGridAuthor`, `clientArtifact`, `clientArtifactBytes`, and `client.grid(...).compute.clientMods` | `client.exec.gridClientMods`, `consentClientMod`, `trustAuthor`, `modClientArtifactBytes` (which checks the bytes against their digest); `ExecClientHalves` runs a grid's CLIENT halves |
| `marketplace.listings` / `versions` / `publishListing` / `publishVersion` / `acquire` / `install` / `uninstall` / `myAcquisitions` / `myInstalls` | `client.exec.modPublish` / `modListings` / `modInstall` / `modUnpublish`; a listing carries its mod's CLIENT half |
| `playerWallet.policies` / `setPolicy` / `deletePolicy` (`playerWasmPolicies`) | Mods run under the platform's mod limits; the kill ladder is `client.exec.modSetSwitch` |
| `client.operator` (`computePlatformCeilings`, `setComputePlatformCeilings`) | ck-exec code is bounded by its manifest limits within the platform's; there is nothing to call |
| `client.kit(appId)` blueprints, `kit.deploy`, engines, `kit.inventory` … `kit.minigames`, `kit.features` | Hubs; the starters for NPCs and mobs, sessions and matchmaking. `kit.social` stays; `kit/wire.ts` codecs and `runOptimisticAction` stay |
| `createWorldSession({ model })` (`ContainerMirror`) | Subscribe to the hub's topic |
| `client.grid(...).sessions`, `.model`, `.compute` | A mod on the grid (`client.exec.mod*`) |
| `PlayerCodeBroker` / `startGridMod` without `engine` (a legacy CLIENT module: unmetered, with the whole client catalog), `ALLOWED_HOST_CALLS` | A CLIENT half, the only kind of player module: `artifactHash`, `fuelPerDispatch` and `consentedHostCalls` are required, the allowlist is `EXEC_CLIENT_HOST_CALLS`, and the module must carry the `ck_fuel` meter |
| `MODEL_LINT_QUERY`, `modelLintDiagnostics`, `CrowdyModelLintLog`, the `'model-lint'` diagnostic source | The Rust compiler's diagnostics from the build |

- **The player runtime runs CLIENT halves only.** `PlayerCodeBroker`'s `artifactHash` (the
  served `digest`), `fuelPerDispatch` and `consentedHostCalls` are required, and `engine` is
  `'ck-exec'` or absent; a broker without them, or asked for another engine, does not start.
  The glue offers exactly `EXEC_CLIENT_ABI_IMPORTS` and refuses a module without the `ck_fuel`
  meter; its inert wasi stubs and the `wasi_unstable` alias are gone. `ALLOWED_HOST_CALLS` is
  gone, and `GLUE_HOST_FUNCTIONS` names the CLIENT allowlist. `startGridMod`'s wasm spec needs
  the same three values.
- **CLIENT host calls the legacy engines answered are refused** by the broker as not allowed:
  the Game Model group (`container_*`, `containers_list`, `property_set`, `edge_*`,
  `model_invoke`), `sessions_list`, and `grid_state_get` / `grid_state_set`. A mod's server
  half, a hub keyed by the grid, holds grid state now. `createGridHostCalls` / `startGridMod`
  lost `allowModelInvoke` and the client's `gameModel`.
- **What a CLIENT half says and answers, on the page** (new):
  - `onLog`: its `crowdy::log` lines (crowdy-client-sdk levels 0 debug, 1 info, 2 warn,
    3 error), at most `PLAYER_CODE_LOG_LINES_PER_SECOND` (20) a second and
    `PLAYER_CODE_LOG_MAX_CHARS` (1,000) characters each, then a `warn` counting what was
    dropped. On `PlayerCodeBroker`, `ExecClientHalves` (with the mod) and `startGridMod`. The
    text is the mod author's: render it as text. Crowdy Studio shows its preview's lines in
    Logs.
  - `invoke(payload)`: the module's `handle_invoke` export, called by the page:
    `PlayerCodeBroker.invoke`, `ExecClientHalves.invoke(modId, payload)` and
    `RunningGridMod.invoke`, up to `PLAYER_CODE_INVOKE_MAX_BYTES` (256 KiB) each way. The reply
    is the module's: treat it as untrusted input.
  - `createGridHostCalls` answers `avatar_state_get` and `grid_permission_check` as the host
    catalog scopes them: an avatar whose live actor the game places inside the grid
    (`local.avatarChunk`, then the public `avatarAppState`), and the visiting player
    (`userId`) on this grid, from the permission keys the game knows
    (`local.gridPermissionKeys`). Without those they are refused as not offered, as
    `actors_list` is without `local.actorsInChunk`.
- **Crowdy Studio runs on ck-exec only.** Drop `serverEngine` from the embed, the controller
  and `mountCrowdyStudio`, and `playerCompute` from the embed's services and the controller's
  and `mountCrowdyStudio`'s options (`CrowdyStudioPlayerCompute` is gone); they require
  `mods: client.exec`, and the embed requires `client.exec`. `CrowdyStudioState` loses
  `serverEngine`, `runs` (the Runs panel went) and `usage` (`CrowdyStudioUsageSnapshot`:
  nothing on ck-exec spends player compute quota, and the `'usage'` surface reads the
  wallet); `logs` are `CrowdyStudioLogLine`s (`id`, `source` `'mod' | 'preview'`,
  `moduleName`, `level`, `at`, `text`); `CrowdyStudioInvokeResult` is
  `{ resultJson, durationUs }`. `createCrowdyStudioStarterProject` needs `modStarter` for a
  kind with a SERVER target and has no `engine`: a CLIENT target is a `crowdy-client-sdk`
  CLIENT half. The pairing control went: a mod has no pairing.
- A CLIENT crate still on `crowdy-compute-sdk` is refused before any build, with what to
  change: `crowdy-client-sdk = "0.1.0"` in `Cargo.toml` and `crowdy_client_sdk` in place of
  `crowdy_compute_sdk` in `src/`. Its host calls are the same less the Game Model, sessions and
  grid state (`grid_state_get` / `grid_state_set`).
- `ENGINE_SWITCHED_OFF` left `CrowdyFaultCode`: nothing raises it now.
- The kit's type-98 parser is `parseZoneChangeEvent` beside the other wire parsers.

## Platform administration is not in the SDK

The SDK is for normal clients and designed for production: it carries what players,
developers and org-admins call, and nothing only a super-admin or a platform operator can
call. **18.0.1** removes the wrappers that were left (18.0.0 still had them). The API still has every one of these
fields; **use the API directly from your own tooling** (a GraphQL request with an operator's or
super-admin's session). There is no SDK replacement.

| Removed | Root field |
| --- | --- |
| `client.users.paginated`, `client.users.listConnection` | `usersPaginated`, `usersConnection` |
| `client.users.setSuperAdmin` | `setSuperAdmin` |
| `client.users.setOperator` | `setOperator` |
| `client.users.setEarlyAccessOverride` | `setEarlyAccessOverride` |
| `client.users.updateType` | `updateUserType` |
| `client.users.forceLogout` | `forceLogoutUser` |
| `client.payments.all`, `allConnection` (also `client.admin.payments`) | `checkouts`, `checkoutsConnection` |
| `client.payments.events`, `eventsConnection` | `paymentEvents`, `paymentEventsConnection` |
| `client.organizations.setStatus` | `setOrgStatus` |
| `client.apps.setVisibility` | `setAppVisibility` |
| `client.hosting.all` | `allHostedGames` |
| `client.hosting.setListing` | `setHostedGameListing` |
| `client.hosting.takeDown` | `takeDownHostedGame` |

- `client.quotas.set` takes a `ScopedSetQuotaInput`: an `appId` or an `orgId` (and optionally a
  `tierId`) is required, and it refuses a platform-global rule before any request.
  `client.quotas.remove` is unchanged; it removes a rule on an org or app the caller manages.
- `client.users.get` and `client.users.updateState` stay: any session can call them
  (`updateState` writes only the caller); their docs had said super-admin only.
- The generated types and documents for those operations are gone from
  `@crowdedkingdoms/crowdyjs/generated` as well.

`schema.gql` and the generated types follow the game API: the release carries cks-game-api
`dev`'s SDL after #417 merged (`npm run schema:sync:paths -- --schema <that schema.gql>`, then
`npm run codegen`).

## 18.8.0: the input log says what it lost, and when to retry

Additive. **Needs the Game API release after v2.40.2** (`InputLogSession.missingRecords` is
selected on every sessions read; an older Game API refuses the selection). Promote the Game API
first on each tier.

- **`missingRecords`** on every recorded session: inputs the replication server accepted that
  never reached the log (a full queue, or a broker outage). 0 for a complete session; null on
  one recorded before the count existed. Recording is best-effort, and this is how a gap shows.
- **Two end reasons** in `endReason`: `logging_off` (replay logging was turned off during the
  session) and `shutdown` (the replication server recording it stopped, a deploy; the client
  reconnects elsewhere, which is a new session). `unrecorded` (no end was recorded; closed an
  hour after its last input) came with the Game API release after v2.39.0.
- **Reads say when to retry.** `messages` throws `INPUT_LOG_TEMPORARILY_UNAVAILABLE` when the log
  cannot be read right now (it used to answer an empty page, or `INPUT_LOG_UNAVAILABLE`), and
  `INPUT_LOG_RATE_LIMITED` while another read of yours is running (one per user and two per app
  at a time). Both carry `extensions.retryable`: retry with the same cursor after a short
  back-off. An operation may select `inputLogMessages` only once.
- **A cursor belongs to its session.** `BAD_USER_INPUT` for a malformed cursor or one from another
  session (until this Game API, a cursor from another session was not detected and the read just
  returned fewer inputs).
- **`apps.update(appId, { replayLoggingEnabled: true })`** needs a spendable balance that covers
  the projected cost of keeping one retention period of the app's recent traffic; the
  `INPUT_LOG_FUNDS_NEEDED` refusal's `extensions.requiredMicrousd` and `spendableMicrousd` say how
  much. Recordings already kept go on billing after logging is turned off, until they age out.

Paging a session, the loop that does not stop early:

```ts
import { CrowdyGraphQLError, decodeBase64 } from '@crowdedkingdoms/crowdyjs';

const RETRY = new Set(['INPUT_LOG_TEMPORARILY_UNAVAILABLE', 'INPUT_LOG_RATE_LIMITED']);
let after: string | undefined;
for (let backoffMs = 250; ; ) {
  let page;
  try {
    page = await game.inputLog.messages(appId, gameTokenId, { first: 200, after });
  } catch (err) {
    if (!(err instanceof CrowdyGraphQLError) || !RETRY.has(String(err.code))) throw err;
    await new Promise((r) => setTimeout(r, backoffMs));
    backoffMs = Math.min(backoffMs * 2, 5_000);
    continue; // the same cursor: nothing is skipped
  }
  backoffMs = 250;
  for (const { node } of page.edges) handle(node.messageType, decodeBase64(node.body));
  if (!page.pageInfo.hasNextPage) break;
  after = page.pageInfo.endCursor ?? after;
}
```

Nothing in the SDK changed shape; the regenerated types add `missingRecords` and the refreshed
descriptions.

## 18.7.0: voice helpers, channel audio, opcode 140 on the relay, wide voxels, self-echo, pause and access refusals

Additive, with reads that change for values they used to get wrong (the wide-voxel item) and one
new floor: **the token mutations (`portal.mintAppToken`, `exchangeCode`, `refresh`) select
`runtimeGate` and the `udpNotifications` subscription selects `ChannelAudioNotification`, so
18.7.0 needs the ck-api release after v2.39.0 that carries both** (an older one refuses the
selections). Channel audio and the voxel echo need Buddy v0.37.0.

- **Voice helpers** (`media/voice-frames.ts`, exported from the package entry): an optional
  convention for what an audio payload carries. A 10-byte header, little-endian, goes in front of
  each codec frame: version 1, codec (0 raw, 1 Opus 48 kHz mono, 2 G.711 µ-law 8 kHz), `u16` seq,
  `u32` timestamp in codec samples (milliseconds for raw), the frame's duration in ms, and flags
  (bit 0 the first packet after silence, bit 1 the last before it). `encodeVoiceHeader` /
  `encodeVoicePacket` write it; `decodeVoicePacket` returns `null` for a packet shorter than
  10 bytes or of another version and never throws. `VoicePacketizer` numbers one sender's frames
  across the seq and timestamp wraps and sets the flags (`packetize(frame, { last })`, `skip()`
  for silence). `VoiceJitterBuffer` takes `push(key, packet, nowMs)` per sender key and returns
  the due frames from `pull(key, nowMs)` / `poll(nowMs)`: in seq order, `targetDelayMs` (60) after
  a talk spurt's first packet, a gap (`frame: null`) for each one that never came, late packets
  dropped, at most `maxFrames` (64) a sender, starting over on a talk spurt or `resetAfterMs`
  (200) of silence. A spurt that starts while the one before still has frames waiting drops
  them. CrowdyCPP 0.60.0 has the same helpers and replays `test/unit/fixtures/voice-frames.json`.
  No codec ships: a browser encodes Opus with WebCodecs (the module doc has the settings). A game
  with a voice format of its own keeps it; positioning a voice stays the game's.
- **`genericSpatial`.** Opcode 140 (`GENERIC_SPATIAL_1`), an app-defined spatial payload such as
  CrowdyCPP's `Connection::sendGenericSpatial`, reaches the new `genericSpatial` handler of
  `udp.subscribe` (and `any`) as a `GenericSpatialNotification`: the spatial header fields and a
  base64 `payload`. The World Stores bus has a `genericSpatial` key. **Binary relay only**
  (`realtime: { binaryTransport: true }`): the GraphQL `udpNotifications` union has no member for
  140, so the proxy drops it and a client on the GraphQL transport never sees one. `UdpNotification`
  gains the member, so an exhaustive `switch` over `__typename` needs the new case.
- **`ChunkStore` keeps wide voxel types and other addresses.** Positions and types are the app's
  signed 16-bit values, which the platform does not check. An edit the 16×16×16 one-byte grid
  cannot hold (a type outside 0-255, a position outside 0-15) — a realtime update, a hydrated
  `voxelStates` entry, or a local `setVoxel` — is kept whole in the new `CachedChunk.overlay`
  (`ChunkOverlayVoxel`: `x`, `y`, `z`, `voxelType`, `state`; keyed by `voxelKey(x, y, z)`), and
  `voxelTypeAt` / `voxelStateAt` return it. What changes: a type outside 0-255 is no longer stored
  truncated (300 used to read as 44, -1 as 255); a position outside 0-15 no longer lands on
  another voxel (`(16, 0, 0)` used to overwrite `(0, 1, 0)`), and reading one returns the overlay's
  or nothing; and code that walks `chunk.voxels` itself sees 0 where an in-grid voxel's type is in
  the overlay. The store is a 16×16×16 helper; a game with other addressing reads the raw
  `voxelUpdate` events and `chunks.get`'s `voxelStates`.
- **`createGridHostCalls({ voxelBounds })`** sets the positions and types a CLIENT half's
  `voxel_set` may write, for a world that uses other signed 16-bit values. The default,
  `DEFAULT_GRID_VOXEL_BOUNDS`, is today's: positions 0-15, types 0-255. Bounds that are not
  integer ranges within -32768 to 32767 throw `RangeError` when the host calls are created.
- **Channel audio** (Buddy v0.37.0). `udp.sendChannelAudio({ channelId, uuid, payload,
  sequenceNumber? })` sends opcode 35 (opcode 17's layout and signing) on the binary relay, else
  the `sendChannelAudio` mutation; `payload` is base64, at most 1,024 bytes, and the server
  refuses it with `UNAUTHORIZED` (7) without the channel's `send_voice` and the app's
  `use_voice_chat`. There is no echo to the sender. Other members' frames arrive as opcode 36,
  standalone or bundled, as a `ChannelAudioNotification` (`channelId`, `uuid`, `audioData`
  base64, `sequenceNumber`, `epochMillis`) on the new `channelAudio` handler of `udp.subscribe`
  (and `any`) and the World Stores bus key `channelAudio`, on the binary relay and on the GraphQL
  transport alike (the `udpNotifications` subscription selects the union's
  `ChannelAudioNotification`, so it too needs that ck-api release). `channels.create` /
  `grids.createChannel` take `membersCanSpeak` (default false: the member role gets
  `send_voice`); `GridScope.channels` has `sendAudio(channelId, uuid, audioBase64)`;
  `serializeChannelAudio` is exported. The voice helpers are the payload: see the README.
- **UDP error 33, `APP_PAUSED`**: the replication server refuses a paused app's sends.
  `UDP_ERROR_NAMES[33]` and the generated `UdpErrorCode.AppPaused` name it.
- **Voxel edits are int16 and their state at most 1,024 bytes.** `udp.sendVoxelUpdate` and
  `ChunkStore.setVoxel` throw `RangeError` (nothing sent) for a position or type outside
  -32768..32767 or a state over 1,024 bytes (`assertVoxelEdit`, `VOXEL_STATE_MAX_BYTES`); the
  server answers those with `INVALID_REQUEST` (15). The 0-15 / 0-255 ranges in the docs were
  never enforced and are gone.
- **The echo of your own voxel edit.** Buddy v0.37.0 delivers every accepted edit back to its
  sender as a `VoxelUpdateNotification`. `ChunkStore` records each `setVoxel` (uuid, sequence,
  voxel) for 10 s and does not apply its echo again, so a local edit fires `onChunkChanged` once;
  it applies the echo only when another client's edit of the voxel arrived in between (the server
  ordered yours last) and no newer local edit of it is pending. A game reading `voxelUpdate`
  itself sees its own edits there now: compare the `uuid` and `sequenceNumber` with the send's.
- **Pause and access refusals.** `isAppPaused(gate)` reads `AppTokenResponse.runtimeGate` and
  `GameClientBootstrap.runtimeGate` (`{ status, reason }`; anything but `ACTIVE` is paused; a
  paused app still mints, so check before entering). `appPausedOf(err)` reads `APP_PAUSED`
  (`reason`), `accessRefusalOf(err)` `ACCESS_REVOKED` / `ACCESS_SUSPENDED` (`suspendedUntil`) /
  `ACCESS_NOT_GRANTED`, `actorExistsOf(err)` `ACTOR_EXISTS` (`ownedByCaller`), with their
  `*_CODE` constants.
- **New API wraps**: `users.playerProfile(userId)` and `users.playerProfiles(userIds)` (at most
  `PLAYER_PROFILES_MAX`, 100; `RangeError` above) for public `{ userId, gamertag, disambiguation }`;
  `users.get` documents that another user's private fields come back null.
  `appAccess.suspend(appId, userId, until, idempotencyKey?)`, `unsuspend`,
  `resyncTierGridPermissions` (`manage_access_tiers`); `suspendedUntil` on every access record.
  `exec.restartType(appId, nodeType)` → `{ nodeType, stopped }` (`manage_compute`);
  `exec.status` adds `budgetPauseReason`, `maxInstances`, `maxReservedMb`, `instanceLimit`,
  `instances`, `reservedMb`. `apps.get` / `apps.update` carry `claimOwnerKeys`;
  `chunks.get` / `getByDistance` carry `voxelStatesTruncated`; `gameClientBootstrap` carries
  `runtimeGate` and `wildernessWritesOpen`.

## 18.6.0: the input log

Additive. An app with replay logging on has its client inputs recorded, and `client.inputLog`
reads them back on the app-scoped client:

```ts
const { edges } = await game.inputLog.sessions(appId, { first: 20 });
const gameTokenId = edges[0].node.gameTokenId;
let after: string | undefined;
for (;;) {
  const page = await game.inputLog.messages(appId, gameTokenId, { first: 200, after });
  for (const { node } of page.edges) handle(node.messageType, decodeBase64(node.body));
  if (!page.pageInfo.hasNextPage) break;
  after = page.pageInfo.endCursor ?? after;
}
```

(Corrected in 18.8.0: the first version of this example stopped when `endCursor` came back null
even with `hasNextPage` true, which a v2.39 Game API answers when a read cannot start in time.
18.8.0's section has the loop with retries.)

A player reads only the sessions and inputs they sent; a holder of `manage_apps` on the app reads
every session. Keep paging while `hasNextPage` is true: a messages page can be short, or empty,
when it stopped at the server's time or scan limit. Inputs are kept for the published retention,
so an old session can still be listed after its inputs are gone. Both calls throw
`INPUT_LOG_UNAVAILABLE` on a deployment without input logging, and `messages` throws it, retryable
with the same cursor, when the log cannot be read right now.

`App.replayLoggingEnabled` is selected on every app read and set with `apps.update(appId,
{ replayLoggingEnabled: true })` (`manage_apps`). Turning it on is refused with
`INPUT_LOG_FUNDS_NEEDED` unless the org's wallet has a spendable balance or the org is exempt from
billing, because stored input logs are billed (crowdedkingdoms.com/pricing). It needs ck-api v2.39.0 or later: every app read selects
`replayLoggingEnabled`, which an older Game API refuses.

## 18.5.0: channel messages limited by distance

Additive. `client.udp.sendRangedChannelMessage(input)` publishes to a channel like
`sendChannelMessage`, but only members near an origin chunk receive it: a member gets it when one of
its live actors is in `input.appId` within `input.maxDistance` chunks of `input.chunk`, measured as
the straight-line distance between chunk coordinates, boundary included. `maxDistance` is an integer
from 0 (the origin chunk only) to 2147483647; it is not the 0-8 Chebyshev ring count spatial sends
take. A member with no live actor does not receive it.

```ts
await client.udp.sendRangedChannelMessage({
  channelId,
  uuid: self.uuid,
  payload: encodeBase64(bytes),
  appId,
  chunk: { x: '10', y: '0', z: '-4' },
  maxDistance: 6,
});
```

Members receive the ordinary `channelMessage` notification, so receivers need no change and an older
SDK receives these messages too. The send right is the channel's `send_messages`, as for
`sendChannelMessage`; a refusal arrives as a `genericError` (`UNAUTHORIZED`, or `INVALID_APP_ID` when
`appId` is not the token's app). It needs ck-api with `sendRangedChannelMessage` and Buddy v0.35.0.

## 18.4.1: the generated types come from graphql-codegen 7

No call changes, and the GraphQL documents the SDK sends are byte-for-byte the same. Thirteen types
built from operation results no longer declare an optional `__typename`, because the operations
never select it and it was always `undefined`: `BeginGamePublishResult`, `CompleteGamePublishResult`,
`CrowdyStudioPlayerWallet` (`balance()`), `ExecBuildArtifact`, `ExecModClientArtifact`, `ExecVersion`,
`GridChannel`, `GridToken`, `HostedGame`, `HostedGamePublish`, `HostedGameUpload`,
`UdpNotificationsSubscription` (its outer object; each notification keeps its `__typename`) and
`uploadPublishFiles`'s `uploads` parameter. Code that read `.__typename` on one of them now fails to
compile: delete the read, since it only ever saw `undefined`. The schema types (`Actor`, the inputs,
the enums) are unchanged.

## 18.4.0: the terms and age gate

**What it needs.** ck-api `v2.35.0` (cks-game-api #437, 2026-10-07). Against an older API the
two new calls fail as GraphQL validation errors; nothing else changes.

Since `v2.35.0` no gameplay token is issued until the player has agreed to the current required
legal documents (Game Terms, API Terms, SDK Developer Terms, Free Tier and Billing Basis,
Overworld Privacy Policy) and attested that they are at least 18, or the age of majority where
they live if that is higher. `portal.mintAppToken`, `portal.createAuthorizationCode` and
`portal.refresh` answer `LEGAL_ACCEPTANCE_REQUIRED`; `isLegalAcceptanceRequiredError` reads it.

- **A browser game on its own domain** changes nothing for sign-in: Studio's `/authorize` asks
  for both. A refresh refused this way cannot succeed on retry, so send the player back through
  `portal.signIn`. That also happens when a required document gets a new version.
- **A first-party page or a client outside a browser** shows its own two checkboxes, linking
  each document, then calls `client.auth.recordPlayerConsents({ acceptLegal: true,
  attestAgeOfMajority: true })` before minting. `client.auth.playerLegalAcceptance()` says
  whether that is still needed. Call it only for a player who ticked both boxes: it records
  their agreement.
- `client.auth.register` takes `acceptLegal` and `attestAgeOfMajority`. A browser request must
  send both `true` or it is refused before any account exists. A request with no browser origin
  may omit them and record them later.

The schema is cks-game-api `dev`'s after #437 (`npm run schema:sync:paths`, then
`npm run codegen`).

## 18.3.0: a game answers the page-held host calls

No API change. `createGridHostCalls` takes a `local.page(fn, args)` hook for the calls only the
page can answer: the player's input (`input_axes`, `input_look`, `input_key`), the player's own
body (`pose_get`, `pose_set`, `pose_release`, `teleport_request`), mod-owned actors
(`actor_spawn`, `actor_pose`, `actor_despawn`), the scene (`scene_catalog`, `scene_instances`),
presentation (`avatar_appearance`, `avatar_state_set`, `voice_set`, `video_set`) and the player's
own sends (`send_client_event`, `events_poll`, `send_text`, `send_actor_message`,
`send_channel_message`). Without the hook each is refused as not offered, as before. `clock` is
answered locally. The host catalog lists all of them as client calls the server refuses.

## 18.2.0: `ChunkStore` keeps the voxel edits it hydrated

No API change. Every voxel write but a chunk write-back lands only in the chunk's edit log: a
hub's or mod's `world.set_voxels`, `updateVoxel`, and realtime voxel updates. Since ck-api
`dev/v2.33.0` (cks-game-api #445) `getChunk` returns each recorded edit as a `voxelStates` entry
with its type, over a stored `voxels` that holds none of them. `ChunkStore` applies them when it
hydrates a loaded chunk: set `hydrateVoxelStates: true` unless you configure a
`voxelStateCodec` (the-construct does since construct 0.3.6), or a reload shows none of them.
(OI-2026-10-02-006)

- `ensureAround` no longer applies a chunk it has already loaded when the bulk load returns it
  again: the cube around a new center overlaps the old one, and the stored `voxels` put back
  over the cache wiped the hydrated edits (a hub's block vanished the moment the player crossed
  into a new chunk) and every realtime merge, and the chunk was never hydrated again. To load a
  chunk afresh, `pruneBeyond` it first, or call `hydrate(coord)`.
- `hydrate` puts the entries on a chunk stored with `voxels: null` (a zero grid under them); it
  used to drop their types. An entry without a state clears the state cached at its voxel, as a
  realtime merge without one does.

## 18.1.0: open grids, and where a connect token may go

Additive, except that `client.exec.connect` refuses a gateway it would once have dialed (below).
The two grid calls need a game API with cks-game-api #436 (ck-api `dev/v2.31.0`); nothing else
calls them.

- `client.gameApps.setOpenPermissions({ appId, gridId, permissionKeys })` (also
  `client.admin.grids`) opens a grid to every player with active access to the app: it replaces
  the keys the grid grants each of them, within its limits, and players who gain access later get
  them too. An empty `permissionKeys` closes it; `openPermissions(appId, gridId)` reads them. Both
  need `manage_apps`. Since #436 the most specific grid covering a chunk decides who may build
  there, so a zone nested in the world grid that everyone should build in must grant
  `update_voxel_data` itself. `BAD_REQUEST` refuses the world grid (open already), the four
  player-code keys, a key that is not an active grid key, and a 33rd open grid in one app.
  (OI-2026-09-30-007)
- `client.exec.connect` and `connectAsDeveloper` send the connect token only to a gateway that
  `execGatewayRefusal(gameApiUrl, gatewayUrl)` passes: `ws:` or `wss:`, `wss:` whenever the game
  API is `https:`, no credentials in the URL, and on the estate of the game API or of this
  release's default origin, as `BinaryRelayTransport` holds a reconnect directive to its estate.
  A loopback game API may name a loopback gateway (ck-exec's local cluster). Any other gateway is
  never dialed: the attempt fails `Unavailable` ("refusing the gateway …"), and a reconnect asks
  the game API again. `ExecConnection.open(gatewayUrl, token)` still dials what it is given.
  (OI-2026-09-30-010)
- A gateway's refusal of the connect token is `Denied` again under Node's `ws` package. Since
  ck-exec 0.10.0 a gateway answers the upgrade `HTTP 401` with the reason as its body, which
  `connect` now reads: `Denied: the gateway refused the connection (HTTP 401: <reason>)`.
  `HTTP 429` (a player past 16 sessions to one app through a gateway, or a gateway past its
  total) is `Unavailable` with its reason. A browser, and Node's built-in WebSocket, cannot read a
  refused upgrade, so there both stay `Unavailable`. A gateway before 0.10.0 closed with 4401,
  which is `Denied` everywhere, now for a call in flight when it closes as well.
  (OI-2026-09-29-002)
- `schema.gql` and the generated types are cks-game-api `dev`'s after #436.

## 18.0.4: a refused chunk write-back is dropped, and the wilderness setting

The P3 W5 security review's notes for the SDKs. The game API now refuses `updateChunk` with
`FORBIDDEN` for a player without edit permission on the chunk (someone else's claimed plot, a safe
zone) and while the app's wilderness is closed (cks-game-api #434, ck-api `dev/v2.30.0`).

- `ChunkStore` no longer retries a write-back forever. A write the server refuses (`FORBIDDEN`,
  `SCOPE_MISSING`, `BAD_REQUEST`, `BAD_USER_INPUT`, `NOT_FOUND`, `extensions.retryable: false`, or
  HTTP 400/403/404/413/422) is dropped after one attempt. One that can clear (`PLATFORM_BUSY`, a
  network drop, a timeout, a server error) is tried five times, 0.7 s, 1.4 s, 2.8 s and 5.6 s
  apart, then dropped. A dropped chunk keeps its local voxels and is no longer `dirty`.
- `ChunkStore.onWriteBackFailed(listener)` reports each dropped write-back as a
  `ChunkWriteBackFailure` (`chunk`, `coord`, `error`, `reason: 'refused' | 'exhausted'`,
  `attempts`). The store does not undo the edit: undo it, or prune the chunk and load it again.
- `ChunkStore.flush()` waits out the backoff and resolves with the write-backs it dropped
  (it resolved with nothing before, and looped forever on a refusal).
- `App.wildernessWritesOpen` is selected by `apps.app`, `appBySlug`, `forOrg`, `myApps`, `create`
  and `update`; `apps.update(appId, { wildernessWritesOpen: false })` closes the wilderness
  (`manage_apps`). The marketplace listings do not select it. Selecting it needs a game API with
  #434.

## 18.0.3: a player takes back their consent and their trust

Additive (OI-2026-09-28-001). It needs a game API with cks-game-api #431 (ck-api
`dev/v2.28.0`) for the two new calls; nothing else calls them.

- `client.exec.revokeClientModConsent(appId, modId)` takes back the player's consent to one
  CLIENT half, whatever hash they consented to (true when they had). While they trust its author
  on the grid it is still served to them.
- `client.exec.revokeAuthorTrust(appId, gridId, authorId)` stops trusting an author on a grid and
  takes back the player's consent to each of their CLIENT halves there (true when anything was
  taken back). It works from anywhere, not only inside the grid.
- `ExecClientHalves.revoke(modId)` stops a running CLIENT half and takes back the player's
  agreement to it: the consent, and when it ran through trust, the trust as well, consenting
  instead to the author's other running halves so those keep running. `forgetAuthor(authorId)`
  stops every CLIENT half of the author on the grid and takes the trust back. What was taken back
  is not asked about again on the grid until it changes; a new visit asks again. The runner's
  `exec` needs the two calls for these (`client.exec` has them); a stop for either reason is
  `'revoked'` (`ExecClientHalfStopReason`).

## 18.0.2: a CLIENT half holds to the page's rules

The P3 W5 security review of the clients. A CLIENT half is another player's code in your
player's browser; these close what it could reach that its consent never covered. Nothing else
changes, and no schema change.

- **`grid_permission_check` answers only for the code-permission keys**
  (`GRID_PERMISSION_CHECK_KEYS`: `write_server_code`, `run_server_code`, `write_client_code`,
  `run_client_code`) and refuses any other key as one the page cannot answer. It used to answer
  false, which a half could not tell from "not held": a game knows no other key for a grid.
- **A half's spatial and channel sends go out as an actor uuid the page derives**
  (`clientHalfActorUuid(gridId, name)`, 32 hex characters) from the one it names
  (`uuidHex`) or from `actorUuid`. It used to send as whatever uuid it named, the player's
  avatar or another player's included. The old all-zero default is gone.
- **`voxel_set`** takes a voxel inside its chunk (`voxelX/Y/Z` integers 0-15) and a type 0-255,
  on both the game's `local.setVoxel` and the API path; anything else is refused.
- **The broker refuses a call that names its chunk a second way** (`chunk`, `chunk_x`,
  `chunk_y`, `chunk_z`, and `chunkX/Y/Z` on a read). It checks `x`/`y`/`z` (reads) or
  `chunkX`/`chunkY`/`chunkZ` (`voxel_set`, `emit_spatial`); a game router must use those.
- **The glue bounds what it copies out of a module** before the copy: a host-call request over
  `GLUE_HOST_CALL_REQUEST_MAX_BYTES` is answered `request_too_large` unread, `state_set` refuses
  a blob over `GLUE_STATE_MAX_BYTES` (1 MiB; it returns 1), and a `handle_invoke` reply over
  `GLUE_INVOKE_REPLY_MAX_BYTES` (256 KiB, `PLAYER_CODE_INVOKE_MAX_BYTES`) fails the invoke.
- **`modClientArtifactBytes` refuses a summary whose `hostFunctions` are not all names**, as
  CrowdyCPP does.
- **The agent's draft tests need the player's OK on the page.** On ck-exec a draft test deploys
  the project's mod to the grid like a live deploy (players there who trust you run its CLIENT
  half), so `StudioDshBridge` asks `confirmLiveDeploy` for `studio.draftTest` too, with
  `mode: 'draft'`, and refuses it without the hook. The pane words the question for a draft.
- **Crowdy Studio stops a preview that finished starting after Stop**, a new run or a project
  switch; it used to keep running unseen.

# 17.14.0 ck-exec CLIENT halves

Dev-tier preview (cks-game-api #422, P3 W1). **The release needs a game API that has #422:**
the build and listing documents now select `ExecBuild.kind`, the artifacts' capability fields
and the listings' `client*` fields, which an older API refuses as a validation error. Deploy
the API first.

A mod can carry a **CLIENT half**: browser WASM from one `crowdy-client-sdk` crate, built on
the platform, attached to the mod and served by its grid to visitors who consent to it or
trust its author. It replaces the legacy grid-attached client mods, which keep working until
18.0.

- **`client.exec`**: `modClientBuild(appId, crate)` (a build of `kind` `client`; poll it with
  `modBuildStatus` / `waitForModBuild`), `modClientDeploy(appId, gridId, name, buildId)` →
  `ExecModClient`, `modClientDelete(appId, gridId, name)`, `gridClientMods(appId, gridId)` →
  `ExecGridClientMod[]` (with `capabilitySummary` and `authorCapabilitySummary` parsed beside
  the JSON), `consentClientMod(appId, modId, capabilityHash)`, `trustAuthor(appId, gridId,
  authorId, capabilityHash)`, `modClientArtifact(appId, modId)` and
  `modClientArtifactBytes(appId, modId)`, which decodes the module, recomputes its SHA-256 and
  refuses bytes that differ from `digest` (or a CLIENT ABI other than
  `EXEC_CLIENT_ABI_VERSION`, 0, or a capability summary that does not parse) with a
  `CrowdyProtocolError`. Errors are the API's: a stale
  hash is `CONFLICT`, every artifact refusal `NOT_FOUND`, more than 12 fetches a minute per
  player and mod `RATE_LIMITED`.
- **Types**: `ExecBuild.kind`; `ExecBuildArtifact` (`capabilitySummaryJson`,
  `capabilitySummary`, `capabilityHash`, `tickIntervalMs`, null for a ck-exec module);
  `ExecModListing.clientDigest`, `clientCapabilitySummaryJson`, `clientCapabilitySummary`,
  `clientCapabilityHash`, `clientTickIntervalMs`; `ExecClientCapabilitySummary`,
  `ExecModClient`, `ExecGridClientMod`, `ExecModClientArtifact`, `ExecModClientArtifactBytes`.
- **`ExecClientHalves`**, the exec twin of the-construct's `runConsentedGridMod` and
  `ClientModLifecycle`: tell it the grid (`enterGrid`) and `refresh()` on a cadence. It lists
  the grid's CLIENT halves, stops the ones removed or changed (keyed by `modId`, `digest`,
  `capabilityHash` and tick interval), asks the player once per author (`trustAuthor`) or per
  CLIENT half (`ask: 'mod'`, `consentClientMod`) through your `confirm`, fetches and caches by
  digest, and runs each in a `PlayerCodeBroker` with its fuel budget and tick interval.
  `NOT_FOUND` holds a CLIENT half back 15 s, `RATE_LIMITED` 60 s, refused bytes and a tripped
  circuit 60 s.
- **`PlayerCodeBroker({ engine: 'ck-exec' })`**: the allowlist is `EXEC_CLIENT_HOST_CALLS`,
  exactly what crowdy-client-sdk calls (the client catalog less the Game Model group,
  `sessions_list` and `grid_state_*`); the glue offers exactly `EXEC_CLIENT_ABI_IMPORTS`
  (`ck::{log,now_ms,state_get,state_set,host_call}`, `wasi_snapshot_preview1::random_get`),
  refuses a module without the `ck_fuel` meter, and the broker will not start without
  `artifactHash`, `fuelPerDispatch` and `consentedHostCalls` (the served capability summary's
  `hostFunctions`). A call outside that summary is refused too: the build derives the summary by
  scanning the module for host-call names, so a name assembled at run time would otherwise reach
  calls the player never consented to. The default, `'player-compute'`, is unchanged for legacy
  CLIENT modules. `startGridMod`'s wasm spec takes `engine` and `consentedHostCalls` too.
- **Crowdy Studio's CLIENT target runs on ck-exec** with `serverEngine: 'ck-exec'` (the
  default when `exec` is present). A new CLIENT target starts from a `crowdy-client-sdk` crate
  (`createCrowdyStudioStarterProject({ engine: 'ck-exec' })`); Test draft and Deploy live
  build it with `modClientBuild`, attach it to the project's mod with `modClientDeploy`,
  consent to it as its author and preview the served module with `engine: 'ck-exec'`. A
  CLIENT-only project's CLIENT half rides the mod named for its CLIENT module (which must be a
  mod name now): with no such mod of the player's on the grid, Studio deploys the mod starter's
  server half under it first and says so in the build log, switches it on, and Stop switches
  it off. The preview loads only for a player with `run_client_code` standing in the grid. On
  ck-exec no target reads player compute usage, and the pairing select is disabled.
- **`CrowdyStudioMods` gained `myMods`, `modClientBuild`, `modClientDeploy`,
  `consentClientMod` and `modClientArtifactBytes`.** Pass `client.exec`; a hand-written
  stand-in needs those too.
- **Superseded** (`@deprecated`, removed in 18.0): `marketplace.gridClientMods`,
  `consentGridClientMod`, `trustGridAuthor`, `clientArtifact`, `clientArtifactBytes`, and
  `GridScope.compute.clientMods`.

Existing CLIENT projects keep their files: a CLIENT crate on `crowdy-compute-sdk` is refused on
ck-exec before any build, with what to change (the SDK line becomes
`crowdy-client-sdk = "0.1.0"`, `crowdy_compute_sdk` becomes `crowdy_client_sdk`; the host
calls are the same less the Game Model, sessions and grid state, `grid_state_get` /
`grid_state_set`, which a mod's server half holds now). `serverEngine: 'player-compute'` keeps
both targets on legacy player compute until 18.0.

**Studio's CLIENT target on ck-exec needs ck-api `v2.25.1` or later.** `v2.24.0` and
`v2.25.0` refuse to save a `crowdy-client-sdk` crate in a Studio project
(`CROWDY_STUDIO_MANIFEST_INVALID`, cks-game-api #425), so a CLIENT project cannot start there;
the SDK calls themselves need only `v2.24.0`.

# 17.13.0 ck-exec observability

Additive (dev-tier preview; ck-api `v2.22.0`).

- `client.exec.endpointStats(appId, { nodeType?, sinceMinutes? })` returns `ExecEndpointStat[]`:
  per endpoint (`nodeType`, `method`) the `calls`, `appErrors`, `busy`, `denied`,
  `deadlineExceeded`, `otherErrors` and `timedCalls` in the window, `latencyMsAvg` /
  `latencyMsMax` over the timed calls (null when none), and `firstMinute` / `lastMinute`.
- `client.exec.logs(appId, { flow })` keeps only one flow's lines, and every `ExecLogLine` (also
  from `modLogs`) has `flow`: 32 lowercase hex digits, or null for a line written outside a call.
- `ExecVersion` has `manifestJson` and `manifest` (`ExecManifest`, parsed), null when the
  version's row is gone; a type's spawn seed is its size, `seed_bytes`.
- `CrowdyExecError.rateLimited` and `retryAfterMs`. A call over a player's limit (120 per 10 s
  per app and host) is refused `Busy` with a message starting `rate limited`; wait
  `retryAfterMs` before calling again. The SDK never retries `Busy` itself.
- Now exported: `ExecLogLine`, `ExecLogsOptions`, `ExecInstance`, `ExecVersion`, `ExecManifest`,
  `ExecManifestType`, `ExecAppStatus`, `ExecEndpointStat`, `ExecEndpointStatsOptions`.

# 17.13.0 Crowdy Studio runs SERVER code on ck-exec by default

**A behaviour change for embedders; no signature is removed.** The platform is switching
legacy player compute off (the game API answers `ENGINE_SWITCHED_OFF`, HTTP 503), so
Crowdy Studio's SERVER target moves to ck-exec mods, which 17.12.0 offered behind an option.

- **`createCrowdyStudioEmbed` / `CrowdyStudioEmbed`: `serverEngine` now defaults to
  `'ck-exec'` when `client.exec` is present** (every `CrowdyClient`), and to
  `'player-compute'` only for a client without it. An embed that passed nothing now builds
  and runs SERVER code as the grid's mod. Pass `serverEngine: 'player-compute'` to keep the
  legacy engine until it is removed; `'ck-exec'` without `exec` is refused at mount, as
  before.
- **`CrowdyStudioController` and `mountCrowdyStudio` take `serverEngine` too**, defaulting
  to `'ck-exec'` when `mods` is given and `'player-compute'` otherwise, so a direct caller
  keeps its engine until it passes `mods: client.exec`. `CrowdyStudioState.serverEngine`
  says which one runs.
- **On ck-exec a new project's SERVER target is the mod starter.** `createProject` asks
  `mods.modStarter(appId)` (`execModStarter`) and uses its `ckx-sdk` crate, with the Cargo
  package named for the project, instead of the legacy `crowdy-compute-sdk` crate; the
  server module name fits a mod's (48 characters, starting with a letter) and a full-stack
  project records pairing `NONE`, since a mod has no client pairing. The CLIENT crate is
  unchanged (17.14.0 moved it to ck-exec). `createCrowdyStudioStarterProject` takes the
  starter as `modStarter`.
- **Invoke, Logs, Runs and the budget line follow the engine.** On ck-exec, Invoke calls the
  mod's endpoint (default `state`, JSON arguments sent as MessagePack) over one exec
  connection, and the result is the decoded reply as JSON; Logs are the mod's `ctx.log`
  lines (`modLogs`; `CrowdyStudioRun.level` is set and the text is `errorMessage`); Runs
  stay empty (ck-exec keeps no run records); player compute usage is read only for a
  project with a CLIENT target, whose compiles still spend it.
- **`CrowdyStudioMods` gained `modStarter`, `modLogs` and `connect`.** Pass `client.exec`;
  a hand-written stand-in needs those three as well.
- **The mod build sends only the crate**: `Cargo.toml`, `README.md` and `src/**/*.rs`
  (grid program assets such as `programs/*.js` stay in the project), and a server module
  name that starts with a digit builds as crate `mod-<name>`.

Existing projects keep their files: a project created on the legacy engine has a
`crowdy-compute-sdk` crate, which a mod build refuses. Start a new project, or replace its
SERVER `Cargo.toml` and `src/lib.rs` with the mod starter's.

# CrowdyJS v17.7 — grid-scoped parity (DN-10)

**Additive, plus one coordinated break.** `17.7.0` (2026-09-22), on top of the
ck-api grid-parity release (grid channels, the grid event bus, grid sessions,
grid-scoped tokens). Everything that worked keeps its signature, with one
exception: **the crowdy-dsh bridge protocol is now v4**, so this CrowdyJS
pairs with `@crowdedkingdoms/crowdy-dsh` 0.4 and later (a v3 worker's frames
are dropped, as every version bump does).

- **`client.grid(appId, gridId, box?)`** returns a `GridScope`: one grid,
  bound once. `channels` (list/create/join/leave/send grid channels),
  `sessions` (games hosted inside the grid), `model` (the player-tier Game
  Model), `compute` (deploy/invoke/client mods) and `send` (replication whose
  ORIGIN is in the grid; reach follows `distance`). World helpers check the
  chunk locally and throw `GridScopeError` before any request.
- **`client.grids`**: `mintToken` (a grid-scoped token: an app token narrowed
  to one grid, deny-by-default on the server), `createChannel`, `channels`.
- **New subpath `@crowdedkingdoms/crowdyjs/grid-program`**: run
  player-authored JS with the full SDK inside a grid. The program calls
  `createGridProgramClient(port)` in a network-less sandbox; the page calls
  `hostGridProgram({ port, scope, graphqlUrl, graphqlWsUrl })`, which relays
  HTTP and realtime with a grid token the program never sees.
- **`startGridMod` / `createGridHostCalls`**: one runtime for Rust CLIENT
  mods and JS grid programs. `createGridHostCalls` answers every CLIENT host
  call in the platform catalog through CrowdyJS, confined to the grid, with
  optional game-local fast paths.
- **Player runtime.** The broker allowlist is built from the platform host
  catalog (`GENERATED_HOST_CATALOG`, drift-checked against ck-api's
  `compute-toolchain/host-catalog.json`). New client host calls:
  `emit_channel`, `emit_event` (a page-local grid event bus; `on_event`
  delivery), `container_get_batch`, `edge_add`/`edge_delete`,
  `sessions_list`, `avatar_state_get`. `PlayerCodeGridBounds` takes an
  optional `gridId` (the event bus and self-grid checks need it), and the
  broker takes `moduleName` and `eventBus`.
- **Sessions**: `GmSession.gridId`; `gameModel.sessions({ gridId })`;
  `createSession({ gridId })` (grid owner only).
- **Transport seams**: `createCrowdyClient({ fetch, realtime: { webSocketImpl } })`.
- **crowdy-dsh bridge v4**: `grid.context`, `grid.programRun`,
  `grid.programStatus`, answered through a new optional
  `CrowdyStudioDshHost.grid` capability.

# CrowdyJS v17.5 — bulk containers

**Additive.** `17.5.0` (2026-09-16), on top of ck-api `v2.6.0`. Tracks the cks-game-api bulk-container changes of 2026-09-16
(paging in SQL, seed `bindingKey`, `gameModelContainerStates`, `seedFromApp`,
container-type `scope`). Every existing method keeps its signature.

- **`containers` pages for real, and the page has bounds.** An omitted `limit`
  now returns **200 rows** (it used to return every row of the type) and the
  maximum is **1,000** (`BAD_REQUEST` above). Without `where` the page is read
  in SQL; with `where` the predicates are evaluated after a bounded read
  (10,000 rows of the type; larger is refused). **A caller that relied on an
  unbounded list must page.** `bindingKey` is now forwarded by the SDK's
  document — before this the get-by-key read documented on `containers` was
  silently a full list.
- **New: `containerStates({ appId, containerIds })`** — the bulk twin of
  `containerState`, up to 500 ids, same per-row visibility, missing ids
  omitted, input order kept.
- **`seed`: a container may name its own `bindingKey`** (on a type that is
  `instantiableBy: 'admin'` or carries a `bindPolicyJson`; not beginning with
  `seed:`), so a runtime `gameModelEnsureContainer` later resolves the same
  row; a caller-keyed row that already exists is adopted only if its owner
  matches, so a player who claimed the key first is never written onto; at
  most **1,000 containers per call**, all-or-nothing. A container type
  may declare **`scope: 'app' | 'session'`**.
- **`createSession({ seedFromApp: { typeNames, initialState? } })`** stamps
  the app's keyed template rows of those types into the new session in the
  creation transaction (at most 2,000 rows; refused above). `GmSession` gains
  `seededContainerCount` (create response only; null on later reads); the
  `created` event payload carries `containersSeeded`. Template types must be
  `instantiableBy: 'admin'` or carry a `bindPolicyJson`; a plain member type
  and an `'app'`-scoped type are refused. **Retention is opt-in and touches only the stamped copies:** on a
  tier whose operator sets `GM_SESSION_CONTAINER_RETENTION_DAYS` (default 0,
  off), the copies of a session ended that long ago are dropped; rows a player
  ensured or an admin created in the session are never purged, so a session
  used as a save keeps its hand-made state either way. A tier that runs
  `seedFromApp` with retention off keeps every copy of every match.
- **`kit.matches.create({ seedFromApp })`** forwards the same option.
- **`GmContainerType.scope`** is read back; on an `'app'`-scoped type,
  `createContainer` / `gameModelEnsureContainer` with a `sessionId` are refused
  with `CONTAINER_TYPE_APP_SCOPED`; flipping a type to `'app'` is refused while
  it holds session-scoped rows.

# CrowdyJS v17.4 — the session system

**Additive.** `17.4.0` (2026-09-14), on top of ck-api `v2.3.0`. Tracks cks-game-api
PR #319 (the game-model session system). Every existing session method keeps its signature and every
field it returned; the SDK adds what the server now knows about a session.

- **Roster, admission, capacity, host.** `GmSession` gains `admission`
  (`open | locked | closed`), `maxParticipants`, `participantCount`,
  `hostUserId`, `hostTerm`, `revision`, `endedAt`, `endReason`, `createdAt`.
  `createSession` accepts `maxParticipants`, `admission`, `emptyTimeoutSec`,
  `presence` and `idempotencyKey`; `sessions` filters by `admission` and
  `hostUserId` and takes a `limit`.
- **New methods on `client.gameModel`:** `leaveSession`, `setSessionAdmission`,
  `transferSessionHost`, `endSession` (host or app admin; all accept
  `expectedHostTerm` and `idempotencyKey`), `sessionSnapshot`, `sessionEvents`,
  `sessionInspect` (`manage_apps`), and the `sessionChanged` subscription
  (`{ appId, sessionId, afterRevision? }`; same handler shape as
  `containerChanged`). The contract is the player-count feed's: pull the
  snapshot, apply events above its revision, re-pull on a gap.
- **Reconnection is a rejoin.** `joinSession` on a session you are in returns
  your row with `incarnation + 1`; the join result is now the full roster row
  (`state`, `incarnation`, `actorUuid`, `joinedAt`, `leftAt`, `leftReason`).
  **`leaveSession` requires that `incarnation`** — there is no "leave
  regardless", so a stale client can never remove the one that took over
  (`SESSION_INCARNATION_STALE`).
- **Presence is your actor — a behaviour change every consumer inherits from
  the server, with no SDK call involved.** A joined participant with no fresh
  Buddy actor in the app after the join grace window (60 s by default) is
  marked `left` / `presence_expired`, and a session nobody has been joined to
  for longer than its `emptyTimeoutSec` (5 min by default; `0` disables) is
  ended as `abandoned`. A client that only speaks GraphQL therefore drops out
  of a session it never replicates in. Pass `actorUuid` on join to bind
  presence to one specific actor (your own; 32-hex, the uuid you send on
  `udp.sendActorUpdate` / `session.self.uuid`). Do **not** pass the match kit's
  channel-ping uuid — it never spawns in Buddy.
- **Opting out: `presence: 'none'`.** A session created with
  `createSession({ ..., presence: 'none' })` is never judged by actor presence
  (`GmSession.presence` reports the mode; `sessionInspect` shows its rows as
  `presence: 'none'`). Its roster's only exits are `leaveSession`, `endSession`
  and the empty timeout once everyone has left. Use it for turn-based play that
  talks GraphQL and channel pings and never replicates an actor. The mode is
  fixed at creation. A GraphQL-only session that does **not** opt out empties
  after the grace window and is abandoned after the timeout.
- **The `sessionChanged` push is per datacenter; the events table is the
  record.** A revision committed in one region wakes subscribers on that
  region's API replicas; `sessionEvents(afterRevision)` (and the replay the
  subscription performs on connect) reads the durable rows, so a subscriber
  reconnecting anywhere catches up from the revision it last saw.
- **Error codes added:** `SESSION_FULL`, `SESSION_LOCKED`, `SESSION_CLOSED`,
  `SESSION_ENDED`, `SESSION_NOT_PARTICIPANT` (the caller is not joined),
  `SESSION_TARGET_NOT_PARTICIPANT` (the user named to `transferSessionHost` is
  not joined), `SESSION_INCARNATION_STALE`, `SESSION_HOST_TERM_STALE` — all on
  `CrowdyGraphQLError.code`.
- **`kit.matches` creates its session with `presence: 'none'`, and now leaves
  and ends it.** A kit match is GraphQL plus channel pings; its `actorUuid` is
  only the channel-message sender id and never spawns in Buddy, so under the
  default mode every player would be expired after the grace window. Because
  nothing expires anybody, the kit owns the roster's exits: new
  **`kit.matches.leave(match, incarnation?)`** calls `leaveSession` with the
  incarnation the kit remembered from `create` / `join` on this instance (or
  the one you pass) and leaves the match channel; **`finish()` now ends the
  backing session** (`endSession`, reason `completed`) after a successful
  `end_match`, so the roster is cleared and the session's events become
  eligible for retention; the result's `sessionEnd` says what happened to the
  session (`'ended'`, `'already_ended'` for a replayed finish, `'forbidden'`
  when `end_match` admitted the caller but the session did not -- the creator
  who already left, or the app's elected host who is not the session host -- in
  which case the match is finished, the session is not, and nothing is thrown;
  an app admin can `gameModel.endSession` it). An emptied
  session that was never finished is abandoned by the empty timeout. Otherwise the kit is unchanged: capacity
  still lives in `MatchMeta` and join does not bind an actor. Moving it onto
  session capacity / admission / host is a later, separate change.

No removals.

# CrowdyJS v17.3 — "Create repository on GitHub" (additive)

`17.3.0` (2026-09-14), tracks ck-api `v2.3.0`. Nothing removed. (Written as 17.1 while two other trains — binary-relay bundles 17.1.0 and Crowdy Games hosting 17.2.0 — shipped ahead of it.)

- `CrowdyStudioGitHubStatus.repositorySelection` (`'all' | 'selected' | null`):
  which repositories the installation covers. A repository created on GitHub
  afterwards must be added to a `selected` installation (at `installUrl`)
  before it can be bound.
- `githubNewRepositoryUrl({ owner, name, description, visibility })` and
  `githubRepositorySlug(name)` (from `@crowdedkingdoms/crowdyjs/crowdy-studio`):
  GitHub's `/new` page prefilled for a mod. The App holds installation tokens
  only and cannot create a repository; this makes the modder's own click a
  short one.
- `CrowdyStudioController.createGitHubRepository()` opens that page for the
  open project (connected login as owner, project name slugged, private) and
  sets `state.githubPendingRepo` to `owner/name`; the card's bind input is
  prefilled with it and defaults to PUSH_PROJECT. On a game's app token the
  bind itself still happens in hosted Studio; the message says so.
- ck-api `v2.3.0`: a PUSH_PROJECT bind seeds a `README.md` (project name,
  description, layout) when the branch has none, and treats an empty-tree
  branch as empty rather than missing.

# CrowdyJS v17.2 — publish to Crowdy Games; sign-in under the shell

**Additive.** `17.2.0` (2026-09-14). Tracks ck-api `v2.1.0` (third-party game
hosting). Nothing existing changes shape; two things are new.

- **`client.hosting`** wraps the hosting surface: `claim({ appId, slug? })`,
  `beginPublish({ slug, files })`, `completePublish(slug, publishId)`,
  `abandonPublish`, `setEnabled`, `publishes`, `mine`; public `game(slug)` and
  `listed()`; operator `all()`, `setListing`, `takeDown`. Every mutation needs an
  identity session with `manage_apps` (a game's own app token is refused, so a
  bundle can never publish a replacement for itself). The new subpath
  `@crowdedkingdoms/crowdyjs/hosting` exports `publishDirectory(client, { dir,
  slug })` and `manifestForDirectory(dir)` for Node; the root exports
  `uploadPublishFiles` for a browser tool.
- **`EmbeddedHost`** (`client.embeddedHost`, `CrowdyClientConfig.embeddedHost`):
  when a game published to Crowdy Games runs inside the first-party shell's
  iframe, `portal.signIn` learns the shell's return URL and Studio origin from a
  `crowdyjs:host-hello`, uses the shell's page as `redirect_uri`, and asks the
  shell to navigate (`crowdyjs:navigate`) instead of `location.assign`. The PKCE
  verifier stays in the game origin; `handleSignInCallback` is unchanged because
  the shell relays `?code=&state=` into the iframe's `src`. Detection is a bounded
  hello (1.5 s) and falls back to the ordinary flow, so a self-hosted or
  top-level game behaves exactly as before. `SignInParams.embedded: false` or
  `createCrowdyClient({ embeddedHost: false })` opts out. `portal.embeddedHostInfo()`
  tells a game whether it is under a shell.

No removals. Error codes added: `CONTENT_HOSTING_DISABLED`,
`HOSTED_SLUG_UNAVAILABLE`, `HOSTED_MANIFEST_INVALID`, `HOSTED_PUBLISH_INCOMPLETE`,
`HOSTED_GAME_TAKEN_DOWN`.
# CrowdyJS v17.1 — binary-relay sends are bundled

**Nothing removed.** `17.1.0` (2026-09-13). On the binary relay
(`realtime.binaryTransport: true`) the SDK now packs the messages you send
within a short window into one `MESSAGE_BUNDLE` datagram
(`[2]{[u16 LE len][signed message]}…`) — the framing the server has always
used for its notifications, accepted on the uplink by Buddy v0.27.0+. Every
member is still a complete, individually HMAC-signed message; only the datagram
boundary moved. The GraphQL transport is unchanged: the proxy signs one message
per mutation and cannot bundle.

What changes for you:

- **Nothing in the send API.** `client.udp.sendActorUpdate` and friends resolve
  as before. On the relay a send is now *accepted* rather than *transmitted*
  when it resolves: the frame leaves when `realtime.bundleWindowMs` (default
  `1`) has passed since the bundle opened, when the next message would not fit
  in 1232 bytes or the 32-member cap, on `client.udp.flushSends()` (also
  `client.realtime.flushSends()`), after every `...AndWait` send, and on
  `disconnect()`. A lone message is sent unwrapped, so a client sending one
  message per window puts the same bytes on the wire it always did. A message
  too large to travel inside any bundle (> 1229 bytes) goes alone.
- **Frame-end flush.** A game loop that sends several updates per frame gets
  them in one datagram with no extra latency by calling
  `client.udp.flushSends()` at the end of the frame; otherwise the window
  timer flushes within ~1 ms. In a **hidden tab** (`document.visibilityState
  === 'hidden'`) browsers clamp timers to a second or more, so the transport
  flushes every send immediately there — a background heartbeat leaves as it
  always did.
- **Counters.** `client.realtime.binaryRelayStats()` returns
  `{ messagesSent, framesSent, bundlesSent, bytesSent, messagesDropped }`
  (`framesSent <= messagesSent`; `messagesDropped` counts members that were
  pending when the socket went away inside the window). A local diagnostic,
  not a bill.
- **Server requirement.** The replication server must unpack client bundles
  (Buddy v0.27.0+). Against an older server set `realtime.bundleSends: false`;
  otherwise any two messages sent within a window are dropped together.
- **Opt out.** `realtime: { bundleSends: false }` is exactly the 17.0
  behaviour: one BINARY frame per message, sent synchronously.

Added:

- `RealtimeConfig.bundleSends` (default `true`), `RealtimeConfig.bundleWindowMs`
  (default `1`).
- `client.udp.flushSends()`, `client.realtime.flushSends()`,
  `client.realtime.binaryRelayStats()`.
- `BinaryRelayTransport.flushSends()` / `.stats()`; `BinaryRelayConfig.bundleSends`
  / `.bundleWindowMs`; `BinaryRelaySendStats`.
- Wire helpers: `packMessageBundle`, `bundleSizeOf`, `BUNDLE_HEADER_BYTES`,
  `BUNDLE_LENGTH_PREFIX_BYTES`, `RELAY_MAX_BUNDLE_MEMBERS`,
  `RELAY_MAX_BUNDLE_MEMBER_BYTES`.

CrowdyCPP 0.36.0 ships the same behaviour natively (`Config::bundleSends`,
`Config::bundleWindowMs`, `Connection::flushSends()`, `Stats::bundlesSent`).

# CrowdyJS v17.0 — a bound GitHub repository is the working tree; GitHub stays optional

**Breaking.** `17.0.0` (2026-09-13). Tracks ck-api `v2.0.0`. A project is
`source: 'STUDIO'` until its owner binds a repository and `'GITHUB'` while one
is bound; `createProject` is unchanged and GitHub is never required. While
bound, the project's `files` are the **server's mirror** of the rust under the
repository's layout roots at `github.sha`, read exactly as before — and every
save commits: `client.crowdyStudio.saveProject` sends each changed file as its
own `crowdyStudioGitHubPutFile` (or `DeleteFile`) carrying
`expectedCommitSha`, then metadata as a plain project save with no file
bodies. A stale commit is the same `CrowdyStudioRevisionConflictError` the
editor already recovers from. The controller does not know which path ran.

Removed:

- `CrowdyStudioGitHubTransport.setAutosave`, `CrowdyStudioGitHubStatus.autosave`
  and the "Also push autosaves" toggle: there is nothing to opt into, saves
  commit.
- `CrowdyStudioController.pushToGitHub`, `pullFromGitHub`,
  `setGitHubAutosave`, and the Push / Pull buttons on the card. Bind pushes
  (or takes) once; after that the repository is the tree.
- From `@crowdedkingdoms/crowdyjs/crowdy-studio` (the `github/sync` module):
  `parseCrowdyJson`, `layoutFromTree`, `resolveGitHubLayout`,
  `pullStudioFilesFromGitHub`, `pushStudioFilesToGitHub`,
  `mergeStudioFilesFromGitHub`, `studioFilesMissingOnGitHub`,
  `DEFAULT_FULL_STACK_CROWDY_JSON`, `GitHubLayout`, `GitHubFiles`. The SDK no
  longer parses `crowdy.json`; `client.crowdyStudioGitHub.layout()` is the
  only grammar. `studioFileToRepoPath` / `repoPathToStudioFile` remain, now
  taking the API layout.
- `DeployPlayerComputeInput.sourceFilesJson`, `sdkVersion`, `abiVersion`:
  `client.playerCompute.deploy` takes `projectId` (+ `commitSha` for a GITHUB
  project) and the server resolves the source. No client body is compiled.
- `crowdyStudioGitHubTree` returns `{ commitSha, entries }` rather than a bare
  list.

Added:

- `CrowdyStudioProject.source`, `.github` (`{ owner, repo, branch, sha }`);
  `CrowdyStudioProjectSummary.source`, `.github`, `.githubSha`.
- `CrowdyStudioGitHubTransport.bind({ …, initial })` — `'PUSH_PROJECT'`
  commits the project into the branch (refused with `GITHUB_REPO_HAS_FILES`
  when the branch already has rust under the roots), `'TAKE_REPOSITORY'`
  adopts the branch (refused with `GITHUB_REPO_EMPTY`). `refresh()` brings the
  mirror to the branch head after a push made elsewhere. `layout()`,
  `deleteFile()`. `putFile` / `deleteFile` take `expectedCommitSha`; the blob
  `sha` is optional (the server resolves it from that commit). `getFile` /
  `tree` / `layout` accept `commitSha`.
- `CrowdyStudioController.bindGitHubRepo(slug, initial)`, `refreshFromGitHub()`.
- `createCrowdyStudioEmbed` / `mountCrowdyStudio` `github?:` option for a host
  that holds an identity session (hosted first-party Studio). Games keep the
  default, `client.crowdyStudioGitHub` — the app-token client that plays. The
  API scopes every GitHub field to projects that token's user owns, so a game
  needs no identity session to author against GitHub, and a third-party game
  must never read one.
- `PlayerWasmModuleVersion.projectId`, `.sourceRevision`, `.githubCommitSha`.
- Bridge protocol **v3** (`CROWDY_DSH_PROTOCOL_VERSION = 3`): `DshProjectSummary`
  carries `source` / `githubSha`; `page.hello`, `page.project` and
  `page.saved` carry `source` / `githubSha`, and `page.project` fires whenever
  a bound project's commit moves (bind, refresh, save) so the worker's next
  write carries the current `expectedCommitSha`. `crowdy-dsh` `0.3.x` speaks
  v3; a v2 worker is refused by the frame guard.

Behaviour worth knowing:

- **17.0.1:** a bound save whose `expectedRevisionId` is older than the project
  the provider last returned is refused as `CrowdyStudioRevisionConflictError`
  before any commit. 17.0.0 rode the provider's own commit onto the branch in
  that case (found by the local end-to-end proof, not by a user).
- Bind, unbind and refresh refuse over unsaved edits and re-read the project
  afterwards (`reloadProject`), because `TAKE_REPOSITORY` and `refresh`
  replace its files and every path gives it a new `github.sha`.
- A multi-file save on a bound project is one commit per file. A stale race
  part-way through leaves the earlier commits on the branch and the project
  describing them; the conflict recovery re-reads and "keep my version"
  re-applies the remaining diffs against the new commit.
- `client.crowdyStudioGitHub` is `DATACENTER_ONLY` on the API: it must be the
  client that adopted the app's datacenter endpoint (the one that plays), not
  one pointed at the shared origin.

# CrowdyJS v16.0 — the Crowdy Agent dock is replaced by the in-browser DeepSeek Harness

**Breaking.** `16.0.0` (2026-09-11). Tracks the ck-api release that carries
the metered model endpoint (first dev release after `v1.98.0`): the 21
`crowdyStudioAgent*` session/run/lease/tool root fields this SDK used are gone
from that API, so a 15.x client loses its agent dock the moment it deploys,
whether or not the client upgrades.

Removed:

- `client.crowdyStudioAgent` (`CrowdyAgentGraphQLTransport`) and everything
  under `@crowdedkingdoms/crowdyjs/crowdy-agent`: `CrowdyStudioAgentController`,
  `CrowdyAgentToolRegistry`, `CrowdyAgentBrowserToolDispatcher`,
  `createCrowdyStudioAgentTools`, `CROWDY_AGENT_TOOL_REGISTRY_V1`, session
  resume, the `CrowdyStudioAgent.graphql` operations.
- The `agent` option of `mountCrowdyStudio` / `createCrowdyStudioEmbed`
  (`MountCrowdyStudioAgentOptions`) and the agent dock (`agent-dom-shell`).
- From `@crowdedkingdoms/crowdyjs/player-host`: `AgentControlLeaseManager`,
  `PlayerControlGate`, `AgentControlBanner`, `createPlayerHostAgentTools`.
  `PlayerHostAdapterV1`, its schemas, `CrowdyAgentError` and the preemption
  reason vocabulary stay (moved to `player-host/agent-errors.js` and
  `player-host/agent-types.js`).

Added:

- The `dsh` option of `mountCrowdyStudio` / `createCrowdyStudioEmbed`
  (`MountCrowdyStudioDshOptions`): `graphql`, `webBase`, `graphqlUrl`,
  `apiOrigin`, `getToken`, `persistScope`, `studioOrigin?`. `toggle` accepts
  `playerHost` (observe only) and `dshHost` (`captureFrame`, `describeView`,
  `clientLogs`).
- `@crowdedkingdoms/crowdyjs/crowdy-dsh`: `CrowdyStudioDshPane`,
  `StudioDshBridge`, `CrowdyStudioDshTransport` (`models`, `consent`,
  `setConsent`, `usage`; `modelBaseUrl` for `/v1/model`), the bridge protocol
  (`CROWDY_DSH_PROTOCOL_VERSION = 2`).
- `client.graphqlEndpoint`.
- `CrowdyStudioController.reloadProject()`; `dom-shell` takes a generic `dock`
  factory and an `onFixWithAi` hook.

Behaviour worth knowing:

- The harness runs in the player's browser and talks to the model through the
  tier's metered endpoint with the player's app token; usage is billed to the
  player's wallet by default, or the app's org wallet when its billing admin
  elected that. The token travels over the page/worker channel only and is
  never written to a seed file, the worker's filesystem or OPFS.
- A live deploy requested by the agent waits for the player to confirm in the
  pane (`confirmLiveDeploy` on `StudioDshBridgeOptions`); without that hook the
  request is refused.
- The agent iframe is same-origin (`BroadcastChannel`, OPFS) and carries
  `sandbox="allow-scripts allow-same-origin"`, which does not isolate it; the
  host's CSP on `/dsh/*` is the control. Serving the harness from its own
  origin over a `MessageChannel` relay is a tracked follow-up.
- Games ship the harness from the published `@crowdedkingdoms/crowdy-dsh`
  package (`dist/dsh-web/`), copied under a same-origin path at build time.

# CrowdyJS v15.11 — GitHub repositories for Crowdy Studio projects

**Nothing removed.** `15.11.0` (2026-09-09). Tracks ck-api `v1.96.0`.

- `client.crowdyStudioGitHub` (`CrowdyStudioGitHubTransport`): `status({appId, projectId})`,
  `connectUrl()`, `repos()`, `bind({appId, projectId, owner, repo, branch?})`,
  `unbind`, `setAutosave({..., autosave})`, `tree`, `getFile({..., path})`,
  `putFile({..., path, content, message, sha?})`. Reads and writes never name a
  repository; the game API resolves it from the project's bind and refuses a
  stale `sha` with `GITHUB_STALE_SHA`.
- `mountCrowdyStudio` / `CrowdyStudioController` accept `github` (the transport;
  `CrowdyStudioEmbed` passes `client.crowdyStudioGitHub` automatically). State
  gains `github`, `githubMessage`, `githubBusy`; methods `refreshGitHubStatus`,
  `connectGitHub`, `bindGitHubRepo`, `unbindGitHub`, `setGitHubAutosave`,
  `pushToGitHub`, `pullFromGitHub`.
- Autosave push is **opt-in per project** and off by default. Pull is explicit.
- `crowdy-studio/github/sync.js` exports the layout mapping helpers.

# CrowdyJS v15.10 — portal GitHub guard, Agent session resume

**Nothing removed.** `15.10.0` (2026-09-09). No ck-api version dependency.

- `portal.completeEntry(search?)` returns `null` without calling the API when
  the query has `github`, `installation_id`, or `setup_action`. A GitHub App
  install callback that lands on a game origin no longer overwrites the play
  token. Plain `?code=&state=` from hosted sign-in is unchanged.
- `CrowdyStudioAgentController.initialize()` lists sessions and reopens the
  remembered / most recent resumable session for the same app + project before
  calling `createSession`. Pass `sessionMemory` to control where the last
  session id is kept (defaults to `localStorage`). Closed or revoked sessions
  are never resumed. New exports: `pickResumableAgentSession`,
  `agentSessionMemoryKey`, `StudioSessionMemory`.
- Internal: agent error redaction and two path/slug helpers are linear scans
  with identical matches.

# CrowdyJS v15.9 — nearbyGrids, player_joined, bindPolicyJson

**Nothing removed.** `15.9.0` (2026-09-10). Tracks ck-api `v1.93.0`.

- `gameApps.nearbyGrids` lists overlapping grids (id + bounds). No permission
  keys and no impersonation `userId`. `nearbyPermissions` is unchanged.
- Codegen picks up `player_joined` (automations / compute `onEvent`) and
  `gameModelSeed` container upsert (`seed:<tempId>`).
- Studio ops return `bindPolicyJson` on container types. Authoring surface
  only — do not write live Titan Assault policies from the SDK.

# CrowdyJS v15.8 — Construct papercuts

**Nothing removed.** `15.8.0` (2026-09-09).

- `ChunkStore.setVoxel` without `state` **omits** `voxelState` instead of
  sending `''` (which the live `String!` schema refused). Pass `state` when
  you have one; ck-api is being changed to accept a missing/empty field.
- Studio starter `Cargo.toml` now lists `serde_json = "1"` next to
  `crowdy-compute-sdk` so `host_call` compiles.
- `PlayerCodeBroker` still ticks only when `tickIntervalMs` is set. The
  README minimal CLIENT example now sets it; the Studio embed already
  defaults `clientTickIntervalMs` to `1000`.
- `refreshGameplayToken` waits for in-flight `udp.sendActorUpdate` before
  disconnecting the old proxy. New UDP sends wait for an in-flight
  rotation and then use the fresh token. Use
  `client.waitForGameplayTokenRefresh()` if you send outside `UdpAPI`.

# CrowdyJS v15.7 — invoke policies apply to app admins

**Nothing removed, one input flag and one result field added.** ck-api `v1.89.0`
(2026-09-08).

Until now a caller holding `manage_apps` on the app skipped every Game Model
invoke policy implicitly, with nothing on the result to say so. A developer
testing their own game with their own account therefore saw `self.hp > 0` pass
at `hp = 0` and `owner_of_self` pass on another player's row. From ck-api
v1.89.0 an admin's `gameModel.invoke` is judged exactly like a player's.

- `InvokeFunctionInput.bypassPolicy?: boolean` (default `false`) skips the policy
  for one call. Honoured only with `manage_apps` — anyone else gets a thrown
  `CrowdyGraphQLError` with code `NOT_ALLOWED` and nothing runs.
- `GmInvokeResult.policyBypassed` is `true` on a result that skipped the policy,
  so a client can tell the two kinds of success apart. The server audit-logs the
  call.
- A policy refusal is still a resolved result: `success: false`,
  `fault.code === 'NOT_ALLOWED'`.

**Action:** if your GM console, seed script or admin tool relied on the old skip,
add `bypassPolicy: true` to those calls. Player code needs no change.

# CrowdyJS v15.6 — a browser game signs in through Studio, not through `auth.*`

**Nothing removed, two methods added, and a platform rule that decides which
of the two sign-in paths your code may take.** ck-api `v1.88.0` (2026-09-08).

## Direct sign-in is first-party only

`auth.login`, `auth.register`, `auth.requestLoginLink` / `completeLoginLink`,
`auth.socialLoginStart` / `socialLoginComplete`, `auth.checkAuthMethod`,
`auth.requestPasswordReset` / `resetPassword` are now served only to:

- **first-party browser origins** — Studio and the crowdy.games host; and
- **non-browser callers** — anything that sends no `Origin` header (Node, a
  CLI, CrowdyCPP, tests).

From a browser page on **any other origin** (every customer's game) the API
refuses with `extensions.code` **`HOSTED_SIGN_IN_REQUIRED`** (403).
`isHostedSignInRequiredError(e)` recognises it. The reason is the player's
password: a form on a customer's domain that collects it is indistinguishable,
to the platform and to the player, from a phishing page.

## What to call instead: `portal.signIn` and `portal.handleSignInCallback`

```ts
// boot: finish a sign-in we are returning from (no-op without ?code=)
const entered = await client.portal.handleSignInCallback();

// "Sign in with Crowded Kingdoms" button
await client.portal.signIn({ appId, redirectUri: `${location.origin}/auth/callback` });
```

`signIn` sends the player to Studio's hosted `/authorize` with a PKCE
challenge; the player signs in there (and consents, if your app is not
trusted); Studio redirects back to your `redirectUri` with a one-time code;
`handleSignInCallback` exchanges it for an **app-scoped token** and stores it
on the client. You never held a session token, and you never needed one.

- The hosted page is derived from the API host you configured
  (`ck.<tier>.crowdedkingdoms.com` -> `studio.<tier>.crowdedkingdoms.com/authorize`,
  `localhost:3000` -> `localhost:3001`). Pass `authorizeUrl` to override;
  `defaultHostedSignInUrl(endpoint)` is the derivation.
- Your `redirectUri`'s **origin** must be one of the app's registered redirect
  URIs (Studio > Apps > client settings). That same entry is what puts your
  origin on the API's CORS allow-list, live, without a restart.
- `beginEntry` / `completeEntry` are the same two steps without the defaults
  and are unchanged. `handleAuthorizeRequest` is what Studio's page calls.

## If you are first-party or not in a browser, nothing changes

Studio, the Overworld lobby, CrowdyCPP, load tools and scripts keep calling
`auth.login` / `register` and then `portal.mintAppToken(appId)`.

## Also in this release (server side, no SDK change)

- `resetPassword` now revokes **every** session of the account; `changePassword`
  every session but the calling one. A client that kept a second tab signed in
  will find it signed out after either.
- Ten failed `login` attempts for one address in fifteen minutes answer
  `RATE_LIMITED`; `register`, `checkAuthMethod`, the reset and resend mutations
  and `requestLoginLink` are rate-limited per address and per client too.
- GraphQL introspection is off on every tier; the SDL is published at
  docs.crowdedkingdoms.com and shipped in this package.

---

# CrowdyJS v15.4 — nothing runs for an app with no player in it

**One removal, one addition, and a change in what the platform does that no SDK
version can shield you from.** Read the third part even if you change no code.

## `alwaysOn` is gone

`compute.upsertModule({ alwaysOn: true })` is now **refused** by the platform with
`BAD_REQUEST`. The field is deprecated server-side, always reads `false`, and has
been dropped from the module fragment this SDK selects, so `modules()` and
`upsertModule()` no longer return it.

If you passed it, delete the argument. If you read it, delete the read — it told
you nothing after 2026-09-01 and told you something false before you upgraded.

## Modules and scheduled work now require a player

This is the part that is not about the SDK. A compute module ticks **only while
its app has at least one player connected**, anywhere in the fleet, and stops
when the last one leaves. Scheduled automations (`schedule` triggers, cron and
interval alike) and `gm_timers` behave the same way:

- **Automations** that come due while the app is empty are **skipped silently**
  and rescheduled from the moment a player returns. Missed runs are never made
  up.
- **Timers** whose deadline passes while the app is empty **wait** and fire on
  return. They are late, not lost.
- **`event` and `manual` triggers are unaffected** — something already asked.
- **Synchronous `compute.invoke` is unaffected** — it is a request, not a tick.

**What to change in your game.** Make scheduled work idempotent in *elapsed
time* rather than assuming a cadence:

```ts
// Fragile: stalls while nobody is playing, and resumes as if no time passed.
crop.growth += 1;

// Correct: right whenever anybody next looks at it.
const elapsedMs = now - crop.lastTick;
crop.growth += elapsedMs / MS_PER_GROWTH_STEP;
crop.lastTick = now;
```

Store expiries as **timestamps**, not as remaining-tick counters, so a status
effect that should have lapsed while the world was empty is treated as lapsed
instead of resuming with time left on it. The `worldsim` and `combat` blueprints'
docs previously said their automations "run with no client online"; that was true
and is not, and both have been corrected.

A world that genuinely must advance while empty should compute the elapsed time
on its first tick after a player returns. That is cheaper than ticking an empty
world and gives the same answer.

## Reservations split, and mean something different

`sharedEnvironment.setReservedThroughput()` is **new** — the mutation existed all
along and this SDK never wrapped it.

`App.reservedEgressBytesPerSec` is deprecated in favour of
`app.reservedUdpBytesPerSec`, joined by a second dimension,
`app.reservedGraphqlOpsPerSec`. Reserving one does not reserve the other. Both
are now selected by the `App` query.

Three things a reservation is **not**, all of which it either was or appeared to
be before:

1. **Not a ceiling.** It obliges the platform to keep that much capacity
   provisioned for you and does not cap what you may send. Traffic above the
   reserved rate is metered, not refused.
2. **Not a data allowance.** The monthly fee buys capacity, not volume, and is
   charged *in addition to* metered usage. Reserving 5 MB/s does not make the
   first 5 MB/s free.
3. **Not the way to lift the free-tier cap.** Unfunded free apps are shaped at
   roughly 1 MB/s. Funding the org wallet or enabling auto-billing lifts that;
   reserving does not. Until 2026-09-01 a reservation did double duty as a
   rate-limit bypass, which is why the old schema descriptions said so.

## Also

The schema is resynced against the platform, which corrects a stale worked
example in the rate-card field docs: the illustrative price now reads 19c per
GiB, matching the shipped card rather than the pre-reprice figure.

---

# CrowdyJS v15.1 — password management (additive)

**Nothing breaks.** Four mutations the API has served all along are now wrapped,
so a game shipping this SDK has a first-class way to let a player set or change
a password:

| Method | Requires | For |
|---|---|---|
| `auth.requestPasswordReset(email)` | nothing | "I forgot my password" |
| `auth.resetPassword({ token, newPassword })` | the emailed token | completing that |
| `auth.changePassword({ currentPassword, newPassword })` | a session **and** the current password | an ordinary change |
| `auth.setInitialPassword(newPassword)` | a session, and the account must have **no** password | adding a first password |

**Why four and not one.** Each is defined by what the caller has already
*proven* — an emailed token, the current password, or the session — and
collapsing any pair deletes the proof. In particular `setInitialPassword` is not
`changePassword` with the check removed: it **refuses** when a password already
exists, and that refusal is what stops a stolen session from replacing a
credential the owner still knows. Route on the refusal instead of retrying.

**`setInitialPassword` emails a security notification to the account address**
on success, and that is deliberately the mitigation rather than a refusal: a
stolen session can already attach durable attacker-controlled access through
`linkIdentity`, so refusing here would close nothing and would leave the
legitimate user of a magic-link or social-only account with no door at all. If
you build UI for this, tell the user the email is coming.

**Three new error predicates**, because the three refusals need different
handling and a caller should not have to work out which is which:

- `isPasswordAlreadySetError(e)` — `setInitialPassword` refused; use
  `changePassword`.
- `isNoPasswordSetError(e)` — `changePassword` refused because there is none;
  use `setInitialPassword`.
- `isInvalidCurrentPasswordError(e)` — the current password is wrong; ask again.

**Use these rather than reading `extensions.code` yourself, and the reason is
worth knowing.** Each refusal has its own code — `PASSWORD_ALREADY_SET`,
`PASSWORD_NOT_SET`, `INVALID_CURRENT_PASSWORD` — only from **ck-api v1.60.0**.
Before that release the first two shared `UNAUTHENTICATED` with a genuinely
expired session and the third arrived as `INTERNAL_SERVER_ERROR`, so a caller
keying on the code signed the user out over a typo. Each predicate accepts the
new code **and** the older wording, so one pinned build works against a tier on
either side of that line. `isAlreadyRegisteredError` gained the same treatment
(`EMAIL_ALREADY_REGISTERED`).

None of the three means the session is gone. Sign a user out on
`UNAUTHENTICATED`, which from v1.60.0 says only that.

```ts
try {
  await client.auth.setInitialPassword(pw);
} catch (e) {
  if (isPasswordAlreadySetError(e)) {
    // They have one already — ask for it rather than replacing it blind.
    await client.auth.changePassword({ currentPassword: current, newPassword: pw });
  } else throw e;
}
```

`resetPassword` and `changePassword` do **not** revoke existing sessions. Follow
either with `auth.logoutAllDevices()` if that is the intent.

---

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
  has an account. It carries `EMAIL_ALREADY_REGISTERED` from ck-api v1.60.0;
  before that it arrived as `INTERNAL_SERVER_ERROR`, so a caller keying on
  `CONFLICT` matched nothing. The predicate accepts both.
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
  (e.g. `https://ck.test.crowdedkingdoms.com`); configuring both remains supported
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
