/**
 * Offline unit tests for the Wave 3 engine kit surfaces: realtime event
 * parsers (94-98), the engine-routed kits (abilities, movement, territory,
 * racing/possession), loot engine routing, liveops zone parsing, moderation
 * queue ordering, and quests tutorial reuse against fake domains.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadSdk } from '../helpers.mjs';

const frame = (type, body) => {
  const state = new TextEncoder().encode(JSON.stringify(body));
  const bytes = new Uint8Array(2 + state.length);
  bytes[0] = type & 0xff;
  bytes[1] = type >> 8;
  bytes.set(state, 2);
  return bytes;
};

function fakeCompute(invokes) {
  const calls = [];
  return {
    calls,
    async module() {
      return { enabled: true };
    },
    async invoke({ moduleName, exportName, paramsJson }) {
      calls.push({ moduleName, exportName, params: paramsJson ? JSON.parse(paramsJson) : undefined });
      const handler = invokes[`${moduleName}.${exportName}`];
      if (!handler) throw new Error(`no handler ${moduleName}.${exportName}`);
      const body = typeof handler === 'function' ? handler(calls.at(-1).params) : handler;
      return { resultJson: JSON.stringify(body), fuelUsed: '1', durationUs: 1 };
    },
  };
}

test('wire: realtime parsers 94-98 route by type', async () => {
  const {
    parseAbilityEvent,
    parseControlPointEvent,
    parseMovementViolation,
    parseRaceTimingEvent,
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
});

test('AbilitiesKit + MovementKit route and parse envelopes', async () => {
  const { AbilitiesKit, EngineDetector, MovementKit } = await loadSdk();
  const compute = fakeCompute({
    'abilities-engine.cast': (params) => ({ success: true, cast: true, resource: 90, target: params }),
    'abilities-engine.loadout': { success: true, abilities: [{ abilityId: 'bolt', kind: 'projectile', cooldownMs: 500, resourceCost: 15, range: 40 }] },
    'movement-warden.violations': { success: true, userId: '9', speed: 1, teleport: 2, bounds: 0, log: [{ atMs: 5, kind: 'teleport', detail: '80 units' }] },
  });
  const detector = new EngineDetector('1', compute);
  const abilities = new AbilitiesKit('1', {}, detector);
  const cast = await abilities.cast('bolt', 20, 10);
  assert.equal(cast.resource, 90);
  assert.deepEqual(compute.calls[0].params, { abilityId: 'bolt', targetX: 20, targetZ: 10 });
  const loadout = await abilities.loadout();
  assert.equal(loadout[0].kind, 'projectile');

  const movement = new MovementKit('1', {}, detector);
  const violations = await movement.violations('9');
  assert.equal(violations.teleport, 2);
  assert.equal(violations.log[0].kind, 'teleport');
});

test('TerritoryKit + RacingKit (incl. possession) parse typed views', async () => {
  const { EngineDetector, RacingKit, TerritoryKit } = await loadSdk();
  const compute = fakeCompute({
    'territory.points': { success: true, points: [{ pointId: 'alpha', x: 40, z: 40, radius: 6, owner: 'red', challenger: '', progress: 0, incomePerMin: 60, siegeOpen: true }] },
    'territory.factions': { success: true, factions: [{ factionId: 'red', gold: 18 }] },
    'racing.race_status': { success: true, courseId: 'loop', started: true, lap: 1, nextGate: 2, splitsMs: [1500], bestLapMs: 0, finished: false, totalMs: 0 },
    'possession.match_state': { success: true, teams: { 7: 'west' }, ball: { x: 50, z: 50, holder: null, moving: false }, standings: [], matchesPlayed: 0 },
  });
  const detector = new EngineDetector('1', compute);
  const territory = new TerritoryKit('1', {}, detector);
  const points = await territory.points();
  assert.equal(points[0].owner, 'red');
  assert.equal(points[0].incomePerMin, 60);
  assert.equal((await territory.factions())[0].gold, 18);

  const racing = new RacingKit('1', {}, detector);
  const run = await racing.raceStatus();
  assert.equal(run.nextGate, 2);
  assert.deepEqual(run.splitsMs, [1500]);
  const match = await racing.matchState();
  assert.equal(match.ball.x, 50);
});

test('LootKit engine routing: pull/pity/audit through the module', async () => {
  const { EngineDetector, LootKit } = await loadSdk();
  const compute = fakeCompute({
    'loot-engine.pull': (params) => ({ success: true, results: new Array(params.count).fill({ itemId: 'dust' }) }),
    'loot-engine.pity': { success: true, rolls: 12, pityCounters: { legendary: 3 } },
  });
  const loot = new LootKit('1', {}, {}, new EngineDetector('1', compute));
  assert.equal(await loot.engineAvailable(), true);
  const pulled = await loot.enginePull(3);
  assert.equal(pulled.results.length, 3);
  const pity = await loot.enginePity();
  assert.equal(pity.pityCounters.legendary, 3);
  // Without a detector the engine path reports unavailable.
  const bare = new LootKit('1', {}, {});
  assert.equal(await bare.engineAvailable(), false);
});

test('LiveopsKit parses type-98 zone changes', async () => {
  const { EngineDetector, LiveopsKit } = await loadSdk();
  const liveops = new LiveopsKit('1', {}, {}, new EngineDetector('1', fakeCompute({})));
  const zone = liveops.parseZoneChange(
    frame(98, { kind: 'shrinking', phase: 1, radiusNow: 42.5, centerX: 50, centerZ: 50 }),
  );
  assert.equal(zone.kind, 'shrinking');
  assert.equal(zone.phase, 1);
  assert.ok(Math.abs(zone.radiusNow - 42.5) < 1e-6);
  assert.equal(liveops.parseZoneChange(frame(97, {})), null);
});

test('ModerationKit orders the queue oldest-first and scopes mutes', async () => {
  const { ModerationKit } = await loadSdk();
  const rows = [
    { containerId: 'r2', props: { reporter_user_id: '1', subject_user_id: '9', reason: 'spam', status: 'open', filed_at_ms: 200 } },
    { containerId: 'r1', props: { reporter_user_id: '2', subject_user_id: '9', reason: 'cheating', status: 'open', filed_at_ms: 100 } },
    { containerId: 'r3', props: { reporter_user_id: '3', subject_user_id: '9', reason: 'spam', status: 'actioned', filed_at_ms: 50 } },
  ];
  const gameModel = {
    async containers({ typeName }) {
      if (typeName === 'ModReport') return rows.map((r) => ({ containerId: r.containerId }));
      return [
        { containerId: 'm1' },
        { containerId: 'm2' },
      ];
    },
    async containerState({ containerId }) {
      const report = rows.find((r) => r.containerId === containerId);
      if (report) return { propertiesJson: JSON.stringify(report.props) };
      const mutes = {
        m1: { owner_user_id: '7', muted_user_id: '9' },
        m2: { owner_user_id: '8', muted_user_id: '7' },
      };
      return { propertiesJson: JSON.stringify(mutes[containerId] ?? {}) };
    },
  };
  const moderation = new ModerationKit('1', gameModel);
  const queue = await moderation.queue();
  assert.deepEqual(queue.map((r) => r.containerId), ['r1', 'r2'], 'open only, oldest first');
  const mutes = await moderation.mutes('7');
  assert.deepEqual(mutes, [{ containerId: 'm1', mutedUserId: '9' }]);
});
