/**
 * What a CLIENT half can make the glue copy out of its memory is bounded before the copy: a
 * host-call request past the broker's args limit is answered `request_too_large` unread (and
 * never reaches the page), a state blob past the limit is refused, and a `handle_invoke` reply
 * past the invoke limit fails the invoke instead of being copied and posted to the page.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

function guest(bytes) {
  const memory = { buffer: new ArrayBuffer(bytes) };
  let bump = 1024;
  return {
    memory,
    ck_alloc: (len) => {
      const p = bump;
      bump += len;
      return p;
    },
    ck_free: () => {},
  };
}

test('a host-call request past the limit is answered request_too_large without being read', async () => {
  const { GlueRuntime, GLUE_HOST_CALL_REQUEST_MAX_BYTES } = await import('../../dist/index.js');
  const exports = guest(GLUE_HOST_CALL_REQUEST_MAX_BYTES * 2 + 64 * 1024);
  const seen = [];
  const rt = new GlueRuntime({
    hostCallSync: (req) => {
      seen.push(req.length);
      return new TextEncoder().encode('{"ok":true,"data":null}');
    },
  });
  const imports = rt.buildImports(() => exports);
  const len = GLUE_HOST_CALL_REQUEST_MAX_BYTES + 1;
  const packed = imports.ck.host_call(16, len);
  assert.deepEqual(seen, [], 'the transport never saw the oversized request');
  const outPtr = Number(packed >> 32n);
  const outLen = Number(packed & 0xffffffffn);
  const reply = JSON.parse(new TextDecoder().decode(new Uint8Array(exports.memory.buffer, outPtr, outLen)));
  assert.equal(reply.ok, false);
  assert.equal(reply.error.kind, 'request_too_large');

  const ok = new TextEncoder().encode(JSON.stringify({ fn: 'chunk_get', args: { x: 0, y: 0, z: 0 } }));
  new Uint8Array(exports.memory.buffer, 16, ok.length).set(ok);
  imports.ck.host_call(16, ok.length);
  assert.deepEqual(seen, [ok.length], 'a request within the limit still goes through');
});

test('state_set refuses a blob past the limit and keeps the one it had', async () => {
  const { GlueRuntime, GLUE_STATE_MAX_BYTES } = await import('../../dist/index.js');
  const exports = guest(GLUE_STATE_MAX_BYTES * 2);
  const rt = new GlueRuntime({ hostCallSync: () => new Uint8Array(0) });
  const imports = rt.buildImports(() => exports);
  const blob = new TextEncoder().encode('kept');
  new Uint8Array(exports.memory.buffer, 64, blob.length).set(blob);
  assert.equal(imports.ck.state_set(64, blob.length), 0);
  assert.equal(imports.ck.state_set(64, GLUE_STATE_MAX_BYTES + 1), 1);
  assert.equal(imports.ck.state_get(0, 0), blob.length, 'the earlier blob is still the state');
  assert.equal(imports.ck.state_set(64, GLUE_STATE_MAX_BYTES), 0, 'a blob at the limit is kept');
});

test('an invoke reply past the limit fails the invoke instead of being copied out', async () => {
  const { GlueRuntime, GLUE_INVOKE_REPLY_MAX_BYTES, PLAYER_CODE_INVOKE_MAX_BYTES } = await import(
    '../../dist/index.js'
  );
  assert.equal(GLUE_INVOKE_REPLY_MAX_BYTES, PLAYER_CODE_INVOKE_MAX_BYTES);
  const exports = guest(GLUE_INVOKE_REPLY_MAX_BYTES * 2 + 64 * 1024);
  let replyLen = GLUE_INVOKE_REPLY_MAX_BYTES + 1;
  exports.handle_invoke = () => (BigInt(4096) << 32n) | BigInt(replyLen);
  const rt = new GlueRuntime({ hostCallSync: () => new Uint8Array(0), fuelPerDispatch: 10n });
  rt.exports = exports;
  assert.throws(() => rt.invoke(new Uint8Array([1])), /exceeds the browser sandbox limit/);
  replyLen = GLUE_INVOKE_REPLY_MAX_BYTES;
  assert.equal(rt.invoke(new Uint8Array([1])).length, GLUE_INVOKE_REPLY_MAX_BYTES);
});
