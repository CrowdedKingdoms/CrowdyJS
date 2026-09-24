/**
 * Two-client webcam video replication smoke test for a CKS environment
 * (Buddy v0.25.0 / ck-api v1.87.0 / CrowdyJS 15.5.0).
 *
 * Player A sends one encoded "frame" large enough to need three fragments via
 * `udp.sendVideoFrame`; player B must receive the ClientVideoNotification
 * fragments and reassemble the identical bytes with `VideoFrameAssembler`.
 *
 * Black-box like the audio test: provisioning gives the players a tier holding
 * every runtime permission, which since ck-api v1.87.0 includes `use_video_chat`.
 * Auto-skips unless the integration env vars are present.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import { Buffer } from 'node:buffer';
import { provisionClients } from '../provision.mjs';

globalThis.WebSocket = WebSocket;

const REQUIRED_ENV = ['CROWDY_HTTP_URL', 'CROWDY_WS_URL', 'CROWDY_OWNER_EMAIL'];
const missing = REQUIRED_ENV.filter((key) => !process.env[key]);
const skipReason =
  missing.length > 0
    ? `integration env not configured (missing: ${missing.join(', ')})`
    : undefined;

const NOTIFY_WAIT_MS = Number(process.env.CROWDY_TEST_NOTIFY_WAIT_MS ?? 3000);
const CHUNK = { x: '0', y: '0', z: '0' };
const TEST_UUID_A = 'vvvvvvvvbbbbccccddddeeeeeeeeeee1';
const TEST_UUID_B = 'vvvvvvvvbbbbccccddddeeeeeeeeeee2';

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

test(
  'two-client webcam video: a 3-fragment frame reassembles on the peer',
  { skip: skipReason, timeout: 60_000 },
  async () => {
    const { createCrowdyClient, VideoFrameAssembler, decodeBase64, VideoCodec } =
      await import('../../dist/index.js');
    const { appId, clients } = await provisionClients(createCrowdyClient, 2);
    const [clientA, clientB] = clients;
    const cleanup = [];

    try {
      const assembler = new VideoFrameAssembler();
      const received = { fragments: [], frames: [], genericErrors: [] };
      cleanup.push(
        clientB.udp.subscribe(
          {
            video: (n) => {
              received.fragments.push(n);
              const frame = assembler.ingest(n.uuid, decodeBase64(n.videoData), Date.now());
              if (frame) received.frames.push(frame);
            },
            genericError: (e) => received.genericErrors.push(e),
          },
          appId,
        ),
      );
      await sleep(2000);

      const registerBoth = async () => {
        assert.ok(
          await clientA.udp.sendActorUpdate({
            appId, chunk: CHUNK, distance: 8, uuid: TEST_UUID_A, state: 'AA==', sequenceNumber: 1,
          }),
        );
        assert.ok(
          await clientB.udp.sendActorUpdate({
            appId, chunk: CHUNK, distance: 8, uuid: TEST_UUID_B, state: 'AA==', sequenceNumber: 1,
          }),
        );
      };
      await registerBoth();
      await sleep(1000);
      await registerBoth();
      await sleep(1000);

      // A "frame" of 2 500 bytes: three fragments at the 1 117-byte body maximum.
      const frame = Uint8Array.from({ length: 2500 }, (_, i) => (i * 31 + 7) & 0xff);
      const sent = await clientA.udp.sendVideoFrame({
        appId, chunk: CHUNK, uuid: TEST_UUID_A, frame, frameId: 42, codec: VideoCodec.JPEG, distance: 1,
      });
      assert.equal(sent, 3, 'three fragments were accepted for sending');

      await sleep(NOTIFY_WAIT_MS);

      const fromA = received.fragments.filter((n) => n.uuid === TEST_UUID_A);
      const diagnostics = {
        appId, fragmentsFromA: fromA.length, frames: received.frames.length,
        genericErrors: received.genericErrors, dropped: assembler.dropped, abandoned: assembler.abandoned,
      };
      assert.equal(fromA.length, 3, `B should receive all three fragments. diagnostics=${JSON.stringify(diagnostics)}`);
      assert.equal(fromA[0].__typename, 'ClientVideoNotification');
      assert.equal(received.frames.length, 1, `exactly one frame reassembled. diagnostics=${JSON.stringify(diagnostics)}`);
      const got = received.frames[0];
      assert.equal(got.frameId, 42);
      assert.equal(got.codec, VideoCodec.JPEG);
      assert.equal(Buffer.from(got.bytes).toString('hex'), Buffer.from(frame).toString('hex'), 'reassembled bytes equal the source');
      // The first actor registration may draw UNAUTHORIZED while Buddy loads the grid
      // window (the audio test tolerates the same); the video sends carry sequence
      // numbers 42 & 0xff = 42 and must not.
      const videoErrors = received.genericErrors.filter((e) => e.sequenceNumber === (42 & 0xff));
      assert.equal(videoErrors.length, 0, `no UNAUTHORIZED on the video sends: the tier carries use_video_chat and the world grid follows it. ${JSON.stringify(received.genericErrors)}`);
    } finally {
      for (const unsub of cleanup) { try { unsub(); } catch { /* swallow */ } }
      for (const c of clients) {
        try { await c.udp.disconnect(); } catch { /* swallow */ }
        c.close();
      }
    }
  },
);
