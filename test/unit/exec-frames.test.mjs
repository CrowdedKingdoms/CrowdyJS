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

test('the golden frames hold call-as (0x05), with a player id past 2^53 and player 0', () => {
  const callAs = fixture.client.filter((e) => e.frame.kind === 'callAs');
  assert.ok(callAs.length >= 3, 'the copy carries ck-exec 0.25.0\u2019s call-as cases');
  for (const e of callAs) assert.ok(e.hex.startsWith('05'), e.name);
  assert.ok(callAs.some((e) => BigInt(e.frame.player) > BigInt(Number.MAX_SAFE_INTEGER)));
  assert.ok(callAs.some((e) => e.frame.player === '0'));
  // rid:u32 player:u64 type:str8 key:str16 method:str8 payload:rest
  assert.equal(
    hex(encodeExecFrame({ kind: 'callAs', rid: 1, player: 258n, nodeType: 'a', key: 'b', method: 'c', payload: bytes('ff') })),
    '05' + '01000000' + '0201000000000000' + '0161' + '010062' + '0163' + 'ff',
  );
  assert.throws(
    () => encodeExecFrame({ kind: 'callAs', rid: 1, player: -1, nodeType: 'a', key: '', method: 'm', payload: new Uint8Array() }),
    RangeError,
  );
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
  assert.equal(EXEC_STATUSES.length, 15);
  assert.equal(execStatus(0), 'Ok');
  assert.equal(execStatus(3), 'Moved');
  assert.equal(execStatus(11), 'BadRequest');
  assert.equal(execStatus(12), 'AppPaused');
  assert.equal(execStatus(13), 'AppDisabled');
  assert.equal(execStatus(14), 'TypeDisabled');
  assert.equal(execStatus(200), 'Unknown');
});
