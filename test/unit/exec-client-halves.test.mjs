/**
 * ck-exec CLIENT halves offline: the `client.exec` methods against a fake GraphQL client (their
 * documents, arguments and mapping, the artifact's digest check), and `ExecClientHalves`, the
 * runner a game drives, against a fake `exec` and fake brokers: consent against trust, what a
 * digest change, a removal and a grid change stop, and how NOT_FOUND, RATE_LIMITED and refused
 * bytes hold a CLIENT half back.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

import {
  CrowdyGraphQLError,
  CrowdyProtocolError,
  EXEC_CLIENT_ABI_VERSION,
  ExecAPI,
  ExecClientHalves,
} from '../../dist/index.js';

const SUMMARY = {
  version: 1,
  target: 'client',
  imports: ['ck.host_call', 'ck.log'],
  hostFunctions: ['hud_set'],
  capabilityGroups: ['present'],
  presentationHooks: ['hud_set'],
  exportedFunctions: ['ck_alloc', 'ck_free', 'handle_invoke', 'init', 'tick'],
};
const SUMMARY_JSON = JSON.stringify(SUMMARY);
const HASH = 'c'.repeat(64);
const WASM = new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0]);
const DIGEST = createHash('sha256').update(WASM).digest('hex');

function graphqlError(code, message = code) {
  return new CrowdyGraphQLError([{ message, extensions: { code } }]);
}

/** An ExecAPI whose GraphQL client answers by operation name and records what it was asked. */
function fakeExec(answers) {
  const seen = [];
  const exec = new ExecAPI({
    request: async (doc, vars) => {
      const name = doc.definitions.find((d) => d.kind === 'OperationDefinition').name.value;
      seen.push([name, vars]);
      const answer = answers[name];
      if (!answer) throw new Error(`unexpected ${name}`);
      return typeof answer === 'function' ? answer(vars) : answer;
    },
  });
  return { exec, seen };
}

function artifactAnswer(overrides = {}) {
  return {
    execModClientArtifact: {
      __typename: 'ExecModClientArtifact',
      modId: '900',
      name: 'hud',
      gridId: '5',
      clientVersion: 2,
      digest: DIGEST,
      wasmBase64: Buffer.from(WASM).toString('base64'),
      sizeBytes: WASM.length,
      capabilitySummaryJson: SUMMARY_JSON,
      capabilityHash: HASH,
      tickIntervalMs: 250,
      fuelPerDispatch: '100000000',
      abiVersion: 0,
      ...overrides,
    },
  };
}

// ---- the client.exec methods ----

test('modClientBuild sends one crate and returns a client build; waitForModBuild polls modBuildStatus', async () => {
  const artifact = {
    __typename: 'ExecBuildArtifact', crate: 'hud', digest: DIGEST, sizeBytes: 8,
    capabilitySummaryJson: SUMMARY_JSON, capabilityHash: HASH, tickIntervalMs: 250,
  };
  const fields = { __typename: 'ExecBuild', buildId: 'b7', kind: 'client', log: null, createdAt: 't', startedAt: null, finishedAt: null };
  const statuses = ['building', 'succeeded'];
  const { exec, seen } = fakeExec({
    ExecModClientBuild: { execModClientBuild: { ...fields, status: 'queued', artifacts: [] } },
    ExecModBuildStatus: () => ({ execModBuildStatus: { ...fields, status: statuses.shift(), artifacts: [artifact] } }),
  });
  const queued = await exec.modClientBuild('77', { name: 'hud', files: { 'Cargo.toml': 'c', 'src/lib.rs': 'l' } });
  assert.equal(queued.kind, 'client');
  assert.equal(queued.status, 'queued');
  const done = await exec.waitForModBuild('77', 'b7', { intervalMs: 1 });
  assert.equal(done.status, 'succeeded');
  assert.deepEqual(done.artifacts, [{
    crate: 'hud', digest: DIGEST, sizeBytes: 8,
    capabilitySummaryJson: SUMMARY_JSON, capabilitySummary: SUMMARY, capabilityHash: HASH, tickIntervalMs: 250,
  }]);
  assert.deepEqual(seen, [
    ['ExecModClientBuild', { appId: '77', crate: { name: 'hud', files: [{ path: 'Cargo.toml', content: 'c' }, { path: 'src/lib.rs', content: 'l' }] } }],
    ['ExecModBuildStatus', { appId: '77', buildId: 'b7' }],
    ['ExecModBuildStatus', { appId: '77', buildId: 'b7' }],
  ]);
});

test('modClientDeploy, modClientDelete, consentClientMod and trustAuthor pass their arguments through', async () => {
  const attached = {
    __typename: 'ExecModClient', modId: '900', gridId: '5', name: 'hud', ownerId: '42', clientVersion: 3,
    digest: DIGEST, sizeBytes: 8, capabilitySummaryJson: SUMMARY_JSON, capabilityHash: HASH, tickIntervalMs: 250, updatedAt: 't',
  };
  const { exec, seen } = fakeExec({
    ExecModClientDeploy: { execModClientDeploy: attached },
    ExecModClientDelete: { execModClientDelete: true },
    ExecConsentClientMod: { execConsentClientMod: true },
    ExecTrustAuthor: { execTrustAuthor: true },
  });
  const { __typename, ...plain } = attached;
  assert.deepEqual(await exec.modClientDeploy('77', '5', 'hud', 'b7'), { ...plain, capabilitySummary: SUMMARY });
  assert.equal(await exec.modClientDelete('77', '5', 'hud'), true);
  assert.equal(await exec.consentClientMod('77', '900', HASH), true);
  assert.equal(await exec.trustAuthor('77', '5', '42', 'd'.repeat(64)), true);
  assert.deepEqual(seen, [
    ['ExecModClientDeploy', { appId: '77', gridId: '5', name: 'hud', buildId: 'b7' }],
    ['ExecModClientDelete', { appId: '77', gridId: '5', name: 'hud' }],
    ['ExecConsentClientMod', { appId: '77', modId: '900', capabilityHash: HASH }],
    ['ExecTrustAuthor', { appId: '77', gridId: '5', authorId: '42', capabilityHash: 'd'.repeat(64) }],
  ]);
});

test('a stale hash is CONFLICT, surfaced as the GraphQL error it is', async () => {
  const { exec } = fakeExec({
    ExecConsentClientMod: () => {
      throw graphqlError('CONFLICT', 'the CLIENT half\u2019s capability hash is not the one you consented to');
    },
  });
  await assert.rejects(exec.consentClientMod('77', '900', HASH), (e) => e instanceof CrowdyGraphQLError && e.code === 'CONFLICT');
});

test('gridClientMods parses both capability summaries alongside the raw JSON', async () => {
  const row = {
    __typename: 'ExecGridClientMod', modId: '900', name: 'hud', gridId: '5', authorId: '42', listingId: null,
    clientVersion: 2, digest: DIGEST, capabilitySummaryJson: SUMMARY_JSON, capabilityHash: HASH, tickIntervalMs: 250,
    callerConsented: false, authorCapabilitySummaryJson: '{not json', authorCapabilityHash: 'd'.repeat(64),
    callerTrustsAuthor: false, updatedAt: 't',
  };
  const { exec, seen } = fakeExec({ ExecGridClientMods: { execGridClientMods: [row] } });
  const [mod] = await exec.gridClientMods('77', '5');
  assert.equal(mod.capabilitySummaryJson, SUMMARY_JSON);
  assert.deepEqual(mod.capabilitySummary, SUMMARY);
  assert.equal(mod.authorCapabilitySummaryJson, '{not json');
  assert.equal(mod.authorCapabilitySummary, null, 'JSON that does not parse is null, not a throw');
  assert.equal('__typename' in mod, false);
  assert.deepEqual(seen, [['ExecGridClientMods', { appId: '77', gridId: '5' }]]);
});

test('listings carry the CLIENT half they were published with, parsed', async () => {
  const base = {
    __typename: 'ExecModListing', listingId: '555', title: 'Shop', description: null, publisherId: '42', sourceModId: '900',
    sourceVersion: 1, digest: 'ab'.repeat(32), installs: 0, createdAt: 't', delistedAt: null,
  };
  const { exec } = fakeExec({
    ExecModListings: {
      execModListings: [
        { ...base, clientDigest: DIGEST, clientCapabilitySummaryJson: SUMMARY_JSON, clientCapabilityHash: HASH, clientTickIntervalMs: 250 },
        { ...base, listingId: '556', clientDigest: null, clientCapabilitySummaryJson: null, clientCapabilityHash: null, clientTickIntervalMs: null },
      ],
    },
    ExecModPublish: { execModPublish: { ...base, clientDigest: null, clientCapabilitySummaryJson: null, clientCapabilityHash: null, clientTickIntervalMs: null } },
  });
  const [withClient, without] = await exec.modListings('77');
  assert.equal(withClient.clientDigest, DIGEST);
  assert.equal(withClient.clientTickIntervalMs, 250);
  assert.deepEqual(withClient.clientCapabilitySummary, SUMMARY);
  assert.equal(without.clientCapabilitySummary, null);
  assert.equal((await exec.modPublish('77', '5', 'shop', 'Shop')).clientCapabilitySummary, null);
});

test('modClientArtifactBytes decodes the module, checks its digest and returns what the broker needs', async () => {
  const { exec, seen } = fakeExec({ ExecModClientArtifact: artifactAnswer({ digest: DIGEST.toUpperCase() }) });
  const a = await exec.modClientArtifactBytes('77', '900');
  assert.ok(a.bytes instanceof ArrayBuffer);
  assert.deepEqual([...new Uint8Array(a.bytes)], [...WASM]);
  assert.equal(a.digest, DIGEST, 'lowercase hex, as the broker hashes');
  assert.equal(a.fuelPerDispatch, 100_000_000n);
  assert.equal(a.tickIntervalMs, 250);
  assert.deepEqual(a.capabilitySummary, SUMMARY);
  assert.deepEqual(
    [a.modId, a.name, a.gridId, a.clientVersion, a.capabilityHash, a.abiVersion, a.sizeBytes],
    ['900', 'hud', '5', 2, HASH, EXEC_CLIENT_ABI_VERSION, WASM.length],
  );
  assert.deepEqual(seen, [['ExecModClientArtifact', { appId: '77', modId: '900' }]]);

  const raw = await exec.modClientArtifact('77', '900');
  assert.equal(raw.fuelPerDispatch, '100000000');
  assert.equal(raw.wasmBase64, Buffer.from(WASM).toString('base64'));
});

test('modClientArtifactBytes refuses bytes that differ from the digest, and an ABI it does not run', async () => {
  const tampered = fakeExec({ ExecModClientArtifact: artifactAnswer({ digest: 'e'.repeat(64) }) });
  await assert.rejects(tampered.exec.modClientArtifactBytes('77', '900'), (e) => {
    assert.ok(e instanceof CrowdyProtocolError);
    assert.match(e.message, /not the digest/);
    return true;
  });
  const future = fakeExec({ ExecModClientArtifact: artifactAnswer({ abiVersion: 1 }) });
  await assert.rejects(future.exec.modClientArtifactBytes('77', '900'), (e) => e instanceof CrowdyProtocolError && /ABI 1/.test(e.message));
});

test('modClientArtifactBytes refuses a capability summary that does not parse: nothing would bound the module', async () => {
  const { exec } = fakeExec({ ExecModClientArtifact: artifactAnswer({ capabilitySummaryJson: '{"version":1' }) });
  await assert.rejects(exec.modClientArtifactBytes('77', '900'), (e) => e instanceof CrowdyProtocolError && /does not parse/.test(e.message));
});

test('modClientArtifactBytes passes NOT_FOUND and RATE_LIMITED through untouched', async () => {
  for (const code of ['NOT_FOUND', 'RATE_LIMITED']) {
    const { exec } = fakeExec({
      ExecModClientArtifact: () => {
        throw graphqlError(code);
      },
    });
    await assert.rejects(exec.modClientArtifactBytes('77', '900'), (e) => e instanceof CrowdyGraphQLError && e.code === code);
  }
});

// ---- ExecClientHalves, the runner ----

const GRID = { gridId: '5', low: { x: 0n, y: 0n, z: 0n }, high: { x: 3n, y: 1n, z: 3n } };

function listed(modId, overrides = {}) {
  const wasm = new Uint8Array([0, 97, 115, 109, 1, 0, 0, Number(modId) % 256]);
  return {
    modId,
    name: `mod-${modId}`,
    gridId: '5',
    authorId: '42',
    listingId: null,
    clientVersion: 1,
    digest: createHash('sha256').update(wasm).digest('hex'),
    capabilitySummaryJson: SUMMARY_JSON,
    capabilitySummary: SUMMARY,
    capabilityHash: HASH,
    tickIntervalMs: 250,
    callerConsented: false,
    authorCapabilitySummaryJson: SUMMARY_JSON,
    authorCapabilitySummary: SUMMARY,
    authorCapabilityHash: 'a'.repeat(64),
    callerTrustsAuthor: false,
    updatedAt: 't',
    ...overrides,
    wasm,
  };
}

/** A fake `exec` whose grid lists `state.mods`, with consent and trust recorded as the API would. */
function fakeGrid(mods) {
  const state = { mods, calls: [], fetchError: null };
  const row = (m) => {
    const { wasm: _, ...rest } = m;
    return { ...rest };
  };
  const exec = {
    async gridClientMods(appId, gridId) {
      state.calls.push(['list', appId, gridId]);
      return state.mods.map(row);
    },
    async consentClientMod(appId, modId, hash) {
      state.calls.push(['consent', modId, hash]);
      const m = state.mods.find((x) => x.modId === modId);
      if (!m || m.capabilityHash !== hash) throw graphqlError('CONFLICT');
      m.callerConsented = true;
      return true;
    },
    async trustAuthor(appId, gridId, authorId, hash) {
      state.calls.push(['trust', authorId, hash]);
      if (state.trustError) throw state.trustError;
      const theirs = state.mods.filter((x) => x.authorId === authorId);
      if (theirs.length === 0) throw graphqlError('NOT_FOUND');
      if (theirs[0].authorCapabilityHash !== hash) throw graphqlError('CONFLICT');
      for (const m of theirs) m.callerTrustsAuthor = true;
      return true;
    },
    async modClientArtifactBytes(appId, modId) {
      state.calls.push(['fetch', modId]);
      if (state.fetchError) throw state.fetchError;
      const m = state.mods.find((x) => x.modId === modId);
      if (!m) throw graphqlError('NOT_FOUND');
      return {
        modId, name: m.name, gridId: m.gridId, clientVersion: m.clientVersion, bytes: m.wasm.slice().buffer,
        digest: m.digest, sizeBytes: m.wasm.length, fuelPerDispatch: 5_000n, tickIntervalMs: m.tickIntervalMs,
        capabilitySummaryJson: m.capabilitySummaryJson, capabilitySummary: m.capabilitySummary, capabilityHash: m.capabilityHash, abiVersion: 0,
      };
    },
  };
  return { state, exec };
}

/** Records every broker the runner makes: its options, and its start and stop. */
function brokers() {
  const made = [];
  const factory = (options) => {
    const b = { options, started: 0, stopped: 0, bytes: null, fail: null };
    b.start = async (bytes) => {
      b.started++;
      b.bytes = new Uint8Array(bytes);
      if (b.fail) throw b.fail;
    };
    b.stop = () => {
      b.stopped++;
    };
    made.push(b);
    return b;
  };
  return { made, factory };
}

function runner(exec, extra = {}) {
  const events = [];
  const clock = { now: 1_000_000 };
  const { made, factory } = brokers();
  const halves = new ExecClientHalves({
    exec,
    appId: '77',
    workerUrl: 'glue.js',
    onHostCall: async (call, mod) => ({ call, modId: mod.modId }),
    onStarted: (mod) => events.push(['started', mod.modId, mod.digest.slice(0, 6)]),
    onStopped: (mod, reason) => events.push(['stopped', mod.modId, reason]),
    onError: (e) => events.push(['error', e.mod.modId, e.stage, e.reason]),
    now: () => clock.now,
    brokerFactory: factory,
    ...extra,
  });
  return { halves, events, made, clock };
}

test('the runner runs what the player consented to, without asking, in a ck-exec broker', async () => {
  const { state, exec } = fakeGrid([listed('1', { callerConsented: true }), listed('2')]);
  const { halves, events, made } = runner(exec);
  halves.enterGrid(GRID);
  await halves.refresh();
  assert.deepEqual(events, [['started', '1', state.mods[0].digest.slice(0, 6)]]);
  assert.equal(made.length, 1);
  const { options } = made[0];
  assert.equal(options.engine, 'ck-exec');
  assert.equal(options.artifactHash, state.mods[0].digest);
  assert.equal(options.fuelPerDispatch, 5_000n);
  assert.equal(options.tickIntervalMs, 250);
  assert.equal(options.moduleName, 'mod-1');
  assert.deepEqual(options.consentedHostCalls, ['hud_set'], 'bounded to the summary the player consented to');
  assert.equal(options.workerUrl, 'glue.js');
  assert.deepEqual(options.grid, { low: GRID.low, high: GRID.high, gridId: '5' });
  assert.deepEqual([...made[0].bytes], [...state.mods[0].wasm]);
  assert.deepEqual(await options.onHostCall({ fn: 'chunk_get', args: {} }), { call: { fn: 'chunk_get', args: {} }, modId: '1' });
  assert.deepEqual(halves.running.map((m) => m.modId), ['1']);
  assert.ok(!state.calls.some(([op]) => op === 'consent' || op === 'trust'), 'nothing is consented without a confirm');
});

test('the broker allows only host calls both in the listed summary and in the served artifact\u2019s', async () => {
  const wide = { ...SUMMARY, hostFunctions: ['hud_set', 'overlay_draw'] };
  const { exec } = fakeGrid([
    listed('1', { callerConsented: true, capabilitySummary: wide, capabilitySummaryJson: JSON.stringify(wide) }),
  ]);
  const fetch = exec.modClientArtifactBytes;
  exec.modClientArtifactBytes = async (...args) => ({ ...(await fetch(...args)), capabilitySummary: SUMMARY });
  const { halves, made } = runner(exec);
  halves.enterGrid(GRID);
  await halves.refresh();
  assert.equal(made.length, 1);
  assert.deepEqual(made[0].options.consentedHostCalls, ['hud_set']);
});

test('trust is asked once per author, answered with trustAuthor at the union hash; a no is not asked again', async () => {
  const { state, exec } = fakeGrid([
    listed('1'),
    listed('2'),
    listed('3', { authorId: '43', authorCapabilityHash: 'b'.repeat(64) }),
  ]);
  const prompts = [];
  const { halves, events } = runner(exec, {
    confirm: (p) => {
      prompts.push(p);
      return p.authorId === '42';
    },
  });
  halves.enterGrid(GRID);
  await halves.refresh();
  assert.deepEqual(
    prompts.map((p) => [p.kind, p.authorId, p.capabilityHash, p.mods.map((m) => m.modId)]),
    [
      ['author', '42', 'a'.repeat(64), ['1', '2']],
      ['author', '43', 'b'.repeat(64), ['3']],
    ],
  );
  assert.deepEqual(prompts[0].capabilitySummary, SUMMARY);
  assert.deepEqual(state.calls.filter(([op]) => op === 'trust'), [['trust', '42', 'a'.repeat(64)]]);
  assert.deepEqual(events.map((e) => e.slice(0, 2)), [['started', '1'], ['started', '2']]);

  await halves.refresh();
  assert.equal(prompts.length, 2, 'the declined author is not asked again at the same hash');

  // A wider union is a new hash, and a new question.
  state.mods[2].authorCapabilityHash = 'f'.repeat(64);
  await halves.refresh();
  assert.deepEqual(prompts.slice(2).map((p) => [p.authorId, p.capabilityHash]), [['43', 'f'.repeat(64)]]);
});

test("ask: 'mod' consents per CLIENT half at its own hash", async () => {
  const { state, exec } = fakeGrid([listed('1'), listed('2', { capabilityHash: 'e'.repeat(64) })]);
  const prompts = [];
  const { halves, events } = runner(exec, {
    ask: 'mod',
    confirm: (p) => {
      prompts.push(p);
      return p.mods[0].modId === '2';
    },
  });
  halves.enterGrid(GRID);
  await halves.refresh();
  assert.deepEqual(prompts.map((p) => [p.kind, p.capabilityHash, p.mods.map((m) => m.modId)]), [
    ['mod', HASH, ['1']],
    ['mod', 'e'.repeat(64), ['2']],
  ]);
  assert.deepEqual(state.calls.filter(([op]) => op === 'consent' || op === 'trust'), [['consent', '2', 'e'.repeat(64)]]);
  assert.deepEqual(events.map((e) => e.slice(0, 2)), [['started', '2']]);
});

test('a new digest restarts the CLIENT half; a removed one stops; the module cache spares a refetch', async () => {
  const { state, exec } = fakeGrid([listed('1', { callerConsented: true }), listed('2', { callerConsented: true })]);
  const { halves, events, made } = runner(exec);
  halves.enterGrid(GRID);
  await halves.refresh();
  assert.equal(made.length, 2);

  // mod 1 gets new bytes; mod 2 is deleted.
  const next = listed('1', { callerConsented: true, clientVersion: 2 });
  next.wasm = new Uint8Array([0, 97, 115, 109, 1, 0, 0, 99]);
  next.digest = createHash('sha256').update(next.wasm).digest('hex');
  state.mods = [next];
  events.length = 0;
  await halves.refresh();
  assert.deepEqual(events, [
    ['stopped', '1', 'changed'],
    ['stopped', '2', 'removed'],
    ['started', '1', next.digest.slice(0, 6)],
  ]);
  assert.equal(made[0].stopped, 1);
  assert.equal(made[1].stopped, 1);
  assert.equal(made[2].options.artifactHash, next.digest);

  // Leaving the grid stops it; coming back starts it from the cache, with no second fetch.
  const fetches = () => state.calls.filter(([op]) => op === 'fetch').length;
  const before = fetches();
  halves.enterGrid(null);
  assert.deepEqual(events.at(-1), ['stopped', '1', 'left-grid']);
  halves.enterGrid(GRID);
  await halves.refresh();
  assert.deepEqual(events.at(-1), ['started', '1', next.digest.slice(0, 6)]);
  assert.equal(fetches(), before);
});

test('a CLIENT half whose capability hash changes stops until the player consents again', async () => {
  const { state, exec } = fakeGrid([listed('1', { callerConsented: true })]);
  const prompts = [];
  const { halves, events } = runner(exec, {
    ask: 'mod',
    confirm: (p) => {
      prompts.push(p.capabilityHash);
      return false;
    },
  });
  halves.enterGrid(GRID);
  await halves.refresh();
  state.mods[0].capabilityHash = 'e'.repeat(64);
  state.mods[0].callerConsented = false;
  await halves.refresh();
  assert.deepEqual(events.map((e) => e.slice(0, 3)), [['started', '1', state.mods[0].digest.slice(0, 6)], ['stopped', '1', 'changed']]);
  assert.deepEqual(prompts, ['e'.repeat(64)]);
  assert.equal(halves.running.length, 0);
});

test('NOT_FOUND and RATE_LIMITED hold a CLIENT half back before it is fetched again', async () => {
  const { state, exec } = fakeGrid([listed('1', { callerConsented: true })]);
  const { halves, events, clock } = runner(exec);
  const fetches = () => state.calls.filter(([op]) => op === 'fetch').length;
  halves.enterGrid(GRID);

  state.fetchError = graphqlError('NOT_FOUND');
  await halves.refresh();
  assert.deepEqual(events, [['error', '1', 'fetch', 'not-found']]);
  await halves.refresh();
  assert.equal(fetches(), 1, 'not fetched again inside the 15 s wait');
  clock.now += 15_001;
  state.fetchError = graphqlError('RATE_LIMITED');
  await halves.refresh();
  assert.equal(fetches(), 2);
  assert.deepEqual(events.at(-1), ['error', '1', 'fetch', 'rate-limited']);
  clock.now += 30_000;
  await halves.refresh();
  assert.equal(fetches(), 2, 'a rate limit waits out the minute');
  clock.now += 30_001;
  state.fetchError = null;
  await halves.refresh();
  assert.equal(fetches(), 3);
  assert.deepEqual(events.at(-1).slice(0, 2), ['started', '1']);
});

test('bytes that differ from their digest never reach a broker', async () => {
  const { state, exec: grid } = fakeGrid([listed('1', { callerConsented: true })]);
  const m = state.mods[0];
  // The real modClientArtifactBytes over an API that serves the wrong bytes for the digest.
  const { exec: api } = fakeExec({
    ExecModClientArtifact: artifactAnswer({ modId: '1', digest: m.digest, wasmBase64: Buffer.from([1, 2, 3]).toString('base64') }),
  });
  const exec = { ...grid, modClientArtifactBytes: (appId, modId) => api.modClientArtifactBytes(appId, modId) };
  const { halves, events, made } = runner(exec);
  halves.enterGrid(GRID);
  await halves.refresh();
  assert.deepEqual(events, [['error', '1', 'fetch', 'refused']]);
  assert.equal(made.length, 0);
});

test('a listed CLIENT half whose summary does not parse is never fetched or started', async () => {
  const { state, exec } = fakeGrid([listed('1', { callerConsented: true, capabilitySummary: null })]);
  const { halves, events, made } = runner(exec);
  halves.enterGrid(GRID);
  await halves.refresh();
  assert.deepEqual(events, [['error', '1', 'start', 'refused']]);
  assert.equal(made.length, 0);
  assert.equal(state.calls.filter(([op]) => op === 'fetch').length, 0);
});

test('a trust refused while the player is not yet in the grid is retried without asking again', async () => {
  const { state, exec } = fakeGrid([listed('1')]);
  let asked = 0;
  const { halves, events } = runner(exec, {
    confirm: () => {
      asked++;
      return true;
    },
  });
  halves.enterGrid(GRID);
  state.trustError = graphqlError('NOT_FOUND');
  await halves.refresh();
  assert.deepEqual(events, [['error', '1', 'consent', 'not-found']]);
  state.trustError = null;
  await halves.refresh();
  assert.equal(asked, 1);
  assert.deepEqual(state.calls.filter(([op]) => op === 'trust').length, 2);
  assert.deepEqual(events.at(-1).slice(0, 2), ['started', '1']);
});

test('a consent answered CONFLICT asks again at the new hash', async () => {
  const { state, exec } = fakeGrid([listed('1')]);
  const prompts = [];
  const real = exec.consentClientMod;
  exec.consentClientMod = async (...args) => {
    // The hash moves on between the listing and the consent.
    state.mods[0].capabilityHash = 'e'.repeat(64);
    exec.consentClientMod = real;
    return real(...args);
  };
  const { halves, events } = runner(exec, {
    ask: 'mod',
    confirm: (p) => {
      prompts.push(p.capabilityHash);
      return true;
    },
  });
  halves.enterGrid(GRID);
  await halves.refresh();
  assert.deepEqual(events, [['error', '1', 'consent', 'conflict']]);
  await halves.refresh();
  assert.deepEqual(prompts, [HASH, 'e'.repeat(64)]);
  assert.deepEqual(events.at(-1).slice(0, 2), ['started', '1']);
});

test('a grid change during a fetch leaves nothing running for the old grid', async () => {
  const { state, exec } = fakeGrid([listed('1', { callerConsented: true })]);
  let release;
  const fetch = exec.modClientArtifactBytes;
  exec.modClientArtifactBytes = async (...args) => {
    await new Promise((r) => (release = r));
    return fetch(...args);
  };
  const { halves, made } = runner(exec);
  halves.enterGrid(GRID);
  const pending = halves.refresh();
  await new Promise((r) => setImmediate(r));
  halves.enterGrid({ ...GRID, gridId: '6' });
  release();
  await pending;
  assert.equal(made.length, 0);
  assert.equal(halves.running.length, 0);
  assert.equal(state.calls.filter(([op]) => op === 'fetch').length, 1);
});

test('filter leaves CLIENT halves alone, and a tripped circuit stops one and holds it back', async () => {
  const { exec } = fakeGrid([listed('1', { callerConsented: true }), listed('2', { callerConsented: true })]);
  let skip = '2';
  const { halves, events, made, clock } = runner(exec, { filter: (m) => m.modId !== skip });
  halves.enterGrid(GRID);
  await halves.refresh();
  assert.deepEqual(halves.running.map((m) => m.modId), ['1']);
  skip = '1';
  await halves.refresh();
  assert.deepEqual(events.map((e) => e.slice(0, 3)).filter((e) => e[0] === 'stopped'), [['stopped', '1', 'filtered']]);
  assert.deepEqual(halves.running.map((m) => m.modId), ['2']);

  made.at(-1).options.onCircuitOpen('global host-call rate exceeded');
  assert.deepEqual(events.at(-1), ['stopped', '2', 'circuit-open']);
  await halves.refresh();
  assert.equal(halves.running.length, 0, 'held back after its circuit opened');
  clock.now += 60_001;
  await halves.refresh();
  assert.deepEqual(halves.running.map((m) => m.modId), ['2']);
});

test('a broker that will not start is reported and the CLIENT half is tried again later', async () => {
  const { exec } = fakeGrid([listed('1', { callerConsented: true })]);
  const failing = brokers();
  const events = [];
  const halves = new ExecClientHalves({
    exec,
    appId: '77',
    workerUrl: 'glue.js',
    onHostCall: async () => null,
    onError: (e) => events.push([e.stage, e.reason, e.retryAt > 0]),
    brokerFactory: (options) => {
      const b = failing.factory(options);
      b.fail = new Error('refusing to run an artifact that was not fetched from the platform');
      return b;
    },
  });
  halves.enterGrid(GRID);
  await halves.refresh();
  assert.deepEqual(events, [['start', 'failed', true]]);
  assert.equal(failing.made[0].stopped, 1);
  assert.equal(halves.running.length, 0);
});

test('stop() stops everything; refresh without a grid does nothing', async () => {
  const { state, exec } = fakeGrid([listed('1', { callerConsented: true })]);
  const { halves, events } = runner(exec);
  await halves.refresh();
  assert.deepEqual(state.calls, []);
  halves.enterGrid(GRID);
  await halves.refresh();
  halves.stop();
  assert.deepEqual(events.at(-1), ['stopped', '1', 'stopped']);
  await halves.refresh();
  assert.equal(state.calls.filter(([op]) => op === 'list').length, 1);
});

test('a listing that fails rejects refresh and leaves what runs running', async () => {
  const { exec } = fakeGrid([listed('1', { callerConsented: true })]);
  const { halves } = runner(exec);
  halves.enterGrid(GRID);
  await halves.refresh();
  exec.gridClientMods = async () => {
    throw new Error('network down');
  };
  await assert.rejects(halves.refresh(), /network down/);
  assert.deepEqual(halves.running.map((m) => m.modId), ['1']);
});
