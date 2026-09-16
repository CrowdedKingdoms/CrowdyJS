// The bulk-container surface (cks-game-api 2026-09-16), through the SDK,
// against a live API: a keyed seed, paged identity, bulk state, a session
// stamped from the app's template rows, and a type scoped to the app.
//
// Requires CROWDY_HTTP_URL, CROWDY_OWNER_EMAIL, CROWDY_OWNER_PASSWORD and
// CROWDY_TEST_APP_ID (for the owner's org); skips otherwise. A fresh app is
// created per run so the counts here are exact.
import test from 'node:test';
import assert from 'node:assert/strict';
import { skipReasonFor, gameClientConfig, MANAGEMENT_E2E_ENV } from '../helpers.mjs';
import { createNewApp, mintAppAccess, ownerOrgId, provisionOwner } from '../provision.mjs';

const skip = skipReasonFor([...MANAGEMENT_E2E_ENV, 'CROWDY_OWNER_PASSWORD']);

const hex32 = (i) => i.toString(16).padStart(32, '0');

async function adminGameModel() {
  const { createCrowdyClient } = await import('../../dist/index.js');
  const owner = await provisionOwner();
  const orgId = await ownerOrgId(owner.token);
  const appId = await createNewApp(owner.token, orgId, `gm-bulk-${Date.now().toString(36)}`);
  const access = await mintAppAccess(appId, owner.token);
  const client = createCrowdyClient(gameClientConfig(access));
  client.setToken(access.token);
  return { appId, gameModel: client.gameModel };
}

test('bulk containers: keyed seed, paged identity, bulk state, session seed, app scope', { skip, timeout: 120_000 }, async () => {
  const { appId, gameModel } = await adminGameModel();
  const N = 350;

  // 1. A keyed seed of N world objects on an admin type, with one property each.
  const seeded = await gameModel.seed({
    appId,
    containerTypes: [
      { typeName: 'WorldObject', displayName: 'World object', instantiableBy: 'admin' },
      { typeName: 'Landmark', displayName: 'Landmark', instantiableBy: 'admin', scope: 'app' },
    ],
    propertyDefinitions: [
      { containerTypeName: 'WorldObject', key: 'hp', valueType: 'int', defaultValueJson: '0' },
    ],
    containers: [
      ...Array.from({ length: N }, (_, i) => ({
        tempId: `w${i}`,
        typeName: 'WorldObject',
        displayName: `Obj ${i}`,
        bindingKey: hex32(i),
        properties: [{ key: 'hp', valueType: 'int', valueJson: String(i) }],
      })),
      { tempId: 'lm', typeName: 'Landmark', displayName: 'Old Tower', bindingKey: 'tower-1' },
    ],
  });
  assert.equal(seeded.containersCreated, N + 1);
  const idMap = JSON.parse(seeded.idMapJson);
  assert.equal(Object.keys(idMap).length, N + 1);

  // Re-seed is idempotent on the key.
  const again = await gameModel.seed({
    appId,
    containers: [{ tempId: 'w0', typeName: 'WorldObject', displayName: 'Obj 0', bindingKey: hex32(0) }],
  });
  assert.equal(again.containersCreated, 0);
  assert.equal(JSON.parse(again.idMapJson).w0, idMap.w0);

  // 2. Paged identity: default page 200, then the rest; the union is the whole type.
  const page1 = await gameModel.containers({ appId, typeName: 'WorldObject' });
  assert.equal(page1.length, 200, 'an omitted limit is a page of 200');
  const page2 = await gameModel.containers({ appId, typeName: 'WorldObject', limit: 1000, offset: 200 });
  assert.equal(page2.length, N - 200);
  const ids = [...page1, ...page2].map((c) => c.containerId);
  assert.equal(new Set(ids).size, N, 'pages do not overlap');
  await assert.rejects(
    gameModel.containers({ appId, typeName: 'WorldObject', limit: 1001 }),
    /maximum page of 1000/,
  );

  // 3. Bulk state over the first page, in two calls of 500 max.
  const states = await gameModel.containerStates({ appId, containerIds: ids.slice(0, 200) });
  assert.equal(states.length, 200);
  const byId = new Map(states.map((s) => [s.containerId, s]));
  for (const c of page1) {
    const s = byId.get(c.containerId);
    assert.ok(s, `state for ${c.containerId}`);
    const i = Number(c.displayName.slice('Obj '.length));
    assert.deepEqual(JSON.parse(s.propertiesJson), { hp: i });
  }
  await assert.rejects(
    gameModel.containerStates({ appId, containerIds: Array.from({ length: 501 }, (_, i) => `00000000-0000-0000-0000-${String(i).padStart(12, '0')}`) }),
    /at most 500/,
  );

  // 4. A session stamped from the template rows, with state.
  const session = await gameModel.createSession({
    appId,
    name: 'seeded match',
    presence: 'none',
    seedFromApp: { typeNames: ['WorldObject'], initialState: 'app' },
  });
  assert.equal(session.seededContainerCount, N);
  const inSession = await gameModel.containers({
    appId,
    typeName: 'WorldObject',
    sessionId: session.sessionId,
    bindingKey: hex32(42),
  });
  assert.equal(inSession.length, 1);
  assert.equal(inSession[0].displayName, 'Obj 42');
  const [copy] = await gameModel.containerStates({ appId, containerIds: [inSession[0].containerId] });
  assert.deepEqual(JSON.parse(copy.propertiesJson), { hp: 42 });
  const reread = await gameModel.session({ appId, sessionId: session.sessionId });
  assert.equal(reread.seededContainerCount, null, 'the count is on the create response only');
  const events = await gameModel.sessionEvents({ appId, sessionId: session.sessionId, afterRevision: '0' });
  assert.equal(events[0].kind, 'created');
  assert.equal(JSON.parse(events[0].payloadJson).containersSeeded, N);
  await assert.rejects(
    gameModel.createSession({ appId, presence: 'none', seedFromApp: { typeNames: ['Nope'] } }),
    /does not define/,
  );

  // 5. The app-scoped type: readable as such, and a scope flip is refused
  //    while WorldObject holds session copies.
  const types = await gameModel.containerTypes({ appId });
  assert.equal(types.find((t) => t.typeName === 'Landmark').scope, 'app');
  assert.equal(types.find((t) => t.typeName === 'WorldObject').scope, 'session');
  await assert.rejects(
    gameModel.upsertContainerType({
      appId,
      typeName: 'WorldObject',
      displayName: 'World object',
      instantiableBy: 'admin',
      scope: 'app',
    }),
    /session-scoped row/,
  );
});
