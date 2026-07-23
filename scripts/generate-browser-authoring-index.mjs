import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = resolve(
  root,
  'src/live-coding/assets/browser-authoring-index.json',
);
const destination = resolve(
  root,
  'src/live-coding/browser-authoring-index.generated.ts',
);
const parsed = JSON.parse(await readFile(source, 'utf8'));
const output = `// Generated from assets/browser-authoring-index.json. Do not edit by hand.
export const GENERATED_BROWSER_AUTHORING_INDEX: unknown = ${JSON.stringify(parsed, null, 2)};
`;
if (process.argv.includes('--write')) {
  await writeFile(destination, output);
} else {
  const current = await readFile(destination, 'utf8').catch(() => '');
  if (current !== output) {
    throw new Error(
      'Generated platform index drifted; run npm run authoring-index:generate',
    );
  }
}
