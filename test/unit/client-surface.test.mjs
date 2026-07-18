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

test('client exposes the full management + game sub-client surface', async () => {
  const { createCrowdyClient } = await loadSdk();
  const client = createCrowdyClient({
    managementUrl: 'https://management.invalid',
    httpUrl: 'https://game.invalid',
    wsUrl: 'wss://game.invalid',
  });

  // Existing client-facing sub-clients still present.
  for (const k of [
    'auth', 'users', 'apps', 'platform', 'chunks', 'voxels', 'actors',
    'teleport', 'state', 'serverStatus', 'channels', 'teams', 'udp', 'gameModel',
  ]) {
    assert.ok(client[k], `client.${k} should exist`);
  }

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
  assertMethods(client.gameApps, 'gameApps', ['userPermissions', 'nearbyPermissions', 'permissionLimits', 'createGrid', 'grantPermissions', 'assignGroup']);

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
  assert.equal(client.admin.billing, client.billing, 'admin.billing aliases client.billing');
  assert.equal(client.admin.environments, client.environments, 'admin.environments aliases client.environments');
  assert.equal(client.admin.grids, client.gameApps, 'admin.grids aliases client.gameApps');

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
