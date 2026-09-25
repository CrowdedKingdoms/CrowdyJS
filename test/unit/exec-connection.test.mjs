/**
 * `client.exec` against a fake gateway: a `ws` server speaking the ck-exec client protocol,
 * and a fake `execConnect` that hands out its address. Covers calls, errors, pushes,
 * reconnecting after the host goes away (subscriptions renewed), and redialing on `Moved`.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { WebSocket, WebSocketServer } from 'ws';
import { decode, encode } from '@msgpack/msgpack';

import { CrowdyExecError, ExecAPI, ExecModScope, execModType } from '../../dist/index.js';

function readClientFrame(buf) {
  const b = new Uint8Array(buf);
  let at = 0;
  const u8 = () => b[at++];
  const u16 = () => (at += 2, b[at - 2] | (b[at - 1] << 8));
  const u32 = () => (at += 4, (b[at - 4] | (b[at - 3] << 8) | (b[at - 2] << 16) | (b[at - 1] << 24)) >>> 0);
  const str = (n) => Buffer.from(b.subarray(at, (at += n))).toString('utf8');
  const tag = u8();
  if (tag === 0x04) return { kind: 'ping', nonce: u32() };
  const rid = u32();
  const nodeType = str(u8());
  const key = str(u16());
  if (tag === 0x01) {
    const method = str(u8());
    return { kind: 'call', rid, nodeType, key, method, payload: b.slice(at) };
  }
  return { kind: tag === 0x02 ? 'subscribe' : 'unsubscribe', rid, nodeType, key, topic: str(u8()) };
}

const u32le = (v) => {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(v);
  return b;
};
const s8 = (s) => Buffer.concat([Buffer.from([Buffer.byteLength(s)]), Buffer.from(s)]);
const s16 = (s) => {
  const b = Buffer.alloc(2);
  b.writeUInt16LE(Buffer.byteLength(s));
  return Buffer.concat([b, Buffer.from(s)]);
};
const reply = (rid, status, payload = new Uint8Array()) =>
  Buffer.concat([Buffer.from([0x81]), u32le(rid), Buffer.from([status]), Buffer.from(payload)]);
const push = (nodeType, key, topic, payload) =>
  Buffer.concat([Buffer.from([0x82]), s8(nodeType), s16(key), s8(topic), Buffer.from(payload)]);
const pong = (nonce) => Buffer.concat([Buffer.from([0x84]), u32le(nonce)]);

/** A gateway whose behaviour a test scripts per connection. */
async function fakeGateway(onFrame) {
  const wss = new WebSocketServer({ port: 0 });
  await new Promise((r) => wss.once('listening', r));
  const gw = { wss, sockets: [], frames: [], url: `ws://127.0.0.1:${wss.address().port}` };
  wss.on('connection', (ws, req) => {
    const conn = { ws, n: gw.sockets.length, token: new URL(req.url, 'http://x').searchParams.get('token') };
    gw.sockets.push(conn);
    ws.on('message', (data) => {
      const f = readClientFrame(data);
      gw.frames.push({ conn: conn.n, ...f });
      onFrame(f, conn, gw);
    });
  });
  return gw;
}

function api(gw) {
  const dials = [];
  const graphql = {
    request: async (_doc, vars) => {
      dials.push(vars);
      return {
        execConnect: {
          gatewayUrl: gw.url,
          token: `token-${dials.length}`,
          host: `host-${dials.length}`,
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
        },
      };
    },
  };
  return { exec: new ExecAPI(graphql), dials };
}

const opts = { WebSocket, callTimeoutMs: 2_000 };

/** Answers every call with `{ method, args }` and every subscribe with Ok. */
function echo(f, conn) {
  if (f.kind === 'call') conn.ws.send(reply(f.rid, 0, encode({ method: f.method, args: decode(f.payload) })));
  if (f.kind === 'subscribe' || f.kind === 'unsubscribe') conn.ws.send(reply(f.rid, 0));
  if (f.kind === 'ping') conn.ws.send(pong(f.nonce));
}

const until = async (what, check, ms = 3_000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (check()) return;
    await new Promise((r) => setTimeout(r, 10));
  }
  assert.fail(`timed out waiting for ${what}`);
};

test('connect asks for a host with the placement it wants, and calls round-trip as MessagePack', async (t) => {
  const gw = await fakeGateway(echo);
  t.after(() => gw.wss.close());
  const { exec, dials } = api(gw);
  const c = await exec.connect('77', { ...opts, nodeType: 'arena', key: 'm1' });
  t.after(() => c.close());
  assert.deepEqual(dials, [{ appId: '77', nodeType: 'arena', key: 'm1' }]);
  assert.equal(gw.sockets[0].token, 'token-1');
  assert.equal(c.host, 'host-1');
  assert.deepEqual(await c.call('arena', 'm1', 'hit', { weapon: 2 }), { method: 'hit', args: { weapon: 2 } });
  assert.ok((await c.ping()) >= 0);
});

test('a refused call is a CrowdyExecError with the platform status and the handler message', async (t) => {
  const gw = await fakeGateway((f, conn) => {
    if (f.kind === 'call') conn.ws.send(reply(f.rid, f.method === 'fail' ? 1 : 6, Buffer.from('no such thing')));
  });
  t.after(() => gw.wss.close());
  const c = await api(gw).exec.connect('77', opts);
  t.after(() => c.close());
  await assert.rejects(c.call('arena', 'm1', 'fail'), (e) => {
    assert.ok(e instanceof CrowdyExecError);
    assert.equal(e.status, 'AppError');
    assert.equal(e.retryable, false);
    assert.match(e.message, /no such thing/);
    return true;
  });
  await assert.rejects(c.call('arena', 'm1', 'apply_damage'), (e) => e.status === 'Denied');
});

test('pushes reach their handlers decoded, and the last unsubscribe tells the gateway', async (t) => {
  const gw = await fakeGateway((f, conn) => {
    echo(f, conn);
    if (f.kind === 'subscribe') setTimeout(() => conn.ws.send(push(f.nodeType, f.key, f.topic, encode({ hp: 9 }))), 5);
  });
  t.after(() => gw.wss.close());
  const c = await api(gw).exec.connect('77', opts);
  t.after(() => c.close());
  const got = [];
  const stop = await c.subscribe('arena', 'm1', 'hp', (p) => got.push(p));
  await until('a push', () => got.length === 1);
  assert.deepEqual({ ...got[0], payload: undefined }, { nodeType: 'arena', key: 'm1', topic: 'hp', value: { hp: 9 }, payload: undefined });
  await stop();
  await until('the unsubscribe', () => gw.frames.some((f) => f.kind === 'unsubscribe'));
});

test('when the host goes away the connection comes back on a fresh host, subscriptions and all', async (t) => {
  const gw = await fakeGateway(echo);
  t.after(() => gw.wss.close());
  const { exec, dials } = api(gw);
  const c = await exec.connect('77', { ...opts, nodeType: 'arena', key: 'm1' });
  t.after(() => c.close());
  const hosts = [];
  c.onReconnect((h) => hosts.push(h));
  await c.subscribe('arena', 'm1', 'hp', () => {});

  gw.sockets[0].ws.terminate();
  await until('the reconnect', () => hosts.length === 1);
  assert.deepEqual(hosts, ['host-2']);
  assert.equal(dials.length, 2, 'a fresh execConnect');
  assert.ok(
    gw.frames.some((f) => f.conn === 1 && f.kind === 'subscribe' && f.topic === 'hp'),
    'the subscription is renewed on the new connection',
  );
  assert.deepEqual(await c.call('arena', 'm1', 'state'), { method: 'state', args: null });
});

test('a call answered Moved is tried once more on a fresh connection', async (t) => {
  const gw = await fakeGateway((f, conn) => {
    if (f.kind === 'call' && conn.n === 0) return conn.ws.send(reply(f.rid, 3, Buffer.from('moved')));
    echo(f, conn);
  });
  t.after(() => gw.wss.close());
  const { exec, dials } = api(gw);
  const c = await exec.connect('77', opts);
  t.after(() => c.close());
  assert.deepEqual(await c.call('arena', 'm1', 'state'), { method: 'state', args: null });
  assert.equal(dials.length, 2);
  assert.equal(c.host, 'host-2');
});

test('deploy sends the manifest with digests and each distinct module once', async () => {
  const sent = [];
  const exec = new ExecAPI({ request: async (_doc, vars) => (sent.push(vars), { execDeploy: { version: 4 } }) });
  const wasm = new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0]);
  const r = await exec.deploy({
    appId: '77',
    root: 'lobby',
    types: {
      lobby: { kind: 'hub', wasm, client: true },
      arena: { kind: 'hub', parent: 'lobby', wasm, persist_every_ms: 5000 },
    },
  });
  assert.deepEqual(r, { version: 4 });
  const { input } = sent[0];
  const manifest = JSON.parse(input.manifestJson);
  const digest = '93a44bbb96c751218e4c00d479e4c14358122a389acca16205b1e4d0dc5f9476';
  assert.deepEqual(manifest, {
    root: 'lobby',
    types: {
      lobby: { kind: 'hub', client: true, digest },
      arena: { kind: 'hub', parent: 'lobby', persist_every_ms: 5000, digest },
    },
  });
  assert.deepEqual(input.artifacts, [{ digest, wasmBase64: Buffer.from(wasm).toString('base64') }]);
});

test('connectAsDeveloper dials execConnectAsDeveloper, and reconnects with a fresh developer token', async (t) => {
  const gw = await fakeGateway(echo);
  t.after(() => gw.wss.close());
  const docs = [];
  const exec = new ExecAPI({
    request: async (doc, vars) => {
      docs.push(doc.definitions[0].name.value);
      return {
        execConnectAsDeveloper: {
          gatewayUrl: gw.url,
          token: `dev-${docs.length}`,
          host: `host-${docs.length}`,
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
        },
        vars,
      };
    },
  });
  const c = await exec.connectAsDeveloper('77', { ...opts, nodeType: 'bare', key: 'k' });
  t.after(() => c.close());
  assert.deepEqual(docs, ['ExecConnectAsDeveloper']);
  assert.equal(gw.sockets[0].token, 'dev-1');
  assert.deepEqual(await c.call('bare', 'k', 'whoami'), { method: 'whoami', args: null });
  gw.sockets[0].ws.terminate();
  await until('a second developer dial', () => docs.length === 2 && gw.sockets.length === 2);
  assert.equal(gw.sockets[1].token, 'dev-2');
});

test('operations pass their arguments through and drop __typename', async () => {
  const seen = [];
  const status = { __typename: 'ExecAppStatus', activeVersion: 2, disabled: false, disabledTypes: ['bare'], budgetPaused: false };
  const answers = {
    ExecLogs: { execLogs: [{ __typename: 'ExecLogLine', id: '9', nodeType: 'arena', key: 'm1', level: 2, host: 'h', at: '2026-09-25T00:00:00.000Z', text: 'hi' }] },
    ExecInstances: { execInstances: [{ __typename: 'ExecInstance', instanceId: '1', nodeType: 'lobby', key: '', kind: 'hub', phase: 'running', host: 'h', epoch: 3, sinceMs: 5, heldBack: null }] },
    ExecVersions: { execVersions: [{ __typename: 'ExecVersion', version: 2, createdBy: 'user:1', createdAt: '2026-09-25T00:00:00.000Z', types: 4, active: true }] },
    ExecAppStatus: { execAppStatus: status },
    ExecActivateVersion: { execActivateVersion: status },
    ExecSetEnabled: { execSetEnabled: status },
  };
  const exec = new ExecAPI({
    request: async (doc, vars) => {
      const name = doc.definitions.find((d) => d.kind === 'OperationDefinition').name.value;
      seen.push([name, vars]);
      return answers[name];
    },
  });
  const [line] = await exec.logs('77', { nodeType: 'arena', maxLevel: 1, limit: 10 });
  assert.deepEqual(line, { id: '9', nodeType: 'arena', key: 'm1', level: 2, host: 'h', at: '2026-09-25T00:00:00.000Z', text: 'hi' });
  assert.equal((await exec.instances('77'))[0].phase, 'running');
  assert.equal((await exec.versions('77'))[0].active, true);
  const { __typename, ...plain } = status;
  assert.deepEqual(await exec.status('77'), plain);
  assert.deepEqual(await exec.activateVersion('77', 1), plain);
  assert.deepEqual(await exec.setEnabled('77', false, 'bare'), plain);
  assert.deepEqual(seen, [
    ['ExecLogs', { appId: '77', nodeType: 'arena', maxLevel: 1, limit: 10 }],
    ['ExecInstances', { appId: '77' }],
    ['ExecVersions', { appId: '77' }],
    ['ExecAppStatus', { appId: '77' }],
    ['ExecActivateVersion', { appId: '77', version: 1 }],
    ['ExecSetEnabled', { appId: '77', enabled: false, nodeType: 'bare' }],
  ]);
});

test('starters, build and waitForBuild pass their arguments through and drop __typename', async () => {
  const seen = [];
  const artifacts = [{ __typename: 'ExecBuildArtifact', crate: 'world-tick', digest: 'ab'.repeat(32), sizeBytes: 9 }];
  const fields = { __typename: 'ExecBuild', buildId: 'b1', log: null, createdAt: 't', startedAt: null, finishedAt: null };
  const statuses = ['queued', 'building', 'succeeded'];
  const answers = {
    ExecStarters: () => ({
      execStarters: {
        __typename: 'ExecStarterPack',
        manifestJson: '{"root":"world","types":{"world":{"kind":"hub","crate":"world-tick","client":true}}}',
        starters: [{ __typename: 'ExecStarter', crate: 'world-tick', nodeType: 'world', description: 'd', files: [{ __typename: 'ExecStarterFile', path: 'Cargo.toml', content: 'c' }] }],
      },
    }),
    ExecBuild: () => ({ execBuild: { ...fields, status: 'queued', artifacts: [] } }),
    ExecBuildStatus: () => ({ execBuildStatus: { ...fields, status: statuses.shift(), artifacts } }),
  };
  const exec = new ExecAPI({
    request: async (doc, vars) => {
      const name = doc.definitions.find((d) => d.kind === 'OperationDefinition').name.value;
      seen.push([name, vars]);
      return answers[name]();
    },
  });
  const pack = await exec.starters('77');
  assert.deepEqual(pack.manifest, { root: 'world', types: { world: { kind: 'hub', crate: 'world-tick', client: true } } });
  assert.deepEqual(pack.starters[0], { crate: 'world-tick', nodeType: 'world', description: 'd', files: [{ path: 'Cargo.toml', content: 'c' }] });
  const queued = await exec.build('77', [
    { name: pack.starters[0].crate, files: pack.starters[0].files },
    { name: 'mine', files: { 'Cargo.toml': 'm', 'src/lib.rs': 'l' } },
  ]);
  assert.deepEqual(queued, { buildId: 'b1', status: 'queued', log: null, createdAt: 't', startedAt: null, finishedAt: null, artifacts: [] });
  const done = await exec.waitForBuild('77', 'b1', { intervalMs: 1 });
  assert.equal(done.status, 'succeeded');
  assert.deepEqual(done.artifacts, [{ crate: 'world-tick', digest: 'ab'.repeat(32), sizeBytes: 9 }]);
  assert.deepEqual(seen.slice(0, 2), [
    ['ExecStarters', { appId: '77' }],
    ['ExecBuild', { input: { appId: '77', crates: [
      { name: 'world-tick', files: [{ path: 'Cargo.toml', content: 'c' }] },
      { name: 'mine', files: [{ path: 'Cargo.toml', content: 'm' }, { path: 'src/lib.rs', content: 'l' }] },
    ] } }],
  ]);
  assert.deepEqual(seen.slice(2).map(([n, v]) => [n, v]), [
    ['ExecBuildStatus', { appId: '77', buildId: 'b1' }],
    ['ExecBuildStatus', { appId: '77', buildId: 'b1' }],
    ['ExecBuildStatus', { appId: '77', buildId: 'b1' }],
  ]);
});

test('mods: a build, deploy, switch and install pass their arguments through and drop __typename', async () => {
  const seen = [];
  const mod = { __typename: 'ExecMod', modId: '900', gridId: '5', name: 'turret', ownerId: '42', version: 1, digest: 'ab'.repeat(32), enabled: false, listingId: null, blocked: null, running: false, updatedAt: 't' };
  const fields = { __typename: 'ExecBuild', buildId: 'b1', log: null, createdAt: 't', startedAt: null, finishedAt: null, artifacts: [] };
  const statuses = ['building', 'succeeded'];
  const answers = {
    ExecModBuild: () => ({ execModBuild: { ...fields, status: 'queued' } }),
    ExecModBuildStatus: () => ({ execModBuildStatus: { ...fields, status: statuses.shift() } }),
    ExecModDeploy: () => ({ execModDeploy: mod }),
    ExecModSetEnabled: () => ({ execModSetEnabled: { ...mod, enabled: true } }),
    ExecModInstall: () => ({ execModInstall: { ...mod, name: 'shop', listingId: '555' } }),
    ExecModSetSwitch: () => ({ execModSetSwitch: [{ __typename: 'ExecModSwitch', scope: 'GRID', target: '5', reason: null, createdBy: 'user:1', createdAt: 't' }] }),
  };
  const exec = new ExecAPI({
    request: async (doc, vars) => {
      const name = doc.definitions.find((d) => d.kind === 'OperationDefinition').name.value;
      seen.push([name, vars]);
      return answers[name]();
    },
  });
  await exec.modBuild('77', { name: 'turret', files: { 'Cargo.toml': 'c', 'src/lib.rs': 'l' } });
  assert.equal((await exec.waitForModBuild('77', 'b1', { intervalMs: 1 })).status, 'succeeded');
  const { __typename: _, ...plain } = mod;
  assert.deepEqual(await exec.modDeploy('77', '5', 'turret', 'b1'), plain);
  assert.equal((await exec.modSetEnabled('77', '5', 'turret', true)).enabled, true);
  assert.equal((await exec.modInstall('77', '5', 'shop', '555')).listingId, '555');
  const off = await exec.modSetSwitch('77', ExecModScope.Grid, true, { target: '5' });
  assert.deepEqual(off, [{ scope: 'GRID', target: '5', reason: null, createdBy: 'user:1', createdAt: 't' }]);
  assert.equal(execModType('turret'), 'mod:turret');
  assert.deepEqual(seen.map(([n, v]) => [n, v]), [
    ['ExecModBuild', { appId: '77', crate: { name: 'turret', files: [{ path: 'Cargo.toml', content: 'c' }, { path: 'src/lib.rs', content: 'l' }] } }],
    ['ExecModBuildStatus', { appId: '77', buildId: 'b1' }],
    ['ExecModBuildStatus', { appId: '77', buildId: 'b1' }],
    ['ExecModDeploy', { appId: '77', gridId: '5', name: 'turret', buildId: 'b1' }],
    ['ExecModSetEnabled', { appId: '77', gridId: '5', name: 'turret', enabled: true }],
    ['ExecModInstall', { appId: '77', gridId: '5', name: 'shop', listingId: '555' }],
    ['ExecModSetSwitch', { appId: '77', scope: 'GRID', off: true, target: '5' }],
  ]);
});

test('deploy with a build names crates and uploads only the modules it was given', async () => {
  const sent = [];
  const exec = new ExecAPI({ request: async (_doc, vars) => (sent.push(vars), { execDeploy: { version: 5 } }) });
  const wasm = new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0]);
  await exec.deploy({
    appId: '77',
    root: 'world',
    buildId: 'b1',
    types: {
      world: { kind: 'hub', crate: 'world-tick', client: true },
      extra: { kind: 'spoke', parent: 'world', wasm },
    },
  });
  const { input } = sent[0];
  assert.equal(input.buildId, 'b1');
  const manifest = JSON.parse(input.manifestJson);
  assert.deepEqual(manifest.types.world, { kind: 'hub', crate: 'world-tick', client: true });
  assert.equal(manifest.types.extra.digest.length, 64);
  assert.equal(input.artifacts.length, 1);
  await assert.rejects(
    exec.deploy({ appId: '77', root: 'world', types: { world: { kind: 'hub', crate: 'world-tick' } } }),
    /needs its wasm, or a crate of the deploy's buildId/,
  );
  assert.equal(sent.length, 1, 'refused before any request');
});
