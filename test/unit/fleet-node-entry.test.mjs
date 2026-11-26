/**
 * The Node entry point, `@crowdedkingdoms/crowdyjs/fleet`: the one place the SDK opens a UDP
 * socket. A fleet session runs on a server an organization runs, so:
 *   - no other entry point of the package reaches `node:dgram`, which keeps it out of every
 *     browser bundle;
 *   - importing the entry where `node:dgram` does not exist throws a clear error;
 *   - with the default socket a session talks to a realtime server over real UDP.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import dgram from 'node:dgram';
import { execFile } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

import {
  FLEET_TOKEN,
  PLAYER_TOKEN,
  FLEET_ID,
  PLAYER_ID,
  USER_ID,
  UUID,
  rawHmac,
  plainNotification,
  carryResult,
  delivery,
  withOwnHmac,
  signedBundle,
} from './fleet-frames.mjs';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const dist = join(repo, 'dist');
const entryUrl = pathToFileURL(join(dist, 'fleet', 'index.js')).href;
const run = promisify(execFile);

/** Every file `entry` reaches through static and dynamic relative imports. */
function reachable(entry) {
  const seen = new Set();
  const walk = (file) => {
    if (seen.has(file)) return;
    seen.add(file);
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(/(?:from\s+|import\s*\(\s*|import\s+)['"](\.{1,2}\/[^'"]+)['"]/g)) {
      const next = resolve(dirname(file), match[1]);
      if (next.endsWith('.js')) walk(next);
    }
  };
  walk(entry);
  return seen;
}

test('only the fleet entry point reaches node:dgram; no other entry of the package does', () => {
  const pkg = JSON.parse(readFileSync(join(repo, 'package.json'), 'utf8'));
  assert.deepEqual(pkg.exports['./fleet'], {
    import: './dist/fleet/index.js',
    types: './dist/fleet/index.d.ts',
  });
  const entries = Object.entries(pkg.exports).filter(([name]) => name !== './fleet');
  assert.ok(entries.length >= 9);
  for (const [name, target] of entries) {
    const files = reachable(join(repo, target.import));
    assert.ok(files.size > 0, name);
    for (const file of files) {
      assert.ok(!file.startsWith(join(dist, 'fleet') + '/'), `${name} reaches ${file}`);
      assert.doesNotMatch(readFileSync(file, 'utf8'), /node:dgram/, `${name} reaches node:dgram through ${file}`);
    }
  }
  // The fleet entry does reach it, and names it nowhere a bundler resolves at build time.
  const fleet = reachable(join(dist, 'fleet', 'index.js'));
  assert.ok(fleet.has(join(dist, 'fleet', 'socket.js')));
  const socket = readFileSync(join(dist, 'fleet', 'socket.js'), 'utf8');
  assert.match(socket, /node:dgram/);
  assert.doesNotMatch(socket, /from\s+['"]node:/);
  assert.doesNotMatch(socket, /import\s*\(\s*['"]node:/);
});

test('importing the entry where node:dgram does not exist throws a clear error', async () => {
  // A runtime with no Node process at all (a browser page, a worker), and one with a
  // bundler's `process` stand-in.
  for (const stand of ['undefined', '{ env: {}, browser: true, versions: {} }']) {
    const script = `
      const real = globalThis.process;
      globalThis.process = ${stand};
      let line;
      try {
        await import(${JSON.stringify(entryUrl)});
        line = 'IMPORTED';
      } catch (error) {
        line = 'THREW ' + error.name + ': ' + error.message;
      }
      globalThis.process = real;
      console.log(line);
    `;
    const { stdout } = await run(process.execPath, ['--input-type=module', '-e', script]);
    assert.match(stdout, /^THREW CrowdyError: /, stand);
    assert.match(stdout, /@crowdedkingdoms\/crowdyjs\/fleet runs on a server your organization runs/);
    assert.match(stdout, /node:dgram, which this runtime does not have/);
    assert.match(stdout, /never runs in a browser page or a game client/);
  }
  // A Node without process.getBuiltinModule (before 20.16) still imports it, and the socket
  // loads node:dgram when it is first opened.
  const older = `
    const real = globalThis.process;
    globalThis.process = { versions: { node: '18.19.0' } };
    const { nodeFleetSocket } = await import(${JSON.stringify(entryUrl)});
    const socket = await nodeFleetSocket()({ ip4: '127.0.0.1', clientPort: 9 }, { onDatagram() {}, onError() {} });
    socket.close();
    globalThis.process = real;
    console.log('OPENED');
  `;
  const { stdout } = await run(process.execPath, ['--input-type=module', '-e', older]);
  assert.match(stdout, /^OPENED/);
});

test('with the default socket a session binds, carries and receives over real UDP', async (t) => {
  const { FleetSession } = await import(entryUrl);
  // A realtime server on loopback: it acknowledges the capabilities, answers each carry, and
  // then sends a delivery of the largest size a fleet session is sent.
  const server = dgram.createSocket('udp4');
  await new Promise((r) => server.bind(0, '127.0.0.1', r));
  t.after(() => server.close());
  const received = [];
  const video = plainNotification(
    { type: 144, chunk: [1, -2, 3], distance: 1, uuid: UUID, payload: Buffer.alloc(1123, 0x5a) },
    { epochMs: 11n, seq: 3 },
  );
  const largest = withOwnHmac(delivery([PLAYER_ID], video));
  assert.equal(largest.length, 1242);
  server.on('message', (message, from) => {
    received.push(message[0]);
    const reply = (bytes) => server.send(bytes, from.port, from.address);
    if (message[0] === 29) {
      const lead = Buffer.concat([Buffer.from([46]), message.subarray(72, 80)]);
      reply(Buffer.concat([lead, rawHmac(FLEET_TOKEN, lead)]));
    }
    if (message[0] === 49) {
      reply(signedBundle([carryResult(message.readBigInt64LE(68), USER_ID, 0)]));
      reply(largest);
    }
  });

  const got = [];
  const statuses = [];
  const fleet = new FleetSession({
    session: {
      token: FLEET_TOKEN,
      gameTokenId: String(FLEET_ID),
      appId: '7',
      expiresAt: new Date(Date.now() + 24 * 3600_000).toISOString(),
      maxPlayers: 256,
      server: { ip4: '127.0.0.1', ip6: '', clientPort: server.address().port },
    },
    handlers: {
      video: (n, players) => got.push({ n, players }),
      status: (s) => statuses.push(s),
    },
  });
  t.after(() => fleet.close());
  await fleet.connect();
  const result = await fleet.carry({ token: PLAYER_TOKEN, gameTokenId: String(PLAYER_ID) });
  assert.deepEqual(result, { playerGameTokenId: '4242', userId: '77', status: 'carried', wireStatus: 0, carried: true });
  assert.deepEqual(received.slice(0, 2), [29, 49], 'the capabilities first, then the carry');

  const end = Date.now() + 3_000;
  while (got.length === 0 && Date.now() < end) await new Promise((r) => setTimeout(r, 5));
  assert.equal(got.length, 1, 'the 1,242-byte datagram came through the socket');
  assert.deepEqual(got[0].players, ['4242']);
  assert.equal(Buffer.from(got[0].n.videoData, 'base64').length, 1123);
  assert.deepEqual(statuses, ['connecting', 'connected']);

  await fleet.sendActorUpdate(PLAYER_ID, { chunk: { x: '1', y: '-2', z: '3' }, uuid: UUID, state: 'AQID' });
  const sent = Date.now() + 3_000;
  while (!received.includes(128) && Date.now() < sent) await new Promise((r) => setTimeout(r, 5));
  assert.ok(received.includes(128), 'a carried player\u2019s update reached the server');
  const stats = fleet.stats();
  assert.equal(stats.hmacFailures, 0);
  assert.equal(stats.oversized, 0);
  assert.equal(stats.sentByType[49], 1);
  fleet.close();
  assert.equal(fleet.status, 'closed');
});
