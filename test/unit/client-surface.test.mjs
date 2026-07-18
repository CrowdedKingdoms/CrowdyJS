/**
 * Offline unit test for the full-surface SDK shape.
 *
 * Constructs a CrowdyClient (no network) and asserts every sub-client and
 * grouping facade is present and exposes the expected methods. This guards the
 * wiring in crowdy-client.ts as the surface grows.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadSdk } from '../helpers.mjs';

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

  // Admin grouping facade points at the same instances.
  assert.equal(client.admin.organizations, client.organizations, 'admin.organizations aliases client.organizations');
  assert.equal(client.admin.billing, client.billing, 'admin.billing aliases client.billing');
  assert.equal(client.admin.environments, client.environments, 'admin.environments aliases client.environments');
  assert.equal(client.admin.grids, client.gameApps, 'admin.grids aliases client.gameApps');

  client.close();
});
