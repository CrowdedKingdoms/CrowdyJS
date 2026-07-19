/**
 * Offline unit tests for the Wave 1 engine kit surfaces: the wire registry
 * (pose codec parity with kit-core::wire, lanes, event parsers) and the
 * capability-detected routing helpers (EngineDetector, MobsKit, CombatKit,
 * NpcsKit overlay) against fake domains.
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

  const frame = (type, body) => {
    const state = new TextEncoder().encode(JSON.stringify(body));
    const bytes = new Uint8Array(2 + state.length);
    bytes[0] = type & 0xff;
    bytes[1] = type >> 8;
    bytes.set(state, 2);
    return bytes;
  };

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

function fakeCompute({ modules = {}, invokes = {} } = {}) {
  const calls = [];
  return {
    calls,
    async module({ name }) {
      if (!(name in modules)) throw Object.assign(new Error('not found'), { code: 'BAD_REQUEST' });
      return modules[name];
    },
    async invoke({ moduleName, exportName, paramsJson }) {
      calls.push({ moduleName, exportName, params: paramsJson ? JSON.parse(paramsJson) : undefined });
      const handler = invokes[`${moduleName}.${exportName}`];
      if (!handler) throw new Error(`no invoke handler for ${moduleName}.${exportName}`);
      return { resultJson: JSON.stringify(handler), fuelUsed: '1000', durationUs: 42 };
    },
  };
}

test('EngineDetector: caches probes and parses invoke envelopes', async () => {
  const { EngineDetector } = await loadSdk();
  let probes = 0;
  const compute = fakeCompute({
    invokes: { 'mob-engine.attack_mob': { success: false, reason: 'out of range' } },
  });
  const baseModule = compute.module.bind(compute);
  compute.module = async (vars) => {
    probes += 1;
    if (vars.name === 'mob-engine') return { enabled: true };
    return baseModule(vars);
  };

  const detector = new EngineDetector('1', compute);
  assert.equal(await detector.has('mob-engine'), true);
  assert.equal(await detector.has('mob-engine'), true);
  assert.equal(probes, 1, 'probe is cached');
  detector.reset();
  await detector.has('mob-engine');
  assert.equal(probes, 2, 'reset re-probes');

  const denial = await detector.invoke('mob-engine', 'attack_mob', { containerId: 'x' });
  assert.equal(denial.success, false);
  assert.equal(denial.reason, 'out of range');

  const offline = new EngineDetector('1', undefined);
  assert.equal(await offline.has('anything'), false);
});

test('MobsKit.attack routes through the referee envelope', async () => {
  const { EngineDetector, MobsKit } = await loadSdk();
  const compute = fakeCompute({
    invokes: { 'mob-engine.attack_mob': { success: true, health: 5, killed: false } },
  });
  const detector = new EngineDetector('1', compute);
  const mobs = new MobsKit('1', /* gameModel */ {}, detector);

  const verdict = await mobs.attack('slot-1', 3);
  assert.deepEqual(
    { success: verdict.success, health: verdict.health, killed: verdict.killed },
    { success: true, health: 5, killed: false },
  );
  assert.deepEqual(compute.calls[0], {
    moduleName: 'mob-engine',
    exportName: 'attack_mob',
    params: { containerId: 'slot-1', amount: 3 },
  });
});

test('CombatKit.attackRouted prefers the engine, falls back to the model', async () => {
  const { CombatKit, EngineDetector } = await loadSdk();

  // Engine present: routes to attack_mob.
  const withEngine = fakeCompute({
    invokes: { 'mob-engine.attack_mob': { success: true, health: 2, killed: true } },
  });
  withEngine.module = async () => ({ enabled: true });
  const combatEngine = new CombatKit('1', {}, {}, new EngineDetector('1', withEngine));
  const engineVerdict = await combatEngine.attackRouted({ targetId: 'slot-1', amount: 4 });
  assert.equal(engineVerdict.via, 'engine');
  assert.equal(engineVerdict.killed, true);

  // No engine: uses the model invoke (gameModel.invoke).
  const gameModel = {
    async invoke({ functionName }) {
      return {
        eventId: 'e1',
        functionName,
        success: true,
        returnValueJson: '55',
        errorMessage: null,
        mutationsApplied: [],
      };
    },
  };
  const combatModel = new CombatKit('1', gameModel, {}, new EngineDetector('1', undefined));
  const modelVerdict = await combatModel.attackRouted({
    targetId: 't1',
    attackerId: 'a1',
  });
  assert.equal(modelVerdict.via, 'model');
  assert.equal(modelVerdict.success, true);
  assert.equal(modelVerdict.health, 55);

  // Model path without an attacker is a graceful failure.
  const missing = await combatModel.attackRouted({ targetId: 't1' });
  assert.equal(missing.success, false);
  assert.match(missing.reason, /attackerId/);
});

test('NpcsKit.overlayLivePoses overlays only matched actor uuids', async () => {
  const { NpcsKit } = await loadSdk();
  const npcs = new NpcsKit('1', {});
  const polled = [
    { containerId: 'c1', x: 1, y: 2, z: 3, properties: { actor_uuid: 'a'.repeat(32) } },
    { containerId: 'c2', x: 9, y: 9, z: 9, properties: { actor_uuid: 'b'.repeat(32) } },
  ];
  const lane = [
    { uuid: 'a'.repeat(32), state: { x: 10, y: 20, z: 30 }, receivedAt: 1 },
    { uuid: 'x'.repeat(32), state: { x: 0, y: 0, z: 0 }, receivedAt: 1 },
  ];
  const overlaid = npcs.overlayLivePoses(polled, lane);
  assert.deepEqual(
    { x: overlaid[0].x, y: overlaid[0].y, z: overlaid[0].z },
    { x: 10, y: 20, z: 30 },
    'live pose wins',
  );
  assert.equal(overlaid[1].x, 9, 'unmatched keeps the durable position');
  assert.equal(npcs.overlayLivePoses(polled, []), polled, 'empty lane is a no-op');
});

test('WorldsimKit.forecast + parseWeather', async () => {
  const { EngineDetector, WorldsimKit } = await loadSdk();
  const compute = fakeCompute({
    invokes: {
      'world-engine.forecast': {
        success: true,
        weather: 'storm',
        dayPhase: 0.25,
        isNight: false,
        remainingMs: 1234,
      },
    },
  });
  compute.module = async () => ({ enabled: true });
  const worldsim = new WorldsimKit('1', {}, {}, new EngineDetector('1', compute));
  assert.equal(await worldsim.engineAvailable(), true);
  const forecast = await worldsim.forecast();
  assert.equal(forecast.weather, 'storm');
  assert.equal(forecast.remainingMs, 1234);
});
