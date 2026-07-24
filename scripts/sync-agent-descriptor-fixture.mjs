import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const args = process.argv.slice(2);
const sourceIndex = args.indexOf('--source');
const source =
  sourceIndex >= 0 ? args[sourceIndex + 1] : undefined;
const write = args.includes('--write');
if (!source) {
  throw new Error(
    'Usage: node scripts/sync-agent-descriptor-fixture.mjs --source <game-api fixture> [--write]',
  );
}

const destination = resolve(
  'src/crowdy-agent/fixtures/crowdyjs-descriptor-digests.v1.json',
);
const sourceText = await readFile(resolve(source), 'utf8');
JSON.parse(sourceText);
if (write) {
  await writeFile(destination, sourceText);
  console.log(`agent-descriptor-fixture: copied ${source} -> ${destination}`);
} else {
  const destinationText = await readFile(destination, 'utf8');
  if (destinationText !== sourceText) {
    throw new Error(
      'Agent descriptor fixture drifted from the explicitly supplied Game API source.',
    );
  }
  console.log('agent-descriptor-fixture: explicit Game API source matches');
}
