/**
 * The load-bearing proof for the browser player-compute sandbox (P5): the
 * SYNCHRONOUS host-call bridge really round-trips across the worker boundary.
 *
 * A worker blocked in `Atomics.wait` cannot receive postMessage, so the only
 * correct transport is the SharedArrayBuffer reply channel. Node's
 * worker_threads + SharedArrayBuffer + Atomics have no cross-origin-isolation
 * gate, so this exercises the exact protocol the browser uses (COOP/COEP only
 * gates the browser). A real worker thread blocks on the SAB; the parent runs
 * an async handler (standing in for the page-side broker's onHostCall) and
 * writes the reply back with the production `writeGlueResult`; the worker
 * wakes and returns the reply synchronously.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { Worker } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const workerPath = join(here, 'fixtures', 'glue-sab-worker.mjs');

test('synchronous host_call round-trips through the SAB while the worker blocks', async () => {
  const { wrapGlueSab, writeGlueResult } = await import('../../dist/index.js');
  const worker = new Worker(workerPath);

  // The worker performs a synchronous host call inside a blocking loop and
  // reports the decoded reply back. The parent services the request through
  // the SAB (never a postMessage reply — the worker is blocked).
  const results = [];
  worker.on('message', (msg) => {
    if (msg.type === 'hostcall') {
      // Simulate the async server-authorized path, then write the reply.
      setTimeout(() => {
        const view = wrapGlueSab(msg.reply);
        if (msg.fn === 'actors_list') {
          writeGlueResult(
            view,
            { ok: true, data: { actors: [{ id: 'a1' }] } },
            msg.id,
          );
        } else {
          writeGlueResult(
            view,
            { ok: false, error: { kind: 'denied' } },
            msg.id,
          );
        }
      }, 15);
    } else if (msg.type === 'done') {
      results.push(msg);
    }
  });

  const done = await new Promise((resolve) => {
    worker.on('message', (m) => m.type === 'done' && resolve(m));
  });
  await worker.terminate();

  // The worker got the actors_list reply synchronously (it was blocked in
  // Atomics.wait until the parent wrote the SAB), then a denial on the second.
  assert.equal(done.ok.ok, true);
  assert.deepEqual(done.ok.data, { actors: [{ id: 'a1' }] });
  assert.equal(done.denied.ok, false);
  assert.equal(done.denied.error.kind, 'denied');
  // Proof the call was actually synchronous: the worker recorded the reply
  // BEFORE returning from the blocking call, in call order.
  assert.deepEqual(done.order, [
    'actors_list',
    'blocked_reply',
    'voxel_set',
    'blocked_reply',
  ]);
});
