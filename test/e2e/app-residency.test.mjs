/**
 * App residency: the route a real client takes to find its app, end to end.
 *
 * An app is distributed on `app_id`, so all of its shards live on one node and
 * it is resident in exactly ONE datacenter. `CROWDY_HTTP_URL` is the shared
 * entry origin — a multivalue DNS record over every datacenter's load balancer —
 * and a cold client's first request lands wherever DNS pointed it. Gameplay has
 * to move to the app's own datacenter, and the SDK exposes two ways to learn
 * where that is: `discovery.apps()` before login, and the `gameApiUrl` that
 * `mintAppToken` returns after.
 *
 * WHY THIS SUITE EXISTS. Every other e2e test now builds its gameplay clients
 * from the mint response, which means they all depend on this contract and none
 * of them assert it. If `gameApiUrl` silently started coming back null, they
 * would fall back to the entry origin, keep passing on a single-datacenter
 * environment, and quietly stop testing residency at all. This suite is the one
 * that fails instead.
 *
 * It also pins the agreement BETWEEN the two discovery paths. They are answered
 * by different resolvers — one unauthenticated, one inside the mint — and two
 * records that quietly stop agreeing is the failure mode this platform keeps
 * paying for. Checking one direction only would not catch it.
 *
 * ON A SINGLE-DATACENTER ENVIRONMENT the placement assertions self-skip rather
 * than fail: an app with no placement legitimately reports null endpoints, which
 * means "keep using the shared origin". `isResidentElsewhere` is what tells the
 * difference, and the suite says out loud which mode it ran in — a silent pass
 * on a one-host environment would be the same trap this file is guarding.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  loadSdk,
  entryClientConfig,
  gameClientConfig,
  entryHttpUrl,
  isResidentElsewhere,
  originOf,
  skipReasonFor,
  FULL_E2E_ENV,
  TEST_CHUNK,
  TEST_UUID_A,
  randomBase64,
  sleep,
} from '../helpers.mjs';
import {
  provisionAppWithPlayers,
  mintAppAccess,
  appId as configuredAppId,
} from '../provision.mjs';

const skip = skipReasonFor(FULL_E2E_ENV);

/** Hostname of a URL, or null if it will not parse. */
function hostOf(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

/**
 * Everything after the first DNS label — the tier zone.
 *
 * `ck-or.dev.cp.cks-env.com` and `ck-api-or-1.dev.cp.cks-env.com` share
 * `dev.cp.cks-env.com`, which is what proves two endpoints belong to the same
 * fleet rather than to a tier somebody pointed at by accident.
 */
function zoneOf(url) {
  const host = hostOf(url);
  return host ? host.split('.').slice(1).join('.') : null;
}

/**
 * Dash-delimited tokens of the first DNS label, which is where this platform
 * encodes the datacenter: `ck-or` -> ['ck','or'], `ck-api-or-1` ->
 * ['ck','api','or','1']. A substring match would accept `ck-oregon` for `or`.
 */
function hostTokens(url) {
  const host = hostOf(url);
  return host ? host.split('.')[0].split('-') : [];
}

test(
  'discovery names the app datacenter before login, and the mint agrees',
  { skip, timeout: 60_000 },
  async () => {
    const { createCrowdyClient } = await loadSdk();

    // 1. Cold start: no token, no idea where the app is. This is the only call a
    //    client is supposed to make against the shared origin before it knows.
    const cold = createCrowdyClient(entryClientConfig());
    let discovered;
    try {
      discovered = await cold.discovery.app(configuredAppId());
    } finally {
      cold.close();
    }

    assert.ok(discovered, 'appDiscovery returned no row for the configured app');
    assert.equal(
      String(discovered.appId),
      String(configuredAppId()),
      'discovery answered about a different app than it was asked about',
    );

    // 2. The authenticated path must name the same place. These are two
    //    different resolvers, and agreement is the property worth testing.
    const { appId, players } = await provisionAppWithPlayers(1);
    const access = await mintAppAccess(appId, players[0].token);

    // THEY AGREE ON THE DATACENTER, NOT ON THE HOST, AND THE DIFFERENCE IS BY
    // DESIGN. `appDiscovery` is the pre-login call, so it answers with the
    // datacenter's load balancer (`ck-<dc>.<zone>`) — a name that survives any
    // one instance dying. `mintAppToken` is post-login and this fleet runs
    // direct connect, so it hands back ONE instance (`ck-api-<dc>-<n>.<zone>`),
    // which is the whole reason `discoveryUrl` is also in that response.
    //
    // Asserting host equality would therefore fail against a correctly
    // configured fleet, and asserting nothing would let a genuine
    // cross-datacenter disagreement through. What must hold is that both name
    // the SAME datacenter, in the SAME zone — checked against the
    // `datacenterCode` discovery declares, so neither side is taken on trust.
    if (discovered.gameApiUrl && access.gameApiUrl) {
      assert.equal(
        zoneOf(access.gameApiUrl),
        zoneOf(discovered.gameApiUrl),
        `mintAppToken and appDiscovery answered in different zones for app ${appId}: ` +
          `mint says ${access.gameApiUrl}, discovery says ${discovered.gameApiUrl}`,
      );
      assert.ok(
        discovered.datacenterCode,
        'a placed app must report its datacenterCode',
      );
      for (const [label, url] of [
        ['mintAppToken', access.gameApiUrl],
        ['appDiscovery', discovered.gameApiUrl],
        ['mintAppToken ws', access.gameApiWsUrl],
      ]) {
        if (!url) continue;
        assert.ok(
          hostTokens(url).includes(discovered.datacenterCode),
          `${label} returned ${url}, whose hostname does not name datacenter ` +
            `'${discovered.datacenterCode}' — the two records disagree about ` +
            'where this app lives',
        );
      }
    }

    // 3. discoveryUrl is the way BACK, and must be the shared origin rather than
    //    the instance we were just handed. A discovery URL that dies with the
    //    instance it exists to replace is worse than none.
    if (access.discoveryUrl) {
      assert.equal(
        originOf(access.discoveryUrl),
        originOf(entryHttpUrl()),
        'discoveryUrl should be the shared entry origin, not a per-instance host',
      );
    }

    if (isResidentElsewhere(access)) {
      assert.ok(
        discovered.datacenterCode,
        'a placed app must report which datacenter it is in',
      );
      console.log(
        `  [residency] app ${appId} is resident in '${discovered.datacenterCode}' ` +
          `at ${originOf(access.gameApiUrl)}, entry origin is ${originOf(entryHttpUrl())}`,
      );
    } else {
      console.log(
        `  [residency] app ${appId} has no separate placement — endpoints equal the ` +
          'entry origin. The cross-datacenter assertions are vacuous on this environment.',
      );
    }
  },
);

test(
  'gameplay works against the endpoint the API named',
  { skip, timeout: 60_000 },
  async () => {
    const { createCrowdyClient } = await loadSdk();
    const { appId, players } = await provisionAppWithPlayers(1);
    const access = await mintAppAccess(appId, players[0].token);

    // Built the way a real client builds it: on the endpoint the mint returned,
    // carrying the discoveryUrl so instance loss is recoverable.
    const client = createCrowdyClient(gameClientConfig(access));
    client.setToken(access.token);

    try {
      const boot = await client.serverStatus.gameClientBootstrap(appId);
      assert.ok(boot, 'bootstrap returned nothing from the resident endpoint');

      // A realtime round trip is the part that actually depends on residency:
      // the Buddy handed out for this app is the one co-located with its shards,
      // and the UDP proxy that reaches it lives on this instance.
      const unsubscribe = client.udp.subscribe({}, appId);
      await sleep(2000);

      // The first spatial message into a fresh chunk is dropped while the server
      // loads grid permissions, so register, wait, then do the awaited send.
      await client.udp.sendActorUpdate({
        appId,
        chunk: TEST_CHUNK,
        distance: 8,
        uuid: TEST_UUID_A,
        state: randomBase64(8),
        sequenceNumber: 1,
      });
      await sleep(1500);

      const echo = await client.udp.sendActorUpdateAndWait({
        appId,
        chunk: TEST_CHUNK,
        distance: 8,
        uuid: TEST_UUID_A,
        state: randomBase64(8),
        sequenceNumber: 42,
      });
      assert.equal(
        echo.__typename,
        'ActorUpdateNotification',
        'no self-echo from the resident endpoint — the client reached an API ' +
          'instance but its Buddy round trip did not complete',
      );
      assert.equal(Number(echo.sequenceNumber), 42);

      unsubscribe();
    } finally {
      try {
        await client.udp.disconnect();
      } catch {
        /* swallow */
      }
      client.close();
    }
  },
);

test(
  'the entry origin is not where gameplay is meant to happen',
  { skip, timeout: 60_000 },
  async () => {
    // The property under test is a CONTRACT, not a behaviour: whatever the API
    // hands back is where gameplay goes. If a future change made the mint return
    // the shared origin for a placed app, every other suite in this directory
    // would go back to scattering its clients across datacenters and would keep
    // passing while doing it. This is the assertion that would not.
    const { appId, players } = await provisionAppWithPlayers(1);
    const access = await mintAppAccess(appId, players[0].token);

    if (!isResidentElsewhere(access)) {
      console.log(
        '  [residency] single-origin environment — nothing to distinguish. This ' +
          'assertion only has teeth on a multi-datacenter fleet.',
      );
      return;
    }

    assert.notEqual(
      originOf(access.gameApiUrl),
      originOf(entryHttpUrl()),
      'a placed app handed back the shared entry origin for gameplay',
    );
    assert.ok(
      access.gameApiWsUrl,
      'a placed app must name a websocket endpoint too — moving HTTP alone ' +
        'leaves the subscription in the wrong datacenter',
    );
    assert.equal(
      originOf(access.gameApiWsUrl).replace(/^wss?:/, ''),
      originOf(access.gameApiUrl).replace(/^https?:/, ''),
      'the http and websocket endpoints must name the same host: a client that ' +
        'splits them subscribes in one datacenter and mutates in another',
    );
  },
);
