/**
 * kit.matches owns its session's exits (17.3.0): a kit match is created with
 * `presence: 'none'`, so the server never expires anybody, and the kit itself
 * leaves (`leave`) and ends (`finish`) the backing gm_sessions row.
 *
 * Black-box against a real API: the owner deploys the matches blueprint,
 * creates a match, a player joins and leaves, the owner finishes. Auto-skips
 * without the full e2e env. Against the local stack:
 *
 *   CROWDY_HTTP_URL='http://127.0.0.1:3000' \
 *   CROWDY_WS_URL='ws://127.0.0.1:3000/graphql' \
 *   CROWDY_OWNER_EMAIL='owner@example.com' CROWDY_OWNER_PASSWORD='...' \
 *   CROWDY_TEST_APP_ID='<snowflake>' npm run test:e2e
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { mintAppAccess, provisionClients } from '../provision.mjs';
import { FULL_E2E_ENV, gameClientConfig, skipReasonFor } from '../helpers.mjs';

const skipReason = skipReasonFor(FULL_E2E_ENV);

test(
  'kit.matches: create is presence none; leave and finish are the roster exits',
  { skip: skipReason, timeout: 120_000 },
  async () => {
    const { createCrowdyClient, matchesBlueprint } = await import('../../dist/index.js');
    const { appId, owner, players, clients } = await provisionClients(createCrowdyClient, 1);
    const [clientB] = clients;
    const [playerB] = players;
    const ownerAccess = await mintAppAccess(appId, owner.token);
    const ownerClient = createCrowdyClient(gameClientConfig(ownerAccess));
    ownerClient.setToken(ownerAccess.token);

    // One blueprint per run so a stale definition from an earlier run cannot
    // answer for this one.
    const typePrefix = `E2eKm${Date.now().toString(36)}`;
    const ownerKit = ownerClient.kit(appId, { matches: { typePrefix } });
    await ownerKit.deploy(matchesBlueprint({ typePrefix }));
    const bKit = clientB.kit(appId, { matches: { typePrefix } });

    // Create: the session is presence 'none' with the creator joined.
    const match = await ownerKit.matches.create({
      creatorUserId: owner.userId,
      mode: 'e2e',
      displayName: `kit-e2e-${typePrefix}`,
    });
    let session = await ownerClient.gameModel.session({ appId, sessionId: match.sessionId });
    assert.equal(session.presence, 'none');
    assert.equal(session.participantCount, 1);
    assert.equal(session.hostUserId, String(owner.userId));

    // Join, then leave: the kit remembers the incarnation the join returned.
    const joined = await bKit.matches.join(match);
    assert.equal(joined.userId, String(playerB.userId));
    assert.equal(joined.incarnation, 1);
    session = await ownerClient.gameModel.session({ appId, sessionId: match.sessionId });
    assert.equal(session.participantCount, 2);

    const left = await bKit.matches.leave(match);
    assert.equal(left.state, 'left');
    assert.equal(left.leftReason, 'left');
    session = await ownerClient.gameModel.session({ appId, sessionId: match.sessionId });
    assert.equal(session.participantCount, 1);
    assert.equal(session.status, 'active');

    // Finish: end_match flips the meta, then the session is ended.
    await ownerKit.matches.start(match);
    const finished = await ownerKit.matches.finish(match, owner.userId);
    assert.equal(finished.success, true, finished.errorMessage);
    const meta = await ownerKit.matches.get(match.metaId);
    assert.equal(meta.state, 'finished');
    assert.equal(meta.winnerUserId, Number(owner.userId));
    session = await ownerClient.gameModel.session({ appId, sessionId: match.sessionId });
    assert.equal(session.status, 'completed');
    assert.equal(session.endReason, 'completed');
    assert.equal(session.admission, 'closed');
    assert.equal(session.participantCount, 0);

    // A second finish is refused by the lifecycle function and never throws
    // on the session, which stays as it was.
    const again = await ownerKit.matches.finish(match, owner.userId);
    assert.equal(again.success, false);
    session = await ownerClient.gameModel.session({ appId, sessionId: match.sessionId });
    assert.equal(session.status, 'completed');
    const events = await ownerClient.gameModel.sessionEvents({
      appId,
      sessionId: match.sessionId,
      afterRevision: '0',
    });
    assert.deepEqual(
      events.map((e) => e.kind),
      ['created', 'participant_joined', 'participant_left', 'participant_left', 'ended'],
    );
  },
);
