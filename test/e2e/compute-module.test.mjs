/**
 * Compute Modules e2e: an org owner drives the full `client.compute` surface
 * against a live stack — create a module, deploy the starter Rust source,
 * wait for the on-instance compile, bind tick + invoke triggers, enable,
 * synchronously invoke an export, read the monitoring surface, and delete.
 *
 * Needs management + game-api HTTP (no realtime/WS). The test app is created
 * fresh and published to the shared environment.
 *
 * WHY THIS WORKS WITH NO PLAYER CONNECTED. Since 2026-09-01 a module TICKS only
 * while its app has a player present, and `alwaysOn` is refused. This test used
 * to set it precisely because a playerless app never activated. It does not need
 * it: every assertion below is driven by the SYNCHRONOUS INVOKE, which is a
 * request rather than a scheduled tick and is not presence-gated. The tick
 * trigger is still created and read back, because binding one is configuration.
 *
 * What this test therefore does NOT cover is a tick actually firing. That needs a
 * connected player and belongs in a realtime suite. Auto-skips unless the compute
 * e2e env is configured.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  loadSdk,
  entryClientConfig,
  gameClientConfig,
  skipReasonFor,
} from '../helpers.mjs';
import {
  provisionOwner,
  mintAppAccess,
  sdkPlaceableDatacenter,
} from '../provision.mjs';

const COMPUTE_E2E_ENV = [
  'CROWDY_HTTP_URL',
  'CROWDY_OWNER_EMAIL',
];
const skip = skipReasonFor(COMPUTE_E2E_ENV);
const rid = () => Math.random().toString(36).slice(2, 10);

/** The starter module from the Compute Modules docs: persists a tick counter
 *  durably and echoes invoke input. */
const STARTER_SOURCE = {
  'Cargo.toml': `[package]
name = "my-module"
version = "0.1.0"
edition = "2021"

[lib]
crate-type = ["cdylib"]

[dependencies]
crowdy-compute-sdk = "0.1.0"
`,
  'src/lib.rs': `use std::sync::atomic::{AtomicU64, Ordering};
static TICKS: AtomicU64 = AtomicU64::new(0);

fn on_init() {
    crowdy_compute_sdk::log(1, "module init");
}

fn on_tick(_dt_ms: u32) {
    let n = TICKS.fetch_add(1, Ordering::Relaxed) + 1;
    crowdy_compute_sdk::state_set(&n.to_le_bytes());
}

fn on_invoke(input: &[u8]) -> Vec<u8> {
    input.to_vec()
}

crowdy_compute_sdk::register_module!(init: on_init, tick: on_tick, invoke: on_invoke);
`,
};

test('compute modules: author -> deploy -> compile -> enable -> invoke -> observe -> delete', { skip, timeout: 240_000 }, async () => {
  const { createCrowdyClient } = await loadSdk();
  // Admin/management stays on the shared entry origin: orgs, apps and shared-env
  // publication are not app-resident. The game client cannot be built yet — the
  // app does not exist, so nothing knows where it lives.
  const admin = createCrowdyClient(entryClientConfig());
  let game;
  // Hoisted so `finally` can undo an enabled module however far the test got.
  const moduleName = 'e2e-counter';
  let appId;
  try {
    // Fresh org + shared app; the creating owner's Owner role carries
    // manage_compute + view_compute_diagnostics.
    const owner = await provisionOwner();
    admin.setToken(owner.token);
    const slug = `e2e-compute-${rid()}`;
    const org = await admin.organizations.create({ name: slug, slug });
    // Asked for, not named: createApp's datacenter is required and permanent, and which
    // codes exist is a property of the deployment this suite happens to be pointed at.
    const datacenter = await sdkPlaceableDatacenter(admin);
    const app = await admin.apps.create({
      orgId: org.orgId,
      name: slug,
      slug,
      datacenter,
    });
    await admin.sharedEnvironment.publishApp(app.appId);

    // Game-api calls ride an APP-scoped token, and compute modules are stored
    // with the app's own shards — so the mint tells us both the credential and
    // the datacenter, and the game client is built only now that both are known.
    const access = await mintAppAccess(app.appId, owner.token);
    game = createCrowdyClient(gameClientConfig(access));
    game.setToken(access.token);

    appId = app.appId;

    // Author: new modules start disabled. No `alwaysOn` -- it is retired and
    // passing true is refused with BAD_REQUEST.
    const mod = await game.compute.upsertModule({
      appId, name: moduleName, description: 'e2e counter',
    });
    assert.equal(mod.name, moduleName);
    assert.equal(mod.enabled, false, 'new modules start disabled');

    // Deploy the starter source; the version parks pending then compiles.
    const version = await game.compute.deployVersion({
      appId, moduleName, sourceFiles: STARTER_SOURCE,
    });
    assert.equal(version.versionNo, 1);
    assert.ok(['pending', 'compiling', 'succeeded'].includes(version.compileStatus));

    const compiled = await game.compute.waitForCompile(appId, moduleName, { timeoutMs: 180_000 });
    assert.equal(compiled.compileStatus, 'succeeded');
    assert.ok(BigInt(compiled.compiledSizeBytes) > 0n, 'artifact has a size');

    // Triggers: a 2 Hz tick and a client-callable echo export (null policy =
    // manage_compute holders only, which the owner is).
    const tick = await game.compute.upsertTrigger({
      appId, moduleName, triggerType: 'tick', tickHz: 2,
    });
    assert.equal(tick.triggerType, 'tick');
    const invokeTrigger = await game.compute.upsertTrigger({
      appId, moduleName, triggerType: 'invoke', exportName: 'echo',
    });
    assert.equal(invokeTrigger.exportName, 'echo');
    const triggers = await game.compute.moduleTriggers({ appId, moduleName });
    assert.equal(triggers.length, 2);

    // Enable (requires the compiled version; resets the circuit).
    const enabled = await game.compute.setModuleEnabled({ appId, name: moduleName, enabled: true });
    assert.equal(enabled.enabled, true);
    assert.equal(enabled.circuitState, 'closed');

    // Synchronous invoke RPC: the guest receives {export, params, callerUserId}
    // and the starter echoes it back verbatim.
    const result = await game.compute.invoke({
      appId, moduleName, exportName: 'echo', paramsJson: JSON.stringify({ ping: 42 }),
    });
    assert.ok(result.resultJson, 'echo result parses as JSON');
    const echoed = JSON.parse(result.resultJson);
    assert.equal(echoed.export, 'echo');
    assert.deepEqual(echoed.params, { ping: 42 });
    assert.equal(String(echoed.callerUserId), String(owner.userId));
    assert.ok(BigInt(result.fuelUsed) > 0n, 'invoke consumed fuel');

    // Observe: the load records an init run (healthy ticks aggregate into
    // per-minute usage, not per-tick run rows); logs carry the guest log line.
    const deadline = Date.now() + 60_000;
    let initRuns = [];
    while (Date.now() < deadline) {
      const runs = await game.compute.moduleRuns({ appId, moduleName });
      initRuns = runs.filter((r) => r.triggerSource === 'init' && r.success);
      if (initRuns.length > 0) break;
      await new Promise((r) => setTimeout(r, 3_000));
    }
    assert.ok(initRuns.length > 0, 'module load recorded an init run');

    // `computeModuleStats` reads the per-minute usage rollups, which each
    // instance buffers in memory before writing. So it is NOT readable the
    // instant an invoke returns, and asserting on it directly is a race this
    // test lost: it reached here about eight seconds after the invoke, inside
    // the minute still in progress, and read zero. The run was recorded and the
    // rollup did arrive — a minute later.
    //
    // ck-api publishes the boundary as `computeModuleStats.aggregatedThrough`
    // and flushes the open minute, which cuts the wait to a few seconds. This
    // polls rather than reading the boundary field because a released SDK must
    // keep working against servers that predate it; switch to the boundary once
    // every tier is past ck-api v1.31.0.
    const statsDeadline = Date.now() + 90_000;
    let stats = await game.compute.moduleStats({ appId });
    while (stats.totalRuns < 1 && Date.now() < statsDeadline) {
      await new Promise((r) => setTimeout(r, 3_000));
      stats = await game.compute.moduleStats({ appId });
    }
    assert.ok(
      stats.totalRuns >= 1,
      `stats count the runs (waited for the usage rollup; totalRuns=${stats.totalRuns})`,
    );
    assert.ok(stats.byModule.some((m) => m.moduleName === moduleName));

    const logs = await game.compute.moduleLogs({ appId, moduleName, limit: 20 });
    assert.ok(logs.some((l) => l.message.includes('module init')), 'guest log line surfaced');

    const diag = await game.compute.appDiagnostics({ appId });
    assert.equal(diag.moduleCount, 1);
    assert.equal(diag.enabledModuleCount, 1);

    const policy = await game.compute.modulePolicy({ appId });
    assert.ok(policy.maxTickHz >= 2, 'policy defaults visible');

    // Cleanup: delete cascades versions/triggers; run history is retained.
    const deleted = await game.compute.deleteModule({ appId, name: moduleName });
    assert.equal(deleted, true);
    const remaining = await game.compute.modules({ appId });
    assert.equal(remaining.length, 0);
  } finally {
    // An ENABLED module outlives this process. It no longer ticks forever --
    // presence gating means an abandoned module in an empty app costs nothing
    // until somebody joins that app -- but the row, its triggers and its
    // compiled version all persist, and the app is real. When the delete above
    // was the last statement of the happy path only, every failure after
    // `setModuleEnabled` leaked one; two were left running on dev by two
    // different failures of the rollup assertion. Best-effort, because the app
    // may not exist.
    try {
      if (game && appId) {
        await game.compute.deleteModule({ appId, name: moduleName });
      }
    } catch {
      // Already deleted by the happy path, or never created.
    }
    admin.close();
    // `game` is undefined if we failed before the app existed.
    game?.close();
  }
});
