/**
 * Fleet sessions against a tier: two game servers of one organization, four of its players,
 * the realtime servers and the Application API for real.
 *
 * This test plays the organization's servers. It opens two fleet sessions with the org
 * token, signs four managed players in (the SDK has no wrapper for that on purpose, so the
 * test makes the GraphQL request itself, as an organization's server does), carries them,
 * sends and receives for them, moves one player from one server to the other, refreshes a
 * session, refreshes a carried player's token, closes a third session through the API to see
 * the session notice, and ends everything it opened.
 *
 * It runs only when all three of these are set, so it never runs by accident:
 *
 *   CROWDY_FLEET_API_URL=https://ck-va.dev.crowdedkingdoms.com/graphql   # the GraphQL endpoint
 *   CROWDY_FLEET_APP_ID=<app id>          # an app of the organization: managed players and
 *                                         # fleet sessions switched on, text chat granted
 *   CROWDY_FLEET_ORG_TOKEN=cko_...        # scopes players:mint and fleet:session
 *   node --test test/e2e/fleet-sessions.test.mjs
 *
 * Optional:
 *
 *   CROWDY_FLEET_HUB_APP_ID=<app id>      # also connect to hubs as the server (step 10)
 *   CROWDY_FLEET_HUB_NODE_TYPE=lobby  CROWDY_FLEET_HUB_KEY=  CROWDY_FLEET_HUB_METHOD=state
 *   CROWDY_FLEET_IDLE_SECONDS=60          # the app's idle timeout: also wait for one player
 *                                         # to be released for idleness (adds that long)
 *   CROWDY_FLEET_CHUNK=7000,7000,7000     # where the players stand
 *
 * WHAT IT LEAVES ON THE TIER. Four managed players, `crowdyjs-fleet-e2e-0` to `-3`, which
 * every run reuses and none deletes; their sign-ins, which last 10 minutes; and the usage of
 * a few hundred datagrams. Both fleet sessions are closed, every player is released and the
 * hub connection is closed, whether the steps passed or not. It changes no setting of the
 * organization or the app.
 *
 * NO TOKEN IS EVER PRINTED. The org token, the fleet tokens, the players' tokens and the hub
 * connect token are scrubbed from every failure and every diagnostic line, and no assertion
 * takes a token as an operand.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import { Buffer } from 'node:buffer';
import { randomBytes } from 'node:crypto';

const REQUIRED = ['CROWDY_FLEET_API_URL', 'CROWDY_FLEET_APP_ID', 'CROWDY_FLEET_ORG_TOKEN'];
const missing = REQUIRED.filter((key) => !process.env[key]);
const skip = missing.length > 0 ? `fleet session env not configured (missing: ${missing.join(', ')})` : false;

const IDLE_SECONDS = Number(process.env.CROWDY_FLEET_IDLE_SECONDS ?? 0);
const [CX, CY, CZ] = (process.env.CROWDY_FLEET_CHUNK ?? '7000,7000,7000').split(',').map((v) => v.trim());
/** Far from anything a game or a load run stands in: chunk (7000, 7000, 7000) unless set. */
const CHUNK = { x: CX, y: CY, z: CZ };
const EXTERNAL_IDS = [0, 1, 2, 3].map((n) => `crowdyjs-fleet-e2e-${n}`);
const SIGN_IN_SECONDS = 600;
const DAY_MS = 24 * 3600_000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b64 = (text) => Buffer.from(text, 'utf8').toString('base64');
const sameSet = (a, b) => a.length === b.length && [...a].sort().join() === [...b].sort().join();

test(
  'fleet sessions on a tier: open, carry, send and receive, a crossing, a refresh, the hub connection, close',
  { skip, timeout: (240 + (IDLE_SECONDS > 0 ? IDLE_SECONDS + 60 : 0)) * 1000 },
  async (t) => {
    const sdk = await import('../../dist/index.js');
    const { FleetSession, FleetNotCarriedError, nodeFleetSocket } = await import('../../dist/fleet/index.js');

    const endpoint = process.env.CROWDY_FLEET_API_URL;
    const appId = process.env.CROWDY_FLEET_APP_ID;
    const orgToken = process.env.CROWDY_FLEET_ORG_TOKEN;

    // ---- nothing secret reaches the output ----
    const secrets = new Set([orgToken]);
    const scrub = (text) => {
      let out = String(text);
      for (const secret of secrets) {
        if (!secret) continue;
        out = out.split(secret).join('[redacted]').split(encodeURIComponent(secret)).join('[redacted]');
      }
      return out;
    };
    const scrubbed = (error) => {
      const clean = new Error(scrub(error?.message ?? error));
      clean.name = error?.name ?? 'Error';
      clean.stack = scrub(error?.stack ?? clean.stack);
      return clean;
    };
    const note = (line) => t.diagnostic(scrub(line));

    // ---- the Application API, with every request counted ----
    let requests = 0;
    const counted = (url, init) => {
      requests += 1;
      return fetch(url, init);
    };
    const origin = new URL(endpoint).origin;
    const api = sdk.createCrowdyClient({
      httpUrl: origin,
      wsUrl: origin.replace(/^http/, 'ws'),
      graphqlEndpoint: endpoint,
      fetch: counted,
    });
    api.setToken(orgToken);

    /** What an organization's server does: sign one of its players in with its org token. */
    async function signIn(externalId) {
      const res = await counted(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${orgToken}` },
        body: JSON.stringify({
          query:
            'mutation($i: MintManagedPlayerTokenInput!) { mintManagedPlayerToken(input: $i) { token gameTokenId appId expiresAt } }',
          variables: {
            i: { appId, externalId, gamertag: externalId, ageYears: 30, country: 'US', sessionTtlSeconds: SIGN_IN_SECONDS },
          },
        }),
      });
      const body = await res.json();
      if (body.errors?.length) {
        const e = body.errors[0];
        throw new Error(`mintManagedPlayerToken for ${externalId}: ${e.extensions?.code}: ${e.message}`);
      }
      const answer = body.data?.mintManagedPlayerToken;
      if (!answer) throw new Error(`mintManagedPlayerToken for ${externalId}: HTTP ${res.status}, no data`);
      secrets.add(answer.token);
      return answer;
    }

    // ---- a game server: one fleet session, and everything it was told ----
    function gameServer(name, opened, config = {}) {
      const seen = { actors: [], texts: [], errors: [], released: [], carryResults: [], statuses: [], moves: 0, sessionReleased: [], failures: [], sockets: [], datagrams: [], kinds: {}, foreign: [] };
      const open = nodeFleetSocket();
      const fleet = new FleetSession({
        ...config,
        session: opened,
        // The default socket, kept within reach so step 8 can send a datagram the session
        // itself refuses to build.
        socket: async (server, events) => {
          const socket = await open(server, {
            ...events,
            // What arrived, by its first byte and its length, for the report. Short frames
            // (an error frame is 3 bytes and holds no secret) are kept whole.
            onDatagram: (datagram) => {
              seen.datagrams.push({
                type: datagram[0],
                length: datagram.length,
                hex: datagram.length <= 3 ? Buffer.from(datagram).toString('hex') : null,
                shape: shapeOf(datagram),
                detail: detailOf(datagram),
              });
              seen.foreign.push(...foreignIn(datagram));
              events.onDatagram(datagram);
            },
          });
          seen.sockets.push(socket);
          return socket;
        },
        handlers: {
          any: (n, players) => {
            const kind = `${n.__typename}${players ? ' (delivery)' : ''}`;
            seen.kinds[kind] = (seen.kinds[kind] ?? 0) + 1;
          },
          actorUpdate: (n, players) =>
            seen.actors.push({
              uuid: n.uuid,
              state: n.state,
              players,
              at: Date.now() - startedAt,
              step: currentStep,
              where: `app ${n.appId} chunk (${n.chunkX}, ${n.chunkY}, ${n.chunkZ}) distance ${n.distance}`,
            }),
          text: (n, players) => seen.texts.push({ uuid: n.uuid, text: n.text, players }),
          genericError: (n, verified) => seen.errors.push({ seq: n.sequenceNumber, code: n.errorCode, verified }),
          carryResult: (r) => seen.carryResults.push(r),
          released: (r) => seen.released.push(r),
          moveOrdered: () => {
            seen.moves += 1;
          },
          sessionReleased: (reason) => seen.sessionReleased.push(reason),
          status: (s) => seen.statuses.push(s),
          error: (e) => seen.failures.push(scrub(e?.message ?? e)),
        },
      });
      return { name, opened, fleet, seen };
    }

    /**
     * How a datagram is framed, with nothing of its contents: its type and length, whether a
     * long-spatial message says it carries its own HMAC (byte 35), and a bundle's members.
     */
    function shapeOf(datagram) {
      const one = (m) => `${m[0]}/${m.length}b${m[0] >= 128 && m.length > 35 ? `/auth${m[35]}` : ''}`;
      if (datagram[0] !== 2 && datagram[0] !== 30) return one(datagram);
      const end = datagram[0] === 30 ? datagram.length - 32 : datagram.length;
      const members = [];
      for (let off = 1; off + 2 <= end; ) {
        const len = datagram[off] | (datagram[off + 1] << 8);
        off += 2;
        if (len === 0 || off + len > end) break;
        members.push(one(datagram.subarray(off, off + len)));
        off += len;
      }
      return `${datagram[0]}[${members.join(' ')}]`;
    }

    /**
     * The notifications in a datagram that name another app than this run's, read for the
     * report without verifying anything: the session itself drops and counts them.
     */
    function foreignIn(datagram) {
      const found = [];
      const one = (m, form) => {
        if (m[0] === 53 && m.length > 2) return one(m.subarray(2 + m[1] * 8), `${form}, inside a FLEET_DELIVERY`);
        if (m[0] < 128 || m.length < 77) return;
        const view = new DataView(m.buffer, m.byteOffset, m.byteLength);
        const app = view.getBigInt64(1, true).toString();
        if (app === appId) return;
        found.push({
          app,
          type: m[0],
          form,
          chunk: `(${view.getBigInt64(9, true)}, ${view.getBigInt64(17, true)}, ${view.getBigInt64(25, true)})`,
          uuid: Buffer.from(m.subarray(36, 68)).toString('latin1').replace(/\0+$/, ''),
          at: Date.now() - startedAt,
          step: currentStep,
        });
      };
      if (datagram[0] !== 2 && datagram[0] !== 30) {
        one(datagram, `alone, ${datagram.length} bytes, containsAuth ${datagram[35]}`);
        return found;
      }
      const end = datagram[0] === 30 ? datagram.length - 32 : datagram.length;
      for (let off = 1; off + 2 <= end; ) {
        const len = datagram[off] | (datagram[off + 1] << 8);
        off += 2;
        if (len === 0 || off + len > end) break;
        one(datagram.subarray(off, off + len), datagram[0] === 30 ? 'a member of a signed bundle (30)' : 'a member of a bundle (2)');
        off += len;
      }
      return found;
    }

    /**
     * What a datagram in an unexpected form says, for the report: which step it arrived in,
     * and for a notification its app, chunk, actor and payload size. Nothing of a signed
     * bundle, an acknowledgement or an error frame is kept.
     */
    function detailOf(datagram) {
      if ([30, 46, 3].includes(datagram[0])) return null;
      const n = sdk.parseNotification(new Uint8Array(datagram));
      const what = n
        ? `${n.__typename} app ${n.appId} chunk (${n.chunkX}, ${n.chunkY}, ${n.chunkZ}) uuid ${n.uuid} seq ${n.sequenceNumber} epoch ${n.epochMillis}` +
          (typeof n.state === 'string' ? ` state ${Buffer.from(n.state, 'base64').length} bytes "${Buffer.from(n.state, 'base64').toString('latin1').replace(/[^\x20-\x7e]/g, '.').slice(0, 40)}"` : '')
        : 'not a notification';
      return `in step ${currentStep} at +${Date.now() - startedAt} ms: ${what}`;
    }

    async function until(what, check, ms = 10_000) {
      const end = Date.now() + ms;
      while (Date.now() < end) {
        if (check()) return;
        await sleep(20);
      }
      if (!check()) throw new Error(`timed out after ${ms} ms waiting for ${what}`);
    }

    // ---- the run's state ----
    const startedAt = Date.now();
    let currentStep = 0;
    const servers = {};
    const players = []; // { externalId, token, gameTokenId, uuid, userId }
    const carrier = new Map(); // player index -> the server that carries it
    const idle = new Set(); // players left without gameplay input on purpose
    const failedSteps = new Set();
    let hub = null;
    let pulses = 0;
    const closed = { X: false, Y: false, Z: false };
    let zClosedAt = 0;

    const spatial = (i) => ({ chunk: CHUNK, uuid: players[i].uuid, distance: 8, decayRate: 0 });
    const update = (server, i, marker) =>
      server.fleet.sendActorUpdate(players[i].gameTokenId, { ...spatial(i), state: b64(marker) });

    // Gameplay input for every carried player well inside the app's idle timeout. Each update
    // differs from the last, because a repeated state is not input.
    const pulse = setInterval(() => {
      pulses += 1;
      for (const [i, server] of carrier) {
        if (idle.has(i)) continue;
        update(server, i, `pulse-${pulses}-${i}`).catch(() => {});
      }
    }, 10_000);

    /** One numbered step. A failure is scrubbed; a step whose needs failed is skipped. */
    const step = (n, name, needs, fn) =>
      t.test(`${n}. ${name}`, async (st) => {
        const blocked = needs.filter((need) => failedSteps.has(need));
        if (blocked.length > 0) {
          failedSteps.add(n);
          st.skip(`needs step ${blocked.join(', ')}, which did not pass`);
          return;
        }
        currentStep = n;
        try {
          await fn(st);
        } catch (error) {
          failedSteps.add(n);
          throw scrubbed(error);
        }
      });

    try {
      await step(1, 'two game servers each open a fleet session', [], async () => {
        for (const name of ['X', 'Y']) {
          const started = Date.now();
          const opened = await api.fleetSessions.open(appId);
          secrets.add(opened.token);
          assert.equal(typeof opened.token, 'string');
          assert.equal(opened.token.length, 64, 'the fleet token is 64 characters');
          assert.match(opened.gameTokenId, /^\d+$/);
          assert.equal(opened.appId, appId);
          assert.ok(Number.isInteger(opened.maxPlayers) && opened.maxPlayers >= 1 && opened.maxPlayers <= 1024, `maxPlayers ${opened.maxPlayers}`);
          assert.match(opened.server.ip4, /^\d{1,3}(\.\d{1,3}){3}$/, 'the realtime server has an IPv4 address');
          assert.ok(opened.server.clientPort > 0 && opened.server.clientPort < 65536);
          const lifetime = Date.parse(opened.expiresAt) - Date.now();
          assert.ok(Math.abs(lifetime - DAY_MS) < 5 * 60_000, `expires ${Math.round(lifetime / 60_000)} minutes away`);
          servers[name] = gameServer(name, opened);
          note(`${name}: opened in ${Date.now() - started} ms, maxPlayers ${opened.maxPlayers}, server ${opened.server.ip4}:${opened.server.clientPort}`);
        }
        const sameServer = servers.X.opened.server.ip4 === servers.Y.opened.server.ip4 && servers.X.opened.server.clientPort === servers.Y.opened.server.clientPort;
        note(`X and Y are on ${sameServer ? 'the same realtime server' : 'different realtime servers'}`);
        assert.notEqual(servers.X.opened.gameTokenId, servers.Y.opened.gameTokenId);
        assert.ok(servers.X.opened.token !== servers.Y.opened.token, 'each session has its own token');
      });

      await step(2, 'four managed players sign in with the org token', [1], async () => {
        for (const externalId of EXTERNAL_IDS) {
          const answer = await signIn(externalId);
          assert.equal(answer.token.length, 64, 'a player\u2019s app token is 64 characters');
          assert.match(answer.gameTokenId, /^\d+$/);
          assert.equal(answer.appId, appId);
          players.push({
            externalId,
            token: answer.token,
            gameTokenId: answer.gameTokenId,
            uuid: randomBytes(16).toString('hex'),
            userId: null,
          });
        }
        assert.equal(new Set(players.map((p) => p.gameTokenId)).size, 4);
      });

      await step(3, 'both sessions connect and the realtime server acknowledges them', [1], async () => {
        for (const server of [servers.X, servers.Y]) {
          const started = Date.now();
          await server.fleet.connect();
          await until(`${server.name} to be connected`, () => server.fleet.status === 'connected', 15_000);
          await until(`${server.name}'s capabilities to be acknowledged (frame 46)`, () => server.fleet.stats().boundControlAcks >= 1, 5_000);
          assert.deepEqual(server.seen.statuses, ['connecting', 'connected']);
          const stats = server.fleet.stats();
          assert.equal(stats.hmacFailures, 0);
          assert.equal(stats.malformed, 0);
          note(`${server.name}: connected in ${Date.now() - started} ms, ${stats.sentByType[29]} capabilities sent, ${stats.boundControlAcks} acknowledged`);
        }
      });

      await step('3b', 'a third session is closed through the Application API while its FleetSession stays open', [3], async () => {
        // A session closed through the API is sent nothing at all: no release frame, and no
        // answer to anything. What tells its game server is the silence. This session
        // tolerates 15 seconds of it (capabilities every 5), so the suite stays short.
        const opened = await api.fleetSessions.open(appId);
        secrets.add(opened.token);
        const z = gameServer('Z', opened, { silenceTimeoutMs: 15_000 });
        servers.Z = z;
        await z.fleet.connect();
        await until('Z to be connected', () => z.fleet.status === 'connected', 15_000);
        assert.equal(z.fleet.refreshDue(), false);
        assert.equal(await api.fleetSessions.close({ appId, gameTokenId: opened.gameTokenId }), true);
        closed.Z = true;
        zClosedAt = Date.now();
        z.seen.atClose = z.seen.datagrams.length;
      });

      await step(4, 'X carries players 0 and 1, Y carries 2 and 3', [2, 3], async () => {
        const plan = [
          [servers.X, 0],
          [servers.X, 1],
          [servers.Y, 2],
          [servers.Y, 3],
        ];
        for (const [server, i] of plan) {
          const started = Date.now();
          const result = await server.fleet.carry({ token: players[i].token, gameTokenId: players[i].gameTokenId });
          assert.equal(result.status, 'carried', `player ${i} on ${server.name}: ${result.status} (wire status ${result.wireStatus})`);
          assert.equal(result.carried, true);
          assert.equal(result.playerGameTokenId, players[i].gameTokenId);
          assert.match(result.userId, /^[1-9]\d*$/, 'a carried player has a user id');
          players[i].userId = result.userId;
          carrier.set(i, server);
          assert.equal(server.fleet.carries(players[i].gameTokenId), true);
          note(`player ${i} carried by ${server.name} in ${Date.now() - started} ms`);
        }
        assert.equal(new Set(players.map((p) => p.userId)).size, 4, 'four different users');
        assert.equal(servers.X.fleet.carriedCount, 2);
        assert.equal(servers.Y.fleet.carriedCount, 2);
        for (const server of [servers.X, servers.Y]) {
          const carries = server.fleet.stats().sentByType[49];
          assert.ok(carries >= 2, `${server.name} sent a FLEET_CARRY for each player`);
          note(`${server.name}: ${carries} FLEET_CARRY sent for 2 players (more than 2 means an answer took over 250 ms and the carry was sent again)`);
        }
      });

      await step(5, 'state from X\u2019s player reaches Y once, plain, and does not come back to X', [4], async () => {
        // Before Y's players stand anywhere, none of them is in range of anything. What Y is
        // sent then is recorded, not judged: the contract says state reaches a session "when
        // at least one carried player may receive it".
        const alone = `alone-${randomBytes(4).toString('hex')}`;
        await update(servers.X, 0, alone);
        await sleep(1_500);
        const early = servers.Y.seen.actors.some((a) => a.state === b64(alone));
        note(`before Y's players had an actor, X's update ${early ? 'reached' : 'did not reach'} Y`);

        // Every player stands in the chunk: one update each first, so every player is in range
        // of the others. The first messages to a chunk nobody stood in may be refused while its
        // permissions load, so each is then sent until the other server sees it.
        const started = Date.now();
        for (const [i, server] of [[1, servers.X], [2, servers.Y], [3, servers.Y]]) await update(server, i, `arrive-${i}`);
        await sleep(300);
        for (const [i, from, to] of [
          [0, servers.X, servers.Y],
          [1, servers.X, servers.Y],
          [2, servers.Y, servers.X],
          [3, servers.Y, servers.X],
        ]) {
          let tries = 0;
          const arrived = () => to.seen.actors.some((a) => a.uuid === players[i].uuid);
          while (!arrived()) {
            if (tries >= 20) throw new Error(`player ${i}'s actor never reached ${to.name}: ${from.name} was answered ${JSON.stringify(from.seen.errors.slice(-5))}`);
            tries += 1;
            await update(from, i, `stand-${i}-${tries}`);
            await until(`player ${i}'s actor on ${to.name}`, arrived, 1_000).catch(() => {});
          }
          if (tries > 0) note(`player ${i}'s actor reached ${to.name} after ${tries} more update(s)`);
        }
        note(`all four actors stand in chunk (${CHUNK.x}, ${CHUNK.y}, ${CHUNK.z}) after ${Date.now() - started} ms`);
        if (IDLE_SECONDS > 0) idle.add(3); // player 3 sends no gameplay input from here on

        const marker = `once-${randomBytes(6).toString('hex')}`;
        const sent = Date.now();
        await update(servers.X, 0, marker);
        const mine = () => servers.Y.seen.actors.filter((a) => a.state === b64(marker));
        await until('the update on Y', () => mine().length > 0, 5_000);
        note(`an actor update crossed from X to Y in ${Date.now() - sent} ms`);
        await sleep(1_500);
        assert.equal(mine().length, 1, 'Y is sent the update once, however many of its players are in range');
        assert.equal(mine()[0].uuid, players[0].uuid);
        assert.equal(mine()[0].players, null, 'state arrives plain: for every player of Y in range');
        // A session is not sent the state its own carried players sent.
        const own = servers.X.seen.actors.filter((a) => a.uuid === players[0].uuid || a.uuid === players[1].uuid);
        assert.equal(own.length, 0, 'X was sent none of its own players\u2019 state back');
        assert.equal(servers.Y.seen.actors.filter((a) => a.uuid === players[2].uuid || a.uuid === players[3].uuid).length, 0);
        assert.ok(servers.X.seen.actors.every((a) => a.players === null));
      });

      await step(6, 'a spatial text arrives inside a delivery that lists its players', [5], async () => {
        const text = `hello-${randomBytes(6).toString('hex')}`;
        const sent = Date.now();
        const seq = await servers.X.fleet.sendTextPacket(players[0].gameTokenId, { ...spatial(0), text });
        const refused = () => servers.X.seen.errors.find((e) => e.seq === seq && e.code === 'UNAUTHORIZED');
        const onY = () => servers.Y.seen.texts.filter((m) => m.text === text);
        const onX = () => servers.X.seen.texts.filter((m) => m.text === text);
        await until('the text on Y, or its refusal', () => onY().length > 0 || refused(), 8_000);
        if (onY().length === 0 && refused()) {
          throw new Error(
            'SETUP: the realtime server refused the text UNAUTHORIZED. The app\u2019s access tier does not grant text chat ' +
              '(use_text_chat) to these players; grant it and run again. This is not a defect of the SDK.',
          );
        }
        note(`a text crossed from X to Y in ${Date.now() - sent} ms`);
        await until('the text on X', () => onX().length > 0, 5_000);
        await sleep(1_000);
        const id = (i) => players[i].gameTokenId;
        for (const m of [...onY(), ...onX()]) {
          assert.ok(Array.isArray(m.players) && m.players.length > 0, 'a text is never plain: it names its players');
          assert.equal(m.uuid, players[0].uuid);
        }
        const listedY = onY().flatMap((m) => m.players);
        const listedX = onX().flatMap((m) => m.players);
        assert.ok(sameSet(listedY, [id(2), id(3)]), `Y's delivery lists players 2 and 3 (${listedY.length} listed in ${onY().length} frame(s))`);
        // A sender's own text lists the sender.
        assert.ok(sameSet(listedX, [id(0), id(1)]), `X's delivery lists players 0 and 1 (${listedX.length} listed in ${onX().length} frame(s))`);
        note(`Y: ${onY().length} delivery frame(s); X: ${onX().length} delivery frame(s)`);
      });

      await step(7, 'a crossing: Y carries player 0, X is told, and no Application API call is made', [5], async () => {
        const before = requests;
        const p = players[0];
        const started = Date.now();
        const result = await servers.Y.fleet.carry({ token: p.token, gameTokenId: p.gameTokenId });
        const carried = Date.now() - started;
        assert.equal(result.status, 'carried', `Y's carry of player 0: ${result.status} (wire status ${result.wireStatus})`);
        assert.equal(result.userId, p.userId, 'the same user');
        carrier.set(0, servers.Y);
        const told = () => servers.X.seen.released.find((r) => r.playerGameTokenId === p.gameTokenId);
        await until('X to be told the player was released', () => told(), 5_000);
        note(`crossing: Y's carry answered in ${carried} ms; X was told ${Date.now() - started} ms after the carry was asked for`);
        assert.equal(told().reason, 1, 'reason 1: another session carries the player');
        assert.equal(told().userId, p.userId);
        assert.equal(servers.X.fleet.carries(p.gameTokenId), false);
        assert.equal(servers.Y.fleet.carries(p.gameTokenId), true);
        const datagrams = servers.X.fleet.stats().datagramsSent;
        await assert.rejects(update(servers.X, 0, 'after-the-crossing'), (e) => e instanceof FleetNotCarriedError);
        assert.equal(servers.X.fleet.stats().datagramsSent, datagrams, 'and X sent nothing for the player');
        assert.equal(requests, before, 'the crossing made no Application API call');
        // The player continues on Y: its state now reaches X, which no longer carries it.
        const marker = `moved-${randomBytes(6).toString('hex')}`;
        const moved = Date.now();
        await update(servers.Y, 0, marker);
        await until('the moved player\u2019s update on X', () => servers.X.seen.actors.some((a) => a.state === b64(marker)), 5_000);
        note(`the moved player's first update under Y reached X in ${Date.now() - moved} ms`);
        assert.equal(servers.X.seen.actors.find((a) => a.state === b64(marker)).players, null);
        assert.equal(servers.Y.seen.released.length, 0);
      });

      await step(8, 'a message for a player the session does not carry is answered UNAUTHORIZED', [5], async () => {
        // FleetSession refuses to build such a message. The codecs and the socket are public,
        // so the test builds one itself: X signs an actor update for player 2, whom Y carries.
        const x = servers.X;
        const last = await update(x, 1, `before-forced-${randomBytes(3).toString('hex')}`);
        const seq = (last + 97) & 0xff;
        const own = await sdk.createFleetSignContext(x.opened.gameTokenId, x.opened.token);
        const forged = await sdk.serializeActorUpdate(sdk.carriedPlayerContext(own, players[2].gameTokenId), {
          appId,
          ...spatial(2),
          state: b64('not-mine'),
          sequenceNumber: seq,
        });
        const sent = Date.now();
        x.seen.sockets.at(-1).send(forged);
        const answer = () => x.seen.errors.find((e) => e.seq === seq);
        await until('the refusal on X', () => answer(), 5_000);
        assert.equal(answer().code, 'UNAUTHORIZED');
        assert.equal(typeof answer().verified, 'boolean');
        const raw = x.seen.datagrams.filter((d) => d.type === 3).at(-1);
        note(
          `UNAUTHORIZED for sequence ${seq} came back in ${Date.now() - sent} ms, verified: ${answer().verified}` +
            (raw ? `; the last datagram that began with 3 was ${raw.length} bytes${raw.hex ? ` (${raw.hex})` : ''}` : '; it arrived inside a bundle'),
        );
        // The forged update reached nobody, and the session was not harmed by sending it.
        await sleep(500);
        assert.equal(servers.Y.seen.actors.filter((a) => a.state === b64('not-mine')).length, 0);
        assert.equal(x.fleet.status, 'connected');
        assert.equal(x.fleet.carries(players[1].gameTokenId), true);
      });

      await step(9, 'a refresh keeps the token, the server and the carries', [5], async () => {
        const x = servers.X;
        const before = { expiresAt: x.fleet.expiresAt, sockets: x.seen.sockets.length, stats: x.fleet.stats(), server: x.fleet.currentServer, carried: x.fleet.carriedCount };
        const input = x.fleet.refreshInput();
        assert.deepEqual(input.currentServer, { ip4: before.server.ip4, clientPort: before.server.clientPort }, 'the refresh names the server the session is on');
        assert.equal(x.fleet.refreshDue(), false);
        const started = Date.now();
        const answer = await api.fleetSessions.refresh(input);
        secrets.add(answer.token);
        note(`refreshFleetSession answered in ${Date.now() - started} ms`);
        assert.ok(answer.token === x.opened.token, 'the same token');
        assert.equal(answer.gameTokenId, x.opened.gameTokenId);
        assert.equal(answer.appId, appId);
        assert.ok(Date.parse(answer.expiresAt) > before.expiresAt, 'a later expiry');
        assert.ok(Math.abs(Date.parse(answer.expiresAt) - Date.now() - DAY_MS) < 5 * 60_000);
        assert.equal(`${answer.server.ip4}:${answer.server.clientPort}`, `${before.server.ip4}:${before.server.clientPort}`, 'the session stays on its server');
        await x.fleet.applyRefresh(answer);
        assert.equal(x.fleet.expiresAt, Date.parse(answer.expiresAt));
        assert.equal(x.fleet.status, 'connected');
        assert.equal(x.seen.sockets.length, before.sockets, 'the same socket');
        const after = x.fleet.stats();
        assert.equal(after.sentByType[49], before.stats.sentByType[49], 'no FLEET_CARRY: the carries stand');
        assert.ok(after.sentByType[29] > before.stats.sentByType[29], 'the capabilities again');
        assert.equal(x.fleet.carriedCount, before.carried);
        const marker = `refreshed-${randomBytes(6).toString('hex')}`;
        await update(x, 1, marker);
        await until('a carried player\u2019s update on Y after the refresh', () => servers.Y.seen.actors.some((a) => a.state === b64(marker)), 5_000);
        assert.equal(x.seen.sessionReleased.length, 0);
        assert.equal(x.seen.moves, 0);
      });

      await step('9b', 'a carried player\u2019s token is refreshed and carried again with no gap', [5], async () => {
        // The player's token is refreshed as the player's own client would: with the app
        // token as the bearer. The old token is revoked by it.
        const x = servers.X;
        const p = players[1];
        const old = { token: p.token, gameTokenId: p.gameTokenId };
        const res = await counted(endpoint, {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${old.token}` },
          body: JSON.stringify({ query: 'mutation { refreshAppToken { token gameTokenId appId expiresAt } }' }),
        });
        const body = await res.json();
        if (body.errors?.length) throw new Error(`refreshAppToken: ${body.errors[0].extensions?.code}: ${body.errors[0].message}`);
        const fresh = body.data.refreshAppToken;
        secrets.add(fresh.token);
        assert.equal(fresh.token.length, 64);
        assert.ok(fresh.token !== old.token, 'a new token');
        assert.notEqual(fresh.gameTokenId, old.gameTokenId, 'with a new id');

        // Carry again with the new token while the player keeps sending, by the id the game
        // server knew them by a moment ago. Every send must be accepted: none refused.
        const errorsBefore = x.seen.errors.length;
        const releasedBefore = x.seen.released.length;
        const seqs = [];
        let sending = true;
        const stream = (async () => {
          for (let n = 0; sending; n += 1) {
            seqs.push(await update(x, 1, `during-recarry-${n}`).catch((e) => `${e?.name}`));
            await sleep(5);
          }
        })();
        const started = Date.now();
        const result = await x.fleet.carry({ token: fresh.token, gameTokenId: fresh.gameTokenId, replaces: old.gameTokenId });
        const took = Date.now() - started;
        // As a game server does on the carry's answer: from here it knows the player by the new id.
        if (result.carried) {
          p.token = fresh.token;
          p.gameTokenId = fresh.gameTokenId;
        }
        await sleep(300); // sends that were on their way, and any late word about the old id
        sending = false;
        await stream;
        assert.equal(result.status, 'carried', `the refreshed carry: ${result.status} (wire status ${result.wireStatus})`);
        assert.equal(result.playerGameTokenId, fresh.gameTokenId);
        assert.equal(result.userId, p.userId, 'the same user');
        assert.ok(seqs.length > 5 && seqs.every((v) => typeof v === 'number'), `every send was taken locally (${seqs.filter((v) => typeof v !== 'number').length} of ${seqs.length} were not)`);
        assert.equal(x.fleet.carries(fresh.gameTokenId), true);
        assert.equal(x.fleet.carries(old.gameTokenId), false, 'the old id names nothing now');
        assert.equal(x.seen.released.length, releasedBefore, 'no released event: the player was carried throughout');
        const refusals = x.seen.errors.slice(errorsBefore);
        note(
          `the refreshed carry answered in ${took} ms; ${seqs.length} updates were sent across it; ` +
            `${refusals.length} were refused${refusals.length ? ` (${refusals.map((e) => e.code).join(', ')})` : ''}; ` +
            `late frames about the old id ignored: ${x.fleet.stats().replacedIdFrames}`,
        );
        assert.equal(refusals.length, 0, 'no send was refused across the refreshed carry');
        // The player continues under the new id: its state reaches Y, and the last update sent
        // across the carry did too.
        const marker = `recarried-${randomBytes(6).toString('hex')}`;
        await update(x, 1, marker);
        await until('the recarried player\u2019s update on Y', () => servers.Y.seen.actors.some((a) => a.state === b64(marker)), 5_000);
        const arrived = seqs.filter((_, n) => servers.Y.seen.actors.some((a) => a.state === b64(`during-recarry-${n}`))).length;
        note(`${arrived} of the ${seqs.length} updates sent across the carry reached Y`);
        assert.ok(arrived >= seqs.length - 2, 'the updates sent across the carry reached Y');
        await assert.rejects(x.fleet.sendActorUpdate(old.gameTokenId, { ...spatial(1), state: b64('old-id') }), (e) => e instanceof FleetNotCarriedError);
      });

      await step('9c', 'the session closed through the API learns of it, and its refresh answers NOT_FOUND', ['3b'], async () => {
        const z = servers.Z;
        await until('Z to see that a refresh is due', () => z.fleet.refreshDue(), 60_000 - Math.min(59_000, Date.now() - zClosedAt));
        const after = Math.round((Date.now() - zClosedAt) / 100) / 10;
        assert.ok(Date.now() - zClosedAt <= 60_000, 'within 60 seconds of the close');
        assert.equal(z.fleet.moveOrdered, true);
        const since = z.seen.datagrams.slice(z.seen.atClose);
        note(`Z was sent ${since.length} datagram(s) after the close${since.length ? `: ${since.map((d) => d.shape).slice(0, 5).join(', ')}` : ''}`);
        if (z.seen.sessionReleased.length > 0) {
          // Realtime servers from v0.50.1 tell the session, in a frame signed with its fleet
          // token, within seconds of the close.
          note(`Z: told by a signed COMMAND_SESSION_RELEASED ${after} s after closeFleetSession`);
          assert.deepEqual(z.seen.sessionReleased, [0], 'one signed release, reason 0');
          assert.equal(z.fleet.status, 'released');
        } else {
          // Before v0.50.1 the session is sent nothing and notices the silence.
          note(`Z: refreshDue() turned true ${after} s after closeFleetSession (it tolerates 15 s of silence)`);
          assert.equal(z.seen.moves, 1, 'the moveOrdered handler fired');
          assert.equal(z.fleet.status, 'connected', 'nothing told it otherwise');
        }
        assert.deepEqual(z.fleet.refreshInput(), { appId, gameTokenId: z.opened.gameTokenId }, 'the refresh names no server');
        const refusal = await api.fleetSessions.refresh(z.fleet.refreshInput()).then(
          () => null,
          (e) => e,
        );
        assert.ok(refusal instanceof sdk.CrowdyGraphQLError, 'the refresh of a closed session is refused');
        assert.equal(refusal.code, 'NOT_FOUND');
        assert.equal(sdk.fleetSessionNotFoundOf(refusal), true);
        z.fleet.close();
      });

      await step(10, 'the game server connects to hubs as itself and calls for a player', [4], async (st) => {
        const hubApp = process.env.CROWDY_FLEET_HUB_APP_ID;
        if (!hubApp) {
          st.skip('set CROWDY_FLEET_HUB_APP_ID to an app with hubs deployed');
          return;
        }
        const nodeType = process.env.CROWDY_FLEET_HUB_NODE_TYPE ?? 'lobby';
        const key = process.env.CROWDY_FLEET_HUB_KEY ?? '';
        const method = process.env.CROWDY_FLEET_HUB_METHOD ?? 'state';
        // What the API answers: an endpoint, or a refusal with a code.
        let answer;
        try {
          answer = await api.exec.serverEndpoint(hubApp);
        } catch (error) {
          assert.ok(error instanceof sdk.CrowdyGraphQLError, `execConnectAsServer failed with ${error?.name}: ${scrub(error?.message)}`);
          assert.equal(typeof error.code, 'string', 'a refusal carries a code');
          note(`execConnectAsServer was refused ${error.code}: ${error.message}`);
          return;
        }
        secrets.add(answer.token);
        assert.match(answer.gatewayUrl, /^wss?:\/\//);
        assert.ok(typeof answer.token === 'string' && answer.token.length > 20, 'a connect token');
        assert.equal(typeof answer.host, 'string');
        const lifetime = Date.parse(answer.expiresAt) - Date.now();
        assert.ok(lifetime > 0 && lifetime <= 120_000, `the connect token lasts about a minute (${Math.round(lifetime / 1000)} s left)`);
        note(`execConnectAsServer answered host ${answer.host}, gateway ${answer.gatewayUrl}, token good for ${Math.round(lifetime / 1000)} s`);

        const documented = (error, what) => {
          assert.ok(error instanceof sdk.CrowdyExecError, `${what} failed with ${error?.name}: ${scrub(error?.message)}`);
          assert.ok(sdk.EXEC_STATUSES.includes(error.status), `${what}: status ${error.status} is a documented one`);
          assert.doesNotMatch(error.message, /no reply in \d+ ms/, `${what}: the gateway answered`);
          note(`${what} was answered ${scrub(error.message)}`);
        };
        try {
          hub = await api.exec.connectAsServer(hubApp, { WebSocket, callTimeoutMs: 8_000, reconnect: false });
        } catch (error) {
          documented(error, 'the server connection');
          return;
        }
        assert.equal(hub.isServer, true);
        note(`the gateway took the server connection on host ${hub.host}; round trip ${await hub.ping()} ms`);
        // The server's own call (frame 0x01), then a call for a player it carries (0x05).
        const player = players[1];
        for (const [what, call] of [
          [`call ${nodeType}/${key}/${method}`, () => hub.call(nodeType, key, method)],
          [`callAs(player 1) ${nodeType}/${key}/${method}`, () => hub.callAs(player.userId, nodeType, key, method)],
        ]) {
          const started = Date.now();
          try {
            const value = await call();
            note(`${what} answered Ok in ${Date.now() - started} ms: ${scrub(JSON.stringify(value) ?? 'undefined').slice(0, 200)}`);
          } catch (error) {
            documented(error, what);
          }
        }
        // The frame was taken: the gateway closes a connection that sends a frame it does not
        // know, and this one still answers.
        assert.ok((await hub.ping()) >= 0, 'the connection is still open after the call-as frame');
        hub.close();
        hub = null;
      });

      await step('10b', 'a player with no gameplay input is released for idleness, and the session stays', [5], async (st) => {
        if (!(IDLE_SECONDS > 0)) {
          st.skip('set CROWDY_FLEET_IDLE_SECONDS to the app\u2019s idle timeout to wait for it');
          return;
        }
        const y = servers.Y;
        const p = players[3];
        const started = Date.now();
        // Its actor is kept present by the session's heartbeats, which are not gameplay input.
        const gone = () => y.seen.released.find((r) => r.playerGameTokenId === p.gameTokenId);
        await until('player 3 to be released for idleness', () => gone(), (IDLE_SECONDS + 45) * 1000);
        note(`player 3 was released ${Math.round((Date.now() - started) / 1000)} s after this step began, reason ${gone().reason}`);
        assert.equal(gone().reason, 5, 'reason 5: no gameplay input for the app\u2019s idle timeout');
        assert.equal(y.fleet.carries(p.gameTokenId), false);
        carrier.delete(3);
        assert.equal(y.fleet.status, 'connected', 'the session stays');
        assert.equal(y.fleet.carries(players[2].gameTokenId), true, 'and so do the players who kept playing');
        assert.equal(y.fleet.carries(players[0].gameTokenId), true);
        assert.equal(servers.X.fleet.carries(players[1].gameTokenId), true);
      });

      await step(11, 'every player is released and both sessions are closed', [1], async () => {
        clearInterval(pulse);
        for (const server of [servers.X, servers.Y]) {
          for (const row of server.fleet.players()) await server.fleet.release(row.gameTokenId);
          assert.deepEqual(server.fleet.players(), []);
          const stats = server.fleet.stats();
          const forms = {};
          for (const d of server.seen.datagrams) forms[d.type] = (forms[d.type] ?? 0) + 1;
          note(`${server.name}: datagrams received by first byte (type: count): ${JSON.stringify(forms)}`);
          note(`${server.name}: notifications handled: ${JSON.stringify(server.seen.kinds)}`);
          const states = {};
          for (const a of server.seen.actors) {
            const text = Buffer.from(a.state, 'base64').toString('utf8');
            states[text] = (states[text] ?? 0) + 1;
          }
          const repeated = Object.entries(states).filter(([, n]) => n > 1);
          note(`${server.name}: ${Object.keys(states).length} different actor states received, ${repeated.length} of them more than once`);
          note(
            `${server.name}: sent ${stats.datagramsSent} datagrams, received ${stats.datagramsReceived}; ` +
              `errors ${stats.errorsReceived} (unverified ${stats.unverifiedErrorsReceived}), HMAC failures ${stats.hmacFailures}, ` +
              `unsigned ${stats.unsigned}, another app's ${stats.wrongApp}, malformed ${stats.malformed}, stale control ${stats.staleControl}`,
          );
          // Every datagram that was not a signed bundle, an acknowledgement or an error frame.
          const other = server.seen.datagrams.filter((d) => ![30, 46, 3].includes(d.type));
          for (const d of other.slice(0, 12)) note(`${server.name}: a datagram in another form (type/length/own HMAC) ${d.shape}, ${d.detail}`);
          const mine = players.map((p, i) => `player ${i} ${p.uuid}`).join(', ');
          if (other.length > 0) note(`this run's actors: ${mine}`);
          assert.equal(stats.hmacFailures, 0, `${server.name}: every frame verified`);
          assert.equal(stats.oversized, 0);
          assert.deepEqual(server.seen.failures, [], `${server.name}: no socket failure and no handler threw`);
          await sleep(200); // let the releases leave the socket
          server.fleet.close();
          assert.equal(server.fleet.status, 'closed');
          const input = { appId, gameTokenId: server.opened.gameTokenId };
          assert.equal(await api.fleetSessions.close(input), true, `${server.name}: closeFleetSession ended the session`);
          closed[server.name] = true;
          assert.equal(await api.fleetSessions.close(input), false, `${server.name}: a second close finds none`);
        }
      });
      await step(12, 'the realtime server sent each session nothing but its own', [3], async () => {
        // Checked last and on its own, because it judges the realtime servers and not the
        // steps above: a session is in one app, and everything it is sent is signed.
        const problems = [];
        for (const server of [servers.X, servers.Y, servers.Z].filter(Boolean)) {
          const stats = server.fleet.stats();
          const by = (key) => {
            const counts = {};
            for (const f of server.seen.foreign) counts[f[key]] = (counts[f[key]] ?? 0) + 1;
            return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, n]) => `${k}: ${n}`).join('; ');
          };
          if (server.seen.foreign.length > 0) {
            const f = server.seen.foreign;
            problems.push(
              `${server.name} (app ${appId}, on ${server.opened.server.ip4}:${server.opened.server.clientPort}) was sent ${f.length} notifications of ` +
                `another app, from +${f[0].at} ms to +${f.at(-1).at} ms of the run: by app ${by('app')}; by message type ${by('type')}; ` +
                `by form ${by('form')}; by chunk ${by('chunk')}; ${new Set(f.map((x) => x.uuid)).size} different actors ` +
                `(for example ${[...new Set(f.map((x) => x.uuid))].slice(0, 2).join(', ')}); first arrived in step ${f[0].step}. ` +
                `The session dropped ${stats.wrongApp} of them as another app's and ${stats.unsigned} as unsigned.`,
            );
          } else if (stats.wrongApp > 0 || stats.unsigned > 0) {
            problems.push(`${server.name} dropped ${stats.wrongApp} notifications of another app and ${stats.unsigned} unsigned ones`);
          }
        }
        for (const problem of problems) note(`NOT THE SDK: ${problem}`);
        assert.equal(
          problems.length,
          0,
          `the realtime server sent a session what is not its own (the SDK dropped and counted it; see the diagnostics): ${problems.join(' | ')}`,
        );
      });
    } finally {
      // Whatever happened above, nothing is left running.
      clearInterval(pulse);
      try {
        hub?.close();
      } catch {
        /* already closed */
      }
      for (const name of ['X', 'Y', 'Z']) {
        const server = servers[name];
        if (!server) continue;
        try {
          if (server.fleet.status !== 'closed') {
            for (const row of server.fleet.players()) await server.fleet.release(row.gameTokenId).catch(() => {});
            await sleep(200);
            server.fleet.close();
          }
          if (!closed[name]) await api.fleetSessions.close({ appId, gameTokenId: server.opened.gameTokenId });
        } catch (error) {
          note(`cleanup of ${name}: ${error?.name}: ${error?.message}`);
        }
      }
      api.close();
    }
  },
);
