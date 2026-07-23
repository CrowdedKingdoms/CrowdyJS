import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateIndexBytes } from './browser-authoring-index-lib.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const embedded = resolve(
  root,
  'src/live-coding/assets/browser-authoring-index.json',
);
const write = process.argv.includes('--write');
const sourceArgument = argumentValue('--source');
if (!sourceArgument) {
  throw new Error(
    'Usage: npm run authoring-index:drift -- --source <browser-authoring-index.json> [--write]',
  );
}
const source = resolve(process.cwd(), sourceArgument);
const [sourceBytes, embeddedBytes] = await Promise.all([
  readFile(source),
  readFile(embedded),
]);
validateIndexBytes(sourceBytes, 'Source browser authoring index');
validateIndexBytes(embeddedBytes, 'Embedded browser authoring index');

if (write) {
  await writeFile(embedded, sourceBytes);
} else if (!embeddedBytes.equals(sourceBytes)) {
  throw new Error(
    `Embedded browser authoring index drifted from supplied source: ${source}`,
  );
}

function argumentValue(name) {
  const position = process.argv.indexOf(name);
  if (position < 0) return null;
  const value = process.argv[position + 1];
  return value && !value.startsWith('--') ? value : null;
}
