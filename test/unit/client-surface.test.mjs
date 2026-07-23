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
    managementUrl: 'https://management.invalid',
    httpUrl: 'https://game.invalid',
    wsUrl: 'wss://game.invalid',
  });
  assertMethods(client, 'client', ['refreshGameplayToken']);

  // Existing client-facing sub-clients still present.
  for (const k of [
    'auth', 'users', 'apps', 'platform', 'chunks', 'voxels', 'actors',
    'teleport', 'state', 'serverStatus', 'channels', 'teams', 'udp', 'gameModel',
  ]) {
    assert.ok(client[k], `client.${k} should exist`);
  }

  // Compute Modules (server-side Rust/WASM logic).
  assertMethods(client.compute, 'compute', [
    'upsertModule', 'deployVersion', 'setModuleEnabled', 'deleteModule',
    'upsertTrigger', 'deleteTrigger', 'setPolicy', 'invoke', 'waitForCompile',
    'modules', 'module', 'moduleVersions', 'moduleTriggers', 'modulePolicy',
    'moduleRuns', 'moduleStats', 'moduleLogs', 'appDiagnostics',
  ]);
  assertMethods(client.playerCompute, 'playerCompute', [
    'deploy', 'setEnabled', 'invoke', 'myModules', 'versions', 'delete',
  ]);
  assertMethods(client.playerCodeProjects, 'playerCodeProjects', [
    'listProjects', 'getProject', 'createProject', 'saveProject',
    'listPersonalLibraryFiles', 'listCommonFiles',
  ]);
  // P4a marketplace (free mode): store + installs + consent + claim flows
  // (game API) and studio moderation (management API).
  assertMethods(client.marketplace, 'marketplace', [
    'listings', 'versions', 'myAcquisitions', 'myInstalls',
    'publishListing', 'publishVersion', 'acquire', 'install', 'uninstall',
    'gridClientMods', 'consentGridClientMod', 'clientArtifact',
    'clientArtifactBytes', 'gridClaimPolicy', 'gridClaimRequests',
    'claimGridOwnership', 'claimGridChunk', 'releaseClaimedGrid',
    'decideGridClaim', 'issueGridClaimInvite',
    'admissionQueue', 'appListings', 'appAcquisitions', 'transferListing',
    'setListingStatus', 'setGridClaimPolicy',
  ]);
  assertMethods(client.playerModel, 'playerModel', [
    'containers', 'container', 'createContainer', 'setProperty',
    'deleteContainer', 'automations', 'createAutomation',
    'setAutomationEnabled', 'deleteAutomation',
  ]);

  // New management admin sub-clients.
  assertMethods(client.organizations, 'organizations', ['get', 'bySlug', 'mine', 'create', 'createToken', 'inviteMember', 'createRole']);
  assertMethods(client.appAccess, 'appAccess', ['tiers', 'myAccess', 'createTier', 'grant', 'revoke']);
  assertMethods(client.billing, 'billing', ['walletBalance', 'walletTransactions', 'appBudget', 'setAppBudget']);
  assertMethods(client.payments, 'payments', ['create', 'mine', 'all']);
  assertMethods(client.quotas, 'quotas', ['forOrg', 'forApp', 'effective', 'set', 'remove']);
  assertMethods(client.environments, 'environments', ['list', 'get', 'versions', 'quote', 'create', 'destroy', 'redeploy', 'linkApp']);
  assertMethods(client.usage, 'usage', ['environmentSummary', 'orgByEnvironment', 'environmentByApp', 'appGraphqlOperations', 'appSummary']);
  assertMethods(client.sharedEnvironment, 'sharedEnvironment', ['plans', 'freeAppQuota', 'appRuntimeState', 'publishApp', 'setSpendCaps', 'setAutoBilling']);

  // Operator (control-plane) surface.
  assertMethods(client.operator, 'operator', ['environments', 'environment', 'changeOrders', 'audit', 'secrets', 'putSecret', 'ingestEnvironmentVersion', 'yankEnvironmentVersion']);

  // New game-side sub-clients.
  assertMethods(client.avatars, 'avatars', ['listForUser', 'get', 'mine', 'appState', 'create', 'update', 'delete', 'updateState', 'updateAppState']);
  assertMethods(client.host, 'host', ['get', 'heartbeat']);
  assertMethods(client.gameApps, 'gameApps', [
    'ownership', 'assignOwnership', 'transferOwnership', 'userPermissions',
    'nearbyPermissions', 'permissionLimits', 'createGrid', 'grantPermissions',
    'assignGroup',
  ]);
  assertMethods(client.apps, 'apps', [
    'codeAdmissionMode', 'codeAdmissions', 'setCodeAdmissionMode', 'admitCode',
    'revokeCodeAdmission',
  ]);

  // Passwordless auth surface (v8): no password login/register.
  assertMethods(client.auth, 'auth', [
    'requestLoginLink', 'completeLoginLink', 'socialLoginStart',
    'socialLoginComplete', 'devLogin', 'availableLoginProviders',
    'myIdentities', 'linkIdentity', 'unlinkIdentity', 'logout',
    'logoutAllDevices', 'setToken', 'getToken',
  ]);
  for (const removed of ['login', 'register', 'changePassword', 'resetPassword']) {
    assert.equal(client.auth[removed], undefined, `auth.${removed} should be removed`);
  }

  // Portal consent + connected-apps surface.
  assertMethods(client.portal, 'portal', [
    'mintAppToken', 'createAuthorizationCode', 'exchangeCode', 'refresh',
    'beginEntry', 'handleAuthorizeRequest', 'completeEntry',
    'getConsent', 'authorizeApp', 'revokeAppAuthorization',
    'myAuthorizedApps', 'setAppClientSettings',
  ]);

  // Game Kit facade (app-scoped, over gameModel).
  const kit = client.kit('1');
  assertMethods(kit, 'kit', ['deploy', 'objectsFor']);
  assertMethods(kit.inventory, 'kit.inventory', [
    'ensure', 'stacks', 'createStack', 'grant', 'consume', 'move', 'transfer',
    'linkStack', 'contents',
  ]);
  assertMethods(kit.objects, 'kit.objects', [
    'create', 'grantKey', 'keysOf', 'open', 'close', 'isOpen', 'list',
  ]);
  assertMethods(kit.npcs, 'kit.npcs', [
    'spawn', 'list', 'state', 'runNow', 'setEnabled', 'stats', 'runs',
  ]);
  assertMethods(kit.plots, 'kit.plots', [
    'create', 'list', 'buy', 'rent', 'evict', 'accessOf',
  ]);
  assertMethods(kit.economy, 'kit.economy', [
    'ensureWallet', 'balance', 'wallet', 'earn', 'spend',
  ]);
  assertMethods(kit.economy.shop, 'kit.economy.shop', ['create', 'list', 'buy']);
  assertMethods(kit.economy.trades, 'kit.economy.trades', [
    'offer', 'accept', 'cancel', 'get', 'listMine',
  ]);
  assertMethods(kit.economy.market, 'kit.economy.market', [
    'list', 'browse', 'buy', 'cancel',
  ]);
  assertMethods(kit.loot, 'kit.loot', [
    'createRoll', 'roll', 'claim', 'state', 'rolls', 'history',
  ]);
  assertMethods(kit.progression, 'kit.progression', [
    'ensure', 'state', 'grantXp', 'skillCatalog', 'defineSkill', 'ensureSkillRank',
    'buySkill', 'skills', 'achievementCatalog', 'defineAchievement', 'achievements',
    'unlockAchievement', 'applyMatchResult',
  ]);
  assertMethods(kit.quests, 'kit.quests', [
    'catalog', 'defineQuest', 'accept', 'mine', 'state', 'advance', 'claim',
  ]);
  assertMethods(kit.combat, 'kit.combat', [
    'spawnCombatant', 'state', 'attack', 'applyEffect', 'effects', 'respawn',
    'revive', 'syncCombatant',
  ]);
  assertMethods(kit.matches, 'kit.matches', [
    'create', 'open', 'get', 'join', 'start', 'advanceRound', 'myTurn', 'endTurn',
    'ensureScore', 'score', 'standings', 'finish', 'notifyChanged', 'onMatchChanged',
  ]);
  assertMethods(kit.decks, 'kit.decks', [
    'deal', 'shuffle', 'cards', 'myHand', 'board', 'draw', 'drawCard', 'play', 'discard',
  ]);
  assertMethods(kit.worldsim, 'kit.worldsim', [
    'ensureWorld', 'worldState', 'setWeather', 'createNode', 'nodes', 'gather',
    'plant', 'crops', 'harvest', 'createSpawner', 'spawners', 'runNow', 'setEnabled',
  ]);
  assertMethods(kit.social.party, 'kit.social.party', [
    'create', 'find', 'invite', 'join', 'leave', 'members',
  ]);
  assertMethods(kit.social.guild, 'kit.social.guild', [
    'create', 'find', 'roster', 'roles', 'createRole', 'promote', 'claimTerritory',
  ]);
  assertMethods(kit.social.chat, 'kit.social.chat', [
    'room', 'join', 'send', 'onMessage',
  ]);
  assertMethods(kit.leaderboards, 'kit.leaderboards', [
    'ensureEntry', 'submit', 'board', 'top', 'around', 'season',
  ]);
  assertMethods(kit.features, 'kit.features', [
    'define', 'list', 'grantToTier', 'revokeFromTier', 'tierFeatures', 'gate',
  ]);

  // Admin grouping facade points at the same instances.
  assert.equal(client.admin.organizations, client.organizations, 'admin.organizations aliases client.organizations');
  assert.equal(client.admin.apps, client.apps, 'admin.apps aliases client.apps');
  assert.equal(client.admin.billing, client.billing, 'admin.billing aliases client.billing');
  assert.equal(client.admin.environments, client.environments, 'admin.environments aliases client.environments');
  assert.equal(client.admin.grids, client.gameApps, 'admin.grids aliases client.gameApps');

  client.close();
});

test('marketplace chunk claim wrappers map variables, results, and documents', async () => {
  const { createCrowdyClient } = await loadSdk();
  const client = createCrowdyClient({
    managementUrl: 'https://management.invalid',
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

test('player runtime wrappers route to the correct GraphQL planes', async () => {
  const { createCrowdyClient, CodeAdmissionMode } = await loadSdk();
  const client = createCrowdyClient({
    managementUrl: 'https://management.invalid',
    httpUrl: 'https://game.invalid',
  });
  const gameCalls = [];
  const managementCalls = [];
  const gameResults = [
    { gridOwnership: { gridOwnershipId: 'ownership-1' } },
    { assignGridOwnership: { gridOwnershipId: 'ownership-2' } },
    { transferGridOwnership: { gridOwnershipId: 'ownership-3' } },
    { playerComputeDeploy: { versionId: 'version-1' } },
    { playerComputeSetEnabled: { moduleId: 'module-1' } },
    { playerComputeMyModules: [{ moduleId: 'module-1' }] },
    { playerComputeVersions: [{ versionId: 'version-1' }] },
    { playerComputeDelete: true },
  ];
  client.graphql.request = async (_document, variables) => {
    gameCalls.push(variables);
    return gameResults.shift();
  };
  const managementResults = [
    { appCodeAdmissionMode: CodeAdmissionMode.ImplicitAllow },
    { appCodeAdmissions: [{ admissionId: 'admission-1' }] },
    { setAppCodeAdmissionMode: CodeAdmissionMode.AllowList },
    { admitAppCode: { admissionId: 'admission-2' } },
    { revokeAppCodeAdmission: { admissionId: 'admission-2' } },
  ];
  client.management.request = async (_document, variables) => {
    managementCalls.push(variables);
    return managementResults.shift();
  };

  await client.gameApps.ownership('1', '2');
  await client.gameApps.assignOwnership({ appId: '1', gridId: '2', ownerUserId: '3' });
  await client.gameApps.transferOwnership({ appId: '1', gridId: '2', newOwnerUserId: '4' });
  await client.playerCompute.deploy({
    appId: '1', gridId: '2', name: 'weather', target: 'SERVER',
    sourceFilesJson: '{}',
  });
  await client.playerCompute.setEnabled({
    appId: '1', gridId: '2', name: 'weather', enabled: true,
  });
  await client.playerCompute.myModules({ appId: '1' });
  await client.playerCompute.versions({ appId: '1', gridId: '2', name: 'weather' });
  await client.playerCompute.delete({ appId: '1', gridId: '2', name: 'weather' });

  await client.apps.codeAdmissionMode('1');
  await client.apps.codeAdmissions('1', true);
  await client.apps.setCodeAdmissionMode('1', CodeAdmissionMode.AllowList);
  await client.apps.admitCode({
    appId: '1', subjectKind: 'AUTHOR', subjectRef: '3',
  });
  await client.apps.revokeCodeAdmission('1', 'admission-2');

  assert.deepEqual(gameCalls[0], { appId: '1', gridId: '2' });
  assert.deepEqual(gameCalls[4], {
    appId: '1', gridId: '2', name: 'weather', enabled: true,
  });
  assert.deepEqual(managementCalls, [
    { appId: '1' },
    { appId: '1', includeRevoked: true },
    { appId: '1', mode: CodeAdmissionMode.AllowList },
    { input: { appId: '1', subjectKind: 'AUTHOR', subjectRef: '3' } },
    { appId: '1', admissionId: 'admission-2' },
  ]);
  client.close();
});

test('World Stores session exposes exactly the configured stores', async () => {
  const { createCrowdyClient } = await loadSdk();
  const { createWorldSession, manualTicker, jsonCodec } = await loadStores();
  const client = createCrowdyClient({
    managementUrl: 'https://management.invalid',
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
    model: true,
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
  assertMethods(session.model, 'session.model', [
    'watch', 'unwatch', 'get', 'list', 'onChange', 'bindToChannel', 'refresh', 'refreshAll',
  ]);

  // Unconfigured stores are absent at runtime too.
  const bare = createWorldSession(client, '1', { ticker: manualTicker() });
  for (const key of ['self', 'actors', 'errors', 'chunks', 'channelInbox',
    'actorInbox', 'events', 'host', 'save', 'avatar', 'model']) {
    assert.equal(bare[key], undefined, `bare session has no ${key}`);
  }

  session.dispose();
  bare.dispose();
  client.close();
});
