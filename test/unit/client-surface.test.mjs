/**
 * Offline unit test for the full-surface SDK shape.
 *
 * Constructs a CrowdyClient (no network) and asserts every sub-client and
 * grouping facade is present and exposes the expected methods. This guards the
 * wiring in crowdy-client.ts as the surface grows.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadSdk, loadStores } from '../helpers.mjs';

function assertMethods(obj, name, methods) {
  assert.ok(obj && typeof obj === 'object', `${name} should be an object`);
  for (const m of methods) {
    assert.equal(typeof obj[m], 'function', `${name}.${m}() should be a function`);
  }
}

test('client normalizes routed WebSocket base URLs to the GraphQL endpoint', async () => {
  const { createCrowdyClient } = await loadSdk();
  const fromBase = createCrowdyClient({
    httpUrl: 'https://game.invalid',
    wsUrl: 'wss://game.invalid',
  });
  const fromEndpoint = createCrowdyClient({
    httpUrl: 'https://game.invalid/graphql',
    wsUrl: 'wss://game.invalid/graphql',
  });

  assert.equal(fromBase.realtime.wsUrl, 'wss://game.invalid/graphql');
  assert.equal(fromEndpoint.realtime.wsUrl, 'wss://game.invalid/graphql');
  fromBase.close();
  fromEndpoint.close();
});

test('client exposes the full management + game sub-client surface', async () => {
  const { createCrowdyClient } = await loadSdk();
  const client = createCrowdyClient({
    httpUrl: 'https://game.invalid',
    wsUrl: 'wss://game.invalid',
  });
  assertMethods(client, 'client', ['refreshGameplayToken', 'waitForGameplayTokenRefresh']);

  // Existing client-facing sub-clients still present.
  for (const k of [
    'auth', 'users', 'apps', 'platform', 'chunks', 'voxels', 'actors',
    'teleport', 'state', 'serverStatus', 'channels', 'teams', 'udp', 'exec',
  ]) {
    assert.ok(client[k], `client.${k} should exist`);
  }

  // The legacy engines' domains went in 18.0.0: ck-exec (`client.exec`) replaced the game
  // model, its automations, Studio compute and player compute (its CLIENT modules too, by a
  // mod's CLIENT half); the operator surface held only the legacy compute ceilings.
  for (const removed of ['gameModel', 'compute', 'playerModel', 'playerCompute', 'operator']) {
    assert.equal(client[removed], undefined, `client.${removed} was removed in 18.0.0`);
  }
  assertMethods(client.exec, 'exec', [
    'modClientBuild', 'modClientDeploy', 'modClientDelete', 'gridClientMods',
    'consentClientMod', 'trustAuthor', 'modClientArtifact', 'modClientArtifactBytes',
  ]);
  assertMethods(client.crowdyStudio, 'crowdyStudio', [
    'listProjects', 'getProject', 'createProject', 'saveProject',
    'listPersonalLibraryFiles', 'listCommonFiles',
  ]);
  // The Crowdy Agent transport left with the orchestrator; the Studio agent is
  // the DeepSeek Harness pane, reached through `crowdyStudioGitHub`, the model
  // endpoint and the `crowdy-dsh` entry rather than a GraphQL sub-client.
  assert.equal(client.crowdyStudioAgent, undefined);
  assertMethods(client.crowdyStudioGitHub, 'crowdyStudioGitHub', [
    'status', 'connectUrl', 'repos', 'bind', 'unbind', 'refresh', 'layout', 'tree', 'getFile', 'putFile', 'deleteFile',
  ]);
  assert.equal(client[['player', 'Code', 'Projects'].join('')], undefined);
  // Grid claim flows and studio moderation; the player-facing listings and grid
  // attachments went with player compute in 18.0.0.
  assertMethods(client.marketplace, 'marketplace', [
    'gridClaimPolicy', 'gridClaimRequests',
    'claimGridOwnership', 'claimGridChunk', 'releaseClaimedGrid',
    'decideGridClaim', 'issueGridClaimInvite',
    'admissionQueue', 'appListings', 'appAcquisitions', 'transferListing',
    'setListingStatus', 'setGridClaimPolicy',
  ]);
  for (const removed of ['listings', 'acquire', 'install', 'gridClientMods', 'clientArtifact']) {
    assert.equal(client.marketplace[removed], undefined, `marketplace.${removed} was removed in 18.0.0`);
  }

  // New management admin sub-clients.
  assertMethods(client.organizations, 'organizations', ['get', 'bySlug', 'mine', 'create', 'createToken', 'inviteMember', 'createRole']);
  assertMethods(client.appAccess, 'appAccess', [
    'tiers', 'myAccess', 'createTier', 'grant', 'revoke',
    // Tier features, beside access tiers since 18.0.0.
    'defineFeature', 'features', 'grantTierFeature', 'revokeTierFeature', 'tierFeatures',
  ]);
  assertMethods(client.billing, 'billing', ['walletBalance', 'walletTransactions', 'appBudget', 'setAppBudget']);
  assertMethods(client.payments, 'payments', ['create', 'mine', 'mineConnection', 'capturePaypal']);
  assertMethods(client.quotas, 'quotas', ['forOrg', 'forApp', 'effective', 'set', 'remove']);
  // The SDK is for normal clients: nothing only a super-admin or an operator can call (18.0.1).
  for (const [domain, removed] of [
    ['users', ['paginated', 'listConnection', 'setSuperAdmin', 'setOperator', 'setEarlyAccessOverride', 'updateType', 'forceLogout']],
    ['payments', ['all', 'allConnection', 'events', 'eventsConnection']],
    ['organizations', ['setStatus']],
    ['apps', ['setVisibility']],
    ['hosting', ['all', 'setListing', 'takeDown']],
  ]) {
    for (const m of removed) {
      assert.equal(client[domain][m], undefined, `${domain}.${m} is platform administration, not in the SDK`);
    }
  }
  assert.equal(client.admin.payments.all, undefined);
  // Dedicated environments retired with the v13 unified API.
  assert.equal('environments' in client, false, 'client.environments was removed in v13');
  assertMethods(client.usage, 'usage', ['appGraphqlOperations', 'appSummary', 'playerPulse']);
  assertMethods(client.sharedEnvironment, 'sharedEnvironment', ['plans', 'freeAppQuota', 'appRuntimeState', 'publishApp', 'setSpendCaps', 'setAutoBilling']);

  // The player WASM policies went with player compute; the wallet stays.
  for (const removed of ['policies', 'setPolicy', 'deletePolicy']) {
    assert.equal(client.playerWallet[removed], undefined, `playerWallet.${removed} was removed in 18.0.0`);
  }

  // New game-side sub-clients.
  assertMethods(client.avatars, 'avatars', ['listForUser', 'get', 'mine', 'appState', 'create', 'update', 'delete', 'updateState', 'updateAppState']);
  assertMethods(client.host, 'host', ['get', 'heartbeat']);
  assertMethods(client.gameApps, 'gameApps', [
    'ownership', 'assignOwnership', 'transferOwnership', 'userPermissions',
    'nearbyPermissions', 'permissionLimits', 'createGrid', 'grantPermissions',
    'assignGroup', 'openPermissions', 'setOpenPermissions',
  ]);
  assertMethods(client.udp, 'udp', [
    'connect', 'disconnect', 'connectionStatus', 'subscribe',
    'sendActorUpdate', 'sendActorUpdateAndWait',
    'sendVoxelUpdate', 'sendVoxelUpdateAndWait',
    'sendAudioPacket', 'sendAudioPacketAndWait',
    'sendVideoPacket', 'sendVideoFrame',
    'sendTextPacket', 'sendTextPacketAndWait',
    'sendClientEvent', 'sendClientEventAndWait',
    'sendSingleActorMessage', 'sendChannelMessage', 'sendRangedChannelMessage',
  ]);
  assertMethods(client.apps, 'apps', [
    'codeAdmissionMode', 'codeAdmissions', 'setCodeAdmissionMode', 'admitCode',
    'revokeCodeAdmission',
  ]);

  // Auth surface: email+password alongside magic link and social, and the four
  // password-management mutations.
  //
  // THIS LIST HAS NOW ASSERTED THE OPPOSITE TWICE, and the second time it was
  // the same mistake with a narrower blast radius. Until 2026-08-20 it asserted
  // `login` and `register` were ABSENT -- the SDK's passwordless claim written
  // down as a check -- and the gap is what sent automated clients to the dev
  // bypass. Adding those two left `changePassword` and `resetPassword` in the
  // removed list below, under a comment about the bypass being deleted from the
  // server. That comment was true of `devLogin` and false of the other two: the
  // API has served all four password mutations throughout, and `resetPassword`
  // was never part of any bypass. So the SDK went on having no way for a player
  // to set or change a password, with a passing test saying that was intended.
  //
  // The lesson is not "check the schema" -- whoever wrote this had the schema.
  // It is that a name in an ABSENT list needs its own reason, because a list
  // shares one comment and the reason only has to be true of the first entry.
  assertMethods(client.auth, 'auth', [
    'login', 'register', 'checkAuthMethod',
    'requestLoginLink', 'completeLoginLink', 'socialLoginStart',
    'socialLoginComplete', 'availableLoginProviders',
    'requestPasswordReset', 'resetPassword', 'changePassword',
    'setInitialPassword',
    'myIdentities', 'linkIdentity', 'unlinkIdentity', 'logout',
    'logoutAllDevices', 'setToken', 'getToken',
  ]);
  // ONE name, and its reason is specific to it: `devLogin` is removed from the
  // SERVER on every tier, so a wrapper could only ever produce a validation
  // error naming a field that does not exist. Do not add a name here without
  // saying which of those two things is true of it -- that the API does not
  // have the field, or that the SDK deliberately declines to expose one it has.
  // The second needs an argument, because an SDK's missing convenience becomes
  // a security decision: `devLogin` got used because nothing else was offered.
  for (const removed of ['devLogin']) {
    assert.equal(client.auth[removed], undefined, `auth.${removed} should be removed`);
  }

  // Portal consent + connected-apps surface.
  assertMethods(client.portal, 'portal', [
    'mintAppToken', 'createAuthorizationCode', 'exchangeCode', 'refresh',
    'beginEntry', 'handleAuthorizeRequest', 'completeEntry',
    // Hosted sign-in (ck-api v1.88.0): the browser game's whole flow.
    'signIn', 'handleSignInCallback',
    'getConsent', 'authorizeApp', 'revokeAppAuthorization',
    'myAuthorizedApps', 'setAppClientSettings',
  ]);

  // Game Kit: only the social helpers outlived the game model (18.0.0).
  const kit = client.kit('1');
  assert.equal(kit.deploy, undefined, 'kit.deploy was removed in 18.0.0');
  assert.equal(kit.inventory, undefined, 'the model-backed kit helpers were removed in 18.0.0');
  assertMethods(kit.social.party, 'kit.social.party', [
    'create', 'find', 'invite', 'join', 'leave', 'members',
  ]);
  assertMethods(kit.social.guild, 'kit.social.guild', [
    'create', 'find', 'roster', 'roles', 'createRole', 'promote', 'claimTerritory',
  ]);
  assertMethods(kit.social.chat, 'kit.social.chat', [
    'room', 'join', 'send', 'onMessage',
  ]);

  // Admin grouping facade points at the same instances.
  assert.equal(client.admin.organizations, client.organizations, 'admin.organizations aliases client.organizations');
  assert.equal(client.admin.apps, client.apps, 'admin.apps aliases client.apps');
  assert.equal(client.admin.billing, client.billing, 'admin.billing aliases client.billing');
  assert.equal('environments' in client.admin, false, 'admin.environments was removed in v13');
  assert.equal(client.admin.grids, client.gameApps, 'admin.grids aliases client.gameApps');

  client.close();
});

test('marketplace chunk claim wrappers map variables, results, and documents', async () => {
  const { createCrowdyClient } = await loadSdk();
  const client = createCrowdyClient({
    httpUrl: 'https://game.invalid',
  });
  const calls = [];
  const claimed = {
    gridId: '42',
    lowChunk: { x: '-2', y: '3', z: '7' },
    highChunk: { x: '-2', y: '3', z: '7' },
    policy: 'SELF_CLAIM',
    ownership: {
      gridOwnershipId: 'ownership-42',
      ownerKind: 'USER',
      ownerRef: '7',
      tenure: 'OWNED',
      acquiredVia: 'self_claim_chunk',
      acquiredAt: '2026-07-22T00:00:00.000Z',
      expiresAt: null,
    },
    moddable: true,
    effectivePermissionKeys: [
      'access',
      'update_voxel_data',
      'write_server_code',
      'run_server_code',
    ],
  };
  const released = {
    gridId: '42',
    lowChunk: claimed.lowChunk,
    highChunk: claimed.highChunk,
    policy: 'SELF_CLAIM',
    released: true,
  };
  client.graphql.request = async (document, variables) => {
    calls.push({ document, variables });
    return calls.length === 1
      ? { claimGridChunk: claimed }
      : { releaseClaimedGrid: released };
  };

  const claimVariables = {
    appId: '2',
    chunk: { x: '-2', y: '3', z: '7' },
  };
  assert.deepEqual(
    await client.marketplace.claimGridChunk(claimVariables),
    claimed,
  );
  assert.deepEqual(
    await client.marketplace.releaseClaimedGrid({ appId: '2', gridId: '42' }),
    released,
  );

  assert.deepEqual(calls.map(({ variables }) => variables), [
    claimVariables,
    { appId: '2', gridId: '42' },
  ]);
  const operations = calls.map(({ document }) =>
    document.definitions.find((definition) =>
      definition.kind === 'OperationDefinition'));
  assert.deepEqual(
    operations.map((operation) => operation.name.value),
    ['MarketplaceClaimGridChunk', 'MarketplaceReleaseClaimedGrid'],
  );
  const claimFields =
    operations[0].selectionSet.selections[0].selectionSet.selections
      .map((selection) => selection.name.value);
  assert.deepEqual(claimFields, [
    'gridId',
    'lowChunk',
    'highChunk',
    'policy',
    'ownership',
    'moddable',
    'effectivePermissionKeys',
  ]);
  assert.equal(
    operations[1].selectionSet.selections[0].name.value,
    'releaseClaimedGrid',
  );
  client.close();
});

// Both families used to be asserted as routing to different endpoints. Since v14
// there is one endpoint, so what is worth pinning is that every wrapper still sends
// the right variables — and that both families reach the SAME client, which is what
// actually broke when the management client was removed.
test('grid ownership and app-admission wrappers send the right variables on one client', async () => {
  const { createCrowdyClient, CodeAdmissionMode } = await loadSdk();
  const client = createCrowdyClient({
    httpUrl: 'https://game.invalid',
  });
  const calls = [];
  const results = [
    { gridOwnership: { gridOwnershipId: 'ownership-1' } },
    { assignGridOwnership: { gridOwnershipId: 'ownership-2' } },
    { transferGridOwnership: { gridOwnershipId: 'ownership-3' } },
    { appCodeAdmissionMode: CodeAdmissionMode.ImplicitAllow },
    { appCodeAdmissions: [{ admissionId: 'admission-1' }] },
    { setAppCodeAdmissionMode: CodeAdmissionMode.AllowList },
    { admitAppCode: { admissionId: 'admission-2' } },
    { revokeAppCodeAdmission: { admissionId: 'admission-2' } },
  ];
  client.graphql.request = async (_document, variables) => {
    calls.push(variables);
    return results.shift();
  };

  await client.gameApps.ownership('1', '2');
  await client.gameApps.assignOwnership({ appId: '1', gridId: '2', ownerUserId: '3' });
  await client.gameApps.transferOwnership({ appId: '1', gridId: '2', newOwnerUserId: '4' });

  await client.apps.codeAdmissionMode('1');
  await client.apps.codeAdmissions('1', true);
  await client.apps.setCodeAdmissionMode('1', CodeAdmissionMode.AllowList);
  await client.apps.admitCode({
    appId: '1', subjectKind: 'AUTHOR', subjectRef: '3',
  });
  await client.apps.revokeCodeAdmission('1', 'admission-2');

  // All 8 landed on the one client; a wrapper wired to a second client would
  // short this list rather than fail an assertion.
  assert.equal(calls.length, 8);
  assert.deepEqual(calls[0], { appId: '1', gridId: '2' });
  assert.deepEqual(calls.slice(3), [
    { appId: '1' },
    { appId: '1', includeRevoked: true },
    { appId: '1', mode: CodeAdmissionMode.AllowList },
    { input: { appId: '1', subjectKind: 'AUTHOR', subjectRef: '3' } },
    { appId: '1', admissionId: 'admission-2' },
  ]);
  client.close();
});

// cks-game-api #436: a grid that grants no player update_voxel_data is closed to everyone, so a
// zone everyone may build in is opened with setGridOpenPermissions (manage_apps).
test('open grid wrappers send their documents and variables, and return the open keys', async () => {
  const { createCrowdyClient } = await loadSdk();
  const client = createCrowdyClient({ httpUrl: 'https://game.invalid' });
  const calls = [];
  const opened = { appId: '1', gridId: '10', permissionKeys: ['access', 'update_voxel_data'] };
  client.graphql.request = async (document, variables) => {
    const op = document.definitions.find((d) => d.kind === 'OperationDefinition');
    calls.push([op.operation, op.name.value, variables]);
    return op.name.value === 'SetGridOpenPermissions'
      ? { setGridOpenPermissions: variables.input.permissionKeys.length ? opened : { ...opened, permissionKeys: [] } }
      : { gridOpenPermissions: opened };
  };

  const set = await client.gameApps.setOpenPermissions({
    appId: '1', gridId: '10', permissionKeys: ['access', 'update_voxel_data'],
  });
  assert.deepEqual(set, opened);
  assert.deepEqual(await client.admin.grids.openPermissions('1', '10'), opened);
  const closed = await client.gameApps.setOpenPermissions({ appId: '1', gridId: '10', permissionKeys: [] });
  assert.deepEqual(closed.permissionKeys, []);
  assert.deepEqual(calls, [
    ['mutation', 'SetGridOpenPermissions', { input: { appId: '1', gridId: '10', permissionKeys: ['access', 'update_voxel_data'] } }],
    ['query', 'GridOpenPermissions', { appId: '1', gridId: '10' }],
    ['mutation', 'SetGridOpenPermissions', { input: { appId: '1', gridId: '10', permissionKeys: [] } }],
  ]);
  client.close();
});

test('World Stores session exposes exactly the configured stores', async () => {
  const { createCrowdyClient } = await loadSdk();
  const { createWorldSession, manualTicker, jsonCodec } = await loadStores();
  const client = createCrowdyClient({
    httpUrl: 'https://game.invalid',
    wsUrl: 'wss://game.invalid',
  });

  // A CrowdyClient satisfies WorldStoresClient structurally. Stub the
  // realtime subscription point so this stays an offline wiring test.
  client.udp.subscribe = () => () => {};
  const codec = jsonCodec();
  const session = createWorldSession(client, '1', {
    ticker: manualTicker(),
    self: { codec, initialState: {}, sendIntervalMs: false },
    actors: { codec },
    errors: true,
    chunks: true,
    channelInbox: true,
    actorInbox: true,
    events: true,
    host: { heartbeatImmediately: false },
    save: true,
    avatar: true,
  });

  assert.equal(session.appId, '1');
  assertMethods(session, 'session', ['dispose']);
  assertMethods(session.self, 'session.self', [
    'setState', 'patchState', 'join', 'moveTo', 'sendNow', 'refresh',
  ]);
  assert.equal(session.self.uuid.length, 32);
  assertMethods(session.actors, 'session.actors', [
    'lane', 'list', 'get', 'onJoin', 'onUpdate', 'onLeave', 'reap', 'clear',
  ]);
  assertMethods(session.errors, 'session.errors', ['recent', 'lastFor', 'onError', 'clear']);
  assertMethods(session.chunks, 'session.chunks', [
    'get', 'list', 'voxelTypeAt', 'voxelStateAt', 'onChunkChanged', 'ensureAround',
    'hydrate', 'setVoxel', 'seed', 'markDirty', 'flush', 'pruneBeyond',
  ]);
  assertMethods(session.channelInbox, 'session.channelInbox', [
    'messages', 'channels', 'onMessage', 'send', 'clear',
  ]);
  assertMethods(session.actorInbox, 'session.actorInbox', [
    'messages', 'onMessage', 'send', 'clear',
  ]);
  assertMethods(session.events, 'session.events', ['on', 'lastEvent', 'send']);
  assertMethods(session.host, 'session.host', ['onHostChanged', 'beat']);
  assertMethods(session.save, 'session.save', ['load', 'set', 'patch', 'save']);
  assertMethods(session.avatar, 'session.avatar', [
    'load', 'setIdentityState', 'setAppState',
  ]);
  assert.equal(session.model, undefined, 'the game-model mirror was removed in 18.0.0');

  // Unconfigured stores are absent at runtime too.
  const bare = createWorldSession(client, '1', { ticker: manualTicker() });
  for (const key of ['self', 'actors', 'errors', 'chunks', 'channelInbox',
    'actorInbox', 'events', 'host', 'save', 'avatar']) {
    assert.equal(bare[key], undefined, `bare session has no ${key}`);
  }

  session.dispose();
  bare.dispose();
  client.close();
});
