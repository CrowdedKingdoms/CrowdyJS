/**
 * What a relay does when the instance it was WORKING with goes away.
 *
 * `binary-relay-unavailable.test.mjs` covers a relay that never came up. This
 * covers the other half, which is the case that actually strands players and
 * which nothing escalated for.
 *
 * The escalation to `onUnavailable` — the only route to re-discovery for the
 * binary transport — was guarded by `!everReady`. So a client that had never
 * connected could be moved, and a client that had been happily connected until
 * its ck-api instance stopped could not: onclose fell through to maybeRetry and
 * it re-dialled one dead address until its attempts ran out. Wiring
 * `discoveryUrl` made no difference, because nothing ever asked.
 *
 * Measured on pgc-prod on 2026-08-06: with ck-api-3 stopped mid-run, four bots
 * logged "Binary relay socket error" repeatedly and never attempted to move.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { BinaryRelayTransport } from '../../dist/binary-relay.js';

const TOKEN = 'a'.repeat(64);

/** Minimal controllable WebSocket. Every instance is recorded so a test can drive the newest. */
class FakeWebSocket {
  static instances = [];
  static OPEN = 1;

  constructor(url, protocols) {
    this.url = url;
    this.protocols = protocols;
    this.readyState = 0;
    this.sent = [];
    FakeWebSocket.instances.push(this);
  }
  send(data) {
    this.sent.push(data);
  }
  close() {
    this.readyState = 3;
  }
  open() {
    this.readyState = FakeWebSocket.OPEN;
    this.onopen?.({});
  }
  /** Deliver the server's `ready` control frame, which is what sets everReady. */
  ready(gameTokenId = '123') {
    this.onmessage?.({ data: JSON.stringify({ type: 'ready', gameTokenId }) });
  }
  drop(code = 1006) {
    this.readyState = 3;
    this.onclose?.({ code, reason: '', wasClean: false });
  }
}

function makeTransport() {
  const events = { unavailable: 0, warnings: [] };
  const transport = new BinaryRelayTransport(
    {
      url: 'wss://ck-api-3.example.test/realtime',
      retryInitialDelayMs: 0,
      retryMaxDelayMs: 0,
      retryAttempts: 20,
      logger: {
        warn: (m) => events.warnings.push(String(m)),
        error: () => {},
        debug: () => {},
        info: () => {},
      },
    },
    {
      getToken: () => TOKEN,
      onNotification: () => {},
      onError: () => {},
      onStatus: () => {},
      onUnavailable: () => {
        events.unavailable += 1;
      },
      onReconnectDirective: () => {},
    },
  );
  return { transport, events };
}

/** Let queued microtasks and zero-delay retry timers run. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 5));

async function connectAndBecomeReady() {
  const { transport, events } = makeTransport();
  transport.connect('76375790011136');
  await settle();
  const ws = FakeWebSocket.instances.at(-1);
  ws.open();
  ws.ready();
  await settle();
  return { transport, events, ws };
}

test.beforeEach(() => {
  FakeWebSocket.instances = [];
  globalThis.WebSocket = FakeWebSocket;
});

test('a relay that was ready and then loses its instance escalates so re-discovery can run', async () => {
  const { events, ws } = await connectAndBecomeReady();
  assert.equal(events.unavailable, 0, 'nothing should escalate while it is healthy');

  // The instance stops. Every reconnect attempt now fails before `ready`.
  ws.drop();
  for (let i = 0; i < 6; i += 1) {
    await settle();
    const next = FakeWebSocket.instances.at(-1);
    if (!next || next === ws) break;
    next.open();
    next.drop();
  }
  await settle();

  assert.equal(
    events.unavailable,
    1,
    'onUnavailable is the only path to re-discovery for the binary transport, and it never fired before this fix',
  );
  assert.ok(
    events.warnings.some((w) => w.includes('the instance is probably gone')),
    `expected a warning naming the likely cause, got: ${events.warnings.join(' | ')}`,
  );
});

test('a single reconnect blip does not move a client off a healthy instance', async () => {
  // The reason the post-ready limit is higher than the pre-ready one. Escalating
  // on the first drop would shuffle clients around during ordinary network noise.
  const { events, ws } = await connectAndBecomeReady();

  ws.drop();
  await settle();
  const next = FakeWebSocket.instances.at(-1);
  next.open();
  next.ready();
  await settle();

  assert.equal(events.unavailable, 0);
});

test('a relay that was never ready still escalates on the earlier, lower limit', async () => {
  // Unchanged behaviour, asserted so the two thresholds cannot be collapsed by
  // accident: never-connected is evidence about the endpoint, and degrading to
  // the GraphQL transport sooner is right for it.
  const { transport, events } = makeTransport();
  transport.connect('76375790011136');
  await settle();

  for (let i = 0; i < 4; i += 1) {
    const ws = FakeWebSocket.instances.at(-1);
    if (!ws) break;
    ws.open();
    ws.drop();
    await settle();
    if (events.unavailable > 0) break;
  }

  assert.equal(events.unavailable, 1);
  assert.ok(
    events.warnings.some((w) => w.includes('failed handshakes')),
    `expected the pre-ready wording, got: ${events.warnings.join(' | ')}`,
  );
});
