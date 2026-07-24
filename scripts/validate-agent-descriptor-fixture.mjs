import { readFile } from 'node:fs/promises';

const fixtureUrl = new URL(
  '../src/crowdy-agent/fixtures/crowdyjs-descriptor-digests.v1.json',
  import.meta.url,
);
const fixture = JSON.parse(await readFile(fixtureUrl, 'utf8'));
const {
  CROWDY_AGENT_TOOL_REGISTRY_V1,
  CrowdyAgentToolRegistry,
} = await import('../dist/crowdy-agent/index.js');

assertEqual(
  'contractVersion',
  fixture.contractVersion,
  CROWDY_AGENT_TOOL_REGISTRY_V1.contractVersion,
);
assertEqual(
  'crowdyJsFullRegistryDigest',
  fixture.crowdyJsFullRegistryDigest,
  CROWDY_AGENT_TOOL_REGISTRY_V1.registryDigest,
);

const subsetDescriptors = [];
for (const [key, expectedDigest] of Object.entries(
  fixture.descriptorDigests,
).sort(([left], [right]) => left.localeCompare(right))) {
  const separator = key.lastIndexOf('@');
  if (separator < 1) throw new Error(`Invalid descriptor fixture key: ${key}`);
  const name = key.slice(0, separator);
  const version = key.slice(separator + 1);
  const entry = CROWDY_AGENT_TOOL_REGISTRY_V1.require(name, version);
  assertEqual(`${key} descriptorDigest`, expectedDigest, entry.descriptorDigest);
  subsetDescriptors.push(entry.descriptor);
}

const subset = new CrowdyAgentToolRegistry(subsetDescriptors);
assertEqual(
  'gameApiSubsetRegistryDigest',
  fixture.gameApiSubsetRegistryDigest,
  subset.registryDigest,
);
console.log(
  `agent-descriptor-fixture: ${subsetDescriptors.length} Game API descriptors and full registry match`,
);

function assertEqual(field, expected, actual) {
  if (expected !== actual) {
    throw new Error(
      `Agent descriptor fixture drift at ${field}: expected ${expected}, got ${actual}. Regenerate only from the coordinated Game API fixture.`,
    );
  }
}
