/**
 * Two-client actor update replication test.
 *
 * Follows the authoritative connection lifecycle:
 *   1. Login
 *   2. Subscribe to udpNotifications (auto-opens UDP proxy)
 *   3. Register in chunk (sendActorUpdate with empty state)
 *   4. Send actor updates
 *
 * Usage:
 *   node test/two-client-actor-test.mjs <email1> <pass1> <email2> <pass2> [httpEndpoint]
 *
 * The WebSocket endpoint is derived automatically (https->wss, http->ws).
 * Defaults to http://localhost:3000/graphql if no endpoint is given.
 */

import WebSocket from 'ws';
globalThis.WebSocket = WebSocket;

import { CrowdyClient } from '../dist/index.js';

const args = process.argv.slice(2);
const email1 = args[0];
const pass1 = args[1];
const email2 = args[2];
const pass2 = args[3];
const ENDPOINT = args[4] || 'http://localhost:3000/graphql';
const WS_ENDPOINT = ENDPOINT.replace(/^http/, 'ws');

if (!email1 || !pass1 || !email2 || !pass2) {
  console.error('Usage: node test/two-client-actor-test.mjs <email1> <pass1> <email2> <pass2> [httpEndpoint]');
  process.exit(1);
}

console.log(`Endpoint:    ${ENDPOINT}`);
console.log(`WS Endpoint: ${WS_ENDPOINT}`);
const APP_ID = 0;
const CHUNK = { x: 0, y: 0, z: 0 };
const TEST_UUID_A = 'aaaaaaaabbbbccccddddeeeeeeeeeeee';
const TEST_UUID_B = 'bbbbbbbbccccddddeeeeeeeeeeeeeeee';

function makeBase64State() {
  const buf = new Uint8Array(96);
  for (let i = 0; i < buf.length; i++) buf[i] = Math.floor(Math.random() * 256);
  return Buffer.from(buf).toString('base64');
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) {
    console.log(`  PASS: ${label}`);
    passed++;
  } else {
    console.error(`  FAIL: ${label}`);
    failed++;
  }
}

async function run() {
  const clientA = new CrowdyClient({ graphqlEndpoint: ENDPOINT, wsEndpoint: WS_ENDPOINT });
  const clientB = new CrowdyClient({ graphqlEndpoint: ENDPOINT, wsEndpoint: WS_ENDPOINT });

  // ---- 1. Login ----
  console.log('\n--- Login ---');
  const authA = await clientA.login(email1, pass1);
  console.log(`Client A logged in: ${authA.user.email}`);

  const authB = await clientB.login(email2, pass2);
  console.log(`Client B logged in: ${authB.user.email}`);

  // ---- 2. Subscribe (auto-opens UDP proxy) ----
  console.log('\n--- Register subscriptions (all at once) ---');
  const receivedByA = { actorUpdates: [] };
  const receivedByB = {
    actorUpdates: [],
    actorResponses: [],
    voxelUpdates: [],
    genericErrors: [],
  };

  const unsubs = [];
  try {
    unsubs.push(clientA.onActorUpdate((n) => {
      receivedByA.actorUpdates.push(n);
    }));
    console.log('  Client A registered: onActorUpdate');

    unsubs.push(clientB.onActorUpdate((n) => {
      receivedByB.actorUpdates.push(n);
    }));
    console.log('  Client B registered: onActorUpdate');

    unsubs.push(clientB.onActorUpdateResponse((r) => {
      receivedByB.actorResponses.push(r);
    }));
    console.log('  Client B registered: onActorUpdateResponse');

    unsubs.push(clientB.onVoxelUpdate((n) => {
      receivedByB.voxelUpdates.push(n);
    }));
    console.log('  Client B registered: onVoxelUpdate');

    unsubs.push(clientB.onGenericError((e) => {
      receivedByB.genericErrors.push(e);
    }));
    console.log('  Client B registered: onGenericError');

    console.log('  All handlers registered without error');
    assert(true, 'No InvalidStateError when registering multiple handlers');
  } catch (err) {
    console.error(`  ERROR during handler registration: ${err.message}`);
    assert(false, `No InvalidStateError when registering multiple handlers (got: ${err.message})`);
  }

  // Wait for WebSocket subscriptions to fully connect
  console.log('\n--- Waiting for subscription WebSocket... ---');
  await sleep(2000);

  // ---- 3. Register both clients in the chunk ----
  console.log('\n--- Register actors in chunk ---');
  try {
    const regA = await clientA.sendActorUpdate({
      appId: APP_ID,
      chunk: CHUNK,
      distance: 8,
      uuid: TEST_UUID_A,
      state: 'AA==',
      sequenceNumber: 1,
    });
    console.log(`  Client A registered in chunk: ${regA}`);
    assert(regA, 'Client A registration sent');
  } catch (err) {
    console.error(`  Client A registration failed: ${err.message}`);
    assert(false, `Client A registration (got: ${err.message})`);
  }

  try {
    const regB = await clientB.sendActorUpdate({
      appId: APP_ID,
      chunk: CHUNK,
      distance: 8,
      uuid: TEST_UUID_B,
      state: 'AA==',
      sequenceNumber: 1,
    });
    console.log(`  Client B registered in chunk: ${regB}`);
    assert(regB, 'Client B registration sent');
  } catch (err) {
    console.error(`  Client B registration failed: ${err.message}`);
    assert(false, `Client B registration (got: ${err.message})`);
  }

  await sleep(1000);

  // ---- 4. Send actor updates from A ----
  console.log('\n--- Client A sends actor updates ---');
  const SEND_COUNT = 5;
  let sendSuccessCount = 0;
  for (let i = 0; i < SEND_COUNT; i++) {
    try {
      const result = await clientA.sendActorUpdate({
        appId: APP_ID,
        chunk: CHUNK,
        distance: 8,
        uuid: TEST_UUID_A,
        state: makeBase64State(),
        sequenceNumber: i + 2,
      });
      if (result) sendSuccessCount++;
      console.log(`  Sent ${i + 1}/${SEND_COUNT}: ${result}`);
    } catch (err) {
      console.error(`  Send ${i + 1} failed: ${err.message}`);
    }
    await sleep(200);
  }
  assert(sendSuccessCount === SEND_COUNT, `All ${SEND_COUNT} actor updates sent successfully`);

  // ---- Wait for notifications ----
  console.log('\n--- Waiting for notifications... ---');
  await sleep(3000);

  // ---- Results ----
  console.log('\n--- Results ---');
  console.log(`  Actor updates sent by A:     ${sendSuccessCount}`);
  console.log(`  Actor updates received by A: ${receivedByA.actorUpdates.length}`);
  console.log(`  Actor updates received by B: ${receivedByB.actorUpdates.length}`);
  console.log(`  Actor responses received:    ${receivedByB.actorResponses.length}`);
  console.log(`  Generic errors received:     ${receivedByB.genericErrors.length}`);

  // B should receive A's updates (game server fans out to other clients in range)
  assert(receivedByB.actorUpdates.length > 0, 'Client B received at least one actor update from A');

  // Find an update from A (skip any registration notifications from B itself)
  const updatesFromA = receivedByB.actorUpdates.filter((n) => n.uuid === TEST_UUID_A);
  assert(updatesFromA.length > 0, 'Client B received at least one update with A\'s uuid');

  if (updatesFromA.length > 0) {
    const sample = updatesFromA[0];
    console.log('\n  Sample notification (from A, received by B):');
    console.log(`    __typename:      ${sample.__typename}`);
    console.log(`    appId:           ${sample.appId}`);
    console.log(`    uuid:            ${sample.uuid}`);
    console.log(`    chunkX:          ${sample.chunkX}`);
    console.log(`    distance:        ${sample.distance}`);
    console.log(`    decayRate:       ${sample.decayRate}`);
    console.log(`    sequenceNumber:  ${sample.sequenceNumber}`);
    console.log(`    epochMillis:     ${sample.epochMillis}`);
    assert(sample.__typename === 'ActorUpdateNotification', 'Notification has correct __typename');
    assert(sample.distance != null, 'Notification includes distance');
    assert(sample.decayRate != null, 'Notification includes decayRate');
    assert(sample.sequenceNumber != null, 'Notification includes sequenceNumber');
    assert(sample.epochMillis != null, 'Notification includes epochMillis');
  }

  if (receivedByB.genericErrors.length > 0) {
    console.log('\n  Generic errors received:');
    receivedByB.genericErrors.forEach((e) => {
      console.log(`    errorCode: ${e.errorCode}, sequenceNumber: ${e.sequenceNumber}`);
    });
  }

  // ---- Cleanup ----
  console.log('\n--- Cleanup ---');
  unsubs.forEach((fn) => fn());
  await clientA.disconnectUdpProxy();
  await clientB.disconnectUdpProxy();
  clientA.close();
  clientB.close();

  // ---- Summary ----
  console.log(`\n=== ${passed} passed, ${failed} failed ===`);
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error('\nTest crashed:', err);
  process.exit(1);
});
