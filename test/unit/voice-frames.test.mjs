import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// The voice payload convention. test/unit/fixtures/voice-frames.json is the shared case set:
// CrowdyCPP copies it byte for byte and replays it in tests/voice_frames_test.cpp, so a change
// to either SDK's behaviour changes the fixture and both replays.
const vf = await import('../../dist/media/voice-frames.js');
const sdk = await import('../../dist/index.js');
const fixture = JSON.parse(
  readFileSync(new URL('./fixtures/voice-frames.json', import.meta.url), 'utf8'),
);

const hex = (bytes) => Buffer.from(bytes).toString('hex');
const unhex = (text) => new Uint8Array(Buffer.from(text, 'hex'));

test('header constants are the convention', () => {
  assert.equal(vf.VOICE_HEADER_BYTES, 10);
  assert.equal(vf.VOICE_HEADER_VERSION, 1);
  assert.equal(vf.MAX_VOICE_FRAME_BYTES, 1113);
  assert.equal(vf.VOICE_TARGET_DELAY_MS, 60);
  assert.equal(vf.VOICE_JITTER_MAX_FRAMES, 64);
  assert.equal(vf.VOICE_RESET_AFTER_MS, 200);
  assert.deepEqual(vf.VoiceCodec, { RAW: 0, OPUS: 1, MULAW: 2 });
  assert.deepEqual(vf.VoiceFlag, { SPURT_START: 1, SPURT_END: 2 });
  assert.equal(vf.voiceClockRate(vf.VoiceCodec.OPUS), 48000);
  assert.equal(vf.voiceClockRate(vf.VoiceCodec.MULAW), 8000);
  assert.equal(vf.voiceClockRate(vf.VoiceCodec.RAW), 1000);
  assert.equal(vf.voiceClockRate(9), 1000);
  assert.equal(vf.voiceSamplesPerFrame(vf.VoiceCodec.OPUS, 20), 960);
  assert.equal(vf.voiceSamplesPerFrame(vf.VoiceCodec.MULAW, 60), 480);
  assert.equal(vf.voiceSeqDiff(0, 65535), 1);
  assert.equal(vf.voiceSeqDiff(65535, 0), -1);
  assert.equal(vf.voiceSeqDiff(0x8000, 0), -0x8000);
  assert.equal(vf.voiceSeqDiff(0x7fff, 0), 0x7fff);
});

test('the package entry exports the voice helpers', () => {
  for (const name of [
    'VOICE_HEADER_BYTES',
    'MAX_VOICE_FRAME_BYTES',
    'VoiceCodec',
    'VoiceFlag',
    'encodeVoiceHeader',
    'encodeVoicePacket',
    'decodeVoicePacket',
    'VoicePacketizer',
    'VoiceJitterBuffer',
  ]) {
    assert.equal(sdk[name], vf[name], name);
  }
});

test('fixture: header encodings', () => {
  for (const { note, header, frame, packet } of fixture.headers) {
    assert.equal(hex(vf.encodeVoicePacket(header, unhex(frame))), packet, note);
    assert.equal(hex(vf.encodeVoiceHeader(header)), packet.slice(0, 20), note);
    const decoded = vf.decodeVoicePacket(unhex(packet));
    assert.deepEqual(decoded.header, { version: 1, ...header }, note);
    assert.equal(hex(decoded.frame), frame, note);
  }
  for (const { note, packet, header, frame } of fixture.decoded) {
    const decoded = vf.decodeVoicePacket(unhex(packet));
    assert.deepEqual(decoded.header, header, note);
    assert.equal(hex(decoded.frame), frame, note);
  }
  for (const { note, packet } of fixture.rejected) {
    assert.equal(vf.decodeVoicePacket(unhex(packet)), null, note);
  }
});

test('fixture: the packetizer', () => {
  for (const { note, options, steps } of fixture.packetizer) {
    const packetizer = new vf.VoicePacketizer(options);
    for (const step of steps) {
      if (step.skip !== undefined) {
        packetizer.skip(step.skip);
        assert.equal(packetizer.nextSeq, step.nextSeq, note);
        assert.equal(packetizer.nextTimestamp, step.nextTimestamp, note);
      } else {
        const packet = packetizer.packetize(unhex(step.packetize), { last: step.last === true });
        assert.equal(hex(packet), step.packet, `${note}: ${step.packetize}`);
      }
    }
  }
});

test('fixture: the jitter buffer', () => {
  for (const { note, options, events, counters } of fixture.jitter) {
    const buffer = new vf.VoiceJitterBuffer(options);
    for (const event of events) {
      const where = `${note} @${event.at}`;
      if (event.push !== undefined) {
        const packet =
          event.packet !== undefined
            ? unhex(event.packet)
            : vf.encodeVoicePacket(event.header, unhex(event.frame));
        assert.equal(buffer.push(event.push, packet, event.at), event.result, where);
        assert.equal(buffer.bufferedCount(event.push), event.buffered, where);
      } else if (event.pull !== undefined) {
        const played = buffer.pull(event.pull, event.at).map((slot) => {
          assert.equal(slot.key, event.pull, where);
          assert.equal(slot.gap, slot.frame === null, where);
          return {
            seq: slot.seq,
            timestamp: slot.timestamp,
            codec: slot.codec,
            frameMs: slot.frameMs,
            flags: slot.flags,
            frame: slot.frame === null ? null : hex(slot.frame),
          };
        });
        assert.deepEqual(played, event.expect, where);
        assert.equal(buffer.senderCount, event.senders, where);
      } else if (event.forget !== undefined) {
        buffer.forget(event.forget);
        assert.equal(buffer.senderCount, event.senders, where);
      }
    }
    assert.deepEqual(
      {
        late: buffer.late,
        duplicates: buffer.duplicates,
        malformed: buffer.malformed,
        discarded: buffer.discarded,
        gaps: buffer.gaps,
      },
      counters,
      note,
    );
  }
});

test('the fixture exercises reordering, loss, wrap and every push result', () => {
  const results = new Set();
  let gaps = 0;
  let wrapped = false;
  for (const { events } of fixture.jitter) {
    for (const event of events) {
      if (event.result) results.add(event.result);
      for (const slot of event.expect ?? []) {
        if (slot.frame === null) gaps += 1;
        if (slot.seq === 0 && slot.timestamp > 0) wrapped = true;
      }
    }
  }
  assert.deepEqual([...results].sort(), ['buffered', 'duplicate', 'late', 'malformed']);
  assert.ok(gaps > 0);
  assert.ok(wrapped);
});

test('writers refuse fields outside their width and frames that do not fit', () => {
  const ok = { codec: 1, seq: 0, timestamp: 0, frameMs: 20, flags: 0 };
  for (const bad of [
    { codec: 256 },
    { seq: 65536 },
    { seq: -1 },
    { timestamp: 2 ** 32 },
    { frameMs: 256 },
    { flags: 1.5 },
  ]) {
    assert.throws(() => vf.encodeVoiceHeader({ ...ok, ...bad }), RangeError);
  }
  assert.equal(vf.encodeVoicePacket(ok, new Uint8Array(1113)).length, 1123);
  assert.throws(() => vf.encodeVoicePacket(ok, new Uint8Array(1114)), /exceeds 1113/);
  assert.throws(() => new vf.VoicePacketizer({ codec: 1, frameMs: 0 }), RangeError);
  const packetizer = new vf.VoicePacketizer({ codec: 1, frameMs: 20 });
  assert.throws(() => packetizer.packetize(new Uint8Array(1114)), RangeError);
  assert.equal(packetizer.nextSeq, 0, 'a refused frame is not numbered');
  assert.throws(() => packetizer.skip(-1), RangeError);
  assert.throws(() => new vf.VoiceJitterBuffer({ targetDelayMs: -1 }), RangeError);
  assert.throws(() => new vf.VoiceJitterBuffer({ maxFrames: 0 }), RangeError);
  assert.throws(() => new vf.VoiceJitterBuffer({ targetDelayMs: 60, resetAfterMs: 60 }), RangeError);
});

test('readers never throw on a packet from the network', () => {
  const buffer = new vf.VoiceJitterBuffer();
  let seed = 7;
  const random = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff);
  for (let i = 0; i < 2000; i += 1) {
    const bytes = Uint8Array.from({ length: random() % 24 }, () => random() & 0xff);
    if (i % 3 === 0 && bytes.length > 0) bytes[0] = 1;
    vf.decodeVoicePacket(bytes);
    buffer.push(`k${i % 5}`, bytes, i);
    buffer.poll(i);
  }
  assert.ok(buffer.malformed > 0);
});

test('poll plays every sender; one sender holds at most maxFrames frames', () => {
  const buffer = new vf.VoiceJitterBuffer({ maxFrames: 4 });
  const packet = (seq, flags = 0) =>
    vf.encodeVoicePacket({ codec: 2, seq, timestamp: seq * 160, frameMs: 20, flags }, new Uint8Array([seq]));
  assert.equal(buffer.push('x', packet(0, 1), 0), 'buffered');
  assert.equal(buffer.push('y', packet(100, 1), 5), 'buffered');
  for (const seq of [1, 2, 3]) assert.equal(buffer.push('x', packet(seq), 1), 'buffered');
  assert.equal(buffer.bufferedCount('x'), 4);
  assert.equal(buffer.push('x', packet(4), 2), 'buffered', 'outside the window: the stream starts over');
  assert.equal(buffer.bufferedCount('x'), 1);
  assert.equal(buffer.discarded, 4);
  const played = buffer.poll(70);
  assert.deepEqual(
    played.map((slot) => [slot.key, slot.seq]).sort(),
    [['x', 4], ['y', 100]],
  );
  buffer.forget('y');
  assert.equal(buffer.senderCount, 1);
});

test('a sender speaking with the packetizer plays back in order after the target delay', () => {
  const packetizer = new vf.VoicePacketizer({ codec: vf.VoiceCodec.OPUS, frameMs: 20, seq: 65530 });
  const buffer = new vf.VoiceJitterBuffer();
  // One packet every 20 ms; every fourth one is overtaken by the packet after it.
  const arrivals = Array.from({ length: 10 }, (_, i) => ({
    at: i * 20 + (i % 4 === 1 ? 25 : 0),
    packet: packetizer.packetize(new Uint8Array([i]), { last: i === 9 }),
  }));
  const played = [];
  for (let t = 0; t <= 400; t += 1) {
    for (const arrival of arrivals) {
      if (arrival.at === t) assert.equal(buffer.push('speaker', arrival.packet, t), 'buffered');
    }
    played.push(...buffer.pull('speaker', t));
  }
  assert.deepEqual(played.map((slot) => slot.frame[0]), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  assert.equal(played[0].flags, vf.VoiceFlag.SPURT_START);
  assert.equal(played[9].flags, vf.VoiceFlag.SPURT_END);
  assert.deepEqual(
    played.map((slot) => slot.seq),
    [65530, 65531, 65532, 65533, 65534, 65535, 0, 1, 2, 3],
  );
  assert.equal(buffer.gaps, 0);
  assert.equal(buffer.late, 0);
});
