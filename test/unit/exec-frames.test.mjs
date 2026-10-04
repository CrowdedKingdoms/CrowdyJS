/**
 * The ck-exec client protocol against its golden frames. `fixtures/exec-client-frames.json` is a
 * copy of ck-exec's `crates/ckx-proto/tests/client-frames.json`, which the Rust codec is held to
 * as well; a protocol change updates both copies.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { decodeExecFrame, encodeExecFrame, execStatus, EXEC_STATUSES } from '../../dist/index.js';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/exec-client-frames.json', import.meta.url)));
const hex = (b) => Buffer.from(b).toString('hex');
const bytes = (h) => new Uint8Array(Buffer.from(h, 'hex'));

function clientFrame(f) {
  const { payloadHex, ...rest } = f;
  return payloadHex === undefined ? rest : { ...rest, payload: bytes(payloadHex) };
}

test('client frames encode to the golden bytes', () => {
  assert.ok(fixture.client.length > 0);
  for (const e of fixture.client) {
    assert.equal(hex(encodeExecFrame(clientFrame(e.frame))), e.hex, e.name);
  }
});

test('gateway frames decode from the golden bytes', () => {
  assert.ok(fixture.server.length > 0);
  for (const e of fixture.server) {
    const got = decodeExecFrame(bytes(e.hex));
    const { payload, ...fields } = got;
    const want = { ...e.frame };
    const wantPayload = want.payloadHex;
    delete want.payloadHex;
    assert.deepEqual(fields, want, e.name);
    if (wantPayload !== undefined) assert.equal(hex(payload), wantPayload, `${e.name}: payload`);
  }
});

test('names longer than their length prefix are refused, not truncated', () => {
  assert.throws(
    () => encodeExecFrame({ kind: 'call', rid: 1, nodeType: 'x'.repeat(256), key: '', method: 'm', payload: new Uint8Array() }),
    /longer than 255 bytes/,
  );
});

test('a truncated or unknown gateway frame is an error', () => {
  assert.throws(() => decodeExecFrame(bytes('8101')), /truncated/);
  assert.throws(() => decodeExecFrame(bytes('99')), /unknown frame type/);
});

test('statuses are named by their wire values', () => {
  assert.equal(EXEC_STATUSES.length, 12);
  assert.equal(execStatus(0), 'Ok');
  assert.equal(execStatus(3), 'Moved');
  assert.equal(execStatus(11), 'BadRequest');
  assert.equal(execStatus(200), 'Unknown');
});
