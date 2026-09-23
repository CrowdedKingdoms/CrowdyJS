import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const embedded = resolve(root, 'src/player-runtime/assets/host-catalog.json');
const write = process.argv.includes('--write');
const position = process.argv.indexOf('--source');
const sourceArgument = position < 0 ? null : process.argv[position + 1];
if (!sourceArgument || sourceArgument.startsWith('--')) {
  throw new Error(
    'Usage: npm run host-catalog:drift -- --source <cks-game-api/compute-toolchain/host-catalog.json> [--write]',
  );
}
const source = resolve(process.cwd(), sourceArgument);
const [sourceBytes, embeddedBytes] = await Promise.all([
  readFile(source),
  readFile(embedded),
]);
JSON.parse(sourceBytes.toString('utf8'));
if (write) {
  await writeFile(embedded, sourceBytes);
} else if (!embeddedBytes.equals(sourceBytes)) {
  throw new Error(`Embedded host catalog drifted from supplied source: ${source}`);
}
