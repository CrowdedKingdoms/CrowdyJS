/**
 * Proves the glue runtime marshals the crowdy-compute-sdk ABI correctly
 * against real guest linear memory: `ck.host_call(ptr,len)` reads the JSON
 * request out of guest memory at (ptr,len), forwards it to the synchronous
 * transport, writes the reply into a guest buffer obtained via `ck_alloc`,
 * and returns the packed `(ptr<<32 | len)` the SDK's `host_call_raw` decodes.
 * Uses a mock guest instance (real ArrayBuffer memory + a bump `ck_alloc`)
 * so every marshalling path runs without a compiled artifact; the compiled
 * end-to-end runs in the BWF browser walk.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

test('ck.host_call marshals request/reply across guest memory + packs the return', async () => {
  const { GlueRuntime } = await import('../../dist/index.js');

  // Mock guest: 64 KiB memory + a bump allocator, matching the ABI surface.
  const memory = { buffer: new ArrayBuffer(64 * 1024) };
  let bump = 1024;
  const exports = {
    memory,
    ck_alloc: (len) => {
      const p = bump;
      bump += len;
      return p;
    },
    ck_free: () => {},
  };

  const seen = [];
  const rt = new GlueRuntime({
    hostCallSync: (reqBytes) => {
      seen.push(JSON.parse(new TextDecoder().decode(reqBytes)));
      // Return the SDK Response envelope bytes.
      return new TextEncoder().encode(
        JSON.stringify({ ok: true, data: { actors: ['a1', 'a2'] } }),
      );
    },
  });
  const imports = rt.buildImports(() => exports);

  // Write a host_call request into guest memory at ptr=16 and invoke the import.
  const reqBytes = new TextEncoder().encode(
    JSON.stringify({ fn: 'actors_list', args: { x: 1, y: 0, z: 1 } }),
  );
  new Uint8Array(memory.buffer, 16, reqBytes.length).set(reqBytes);
  const packed = imports.ck.host_call(16, reqBytes.length);

  // The transport saw exactly the guest's request.
  assert.equal(seen.length, 1);
  assert.deepEqual(seen[0], { fn: 'actors_list', args: { x: 1, y: 0, z: 1 } });

  // The return is a BigInt packed (ptr<<32 | len); decode it like the SDK does.
  assert.equal(typeof packed, 'bigint');
  const outPtr = Number(packed >> 32n);
  const outLen = Number(packed & 0xffffffffn);
  const reply = JSON.parse(
    new TextDecoder().decode(new Uint8Array(memory.buffer, outPtr, outLen)),
  );
  assert.deepEqual(reply, { ok: true, data: { actors: ['a1', 'a2'] } });
  assert.ok(outPtr >= 1024, 'reply was placed in a ck_alloc buffer');
});

test('ck.state_get / state_set round-trip a client-local durable blob', async () => {
  const { GlueRuntime } = await import('../../dist/index.js');
  const memory = { buffer: new ArrayBuffer(8 * 1024) };
  let bump = 512;
  const exports = { memory, ck_alloc: (n) => ((bump += n), bump - n), ck_free: () => {} };
  const rt = new GlueRuntime({ hostCallSync: () => new Uint8Array(0) });
  const imports = rt.buildImports(() => exports);

  const blob = new TextEncoder().encode('hello-state');
  new Uint8Array(memory.buffer, 64, blob.length).set(blob);
  assert.equal(imports.ck.state_set(64, blob.length), 0);

  // size query (cap 0) returns full length; then copy it back out
  const len = imports.ck.state_get(0, 0);
  assert.equal(len, blob.length);
  const dest = 200;
  imports.ck.state_get(dest, len);
  assert.equal(
    new TextDecoder().decode(new Uint8Array(memory.buffer, dest, len)),
    'hello-state',
  );
});
