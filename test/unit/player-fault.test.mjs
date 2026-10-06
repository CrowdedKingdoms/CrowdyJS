import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CrowdyGraphQLError,
  CrowdyUserCodeFaultError,
  playerFaultOf,
} from '../../dist/errors.js';

/**
 * The SDK half of decision D4.
 *
 * THE PROMISE BEING TESTED: a game branches ONCE. There are two carriers — a thrown
 * error, and an in-band `fault` field on a result that still reports what did apply (the
 * legacy `gameModelInvoke` was one) — and `playerFaultOf` has to make those one thing. If
 * it did not, every game would grow two error paths and the second one would rot.
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
test('an open circuit carries why it opened when the server knows', () => {
  const error = new CrowdyUserCodeFaultError([
    {
      message: 'This action is paused because it kept failing.',
      extensions: {
        code: 'CIRCUIT_OPEN',
        blame: 'AUTHOR',
        retryable: true,
        cause: 'watchdog_timeout',
        retryAfterMs: 60000,
      },
    },
  ]);
  assert.equal(playerFaultOf(error).code, 'CIRCUIT_OPEN');
  assert.equal(playerFaultOf(error).cause, 'watchdog_timeout');
  assert.equal(error.fault.cause, 'watchdog_timeout');
});

test('a missing retryable reads as false, not as permission to retry', () => {
  const error = new CrowdyUserCodeFaultError([
    { message: 'x', extensions: { code: 'PLATFORM_ERROR', blame: 'PLATFORM' } },
  ]);
  assert.equal(error.retryable, false);
  assert.equal(playerFaultOf(error).retryable, false);
});

