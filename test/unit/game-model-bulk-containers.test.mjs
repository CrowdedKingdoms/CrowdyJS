import test from 'node:test';
import assert from 'node:assert/strict';
import { loadSdk } from '../helpers.mjs';

/**
 * The bulk-container surface (cks-game-api 2026-09-16): `containerStates`,
 * `seedFromApp` on session creation, a `bindingKey` per seeded container and
 * `scope` on a container type. Each is a thin request over its generated
 * document, so what is worth pinning offline is the document name, the
 * selection the server contract promises, and that the new inputs pass through
 * untouched. Live behaviour is the e2e's job.
 */

function operationOf(document) {
  return document.definitions.find((d) => d.kind === 'OperationDefinition');
}

function fragmentFields(document, name) {
  const fragment = document.definitions.find(
    (d) => d.kind === 'FragmentDefinition' && d.name.value === name,
  );
  assert.ok(fragment, `fragment ${name} is spread by the document`);
  return fragment.selectionSet.selections.map((s) => s.name.value);
}

function rootSelectionFields(document) {
  const root = operationOf(document).selectionSet.selections[0];
  return root.selectionSet.selections.map((s) => s.name.value);
}

function fakeApi(GameModelAPI, calls) {
  return new GameModelAPI({
    async request(document, variables) {
      const op = operationOf(document);
      const root = op.selectionSet.selections[0].name.value;
      calls.push({ op: op.name.value, root, variables, document });
      return { [root]: { marker: root } };
    },
  });
}

test('containerStates wraps GameModelContainerStates with the same selection as containerState', async () => {
  const { GameModelAPI } = await loadSdk();
  const calls = [];
  const api = fakeApi(GameModelAPI, calls);
  const appId = '89512039153664';
  const containerIds = [
    '11111111-1111-1111-1111-111111111111',
    '22222222-2222-2222-2222-222222222222',
  ];

  const result = await api.containerStates({ appId, containerIds });
  const bulk = calls.at(-1);
  assert.equal(bulk.op, 'GameModelContainerStates');
  assert.equal(bulk.root, 'gameModelContainerStates');
  assert.deepEqual(bulk.variables, { appId, containerIds });
  assert.deepEqual(result, { marker: 'gameModelContainerStates' });

  await api.containerState({ appId, containerId: containerIds[0] });
  const single = calls.at(-1);
  assert.deepEqual(
    rootSelectionFields(bulk.document),
    rootSelectionFields(single.document),
    'the bulk read selects exactly what the single read selects',
  );
  assert.ok(rootSelectionFields(bulk.document).includes('propertiesJson'));
});

test('createSession passes seedFromApp through and the session fragment carries seededContainerCount', async () => {
  const { GameModelAPI } = await loadSdk();
  const calls = [];
  const api = fakeApi(GameModelAPI, calls);
  const input = {
    appId: '89512039153664',
    name: 'match',
    presence: 'none',
    seedFromApp: { typeNames: ['WorldObject', 'Spawner'], initialState: 'app' },
  };
  await api.createSession(input);
  const call = calls.at(-1);
  assert.equal(call.op, 'GameModelCreateSession');
  assert.deepEqual(call.variables, { input });
  const fields = fragmentFields(call.document, 'GmSessionFields');
  assert.ok(fields.includes('seededContainerCount'), fields.join(','));
});

test('seed passes bindingKey per container and scope per type through untouched', async () => {
  const { GameModelAPI } = await loadSdk();
  const calls = [];
  const api = fakeApi(GameModelAPI, calls);
  const input = {
    appId: '89512039153664',
    containerTypes: [
      { typeName: 'WorldObject', displayName: 'World object', instantiableBy: 'admin' },
      { typeName: 'Landmark', displayName: 'Landmark', instantiableBy: 'admin', scope: 'app' },
    ],
    containers: [
      { tempId: 'c1', typeName: 'WorldObject', displayName: 'Camp', bindingKey: '0f'.repeat(16) },
      { tempId: 'l1', typeName: 'Landmark', displayName: 'Tower', bindingKey: 'tower-1' },
    ],
  };
  await api.seed(input);
  const call = calls.at(-1);
  assert.equal(call.op, 'GameModelSeed');
  assert.deepEqual(call.variables, { input });
});

test('upsertContainerType passes scope and the type selections read it back', async () => {
  const { GameModelAPI } = await loadSdk();
  const calls = [];
  const api = fakeApi(GameModelAPI, calls);
  const input = {
    appId: '89512039153664',
    typeName: 'Landmark',
    displayName: 'Landmark',
    instantiableBy: 'admin',
    scope: 'app',
  };
  await api.upsertContainerType(input);
  const upsert = calls.at(-1);
  assert.equal(upsert.op, 'GameModelUpsertContainerType');
  assert.deepEqual(upsert.variables, { input });
  assert.ok(rootSelectionFields(upsert.document).includes('scope'));

  await api.containerTypes({ appId: input.appId });
  const list = calls.at(-1);
  assert.equal(list.op, 'GameModelContainerTypes');
  assert.ok(rootSelectionFields(list.document).includes('scope'));
});

test('kit.matches.create forwards seedFromApp to createSession, and omits it when not given', async () => {
  const { MatchesKit } = await loadSdk();
  const created = [];
  const gameModel = {
    async createSession(input) {
      created.push(input);
      return { sessionId: 'sid', status: 'active', presence: 'none', seededContainerCount: 3 };
    },
    async createContainer(input) {
      return { containerId: 'meta-1', displayName: input.displayName, sessionId: 'sid' };
    },
    async container() {
      return { containerId: 'meta-1', displayName: 'm', sessionId: 'sid', typeName: 'MatchMeta' };
    },
    async containerState() {
      return { properties: [] };
    },
  };
  const channels = {
    async create() {
      return { groupId: '77' };
    },
  };
  const kit = new MatchesKit('7', gameModel, channels, undefined);
  await kit
    .create({ creatorUserId: '42', seedFromApp: { typeNames: ['Chest'] } })
    .catch(() => undefined);
  await kit.create({ creatorUserId: '42' }).catch(() => undefined);
  assert.equal(created.length, 2);
  assert.deepEqual(created[0].seedFromApp, { typeNames: ['Chest'] });
  assert.equal(created[0].presence, 'none');
  assert.equal('seedFromApp' in created[1], false, 'absent when the caller did not ask');
});
