import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('v1 registry is immutable, complete, and uses exact wire lookup', async () => {
  const {
    CROWDY_AGENT_TOOL_REGISTRY_V1: registry,
    CROWDY_AGENT_TOOL_DESCRIPTORS_V1: descriptors,
  } = await import('../../dist/crowdy-agent/index.js');

  const names = registry.list().map((entry) => entry.descriptor.name);
  for (const required of [
    'studio.context.get',
    'project.create',
    'project.checkpoint.restore',
    'workspace.file.patch',
    'workspace.conflict.resolve',
    'library.personal.save',
    'library.common.read',
    'diagnostics.local.get',
    'runtime.test_draft',
    'runtime.deploy_live',
    'game.capabilities.get',
    'game.observe',
    'game.control.move',
    'game.inventory.transfer',
    'game.combat.attack',
    'game.travel.teleport',
  ]) {
    assert.ok(names.includes(required), `${required} must be registered`);
  }
  assert.equal(registry.list().length, descriptors.length);
  assert.match(registry.registryDigest, /^sha256:[0-9a-f]{64}$/);

  const patch = registry.require('workspace.file.patch', '1.0.0');
  assert.equal(
    registry.fromWireName('workspace_file_patch_v1'),
    patch,
  );
  assert.throws(
    () => registry.fromWireName('Workspace_file_patch_v1'),
    (error) => error.code === 'AGENT_TOOL_UNKNOWN',
  );
  assert.ok(Object.isFrozen(patch.descriptor));
  assert.ok(Object.isFrozen(patch.descriptor.inputSchema));
  assert.throws(() => {
    patch.descriptor.modes.push('ASK');
  }, TypeError);
});

test('strict schema validation rejects extras, oversized values, and unsafe numbers', async () => {
  const { CROWDY_AGENT_TOOL_REGISTRY_V1: registry } = await import(
    '../../dist/crowdy-agent/index.js'
  );
  const good = {
    expectedRevision: '7',
    changes: [{
      target: 'SERVER',
      path: 'src/lib.rs',
      content: 'pub fn tick() {}',
      expectedContentHash: `sha256:${'a'.repeat(64)}`,
    }],
  };
  registry.validateInput('workspace.file.patch', '1.0.0', good);
  assert.deepEqual(
    registry.requiredScopes('workspace.file.patch', '1.0.0', good),
    ['agent.use', 'studio.project.write.server'],
  );

  for (const bad of [
    { ...good, userId: 'forged-user' },
    {
      ...good,
      changes: [{ ...good.changes[0], content: 'x'.repeat(65_537) }],
    },
    {
      ...good,
      changes: [{ ...good.changes[0], target: 'ADMIN' }],
    },
  ]) {
    assert.throws(
      () => registry.validateInput('workspace.file.patch', '1.0.0', bad),
      (error) => error.code === 'AGENT_TOOL_INPUT_INVALID',
    );
  }
  assert.throws(
    () =>
      registry.validateInput('game.control.move', '1.0.0', {
        observationId: 'obs',
        capabilityRevision: 'cap',
        controlledEntityId: 'entity',
        direction: 'FORWARD',
        intensity: Number.NaN,
        durationMs: 100,
      }),
    (error) => error.code === 'AGENT_TOOL_INPUT_INVALID',
  );
});

test('registry rejects caller authority and forbidden arbitrary surfaces', async () => {
  const {
    CrowdyAgentToolRegistry,
    CROWDY_AGENT_TOOL_REGISTRY_V1: registry,
    CrowdyAgentError,
  } = await import('../../dist/crowdy-agent/index.js');
  const { CrowdyError } = await import('../../dist/index.js');
  assert.ok(
    new CrowdyAgentError('AGENT_TOOL_UNKNOWN', 'unknown') instanceof CrowdyError,
  );

  const base = structuredClone(
    registry.require('studio.state.get', '1.0.0').descriptor,
  );
  base.name = 'studio.forged';
  base.wireName = 'studio_forged_v1';
  base.inputSchema = {
    type: 'object',
    additionalProperties: false,
    required: ['clientEpoch'],
    maxProperties: 1,
    properties: {
      clientEpoch: { type: 'string', minLength: 1, maxLength: 40 },
    },
  };
  assert.throws(
    () => new CrowdyAgentToolRegistry([base]),
    (error) => error.code === 'AGENT_TOOL_DESCRIPTOR_INVALID',
  );

  base.name = 'studio.raw_graphql';
  base.wireName = 'studio_raw_graphql_v1';
  base.inputSchema = {
    type: 'object',
    additionalProperties: false,
    required: [],
    maxProperties: 0,
    properties: {},
  };
  assert.throws(
    () => new CrowdyAgentToolRegistry([base]),
    (error) =>
      error.code === 'AGENT_TOOL_DESCRIPTOR_INVALID' &&
      /forbidden surface/.test(error.message),
  );
});

test('canonical digest implementation matches the SHA-256 known vector', async () => {
  const { sha256Digest, canonicalJson } = await import(
    '../../dist/crowdy-agent/index.js'
  );
  assert.equal(
    sha256Digest('abc'),
    'sha256:ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
  );
  assert.equal(canonicalJson({ z: 1, a: [true, 'x'] }), '{"a":[true,"x"],"z":1}');
});

test('canonical Game API fixture matches all 8 Studio and 14 game descriptors', async () => {
  const {
    CROWDY_AGENT_TOOL_REGISTRY_V1: registry,
    CrowdyAgentToolRegistry,
  } = await import('../../dist/crowdy-agent/index.js');
  const fixture = JSON.parse(
    await readFile(
      new URL(
        '../../src/crowdy-agent/fixtures/crowdyjs-descriptor-digests.v1.json',
        import.meta.url,
      ),
      'utf8',
    ),
  );
  const entries = Object.entries(fixture.descriptorDigests).map(
    ([key, digest]) => {
      const separator = key.lastIndexOf('@');
      const entry = registry.require(
        key.slice(0, separator),
        key.slice(separator + 1),
      );
      assert.equal(entry.descriptorDigest, digest, key);
      return entry;
    },
  );
  assert.equal(entries.length, 22);
  assert.equal(
    entries.filter((entry) => entry.descriptor.name.startsWith('game.')).length,
    14,
  );
  assert.equal(
    new CrowdyAgentToolRegistry(
      entries.map((entry) => entry.descriptor),
    ).registryDigest,
    fixture.gameApiSubsetRegistryDigest,
  );
  assert.equal(registry.registryDigest, fixture.crowdyJsFullRegistryDigest);
});
