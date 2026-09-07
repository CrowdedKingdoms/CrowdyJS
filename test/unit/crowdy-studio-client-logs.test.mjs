/**
 * Closed-loop Test draft log capture: inject a line, format/tool text
 * contains it. No live WASM.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

const {
  CrowdyStudioClientLogBuffer,
  bindClientLogShipper,
  formatClientLogTail,
} = await import('../../dist/crowdy-studio/client-logs.js');
const { PlayerCodeBroker } = await import(
  '../../dist/player-runtime/player-code-broker.js'
);

const READY = 'disco skin client ready';

function line(message, at = '2026-08-25T19:20:00.000Z') {
  return { at, level: 2, message, target: 'CLIENT' };
}

test('formatClientLogTail explains an empty ring', () => {
  assert.match(formatClientLogTail([]), /No client module logs yet/);
});

test('buffer closed loop keeps the injected ready line', () => {
  const buffer = new CrowdyStudioClientLogBuffer();
  buffer.append(line(READY));
  const first = buffer.format();
  assert.match(first, /CLIENT info disco skin client ready/);
  buffer.append(
    line('disco floor: 2 of 12 voxel writes failed', '2026-08-25T19:20:01.000Z'),
  );
  const second = buffer.format();
  assert.match(second, /disco skin client ready/);
  assert.match(second, /2 of 12 voxel writes failed/);
});

test('broker onLog fires when the glue worker posts type=log', async () => {
  const seen = [];
  const listeners = [];
  const worker = {
    postMessage() {},
    addEventListener(_type, listener) {
      listeners.push(listener);
    },
    removeEventListener() {},
    terminate() {},
  };
  const broker = new PlayerCodeBroker({
    workerUrl: 'about:blank',
    grid: {
      low: { x: 0n, y: 0n, z: 0n },
      high: { x: 1n, y: 1n, z: 1n },
    },
    onHostCall: async () => ({}),
    onLog: (level, message) => seen.push({ level, message }),
    workerFactory: () => worker,
  });
  await broker.start(new ArrayBuffer(8));
  for (const listener of listeners) {
    listener({
      data: { type: 'log', level: 2, message: READY },
    });
  }
  broker.stop();
  assert.deepEqual(seen, [{ level: 2, message: READY }]);
});

test('shipper posts the injected line to the sidecar transport', async () => {
  const posted = [];
  const transport = {
    async appendClientLogs(input) {
      posted.push(input);
    },
  };
  const shipper = bindClientLogShipper(
    () => 'proj-disco',
    transport,
  );
  shipper.onClientLog(line(READY));
  await new Promise((resolve) => setTimeout(resolve, 80));
  shipper.dispose();
  assert.equal(posted.length, 1);
  assert.equal(posted[0].projectId, 'proj-disco');
  assert.equal(posted[0].lines[0].message, READY);
});
