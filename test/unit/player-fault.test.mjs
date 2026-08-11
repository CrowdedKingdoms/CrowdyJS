import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import {
  CrowdyGraphQLError,
  CrowdyUserCodeFaultError,
  playerFaultOf,
} from '../../dist/errors.js';

/**
 * The SDK half of decision D4.
 *
 * THE PROMISE BEING TESTED: a game branches ONCE. The server has two carriers — a thrown
 * error for `computeInvoke` / `playerComputeInvoke`, an in-band `fault` field for
 * `gameModelInvoke`, because the latter still returns an event id and the writes that did
 * apply — and `playerFaultOf` has to make those one thing. If it did not, every game
 * would grow two error paths and the second one would rot.
 *
 * AND WHAT MUST *NOT* HAPPEN: `playerFaultOf` returning a fault for something that is not
 * one. A timeout, a dropped socket and an ordinary validation error elsewhere in the API
 * are not questions about whose code failed, and answering them with `blame: PLATFORM`
 * would be the same category error the server used to make in the other direction.
 */

const thrownFault = () =>
  new CrowdyUserCodeFaultError([
    {
      message: 'The service is busy. Please try again in a moment.',
      path: ['computeInvoke'],
      extensions: { code: 'PLATFORM_BUSY', blame: 'PLATFORM', retryable: true },
    },
  ]);

const inBandFault = () => ({
  eventId: 'evt-1',
  functionName: 'TakeDamage',
  success: false,
  returnValueJson: null,
  mutationsApplied: [],
  fault: { code: 'USER_CODE_TOO_SLOW', blame: 'AUTHOR', retryable: false },
  errorMessage: 'This action could not be completed.',
});

test('both carriers normalise to one shape', () => {
  assert.deepEqual(playerFaultOf(thrownFault()), {
    code: 'PLATFORM_BUSY',
    blame: 'PLATFORM',
    retryable: true,
  });
  assert.deepEqual(playerFaultOf(inBandFault()), {
    code: 'USER_CODE_TOO_SLOW',
    blame: 'AUTHOR',
    retryable: false,
  });
});

test('a thrown fault is still a CrowdyGraphQLError, so existing catches keep working', () => {
  const error = thrownFault();
  assert.ok(error instanceof CrowdyGraphQLError);
  assert.equal(error.blame, 'PLATFORM');
  assert.equal(error.retryable, true);
  assert.equal(error.fault.code, 'PLATFORM_BUSY');
});

test('a successful invoke has no fault', () => {
  assert.equal(
    playerFaultOf({ success: true, fault: null, errorMessage: null }),
    null,
  );
});

test('an unattributed error is not turned into one', () => {
  const ordinary = new CrowdyGraphQLError([
    { message: 'Nope', extensions: { code: 'SCOPE_MISSING' } },
  ]);
  assert.equal(playerFaultOf(ordinary), null);
  assert.equal(playerFaultOf(new Error('socket hang up')), null);
  assert.equal(playerFaultOf(null), null);
  assert.equal(playerFaultOf('BUDGET'), null);
});

/**
 * `retryable` decides whether a client loops. An absent value must therefore read as
 * false: "we did not say" is not permission to hammer the endpoint, and this is the one
 * default in the whole feature where guessing wrong costs the platform rather than the
 * player.
 */
test('a missing retryable reads as false, not as permission to retry', () => {
  const error = new CrowdyUserCodeFaultError([
    { message: 'x', extensions: { code: 'PLATFORM_ERROR', blame: 'PLATFORM' } },
  ]);
  assert.equal(error.retryable, false);
  assert.equal(playerFaultOf(error).retryable, false);
});

/**
 * The reason the SDK can promise a game that no platform string reaches it is that the
 * generated operation asks for the structured field. Selecting only `errorMessage` would
 * leave every fault `null` here and every game back to rendering text.
 */
test('the invoke document selects the structured fault', () => {
  const document = readFileSync(
    new URL('../../src/operations/gameModel/GameModelRuntime.graphql', import.meta.url),
    'utf8',
  );
  const fragment = document.slice(
    document.indexOf('fragment GmInvokeResultFields'),
  );
  const body = fragment.slice(0, fragment.indexOf('\n}'));
  for (const field of ['fault', 'code', 'blame', 'retryable']) {
    assert.ok(body.includes(field), `GmInvokeResultFields must select ${field}`);
  }
});
