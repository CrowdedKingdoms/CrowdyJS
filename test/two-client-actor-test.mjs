/**
 * Two-client actor update replication test.
 *
 * Requires a running server at localhost:3000/graphql and two test accounts.
 *
 * Usage:
 *   node test/two-client-actor-test.mjs <email1> <pass1> <email2> <pass2>
 *
 * Example:
 *   node test/two-client-actor-test.mjs alice@test.com pw1 bob@test.com pw2
 */

import WebSocket from 'ws';
globalThis.WebSocket = WebSocket;

import { CrowdyClient } from '../dist/index.js';

const [email1, pass1, email2, pass2] = process.argv.slice(2);
if (!email1 || !pass1 || !email2 || !pass2) {
  console.error('Usage: node test/two-client-actor-test.mjs <email1> <pass1> <email2> <pass2>');
  process.exit(1);
}

const ENDPOINT = 'http://localhost:3000/graphql';
const WS_ENDPOINT = 'ws://localhost:3000/graphql';
const MAP_ID = '1';
const CHUNK = { x: '0', y: '0', z: '0' };
const TEST_UUID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

function makeBase64State() {
  const buf = new Uint8Array(96);
  for (let i = 0; i < buf.length; i++) buf[i] = Math.floor(Math.random() * 256);
  return Buffer.from(buf).toString('base64');
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function run() {
  const clientA = new CrowdyClient({ graphqlEndpoint: ENDPOINT, wsEndpoint: WS_ENDPOINT });
  const clientB = new CrowdyClient({ graphqlEndpoint: ENDPOINT, wsEndpoint: WS_ENDPOINT });

  // --- Step 1: Login both clients ---
  console.log('[1] Logging in client A...');
  const authA = await clientA.login(email1, pass1);
  console.log('    Client A logged in as:', authA.user.email);

  console.log('[2] Logging in client B...');
  const authB = await clientB.login(email2, pass2);
  console.log('    Client B logged in as:', authB.user.email);

  // --- Step 2: Connect UDP proxy on both ---
  console.log('[3] Connecting client A to UDP proxy...');
  const statusA = await clientA.connectUdpProxy();
  console.log('    Client A connected:', statusA.connected);

  console.log('[4] Connecting client B to UDP proxy...');
  const statusB = await clientB.connectUdpProxy();
  console.log('    Client B connected:', statusB.connected);

  // --- Step 3: Subscribe client B to actor updates ---
  let receivedCount = 0;
  const receivedUpdates = [];

  console.log('[5] Client B subscribing to actor updates...');
  const unsub = clientB.onActorUpdate((notification) => {
    receivedCount++;
    receivedUpdates.push(notification);
    console.log(`    [B] Received actor update #${receivedCount}: uuid=${notification.uuid}`);
  });

  const unsubResponse = clientB.onActorUpdateResponse((response) => {
    console.log(`    [B] Received actor update response: uuid=${response.uuid}, seq=${response.sequenceNumber}`);
  });

  const unsubError = clientB.onGenericError((err) => {
    console.error(`    [B] Received generic error: code=${err.errorCode}, seq=${err.sequenceNumber}`);
  });

  // Give the WebSocket time to connect and subscribe
  console.log('[6] Waiting for subscription to establish...');
  await sleep(2000);

  // --- Step 4: Client A sends actor updates ---
  const SEND_COUNT = 5;
  console.log(`[7] Client A sending ${SEND_COUNT} actor updates...`);

  for (let i = 0; i < SEND_COUNT; i++) {
    const state = makeBase64State();
    try {
      const result = await clientA.sendActorUpdate({
        mapId: MAP_ID,
        chunk: CHUNK,
        uuid: TEST_UUID,
        state,
      });
      console.log(`    [A] Sent update ${i + 1}/${SEND_COUNT}, result: ${result}`);
    } catch (err) {
      console.error(`    [A] Failed to send update ${i + 1}:`, err.message);
    }
    await sleep(200);
  }

  // --- Step 5: Wait for notifications ---
  console.log('[8] Waiting for notifications to arrive...');
  await sleep(3000);

  // --- Results ---
  console.log('\n=== RESULTS ===');
  console.log(`Updates sent by A:     ${SEND_COUNT}`);
  console.log(`Updates received by B: ${receivedCount}`);

  if (receivedCount > 0) {
    console.log('\nSample received update:');
    console.log(JSON.stringify(receivedUpdates[0], null, 2));
  }

  if (receivedCount === 0) {
    console.log('\nWARNING: No updates received. Possible issues:');
    console.log('  - WebSocket subscription may not have connected');
    console.log('  - Server may not be routing notifications');
    console.log('  - Check server logs for errors');
  }

  // --- Cleanup ---
  console.log('\n[9] Cleaning up...');
  unsub();
  unsubResponse();
  unsubError();
  await clientA.disconnectUdpProxy();
  await clientB.disconnectUdpProxy();
  clientA.close();
  clientB.close();

  console.log('[10] Done.');
  process.exit(receivedCount > 0 ? 0 : 1);
}

run().catch((err) => {
  console.error('Test failed with error:', err);
  process.exit(1);
});
