import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// The compute host catalog is authored in cks-game-api
// (compute-toolchain/host-catalog.json). The embedded copy is refreshed with
// `npm run host-catalog:drift -- --source <path> --write`; this script turns it
// into the module the browser broker imports.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = resolve(root, 'src/player-runtime/assets/host-catalog.json');
const destination = resolve(root, 'src/player-runtime/host-catalog.generated.ts');
const parsed = JSON.parse(await readFile(source, 'utf8'));
for (const fn of parsed.functions ?? []) {
  if (!Object.hasOwn(parsed.groups ?? {}, fn.group)) {
    throw new Error(`host catalog: ${fn.name} names unknown group '${fn.group}'`);
  }
}
const output = `// Generated from assets/host-catalog.json. Do not edit by hand.
export interface HostCatalogFunction {
  name: string;
  group: string;
  targets: ReadonlyArray<'server' | 'client'>;
  egress?: boolean;
  app: string;
  grid: string;
}

export interface HostCatalog {
  catalogVersion: number;
  description: string;
  groups: Readonly<Record<string, string>>;
  functions: ReadonlyArray<HostCatalogFunction>;
}

export const GENERATED_HOST_CATALOG: HostCatalog = ${JSON.stringify(parsed, null, 2)};
`;
if (process.argv.includes('--write')) {
  await writeFile(destination, output);
} else {
  const current = await readFile(destination, 'utf8').catch(() => '');
  if (current !== output) {
    throw new Error('Generated host catalog drifted; run npm run host-catalog:generate');
  }
}
