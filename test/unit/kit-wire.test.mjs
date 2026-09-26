/**
 * Offline unit tests for the kit wire registry: the pose codec (parity with
 * kit-core::wire), lanes, and the server-event parsers (77, 90-98). The
 * layouts outlived the legacy engines that first emitted them: hubs that keep
 * a game's client parsers send the same bytes.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadSdk } from '../helpers.mjs';

// The Rust kit-core::wire pose_roundtrip fixture: encoding THIS pose must
// produce THESE bytes (little-endian layout parity, byte for byte).
const PARITY_POSE = {
  x: 1.5,
  y: -20.25,
  z: 300.0,
  yaw: 0.5,
  pitch: -0.25,
  velX: 1.0,
  velY: 2.0,
  velZ: 3.0,
  flags: 0b0011, // FLAG_GROUNDED | FLAG_MOB
  held: 7,
  updatedAtMs: 1_784_425_621_617.0,
};

const frame = (type, body) => {
  const state = new TextEncoder().encode(JSON.stringify(body));
  const bytes = new Uint8Array(2 + state.length);
  bytes[0] = type & 0xff;
  bytes[1] = type >> 8;
  bytes.set(state, 2);
  return bytes;
};

test('wire: pose encode/decode roundtrip matches the kit-core layout', async () => {
  const { encodeEnginePose, decodeEnginePose, POSE_BYTES } = await loadSdk();

  const bytes = encodeEnginePose(PARITY_POSE);
  assert.equal(bytes.length, POSE_BYTES);

  // Field offsets per the kit-core::wire layout doc.
  const view = new DataView(bytes.buffer);
  assert.equal(view.getFloat32(0, true), 1.5);
  assert.equal(view.getFloat32(8, true), 300.0);
  assert.equal(view.getUint8(32), 0b0011);
  assert.equal(view.getUint8(33), 7);
  assert.equal(view.getFloat64(36, true), 1_784_425_621_617.0);

  const decoded = decodeEnginePose(bytes);
  assert.equal(decoded.x, 1.5);
  assert.equal(decoded.y, -20.25);
  assert.equal(decoded.yaw, 0.5);
  assert.equal(decoded.velZ, 3.0);
  assert.equal(decoded.flags, 0b0011);
  assert.equal(decoded.held, 7);
  assert.equal(decoded.updatedAtMs, 1_784_425_621_617.0);
  assert.equal(decoded.suffix, null);
});

test('wire: suffix tolerated, extracted, and non-finite poses rejected', async () => {
  const { encodeEnginePose, decodeEnginePose, poseSuffix } = await loadSdk();

  const withSuffix = encodeEnginePose({ x: 1, y: 2, z: 3, suffix: 'container-123' });
  assert.equal(decodeEnginePose(withSuffix).suffix, 'container-123');
  assert.equal(poseSuffix(withSuffix), 'container-123');
  assert.equal(poseSuffix(withSuffix.subarray(0, 48)), null);

  assert.equal(decodeEnginePose(new Uint8Array(10)), null, 'short payload');
  const nan = encodeEnginePose({ x: NaN, y: 0, z: 0 });
  assert.equal(decodeEnginePose(nan), null, 'non-finite pose');
});

test('wire: engineLanes route mob/npc/player flags', async () => {
  const { engineLanes, FLAG_GROUNDED, FLAG_MOB, FLAG_NPC } = await loadSdk();
  const lanes = engineLanes();
  assert.ok(lanes.mobs({ flags: FLAG_GROUNDED | FLAG_MOB }));
  assert.ok(!lanes.mobs({ flags: FLAG_GROUNDED }));
  assert.ok(lanes.npcs({ flags: FLAG_NPC }));
  assert.ok(lanes.players({ flags: FLAG_GROUNDED }));
  assert.ok(!lanes.players({ flags: FLAG_MOB }));
});

test('wire: server-event parsers (type 77 + type 90)', async () => {
  const { parseContactDamage, parseWeatherEvent, parseEngineEvent } = await loadSdk();

  const contact = parseContactDamage(
    frame(77, { targetUuid: 'a'.repeat(32), damage: 3, mobId: 'slime', mobName: 'Slime' }),
  );
  assert.equal(contact.damage, 3);
  assert.equal(contact.mobId, 'slime');
  assert.equal(parseContactDamage(frame(90, {})), null, 'wrong type is null');

  const weather = parseWeatherEvent(frame(90, { weather: 'rain', sinceMs: 5, untilMs: 99 }));
  assert.equal(weather.weather, 'rain');
  assert.equal(weather.untilMs, 99);
  assert.equal(parseWeatherEvent(frame(77, {})), null);

  assert.equal(parseEngineEvent(new Uint8Array(1)), null, 'short payload');
});

test('wire: turn/score/proposal parsers (91/92/93)', async () => {
  const { parseTurnEvent, parseScoreEvent, parseProposalEvent } = await loadSdk();

  const turn = parseTurnEvent(frame(91, { actorId: '7', round: 2, turnInRound: 3 }));
  assert.deepEqual({ a: turn.actorId, r: turn.round, t: turn.turnInRound }, { a: '7', r: 2, t: 3 });
  assert.equal(parseTurnEvent(frame(92, {})), null);

  const score = parseScoreEvent(
    frame(92, { winnerId: '9', standings: [{ actorId: '9', score: 20, rank: 1 }] }),
  );
  assert.equal(score.winnerId, '9');
  assert.equal(score.standings[0].rank, 1);

  const proposal = parseProposalEvent(
    frame(93, { proposalId: 'p1', mode: 'ranked', players: ['1', '2'] }),
  );
  assert.equal(proposal.proposalId, 'p1');
  assert.deepEqual(proposal.players, ['1', '2']);
  assert.equal(parseProposalEvent(frame(91, {})), null);
});

test('wire: realtime parsers 94-98 route by type', async () => {
  const {
    parseAbilityEvent,
    parseControlPointEvent,
    parseMovementViolation,
    parseRaceTimingEvent,
    parseZoneChangeEvent,
  } = await loadSdk();

  const ability = parseAbilityEvent(
    frame(94, { kind: 'impact', abilityId: 'bolt', casterId: '7', victimId: '9', damage: 6 }),
  );
  assert.equal(ability.kind, 'impact');
  assert.equal(ability.damage, 6);
  assert.equal(parseAbilityEvent(frame(95, {})), null);

  const violation = parseMovementViolation(
    frame(95, { kind: 'teleport', userId: '9', detail: '80 units' }),
  );
  assert.equal(violation.kind, 'teleport');
  assert.equal(violation.userId, '9');

  const point = parseControlPointEvent(frame(96, { pointId: 'alpha', owner: 'red', previousOwner: '' }));
  assert.equal(point.owner, 'red');

  const race = parseRaceTimingEvent(frame(97, { kind: 'lap', courseId: 'loop', userId: '7' }));
  assert.equal(race.kind, 'lap');
  assert.equal(parseRaceTimingEvent(frame(96, {})), null);

  const zone = parseZoneChangeEvent(
    frame(98, { kind: 'shrinking', phase: 1, radiusNow: 42.5, centerX: 50, centerZ: 50 }),
  );
  assert.equal(zone.kind, 'shrinking');
  assert.equal(zone.phase, 1);
  assert.ok(Math.abs(zone.radiusNow - 42.5) < 1e-6);
  assert.equal(parseZoneChangeEvent(frame(97, {})), null);
});
