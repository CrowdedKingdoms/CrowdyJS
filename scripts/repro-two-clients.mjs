// Headless two-client repro for the phaser-demo multi-tab issue.
// Drives two simulated clients through the real crowdyJS SDK against a
// running web-api on http://localhost:3000/graphql, both registered in
// the same chunk, both sending actor updates at 10 Hz. After RUN_MS it
// prints a structured summary so we can see whether each client is
// actually receiving the other's notifications over the WS.
//
// Run from the crowdyJS directory (so `ws` resolves):
//   cd /Users/michaelmarshall/dev/michaelmarshall/crowded-kingdoms/crowdyJS
//   node /tmp/repro-two-clients.mjs

import { webcrypto } from "node:crypto";
import { performance } from "node:perf_hooks";
import WebSocket from "ws";

if (typeof globalThis.crypto === "undefined") globalThis.crypto = webcrypto;
globalThis.WebSocket = WebSocket;

const SDK_URL = new URL(
  "file:///Users/michaelmarshall/dev/michaelmarshall/crowded-kingdoms/crowdyJS/dist/index.js",
);
const { CrowdyClient } = await import(SDK_URL.href);

const GRAPHQL = "http://localhost:3000/graphql";
const WS_URL = "ws://localhost:3000/graphql";
const APP_ID = "1";
const CHUNK = { x: "8", y: "8", z: "0" };
const SEND_HZ = 10;
const SEND_INTERVAL_MS = Math.round(1000 / SEND_HZ);
const RUN_MS = parseInt(process.env.RUN_MS ?? "20000", 10);

function uuid32hex() {
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function makeStateBase64() {
  // Match Player.encodeState() shape: 96 bytes, first 5 floats meaningful.
  const buf = new ArrayBuffer(96);
  const view = new DataView(buf);
  view.setFloat32(0, 16384, true); // x
  view.setFloat32(4, 16384, true); // y
  view.setFloat32(8, 0, true);     // vx
  view.setFloat32(12, 0, true);    // vy
  view.setFloat32(16, 0, true);    // rotation
  const bytes = new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return Buffer.from(s, "binary").toString("base64");
}

function nowMs() {
  return Math.round(performance.now());
}

async function spawnClient(label) {
  const client = new CrowdyClient({
    graphqlEndpoint: GRAPHQL,
    wsEndpoint: WS_URL,
  });
  const myUuid = uuid32hex();
  const email = `repro-${label.toLowerCase()}-${Date.now()}@example.com`;
  const password = "ReproPassword123!";
  const stats = {
    label,
    email,
    myUuid,
    sendCount: 0,
    sendOk: 0,
    sendErr: 0,
    echoCount: 0,
    seenOtherCount: 0,
    notificationsByType: Object.create(null),
    seenSenders: new Set(),
    errors: [],
    firstEchoMs: null,
    firstSeenOtherMs: null,
  };

  console.log(`[${label}] register ${email} uuid=${myUuid}`);
  await client.auth.register({ email, password });

  const unsub = client.udp.subscribe({
    onActorUpdate: (n) => {
      bumpType(stats, "ActorUpdateNotification");
      stats.seenSenders.add(n.uuid);
      if (n.uuid === myUuid) {
        stats.echoCount += 1;
        if (stats.firstEchoMs === null) stats.firstEchoMs = nowMs();
      } else {
        stats.seenOtherCount += 1;
        if (stats.firstSeenOtherMs === null)
          stats.firstSeenOtherMs = nowMs();
      }
    },
    onActorUpdateResponse: (n) => bumpType(stats, "ActorUpdateResponse", n),
    onVoxelUpdate: (n) => bumpType(stats, "VoxelUpdateNotification", n),
    onVoxelUpdateResponse: (n) => bumpType(stats, "VoxelUpdateResponse", n),
    onClientAudio: (n) => bumpType(stats, "ClientAudioNotification", n),
    onClientText: (n) => bumpType(stats, "ClientTextNotification", n),
    onClientEvent: (n) => bumpType(stats, "ClientEventNotification", n),
    onServerEvent: (n) => bumpType(stats, "ServerEventNotification", n),
    onGenericError: (e) => {
      bumpType(stats, "GenericErrorResponse");
      stats.errors.push({
        seq: e.sequenceNumber,
        code: e.errorCode,
        atMs: nowMs(),
      });
    },
  });

  // Explicit connect first to verify the server's `connectUdpProxy` mutation
  // is now idempotent (used to race with the WS handshake and silently kill
  // the second client's subscription — see UdpProxyConnectionService.connect).
  const conn = await client.udp.connect();
  console.log(`[${label}] udp.connect ->`, conn);

  let seq = 0;
  await sendOnce(client, label, myUuid, seq, stats, "register");
  seq = (seq + 1) % 256;

  const intervalId = setInterval(() => {
    void sendOnce(client, label, myUuid, seq, stats, "interval");
    seq = (seq + 1) % 256;
  }, SEND_INTERVAL_MS);

  return {
    label,
    client,
    stats,
    stop: async () => {
      clearInterval(intervalId);
      try {
        unsub();
      } catch {}
      try {
        await client.udp.disconnect();
      } catch {}
      try {
        client.close();
      } catch {}
    },
  };
}

function bumpType(stats, typename) {
  stats.notificationsByType[typename] =
    (stats.notificationsByType[typename] ?? 0) + 1;
}

async function sendOnce(client, label, myUuid, seq, stats, context) {
  stats.sendCount += 1;
  try {
    const ok = await client.udp.sendActorUpdate({
      appId: APP_ID,
      chunk: CHUNK,
      uuid: myUuid,
      state: makeStateBase64(),
      sequenceNumber: seq,
    });
    if (ok) stats.sendOk += 1;
    else stats.sendErr += 1;
  } catch (err) {
    stats.sendErr += 1;
    if (stats.errors.length < 5) {
      stats.errors.push({
        seq,
        code: "send_throw",
        message: String(err).slice(0, 200),
        atMs: nowMs(),
      });
    }
  }
}

function summarize(stats, runMs) {
  const summary = {
    label: stats.label,
    myUuid: stats.myUuid,
    runMs,
    sendCount: stats.sendCount,
    sendOk: stats.sendOk,
    sendErr: stats.sendErr,
    echoCount: stats.echoCount,
    seenOtherCount: stats.seenOtherCount,
    firstEchoMs: stats.firstEchoMs,
    firstSeenOtherMs: stats.firstSeenOtherMs,
    seenSenders: Array.from(stats.seenSenders),
    notificationsByType: stats.notificationsByType,
    errorCount: stats.errors.length,
    sampleErrors: stats.errors.slice(0, 5),
  };
  return summary;
}

async function main() {
  const start = nowMs();
  // SEQUENTIAL spawn — A must be fully ready before B begins.
  const a = await spawnClient("A");
  const b = await spawnClient("B");

  // Periodic mid-run snapshot so we can see the trajectory, not just final.
  const tickerId = setInterval(() => {
    const tMs = nowMs() - start;
    console.log(
      `[t+${tMs}ms]`,
      `A: send=${a.stats.sendCount} echo=${a.stats.echoCount} seenOther=${a.stats.seenOtherCount}` +
        ` | B: send=${b.stats.sendCount} echo=${b.stats.echoCount} seenOther=${b.stats.seenOtherCount}`,
    );
  }, 5000);

  await new Promise((resolve) => setTimeout(resolve, RUN_MS));
  clearInterval(tickerId);

  console.log("\n========== FINAL ==========");
  console.log(JSON.stringify(summarize(a.stats, RUN_MS), null, 2));
  console.log(JSON.stringify(summarize(b.stats, RUN_MS), null, 2));

  await a.stop();
  await b.stop();
}

main().catch((err) => {
  console.error("repro failed:", err);
  process.exit(1);
});
