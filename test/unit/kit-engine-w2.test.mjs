/**
 * Offline unit tests for the Wave 2 engine kit surfaces: session-genre
 * event parsers (91/92/93) and the engine-routed kits (matches, decks,
 * instances, director, matchmaking, market/orderBook, leaderboards,
 * minigames) against fake compute domains.
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

function fakeCompute(invokes, modules = {}) {
  const calls = [];
  return {
    calls,
    async module({ name }) {
      if (name in modules) return modules[name];
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

test('MatchesKit engine path: ready/submit/deny + findByProposal', async () => {
  const { EngineDetector, MatchesKit } = await loadSdk();
  const compute = fakeCompute({
    'match-engine.ready': { success: true, readyCount: 1, expected: 2, started: false },
    'match-engine.submit_move': { success: false, reason: 'not your turn' },
    'match-engine.find_by_proposal': { success: true, matchId: 'm-1' },
  });
  const matches = new MatchesKit('1', {}, undefined, undefined, {}, new EngineDetector('1', compute));
  assert.equal(await matches.engineAvailable(), true);
  const ready = await matches.engineReady('m-1');
  assert.equal(ready.readyCount, 1);
  await assert.rejects(() => matches.engineSubmitMove('m-1'), /not your turn/);
  assert.equal(await matches.findByProposal('p-1'), 'm-1');
});

test('DecksKit engine path: hand is caller-scoped, play validates', async () => {
  const { DecksKit, EngineDetector } = await loadSdk();
  const compute = fakeCompute({
    'deck-engine.hand': { success: true, hand: ['AS', '2H'] },
    'deck-engine.play': { success: false, reason: 'card not in hand' },
  });
  const decks = new DecksKit('1', {}, {}, new EngineDetector('1', compute));
  assert.deepEqual(await decks.engineHand('t1'), ['AS', '2H']);
  await assert.rejects(() => decks.enginePlay('t1', 'KD'), /card not in hand/);
});

test('InstancesKit + DirectorKit + MatchmakingKit route and parse', async () => {
  const { DirectorKit, EngineDetector, InstancesKit, MatchmakingKit } = await loadSdk();
  const compute = fakeCompute({
    'instance-engine.open': {
      success: true, instanceId: 'i1', seed: '42', status: 'open',
      members: ['7'], chunkBase: [100000, 1, 100000], volumeChunks: 8,
    },
    'director.start_run': {
      success: true, runId: 'r1', encounterId: 'e', players: 2,
      phase: { kind: 'countdown' }, pending: 0, wavesCleared: 0, wavesTotal: 3,
      boss: null, finished: false, outcome: '',
    },
    'matchmaking.queue_status': {
      success: true, queuedIn: 'ranked', proposal: null, queueDepth: 3, rating: 1015,
    },
  });
  const detector = new EngineDetector('1', compute);
  const instance = await new InstancesKit('1', detector).open({ seed: '42' });
  assert.equal(instance.seed, '42');
  assert.deepEqual(instance.chunkBase, [100000, 1, 100000]);
  const run = await new DirectorKit('1', {}, detector).startRun('e', 2);
  assert.equal(run.wavesTotal, 3);
  const status = await new MatchmakingKit('1', detector).queueStatus();
  assert.equal(status.rating, 1015);
  assert.equal(status.queuedIn, 'ranked');
});

test('EconomyKit.orderBook routes bid/ask; LeaderboardsKit engineTop pages', async () => {
  const { EconomyKit, EngineDetector, LeaderboardsKit } = await loadSdk();
  const compute = fakeCompute({
    'market-engine.place': (params) => ({
      success: true, orderId: 5, fills: [], side: params.side,
    }),
    'board-engine.top': { success: true, entries: [{ subjectId: '7', score: 9, rank: 1, percentile: 100 }], total: 1 },
  });
  const detector = new EngineDetector('1', compute);
  const economy = new EconomyKit('1', {}, {}, detector);
  const placed = await economy.orderBook.bid('iron', 10, 2);
  assert.equal(placed.side, 'buy');
  assert.deepEqual(compute.calls[0].params, { item: 'iron', side: 'buy', price: 10, quantity: 2 });

  const boards = new LeaderboardsKit('1', {}, {}, detector);
  const top = await boards.engineTop('arcade');
  assert.equal(top.entries[0].rank, 1);
});

test('MinigamesKit resolves envelopes without throwing on denials', async () => {
  const { EngineDetector, MinigamesKit } = await loadSdk();
  const compute = fakeCompute({
    'minigame.play': { success: false, reason: 'guess must be 1-5' },
  });
  const minigames = new MinigamesKit('1', new EngineDetector('1', compute), {
    defaultModuleName: 'minigame',
  });
  const denied = await minigames.play({ guess: 9 });
  assert.equal(denied.success, false);
  assert.equal(denied.reason, 'guess must be 1-5');
  const unconfigured = new MinigamesKit('1', new EngineDetector('1', compute));
  assert.equal((await unconfigured.play({})).success, false);
});

test('QuestsKit tutorial sequencing: locked/active/complete by order', async () => {
  const { QuestsKit } = await loadSdk();
  // Fake gameModel: 3 tutorial defs + progress rows for owner 7.
  const defs = [0, 1, 2].map((i) => ({
    containerId: `def-${i}`,
    displayName: `Step ${i}`,
    ownerUserId: null,
  }));
  const progress = [
    { containerId: 'p-0', displayName: 'p', ownerUserId: '7' },
  ];
  const props = {
    'def-0': { quest_id: 'ftue:0', target_count: 1 },
    'def-1': { quest_id: 'ftue:1', target_count: 1 },
    'def-2': { quest_id: 'ftue:2', target_count: 1 },
    'p-0': { quest_id: 'ftue:0', count: 1, target: 1, completed: true, claimed: false },
  };
  const gameModel = {
    async containers({ typeName }) {
      return typeName === 'QuestDef' ? defs : progress;
    },
    async container({ containerId }) {
      return [...defs, ...progress].find((c) => c.containerId === containerId);
    },
    async containerState({ containerId }) {
      return { propertiesJson: JSON.stringify(props[containerId] ?? {}) };
    },
  };
  const quests = new QuestsKit('1', gameModel);
  const steps = await quests.tutorial('7');
  assert.equal(steps.length, 3);
  assert.equal(steps[0].status, 'complete');
  assert.equal(steps[1].status, 'active');
  assert.equal(steps[2].status, 'locked');
});
