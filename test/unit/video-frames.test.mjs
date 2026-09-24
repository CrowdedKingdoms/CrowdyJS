import test from 'node:test';
import assert from 'node:assert/strict';

// The SDK-side video fragment contract (program doc 01 §3.2). These seven cases
// are the fixture set both SDKs must pass; CrowdyCPP mirrors them byte for byte.
const vf = await import('../../dist/media/video-frames.js');

const frame = (n, seed = 7) => Uint8Array.from({ length: n }, (_, i) => (i * seed + 3) & 0xff);

test('header constants are the wire contract', () => {
  assert.equal(vf.VIDEO_FRAGMENT_HEADER_BYTES, 6);
  assert.equal(vf.MAX_VIDEO_FRAGMENT_BODY_BYTES, 1117);
  assert.equal(vf.MAX_VIDEO_FRAGMENTS, 16);
  assert.equal(vf.VIDEO_FRAME_TIMEOUT_MS, 500);
  assert.equal(vf.VideoCodec.JPEG, 0);
  assert.equal(vf.VideoCodec.WEBP, 1);
});

test('a 1-fragment frame: one packet, header then body, round-trips', () => {
  const f = frame(300);
  const packets = vf.fragmentFrame(f, 0x1234, vf.VideoCodec.JPEG);
  assert.equal(packets.length, 1);
  assert.deepEqual([...packets[0].subarray(0, 6)], [1, 0, 0x12, 0x34, 0, 1]);
  assert.deepEqual([...packets[0].subarray(6)], [...f]);
  const a = new vf.VideoFrameAssembler();
  const out = a.ingest('u1', packets[0], 1000);
  assert.ok(out);
  assert.equal(out.frameId, 0x1234);
  assert.equal(out.codec, 0);
  assert.deepEqual([...out.bytes], [...f]);
  assert.equal(a.pendingCount, 0);
});

test('a 3-fragment frame splits at the body maximum and reassembles in order', () => {
  const f = frame(1117 * 2 + 100);
  const packets = vf.fragmentFrame(f, 5, vf.VideoCodec.WEBP);
  assert.equal(packets.length, 3);
  assert.deepEqual(packets.map((p) => p.length - 6), [1117, 1117, 100]);
  assert.deepEqual(packets.map((p) => p[4]), [0, 1, 2]);
  assert.ok(packets.every((p) => p[5] === 3 && p[1] === 1));
  const a = new vf.VideoFrameAssembler();
  assert.equal(a.ingest('u', packets[0], 1), null);
  assert.equal(a.ingest('u', packets[1], 2), null);
  const out = a.ingest('u', packets[2], 3);
  assert.deepEqual([...out.bytes], [...f]);
  assert.equal(out.completedAt, 3);
});

test('out-of-order fragments (and a duplicate) still complete exactly once', () => {
  const f = frame(2500, 11);
  const packets = vf.fragmentFrame(f, 9);
  const a = new vf.VideoFrameAssembler();
  assert.equal(a.ingest('u', packets[2], 1), null);
  assert.equal(a.ingest('u', packets[0], 2), null);
  assert.equal(a.ingest('u', packets[0], 3), null); // duplicate
  const out = a.ingest('u', packets[1], 4);
  assert.deepEqual([...out.bytes], [...f]);
  // The frame is done; a late duplicate is a straggler, dropped, not re-delivered.
  assert.equal(a.ingest('u', packets[1], 5), null);
  assert.equal(a.dropped, 1);
});

test('a newer frameId abandons the incomplete frame; an older one is dropped', () => {
  const a = new vf.VideoFrameAssembler();
  const old = vf.fragmentFrame(frame(2000), 100);
  const newer = vf.fragmentFrame(frame(300), 101);
  assert.equal(a.ingest('u', old[0], 1), null);
  const out = a.ingest('u', newer[0], 2);
  assert.ok(out, 'the newer single-fragment frame completes');
  assert.equal(a.abandoned, 1);
  assert.equal(a.ingest('u', old[1], 3), null, 'the rest of the old frame is a straggler');
  assert.equal(a.dropped, 1);
  // Wrap: 0 is newer than 65535.
  assert.equal(vf.isNewerFrameId(0, 65535), true);
  assert.equal(vf.isNewerFrameId(65535, 0), false);
  assert.equal(vf.isNewerFrameId(5, 5), false);
});

test('an incomplete frame is abandoned by timeout, and forget() drops a leaver', () => {
  const a = new vf.VideoFrameAssembler(500);
  const p = vf.fragmentFrame(frame(2000), 1);
  a.ingest('u', p[0], 1000);
  assert.equal(a.prune(1400), 0);
  assert.equal(a.prune(1501), 1);
  assert.equal(a.pendingCount, 0);
  a.ingest('v', p[0], 2000);
  a.forget('v');
  assert.equal(a.pendingCount, 0);
  assert.equal(a.abandoned, 2);
});

test('malformed headers are dropped: wrong version, reserved codec, count 0 or > 16, index past count', () => {
  const a = new vf.VideoFrameAssembler();
  const good = vf.fragmentFrame(frame(100), 3)[0];
  for (const mutate of [
    (p) => (p[0] = 2),
    (p) => (p[1] = 9),
    (p) => (p[5] = 0),
    (p) => (p[5] = 17),
    (p) => ((p[4] = 1), (p[5] = 1)),
  ]) {
    const bad = Uint8Array.from(good);
    mutate(bad);
    assert.equal(vf.parseVideoFragmentHeader(bad), null);
    assert.equal(a.ingest('u', bad, 1), null);
  }
  assert.equal(a.dropped, 5);
  assert.equal(vf.parseVideoFragmentHeader(new Uint8Array(5)), null, 'too short');
});

test('fragmentFrame refuses more than 16 fragments, an empty frame and a bad frameId; nothing partial', () => {
  assert.throws(() => vf.fragmentFrame(frame(1117 * 16 + 1), 1), /ceiling is 16/);
  assert.equal(vf.fragmentFrame(frame(1117 * 16), 1).length, 16);
  assert.throws(() => vf.fragmentFrame(new Uint8Array(0), 1), /empty/);
  assert.throws(() => vf.fragmentFrame(frame(10), 65536), /0\.\.65535/);
});
