/**
 * Where `client.exec.connect` sends a connect token, and what it reports when a gateway refuses
 * one. The game API names the gateway and the token rides in the URL, so `connect` dials only a
 * gateway `execGatewayRefusal` passes (the cases are shared with CrowdyCPP). Since ck-exec 0.10.0
 * a gateway refuses a bad token with `HTTP 401` and the reason as the body, before any WebSocket
 * exists; Node's `ws` can read that, a browser cannot. Before 0.10.0 it upgraded and closed 4401.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { WebSocket, WebSocketServer } from 'ws';

import { CrowdyExecError, ExecAPI, ExecConnection, execGatewayRefusal } from '../../dist/index.js';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/exec-gateway-cases.json', import.meta.url), 'utf8'));

test('execGatewayRefusal answers every shared case', () => {
  assert.ok(fixture.cases.length >= 15);
  for (const c of fixture.cases) {
    const why = execGatewayRefusal(c.gameApi, c.gateway);
    assert.equal(why === null, c.dials, `${c.note}: ${c.gameApi} -> ${c.gateway} (${why})`);
    if (!c.dials) assert.equal(typeof why, 'string');
  }
});

test('a relative game API URL is judged against the page it runs on', (t) => {
  const had = Object.getOwnPropertyDescriptor(globalThis, 'location');
  Object.defineProperty(globalThis, 'location', { value: { href: 'https://mygame.example.com/play/' }, configurable: true });
  t.after(() => {
    if (had) Object.defineProperty(globalThis, 'location', had);
    else delete globalThis.location;
  });
  assert.equal(execGatewayRefusal('/graphql', 'wss://ckx-or-1.exec.dev.crowdedkingdoms.com'), null);
  assert.match(execGatewayRefusal('/graphql', 'ws://ckx-or-1.exec.dev.crowdedkingdoms.com'), /wss: gateways only/);
  assert.match(execGatewayRefusal('/graphql', 'wss://gw.example.org'), /outside the estate/);
});

/** A fake game API whose `execConnect` names `gatewayUrl`, served from `endpoint`. */
function api(endpoint, gatewayUrl) {
  const dials = [];
  const graphql = {
    endpoint,
    request: async (_doc, vars) => {
      dials.push(vars);
      return {
        execConnect: {
          gatewayUrl,
          token: `token-${dials.length}`,
          host: `host-${dials.length}`,
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
        },
      };
    },
  };
  return { exec: new ExecAPI(graphql), dials };
}

async function listeningGateway() {
  const wss = new WebSocketServer({ port: 0 });
  await new Promise((r) => wss.once('listening', r));
  const tokens = [];
  wss.on('connection', (_ws, req) => tokens.push(new URL(req.url, 'http://x').searchParams.get('token')));
  return { wss, tokens, port: wss.address().port };
}

test('connect never dials a gateway the check refuses, and says why', async (t) => {
  const gw = await listeningGateway();
  t.after(() => gw.wss.close());
  // An https game API naming a plain ws: gateway.
  const insecure = api('https://ck.dev.crowdedkingdoms.com/graphql', `ws://127.0.0.1:${gw.port}`);
  await assert.rejects(insecure.exec.connect('77', { WebSocket }), (e) => {
    assert.ok(e instanceof CrowdyExecError);
    assert.equal(e.status, 'Unavailable');
    assert.match(e.message, /refusing the gateway ws:\/\/127\.0\.0\.1:\d+: a game API on https: hands out wss: gateways only/);
    return true;
  });
  // A gateway off the estate.
  const stranger = api('https://ck.dev.crowdedkingdoms.com/graphql', 'wss://gw.example.org');
  await assert.rejects(stranger.exec.connect('77', { WebSocket }), /outside the estate of ck\.dev\.crowdedkingdoms\.com/);
  // A developer connection is held to the same rule.
  const developer = new ExecAPI({
    endpoint: 'https://ck.dev.crowdedkingdoms.com/graphql',
    request: async () => ({
      execConnectAsDeveloper: { gatewayUrl: 'wss://gw.example.org', token: 'dev', host: 'h', expiresAt: '' },
    }),
  });
  await assert.rejects(developer.connectAsDeveloper('77', { WebSocket }), /refusing the gateway wss:\/\/gw\.example\.org/);
  assert.deepEqual(gw.tokens, [], 'no token reached any gateway');
  assert.equal(insecure.dials.length, 1);

  // The local cluster: a loopback game API and a loopback gateway.
  const local = api('http://localhost:3000/graphql', `ws://127.0.0.1:${gw.port}`);
  const c = await local.exec.connect('77', { WebSocket });
  c.close();
  assert.deepEqual(gw.tokens, ['token-1']);
});

/** A gateway that answers every upgrade with `status` and `reason`, as ck-exec 0.10.0+ does. */
async function refusingGateway(status, reason) {
  const server = createServer((_req, res) => res.writeHead(400).end());
  const tokens = [];
  server.on('upgrade', (req, socket) => {
    tokens.push(new URL(req.url, 'http://x').searchParams.get('token'));
    const text = status === 401 ? 'Unauthorized' : 'Too Many Requests';
    socket.end(
      `HTTP/1.1 ${status} ${text}\r\ncontent-type: text/plain; charset=utf-8\r\n` +
        `content-length: ${Buffer.byteLength(reason)}\r\nconnection: close\r\n\r\n${reason}`,
    );
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { server, tokens, url: `ws://127.0.0.1:${server.address().port}` };
}

test('Node: a token the gateway refuses (HTTP 401) is Denied, with the gateway\'s reason', async (t) => {
  const gw = await refusingGateway(401, 'token expired');
  t.after(() => gw.server.close());
  await assert.rejects(ExecConnection.open(gw.url, 'stale', { WebSocket }), (e) => {
    assert.ok(e instanceof CrowdyExecError);
    assert.equal(e.status, 'Denied');
    assert.equal(e.retryable, false);
    assert.equal(e.message, 'Denied: the gateway refused the connection (HTTP 401: token expired)');
    return true;
  });
  // Through the game API too: connect throws it, after one dial.
  const { exec, dials } = api('http://localhost:3000/graphql', gw.url);
  await assert.rejects(exec.connect('77', { WebSocket }), (e) => e.status === 'Denied' && /token expired/.test(e.message));
  assert.equal(dials.length, 1);
  assert.deepEqual(gw.tokens, ['stale', 'token-1']);
});

test('Node: a player past the session cap (HTTP 429) is Unavailable, with the reason', async (t) => {
  const reason = 'a player may hold 16 sessions to an app through this gateway';
  const gw = await refusingGateway(429, reason);
  t.after(() => gw.server.close());
  await assert.rejects(ExecConnection.open(gw.url, 't', { WebSocket }), (e) => {
    assert.equal(e.status, 'Unavailable');
    assert.equal(e.retryable, true);
    assert.equal(e.message, `Unavailable: the gateway refused the connection (HTTP 429: ${reason})`);
    return true;
  });
});

/** What a browser's WebSocket can see of a refused upgrade: an error, then a 1006 close. */
class BrowserLikeWebSocket {
  constructor(url) {
    const inner = new WebSocket(url);
    this.inner = inner;
    inner.onopen = (ev) => this.onopen?.(ev);
    inner.onerror = () => this.onerror?.(new Event('error'));
    inner.onclose = (ev) => this.onclose?.({ code: ev.code, reason: ev.reason });
    inner.onmessage = (ev) => this.onmessage?.(ev);
  }
  set binaryType(v) {
    this.inner.binaryType = v;
  }
  send(data) {
    this.inner.send(data);
  }
  close() {
    this.inner.close();
  }
}

test('a browser cannot read a refused upgrade, so there it stays Unavailable', async (t) => {
  const gw = await refusingGateway(401, 'token expired');
  t.after(() => gw.server.close());
  await assert.rejects(ExecConnection.open(gw.url, 'stale', { WebSocket: BrowserLikeWebSocket }), (e) => {
    assert.equal(e.status, 'Unavailable');
    assert.doesNotMatch(e.message, /token expired/);
    return true;
  });
});

test('a gateway before ck-exec 0.10.0, which upgraded and closed 4401, is still Denied', async (t) => {
  const wss = new WebSocketServer({ port: 0 });
  await new Promise((r) => wss.once('listening', r));
  t.after(() => wss.close());
  wss.on('connection', (ws) => ws.once('message', () => ws.close(4401, 'token expired')));
  for (const WS of [WebSocket, BrowserLikeWebSocket]) {
    const c = await ExecConnection.open(`ws://127.0.0.1:${wss.address().port}`, 't', { WebSocket: WS });
    await assert.rejects(c.call('arena', 'm1', 'state'), (e) => {
      assert.ok(e instanceof CrowdyExecError);
      assert.equal(e.status, 'Denied');
      assert.match(e.message, /4401: token expired/);
      return true;
    });
    c.close();
  }
});
