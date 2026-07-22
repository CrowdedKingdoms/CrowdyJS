import { parentPort } from 'node:worker_threads';
import { startGlueWorker } from '../../../dist/index.js';

if (!parentPort) throw new Error('D13 glue fixture requires a worker thread');

// Drive the production glue-worker wiring over Node's worker_threads port.
// SharedArrayBuffer + Atomics semantics are identical to the browser path;
// cross-origin isolation is the browser-only gate around their availability.
startGlueWorker(parentPort);
