/**
 * The session system end to end through the SDK (17.2.0): create with a seat
 * cap -> join / reconnect (incarnations) -> capacity and lock refusals -> host
 * term staleness -> succession -> snapshot and events -> the
 * gameModelSessionChanged stream -> end.
 *
 * Black-box: an app and three players are provisioned through the API (see
 * provision.mjs); every session call goes through client.gameModel. Auto-skips
 * without the full e2e env. Against the local stack:
 *
 *   CROWDY_HTTP_URL='http://127.0.0.1:3000' \
 *   CROWDY_WS_URL='ws://127.0.0.1:3000/graphql' \
 *   CROWDY_OWNER_EMAIL='owner@example.com' CROWDY_OWNER_PASSWORD='...' \
 *   CROWDY_TEST_APP_ID='<snowflake>' npm run test:e2e
 *
 * Presence is deliberately NOT exercised here: it is the server judging Buddy
 * actor presence after a grace window, which needs a UDP session and a wait;
 * the API's own e2e covers it. Nothing below spawns an actor, so the grace
 * window (60 s by default) is what keeps these participants joined.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import { mintAppAccess, provisionClients } from '../provision.mjs';
import { FULL_E2E_ENV, gameClientConfig, skipReasonFor } from '../helpers.mjs';

const skipReason = skipReasonFor(FULL_E2E_ENV);

async function refused(promise, code) {
  try {
    await promise;
  } catch (err) {
    assert.equal(err.code, code, `expected ${code}, got ${String(err.code)}: ${err.message}`);
    return err;
  }
  assert.fail(`expected a ${code} refusal`);
}

test(
  'session system: roster, admission, capacity, incarnations, host terms, revisions',
  { skip: skipReason, timeout: 120_000 },
  async () => {
    const { createCrowdyClient, CrowdyGraphQLError } = await import('../../dist/index.js');
    const { appId, owner, players, clients } = await provisionClients(createCrowdyClient, 3);
    const [clientB, clientC, clientD] = clients;
    const [playerB, playerC, playerD] = players;
    const ownerAccess = await mintAppAccess(appId, owner.token);
    const ownerClient = createCrowdyClient(gameClientConfig(ownerAccess));
    ownerClient.setToken(ownerAccess.token);

    // Create: the owner is host (term 1), one seat taken of three.
    const created = await ownerClient.gameModel.createSession({
      appId,
      name: `e2e-session-${Date.now()}`,
      maxParticipants: 3,
      idempotencyKey: `create-${Date.now()}`,
    });
    const sessionId = created.sessionId;
    assert.equal(created.status, 'active');
    assert.equal(created.admission, 'open');
    assert.equal(created.maxParticipants, 3);
    assert.equal(created.participantCount, 1);
    assert.equal(created.hostUserId, String(owner.userId));
    assert.equal(created.hostTerm, 1);
    assert.equal(created.revision, '1');

    // Stream from revision 0 so the retained history replays first.
    const received = [];
    const streamErrors = [];
    const unsubscribe = ownerClient.gameModel.sessionChanged(
      { appId, sessionId, afterRevision: '0' },
      {
        next: (event) => received.push(event),
        error: (error) => streamErrors.push(error),
        webSocketImpl: WebSocket,
      },
    );

    try {
      // B and C join; D is refused for capacity.
      const joinedB = await clientB.gameModel.joinSession({ appId, sessionId });
      assert.equal(joinedB.state, 'joined');
      assert.equal(joinedB.incarnation, 1);
      assert.equal(joinedB.userId, String(playerB.userId));
      await clientC.gameModel.joinSession({ appId, sessionId });
      await refused(clientD.gameModel.joinSession({ appId, sessionId }), 'SESSION_FULL');
      assert.equal((await ownerClient.gameModel.session({ appId, sessionId })).participantCount, 3);

      // Idempotent replay of a join returns the same incarnation.
      const key = `join-${Date.now()}`;
      const first = await clientB.gameModel.joinSession({ appId, sessionId, idempotencyKey: key });
      const replay = await clientB.gameModel.joinSession({ appId, sessionId, idempotencyKey: key });
      assert.equal(first.incarnation, 2);
      assert.deepEqual(replay, first);

      // Lock (host, right term): D still refused, B may reconnect (incarnation 3).
      const locked = await ownerClient.gameModel.setSessionAdmission({
        appId, sessionId, admission: 'locked', expectedHostTerm: 1,
      });
      assert.equal(locked.admission, 'locked');
      await refused(clientD.gameModel.joinSession({ appId, sessionId }), 'SESSION_LOCKED');
      const reconnected = await clientB.gameModel.joinSession({ appId, sessionId });
      assert.equal(reconnected.incarnation, 3);

      // A non-host may not change admission; a stale term is refused.
      await refused(
        clientB.gameModel.setSessionAdmission({ appId, sessionId, admission: 'open' }),
        'FORBIDDEN',
      );
      await refused(
        ownerClient.gameModel.setSessionAdmission({ appId, sessionId, admission: 'open', expectedHostTerm: 9 }),
        'SESSION_HOST_TERM_STALE',
      );

      // A superseded client (incarnation 1) cannot leave for the live one.
      await refused(
        clientB.gameModel.leaveSession({ appId, sessionId, incarnation: 1 }),
        'SESSION_INCARNATION_STALE',
      );
      await refused(
        clientD.gameModel.leaveSession({ appId, sessionId, incarnation: 1 }),
        'SESSION_NOT_PARTICIPANT',
      );

      // Binding another user's actor is refused; binding your own is not.
      const actorOfC = 'c'.repeat(32);
      // C rejoins bound to its own uuid (never spawned, so unclaimed: allowed).
      const boundC = await clientC.gameModel.joinSession({ appId, sessionId, actorUuid: actorOfC });
      assert.equal(boundC.actorUuid, actorOfC);
      // B cannot take the same uuid while C holds it.
      await refused(
        clientB.gameModel.joinSession({ appId, sessionId, actorUuid: actorOfC }),
        'FORBIDDEN',
      );

      // Host leaves -> B (longest-joined present) succeeds, term 2; then hands
      // the role to C with the current term.
      const left = await ownerClient.gameModel.leaveSession({ appId, sessionId, incarnation: 1 });
      assert.equal(left.state, 'left');
      assert.equal(left.leftReason, 'left');
      let now = await ownerClient.gameModel.session({ appId, sessionId });
      assert.equal(now.hostUserId, String(playerB.userId));
      assert.equal(now.hostTerm, 2);
      const transferred = await clientB.gameModel.transferSessionHost({
        appId, sessionId, toUserId: String(playerC.userId), expectedHostTerm: 2,
      });
      assert.equal(transferred.hostUserId, String(playerC.userId));
      assert.equal(transferred.hostTerm, 3);
      await refused(
        clientC.gameModel.transferSessionHost({ appId, sessionId, toUserId: String(playerD.userId) }),
        'SESSION_NOT_PARTICIPANT',
      );

      // Snapshot and events agree, and the revision log is contiguous.
      const snapshot = await clientB.gameModel.sessionSnapshot({ appId, sessionId });
      assert.deepEqual(
        snapshot.participants.map((p) => p.userId).sort(),
        [String(playerB.userId), String(playerC.userId)].sort(),
      );
      assert.equal(snapshot.session.revision, snapshot.revision);
      const events = await clientB.gameModel.sessionEvents({ appId, sessionId, afterRevision: '0' });
      assert.deepEqual(events.map((e) => Number(e.revision)), events.map((_, i) => i + 1));
      assert.equal(events.at(-1).revision, snapshot.revision);
      assert.equal(events[0].kind, 'created');
      assert.ok(events.some((e) => e.kind === 'participant_rejoined'));
      assert.ok(events.filter((e) => e.kind === 'host_changed').length >= 2);
      const gap = await clientB.gameModel.sessionEvents({
        appId, sessionId, afterRevision: String(Number(snapshot.revision) - 2),
      });
      assert.equal(gap.length, 2);

      // Operators inspect the whole roster; players may not.
      const inspection = await ownerClient.gameModel.sessionInspect({ appId, sessionId });
      const verdicts = new Map(inspection.participants.map((p) => [p.participant.userId, p.presence]));
      assert.equal(verdicts.get(String(owner.userId)), 'left');
      assert.equal(verdicts.get(String(playerB.userId)), 'grace');
      await refused(clientB.gameModel.sessionInspect({ appId, sessionId }), 'FORBIDDEN');

      // End as the host; nobody gets back in.
      const ended = await clientC.gameModel.endSession({ appId, sessionId, expectedHostTerm: 3 });
      assert.equal(ended.status, 'completed');
      assert.equal(ended.admission, 'closed');
      assert.equal(ended.participantCount, 0);
      assert.ok(ended.endedAt);
      await refused(clientD.gameModel.joinSession({ appId, sessionId }), 'SESSION_ENDED');
      await refused(
        clientC.gameModel.endSession({ appId, sessionId }),
        'SESSION_ENDED',
      );
      assert.ok(
        (await refused(clientD.gameModel.joinSession({ appId, sessionId }), 'SESSION_ENDED'))
          instanceof CrowdyGraphQLError,
      );

      // The stream delivered every revision, in order, ending with `ended`.
      const finalEvents = await clientB.gameModel.sessionEvents({ appId, sessionId, afterRevision: '0' });
      for (let attempt = 0; attempt < 50 && received.length < finalEvents.length; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      assert.deepEqual(streamErrors, []);
      assert.deepEqual(
        received.map((e) => e.revision),
        finalEvents.map((e) => e.revision),
        'subscription replay + live revisions match the event log',
      );
      assert.equal(received.at(-1).kind, 'ended');

      // Lobbies: the ended session is no longer listed as open + active.
      const open = await ownerClient.gameModel.sessions({ appId, status: 'active', admission: 'open' });
      assert.ok(!open.some((s) => s.sessionId === sessionId));
    } finally {
      unsubscribe();
    }
  },
);
