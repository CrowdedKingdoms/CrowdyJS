/**
 * Compute Modules e2e: an org owner drives the full `client.compute` surface
 * against a live stack — create a module, deploy the starter Rust source,
 * wait for the on-instance compile, bind tick + invoke triggers, enable,
 * synchronously invoke an export, read the monitoring surface, and delete.
 *
 * Needs management + game-api HTTP (no realtime/WS). The test app is created
 * fresh and published to the shared environment; the module is `alwaysOn`
 * because a playerless test app never activates lazily. Auto-skips unless the
 * compute e2e env is configured.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadSdk, clientConfig, skipReasonFor } from '../helpers.mjs';
import { provisionOwner, mintAppToken } from '../provision.mjs';

const COMPUTE_E2E_ENV = [
  'CROWDY_MANAGEMENT_URL',
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
  const admin = createCrowdyClient(clientConfig());
  const game = createCrowdyClient(clientConfig());
  try {
    // Fresh org + shared app; the creating owner's Owner role carries
    // manage_compute + view_compute_diagnostics.
    const owner = await provisionOwner();
    admin.setToken(owner.token);
    const slug = `e2e-compute-${rid()}`;
    const org = await admin.organizations.create({ name: slug, slug });
    const app = await admin.apps.create({ orgId: org.orgId, name: slug, slug });
    await admin.sharedEnvironment.publishApp(app.appId);

    // Game-api calls ride an APP-scoped token.
    game.setToken(await mintAppToken(app.appId, owner.token));

    const moduleName = 'e2e-counter';
    const appId = app.appId;

    // Author: new modules start disabled; alwaysOn so it runs without players.
    const mod = await game.compute.upsertModule({
      appId, name: moduleName, description: 'e2e counter', alwaysOn: true,
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

    const stats = await game.compute.moduleStats({ appId });
    assert.ok(stats.totalRuns >= 1, 'stats count the runs');
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
    admin.close();
    game.close();
  }
});
