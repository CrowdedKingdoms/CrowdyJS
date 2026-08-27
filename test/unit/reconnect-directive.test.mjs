import assert from 'node:assert/strict';
import test from 'node:test';
import { isSameEstate } from '../../dist/binary-relay.js';

/**
 * Guard on the server-directed reconnect.
 *
 * The directive arrives over an authenticated TLS socket, so this is not about
 * whether the server is who it says. It bounds what a server may ASK for: one
 * compromised instance must not be able to walk an entire fleet's clients onto
 * an origin outside the estate, which would be far worse than the unbalanced
 * fleet the directive exists to fix.
 */

test('accepts a sibling instance in the same estate', () => {
  assert.equal(
    isSameEstate(
      'wss://ck-api-or-1.prod.crowdedkingdoms.com/realtime',
      'wss://ck-api-or-4.prod.crowdedkingdoms.com',
    ),
    true,
  );
});

test('accepts the shared load balancer', () => {
  assert.equal(
    isSameEstate(
      'wss://ck-api-or-1.prod.crowdedkingdoms.com/realtime',
      'wss://ck.prod.crowdedkingdoms.com',
    ),
    true,
  );
});

test('accepts the identical origin', () => {
  assert.equal(
    isSameEstate('wss://ck.example.com/realtime', 'wss://ck.example.com'),
    true,
  );
});

test('refuses an origin outside the estate', () => {
  assert.equal(
    isSameEstate(
      'wss://ck-api-or-1.prod.crowdedkingdoms.com/realtime',
      'wss://evil.example.com',
    ),
    false,
  );
});

test('refuses a lookalike that only shares a prefix', () => {
  // crowdedkingdoms.com.evil.com must not pass as crowdedkingdoms.com.
  assert.equal(
    isSameEstate(
      'wss://ck.prod.crowdedkingdoms.com/realtime',
      'wss://ck.prod.crowdedkingdoms.com.evil.com',
    ),
    false,
  );
});

test('refuses anything unparseable rather than guessing', () => {
  assert.equal(isSameEstate('wss://ck.example.com', 'not a url'), false);
  assert.equal(isSameEstate('not a url', 'wss://ck.example.com'), false);
  assert.equal(isSameEstate('', ''), false);
});

test('refuses a bare hostname with no registrable domain', () => {
  assert.equal(isSameEstate('wss://localhost/realtime', 'wss://localhost'), true);
  assert.equal(isSameEstate('wss://localhost/realtime', 'wss://otherhost'), false);
});
