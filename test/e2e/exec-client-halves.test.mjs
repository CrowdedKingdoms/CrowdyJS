/**
 * ck-exec CLIENT halves e2e: the owner of a grid builds a mod from the mod starter and a CLIENT
 * half from Crowdy Studio's crowdy-client-sdk starter, attaches it, finds it served on the grid,
 * consents to it (a stale hash is CONFLICT), fetches it when the API serves it to them, detaches
 * it, and deletes the mod.
 *
 * Needs an app on ck-exec and a grid in it that the owner owns, with SERVER and CLIENT code
 * permissions there and nothing awaiting admission:
 *
 *   CROWDY_HTTP_URL=https://ck.dev.crowdedkingdoms.com \
 *   CROWDY_OWNER_EMAIL=... CROWDY_OWNER_PASSWORD=... \
 *   CROWDY_TEST_APP_ID=<app> CROWDY_EXEC_MOD_GRID_ID=<grid the owner owns> \
 *   npm run test:e2e
 *
 * Skips without them, and skips with a reason when the API does not serve CLIENT halves yet
 * (a ck-api before execGridClientMods). The artifact is served only to a player standing in
 * the grid now; this suite has no actor there, so it accepts NOT_FOUND for the fetch and checks
 * the bytes against the digest when the API does serve them.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { gameClientConfig, skipReasonFor } from '../helpers.mjs';
import { appId as testAppId, mintAppAccess, provisionOwner } from '../provision.mjs';

const ENV = [
  'CROWDY_HTTP_URL',
  'CROWDY_OWNER_EMAIL',
  'CROWDY_OWNER_PASSWORD',
  'CROWDY_TEST_APP_ID',
  'CROWDY_EXEC_MOD_GRID_ID',
];
const skip = skipReasonFor(ENV);

/** An API older than the SDK: the documents name fields it does not have. */
function unserved(error) {
  const text = `${error?.message ?? ''} ${error?.body ?? ''}`;
  return /Cannot query field|GRAPHQL_VALIDATION_FAILED|Unknown type/.test(text);
}

const codeOf = (error) => error?.code;

test('CLIENT halves: build, attach, list, consent, fetch, detach', { skip, timeout: 900_000 }, async (t) => {
  const { createCrowdyClient, createCrowdyStudioStarterProject, CrowdyGraphQLError } = await import(
    '../../dist/index.js'
  );
  const appId = testAppId();
  const gridId = process.env.CROWDY_EXEC_MOD_GRID_ID;
  const owner = await provisionOwner();
  const access = await mintAppAccess(appId, owner.token);
  const game = createCrowdyClient(gameClientConfig(access));
  game.setToken(access.token);
  const { exec } = game;
  const name = `e2e-hud-${randomBytes(3).toString('hex')}`;
  let deployed = false;
  try {
    try {
      await exec.gridClientMods(appId, gridId);
    } catch (error) {
      if (unserved(error)) {
        t.skip('the API does not serve CLIENT halves yet (no execGridClientMods)');
        return;
      }
      throw error;
    }

    // The mod the CLIENT half rides: the mod starter, switched on.
    const starter = await exec.modStarter(appId);
    const serverBuild = await exec.waitForModBuild(
      appId,
      (await exec.modBuild(appId, { name, files: starter.files })).buildId,
    );
    assert.equal(serverBuild.status, 'succeeded', serverBuild.log ?? '');
    assert.equal(serverBuild.kind, 'exec');
    await exec.modDeploy(appId, gridId, name, serverBuild.buildId);
    deployed = true;
    const mod = await exec.modSetEnabled(appId, gridId, name, true);
    if (mod.blocked) {
      t.skip(`mod ${name} is held (${mod.blocked}); nothing of it is served`);
      return;
    }

    // Studio's CLIENT starter, built as a CLIENT half.
    const starterProject = createCrowdyStudioStarterProject({
      appId, gridId, name: 'e2e hud', kind: 'CLIENT',
    });
    const queued = await exec.modClientBuild(appId, {
      name: `${name}-client`,
      files: starterProject.files.map(({ path, content }) => ({ path, content })),
    });
    assert.equal(queued.kind, 'client');
    const built = await exec.waitForModBuild(appId, queued.buildId);
    assert.equal(built.status, 'succeeded', built.log ?? '');
    const [artifact] = built.artifacts;
    assert.equal(artifact.tickIntervalMs, 1000);
    assert.match(artifact.capabilityHash, /^[0-9a-f]{64}$/);
    assert.ok(artifact.capabilitySummary.hostFunctions.includes('hud_set'), artifact.capabilitySummaryJson);
    assert.deepEqual(
      artifact.capabilitySummary.imports.filter((i) => !i.startsWith('ck.') && i !== 'wasi_snapshot_preview1.random_get'),
      [],
      'a CLIENT half imports only the CLIENT ABI',
    );

    let attached;
    try {
      attached = await exec.modClientDeploy(appId, gridId, name, built.buildId);
    } catch (error) {
      if (codeOf(error) === 'FORBIDDEN' && /admission/.test(error.message)) {
        t.skip(`the app's code admission holds the CLIENT half: ${error.message}`);
        return;
      }
      throw error;
    }
    assert.equal(attached.name, name);
    assert.equal(attached.clientVersion, 1);
    assert.equal(attached.digest, artifact.digest);
    assert.equal(attached.capabilityHash, artifact.capabilityHash);

    const listed = (await exec.gridClientMods(appId, gridId)).find((m) => m.modId === attached.modId);
    assert.ok(listed, 'the grid serves the CLIENT half of a switched-on mod');
    assert.equal(listed.digest, attached.digest);
    assert.equal(listed.callerConsented, false, 'the author consents afresh too');
    assert.equal(listed.authorId, attached.ownerId);
    assert.deepEqual(listed.capabilitySummary, artifact.capabilitySummary);

    await assert.rejects(
      exec.consentClientMod(appId, attached.modId, '0'.repeat(64)),
      (e) => e instanceof CrowdyGraphQLError && e.code === 'CONFLICT',
    );
    assert.equal(await exec.consentClientMod(appId, attached.modId, attached.capabilityHash), true);
    const consented = (await exec.gridClientMods(appId, gridId)).find((m) => m.modId === attached.modId);
    assert.equal(consented.callerConsented, true);

    try {
      const bytes = await exec.modClientArtifactBytes(appId, attached.modId);
      assert.equal(bytes.digest, attached.digest);
      assert.equal(bytes.bytes.byteLength, attached.sizeBytes);
      assert.ok(bytes.fuelPerDispatch > 0n);
    } catch (error) {
      // Served only to a player standing in the grid now; this suite has no actor there.
      assert.equal(codeOf(error), 'NOT_FOUND', String(error));
    }

    assert.equal(await exec.modClientDelete(appId, gridId, name), true);
    assert.equal(
      (await exec.gridClientMods(appId, gridId)).some((m) => m.modId === attached.modId),
      false,
      'a detached CLIENT half is no longer served',
    );
  } finally {
    if (deployed) await exec.modDelete(appId, gridId, name).catch(() => {});
    game.close();
  }
});
