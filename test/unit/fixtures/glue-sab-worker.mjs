/**
 * A real worker_threads worker that drives the production SAB transport
 * helpers synchronously: it arms the SAB, posts the request, blocks in
 * Atomics.wait, and reads the reply — exactly as the browser glue worker's
 * hostCallSync does. Used by glue-sab-bridge.test.mjs to prove the blocking
 * synchronous round-trip.
 */
import { parentPort } from 'node:worker_threads';
import {
  createGlueSab,
  armGlueRequest,
  waitAndReadGlueReply,
  glueDecoder,
} from '../../../dist/index.js';

const sab = createGlueSab();
const order = [];

function hostCallSync(fn, args) {
  armGlueRequest(sab);
  order.push(fn);
  parentPort.postMessage({ type: 'hostcall', fn, args, reply: sab.sab });
  // Blocks here until the parent writes the SAB + notifies.
  const bytes = waitAndReadGlueReply(sab);
  order.push('blocked_reply');
  return JSON.parse(glueDecoder.decode(bytes));
}

const ok = hostCallSync('actors_list', { x: 0, y: 0, z: 0 });
const denied = hostCallSync('voxel_set', { chunkX: 999 });
parentPort.postMessage({ type: 'done', ok, denied, order });
