import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CrowdyModelLintLog,
  modelLintDiagnostics,
  modelLintSubjectPath,
  modelRefusalFrom,
} from '../../dist/index.js';

/**
 * Game-model findings reaching the developer, by the two routes that exist.
 *
 * An authoring context calls `gameModelLint` and gets diagnostics an editor renders. A
 * shipped game cannot — the query needs `manage_apps` — and instead sees the server refuse
 * a specific operation. Both are covered here, and the deduplication is covered hardest,
 * because a warning printed every frame is the failure mode this code exists to avoid
 * rather than reproduce.
 */

test('lint findings become editor diagnostics with their code and severity', () => {
  const diagnostics = modelLintDiagnostics({
    appId: '1',
    errorCount: 1,
    warningCount: 1,
    clean: false,
    findings: [
      {
        code: 'container_type_undefined',
        severity: 'error',
        subjectKind: 'container_type',
        subject: 'TitanAssaultTeamAssignment',
        message: '3 container(s) name a type this app does not define',
        remedy: 'Define it, or correct the name your client sends.',
      },
      {
        code: 'function_not_defined',
        severity: 'warning',
        subjectKind: 'function',
        subject: 'apply_damage',
        message: "function 'fn:heal' is not defined in this app",
      },
    ],
  });

  assert.equal(diagnostics.length, 2);
  assert.equal(diagnostics[0].severity, 'error');
  assert.equal(diagnostics[0].code, 'container_type_undefined');
  assert.equal(diagnostics[0].source, 'model-lint');
  // The remedy is joined in rather than dropped: a Problems list is one line per
  // entry, and a finding you cannot act on from where you are reading it is the
  // whole problem being fixed here.
  assert.match(diagnostics[0].message, /Define it, or correct the name/);
  assert.equal(diagnostics[1].severity, 'warning');
});

test('the subject path is prefixed by kind, because subjects collide across kinds', () => {
  // An automation and a function may both be called on_join. A Problems list
  // showing both as "on_join" would be actively misleading about which is broken.
  assert.equal(
    modelLintSubjectPath({ subjectKind: 'function', subject: 'on_join' }),
    'function/on_join',
  );
  assert.equal(
    modelLintSubjectPath({ subjectKind: 'automation', subject: 'on_join' }),
    'automation/on_join',
  );
});

test('a clean lint produces nothing to render', () => {
  assert.deepEqual(
    modelLintDiagnostics({
      appId: '1',
      findings: [],
      errorCount: 0,
      warningCount: 0,
      clean: true,
    }),
    [],
  );
  assert.deepEqual(modelLintDiagnostics(null), []);
});

test('a model refusal is recognised by its code, never by its message', () => {
  const refusal = modelRefusalFrom({
    message: "Container type 'Foo' is not defined for app 1",
    extensions: {
      code: 'CONTAINER_TYPE_UNDEFINED',
      typeName: 'Foo',
      definedTypes: ['Bar'],
    },
  });

  assert.ok(refusal);
  assert.equal(refusal.code, 'CONTAINER_TYPE_UNDEFINED');
  assert.equal(refusal.subject, 'Foo');
  // The server's own list of what the app defines rides along, so a client can
  // offer a correction without a second round trip.
  assert.deepEqual(refusal.detail.definedTypes, ['Bar']);
});

test('an unrelated error is not claimed as a model problem', () => {
  assert.equal(modelRefusalFrom({ message: 'nope' }), null);
  assert.equal(
    modelRefusalFrom({ message: 'x', extensions: { code: 'FORBIDDEN' } }),
    null,
  );
  assert.equal(modelRefusalFrom(null), null);
});

test('the same refusal logs once, however many times it happens', () => {
  // The one that matters. A bind is attempted per entity per frame, and a warning
  // at that rate is indistinguishable from noise — which is how the original
  // incident stayed invisible for a day while the client logged continuously.
  const lines = [];
  const log = new CrowdyModelLintLog({ warn: (m) => lines.push(m) });
  const refusal = {
    code: 'CONTAINER_TYPE_UNDEFINED',
    message: 'not defined',
    subject: 'Foo',
  };

  assert.equal(log.record(refusal), true);
  for (let i = 0; i < 1000; i++) log.record(refusal);

  assert.equal(lines.length, 1);
  assert.equal(log.collected().length, 1);
});

test('a different subject is a different problem and is reported', () => {
  const lines = [];
  const log = new CrowdyModelLintLog({ warn: (m) => lines.push(m) });

  log.record({ code: 'CONTAINER_TYPE_UNDEFINED', message: 'a', subject: 'Foo' });
  log.record({ code: 'CONTAINER_TYPE_UNDEFINED', message: 'b', subject: 'Bar' });
  log.record({ code: 'OBJECT_QUARANTINED', message: 'c', subject: 'Foo' });

  assert.equal(lines.length, 3);
});

test('reset lets a reconnect to a repaired app report afresh', () => {
  const lines = [];
  const log = new CrowdyModelLintLog({ warn: (m) => lines.push(m) });
  const refusal = { code: 'OBJECT_QUARANTINED', message: 'q', subject: 'f' };

  log.record(refusal);
  log.reset();
  log.record(refusal);

  assert.equal(lines.length, 2);
  assert.equal(log.collected().length, 1);
});

test('a logger with no warn method is not a crash', () => {
  // The SDK's logger interface has every method optional, and silentLogger
  // implements none of them.
  const log = new CrowdyModelLintLog();
  assert.equal(log.record({ code: 'OBJECT_QUARANTINED', message: 'q' }), true);
});

test('a quarantine is recognised on gameModelInvoke, where the code is USER_CODE_ERROR', () => {
  // THE PATH THAT MATTERS MOST AND WAS MISSED. gameModelInvoke is a user-code boundary, so
  // the server rebuilds the error from a { code, blame, retryable } triple: the code
  // becomes USER_CODE_ERROR while the quarantine fields survive. Keying only on
  // OBJECT_QUARANTINED therefore missed the refusal on the single path a player takes.
  const refusal = modelRefusalFrom({
    message: 'This action could not be completed.',
    extensions: {
      code: 'USER_CODE_ERROR',
      blame: 'AUTHOR',
      retryable: false,
      quarantinedKind: 'function',
      quarantinedName: 'probe_notify',
      quarantineReason: 'notification_channel_foreign: targets another app',
    },
  });

  assert.ok(refusal, 'a quarantine on the invoke path must still be recognised');
  assert.equal(refusal.subject, 'probe_notify');
  assert.equal(refusal.quarantine.kind, 'function');
  assert.match(refusal.quarantine.reason, /notification_channel_foreign/);
});

test('the quarantine reason is first-class, not buried in detail', () => {
  const refusal = modelRefusalFrom({
    message: 'quarantined',
    extensions: {
      code: 'OBJECT_QUARANTINED',
      quarantinedName: 'enemy_ai',
      quarantineReason: 'timer_target_not_autonomous: whatever',
    },
  });
  // `reason` is the only actionable field; reaching it through an untyped bag is how a
  // developer ends up guessing which of their lint errors did it.
  assert.equal(refusal.quarantine.reason, 'timer_target_not_autonomous: whatever');
});

test('an ordinary user-code error is not mistaken for a quarantine', () => {
  const refusal = modelRefusalFrom({
    message: 'This action could not be completed.',
    extensions: { code: 'USER_CODE_ERROR', blame: 'AUTHOR', retryable: false },
  });
  assert.equal(refusal, null);
});
