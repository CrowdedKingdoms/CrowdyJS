/**
 * A session released for idleness is final, on both transports (2026-11-10).
 *
 * The replication server releases a session that sends no gameplay input for the
 * app's idle timeout. This sets the test app's timeout to 60 seconds, opens one
 * player on the binary relay and one on the GraphQL proxy, sends one actor update
 * each (gameplay) and then only waits. Both must report `inactive`, and neither may
 * reconnect afterwards. The app's own value is put back in `finally`.
 *
 * Needs the replication server with the idle release (Buddy v0.44.0) and ck-api
 * v2.64.0 on the tier, the owner env of the other live suites, and about two
 * minutes. Skips without the env.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import { gqlManagement, mintAppAccess, provisionAppWithPlayers } from '../provision.mjs';
import { gameClientConfig } from '../helpers.mjs';

globalThis.WebSocket = WebSocket;

const missing = ['CROWDY_HTTP_URL', 'CROWDY_WS_URL', 'CROWDY_OWNER_EMAIL'].filter((k) => !process.env[k]);
const skipReason = missing.length > 0 ? `integration env not configured (missing: ${missing.join(', ')})` : undefined;

const TIMEOUT_SEC = 60;
// The servers re-read the setting every 15 s; then the rule needs the full period.
const SETTLE_MS = 20_000;
const RELEASE_WITHIN_MS = (TIMEOUT_SEC + 45) * 1000;
const AFTER_MS = 20_000;
const CHUNK = { x: '0', y: '0', z: '0' };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function setIdleTimeout(appId, seconds, token) {
  const data = await gqlManagement(
    `mutation($a: BigInt!, $i: UpdateAppInput!) {
       updateApp(appId: $a, input: $i) { idleTimeoutSeconds effectiveIdleTimeoutSeconds }
     }`,
    { a: String(appId), i: { idleTimeoutSeconds: seconds } },
    token,
  );
  return data.updateApp;
}

async function untilStatus(client, wanted, withinMs) {
  const deadline = Date.now() + withinMs;
  while (Date.now() < deadline) {
    if (client.realtime.status() === wanted) return true;
    await sleep(500);
  }
  return client.realtime.status() === wanted;
}

test(
  'a player who stops playing is released after the app timeout, and nothing reconnects (relay and proxy)',
  { skip: skipReason, timeout: 240_000 },
  async () => {
    const { createCrowdyClient } = await import('../../dist/index.js');
    const { appId, owner, players } = await provisionAppWithPlayers(2);
    const before = await gqlManagement(
      `query($a: BigInt!) { app(appId: $a) { idleTimeoutSeconds } }`,
      { a: String(appId) },
      owner.token,
    );
    const previous = before.app?.idleTimeoutSeconds ?? null;
    const set = await setIdleTimeout(appId, TIMEOUT_SEC, owner.token);
    assert.equal(set.effectiveIdleTimeoutSeconds, TIMEOUT_SEC);

    const clients = [];
    try {
      await sleep(SETTLE_MS);
      for (const [i, binaryTransport] of [[0, true], [1, false]]) {
        const access = await mintAppAccess(appId, players[i].token);
        const client = createCrowdyClient(gameClientConfig(access, { realtime: { binaryTransport } }));
        client.setToken(access.token);
        const statuses = [];
        client.realtime.onStatus((s) => statuses.push(s));
        client.udp.subscribe({ actorUpdate: () => {} }, appId);
        clients.push({ client, statuses, binaryTransport });
      }
      await sleep(2000);
      for (const { client } of clients) {
        const uuid = `${'c'.repeat(24)}${Math.floor(Math.random() * 1e8).toString().padStart(8, '0')}`;
        await client.udp.sendActorUpdate({ appId, chunk: CHUNK, distance: 4, uuid, state: 'AA==', sequenceNumber: 1 });
      }

      const released = await Promise.all(
        clients.map(({ client }) => untilStatus(client, 'inactive', RELEASE_WITHIN_MS)),
      );
      clients.forEach(({ statuses, binaryTransport }, i) => {
        assert.ok(
          released[i],
          `${binaryTransport ? 'relay' : 'proxy'} client never went inactive: ${statuses.join(' > ')}`,
        );
      });

      const marks = clients.map(({ statuses }) => statuses.length);
      await sleep(AFTER_MS);
      clients.forEach(({ client, statuses, binaryTransport }, i) => {
        assert.equal(client.realtime.status(), 'inactive');
        const after = statuses.slice(marks[i]);
        assert.ok(
          !after.some((s) => s === 'connecting' || s === 'reconnecting' || s === 'connected'),
          `${binaryTransport ? 'relay' : 'proxy'} client reconnected on its own: ${after.join(' > ')}`,
        );
      });
    } finally {
      for (const { client } of clients) {
        try { client.close(); } catch { /* swallow */ }
      }
      await setIdleTimeout(appId, previous, owner.token).catch((err) => {
        console.warn(`[idle-release] could not restore app ${appId}'s idle timeout: ${err?.message ?? err}`);
      });
    }
  },
);
