// Runs as the npm `version` lifecycle hook: keeps the VERSION constant in
// src/index.ts in lockstep with package.json so `npm version patch|minor|major`
// can never publish a package whose exported VERSION is stale.
import { readFile, writeFile } from 'node:fs/promises';

const pkg = JSON.parse(
  await readFile(new URL('../package.json', import.meta.url), 'utf8'),
);

const indexUrl = new URL('../src/index.ts', import.meta.url);
const source = await readFile(indexUrl, 'utf8');

const pattern = /^export const VERSION = '[^']*';$/m;
if (!pattern.test(source)) {
  console.error('sync-version: VERSION constant not found in src/index.ts');
  process.exit(1);
}

const updated = source.replace(
  pattern,
  `export const VERSION = '${pkg.version}';`,
);
if (updated !== source) {
  await writeFile(indexUrl, updated);
}
console.log(`sync-version: src/index.ts VERSION = '${pkg.version}'`);
