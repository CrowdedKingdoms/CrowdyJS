/**
 * The 18.40.1 rule, where 18.41.0 applied it outside `FleetSession`'s ids: a message built
 * from a caller's value names its kind or its length, never the value. Each case passes a
 * token where another value belongs and holds the token against the message and the stack.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

const { encodeExecFrame, ExecConnection, CrowdyExecError } = await import('../../dist/domains/exec.js');
const { fleetServerAddress } = await import('../../dist/fleet/socket.js');

const TOKEN = 'Tk'.repeat(32); // 64 characters, as a player's token or a fleet token is

function silent(error) {
  assert.ok(!String(error.message).includes(TOKEN), `the message holds the token: ${error.message.replaceAll(TOKEN, '<token>')}`);
  assert.ok(!String(error.stack).includes(TOKEN), 'the stack holds the token');
  return true;
}

test('callAs: a token where the player id belongs is described, never shown', () => {
  const frame = (player) => encodeExecFrame({ kind: 'callAs', rid: 1, player, nodeType: 'arena', key: 'k', method: 'm', payload: new Uint8Array(0) });
  assert.throws(
    () => frame(TOKEN),
    (error) => {
      assert.ok(error instanceof RangeError);
      assert.match(error.message, /^player must be a whole number from 0 to 2\^64 - 1, and was a string of 64 characters$/);
      return silent(error);
    },
  );
  assert.throws(() => frame(1.5), /and was a number that is not a safe integer$/);
  assert.throws(() => frame(Number.NaN), /and was a number that is not finite$/);
  assert.throws(() => frame(-1n), /and was an integer outside that range$/);
  assert.throws(() => frame(1n << 64n), /and was an integer outside that range$/);
  assert.throws(() => frame(null), /and was null$/);
  assert.throws(() => frame({}), /and was a value of type object$/);
  // A good id still encodes.
  assert.equal(frame('18446744073709551615')[0], 0x05);
});

/** A WebSocket that fails as soon as it is made, as a refused connection does. */
class FailingSocket {
  constructor(url) {
    this.url = url;
    setTimeout(() => this.onerror?.({ type: 'error' }), 0);
  }
  close() {}
}

/** A WebSocket whose constructor refuses the URL and names all of it, as platforms do. */
class RefusingSocket {
  constructor(url) {
    throw new SyntaxError(`Invalid URL: ${url}`);
  }
}

test('a gateway error names the gateway\'s origin, and nothing after it', async () => {
  // A caller's URL that already carries a token: the path and the query stay out.
  await assert.rejects(
    ExecConnection.openAsServer(`wss://gw.example.test:8443/v1/connect?token=${TOKEN}`, 'connect-token', { WebSocket: FailingSocket }),
    (error) => {
      assert.ok(error instanceof CrowdyExecError);
      assert.equal(error.message, 'Unavailable: connecting to wss://gw.example.test:8443 failed');
      return silent(error);
    },
  );
  // The token passed where the URL belongs.
  await assert.rejects(
    ExecConnection.openAsServer(TOKEN, 'wss://gw.example.test', { WebSocket: FailingSocket }),
    (error) => {
      assert.match(error.message, /connecting to a gateway URL that does not parse \(a string of 64 characters\) failed$/);
      return silent(error);
    },
  );
});

test('a socket the platform refuses to make does not put the connect URL in the error', async () => {
  await assert.rejects(
    ExecConnection.openAsServer('wss://gw.example.test', TOKEN, { WebSocket: RefusingSocket }),
    (error) => {
      assert.ok(error instanceof CrowdyExecError);
      assert.equal(error.message, 'Unavailable: no socket could be opened to wss://gw.example.test');
      assert.equal(error.cause, undefined, "the constructor's error names the whole URL, so it is left out");
      return silent(error);
    },
  );
});

test('a fleet session\'s server address: a number and an IP address are shown, anything else is described', () => {
  assert.throws(
    () => fleetServerAddress({ ip4: '203.0.113.7', clientPort: TOKEN }),
    (error) => {
      assert.equal(error.message, 'the realtime server names no usable clientPort: a string of 64 characters');
      return silent(error);
    },
  );
  assert.throws(() => fleetServerAddress({ ip4: '203.0.113.7', clientPort: 70000 }), /clientPort: 70000$/);
  assert.throws(() => fleetServerAddress({ ip4: '203.0.113.7', clientPort: 0 }), /clientPort: 0$/);
  assert.throws(() => fleetServerAddress({ ip4: '203.0.113.7', clientPort: undefined }), /clientPort: a value of type undefined$/);
  assert.throws(() => fleetServerAddress({ ip4: '203.0.113.7', clientPort: null }), /clientPort: null$/);
  assert.deepEqual(fleetServerAddress({ ip4: '203.0.113.7', ip6: '', clientPort: 9091 }), { host: '203.0.113.7', family: 4, port: 9091 });
  assert.deepEqual(fleetServerAddress({ ip4: '', ip6: '2001:db8::7', clientPort: 9091 }), { host: '2001:db8::7', family: 6, port: 9091 });
});
