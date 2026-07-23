import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateIndexBytes } from './browser-authoring-index-lib.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const embedded = resolve(
  root,
  'src/live-coding/assets/browser-authoring-index.json',
);
const embeddedBytes = await readFile(embedded);
validateIndexBytes(embeddedBytes, 'Embedded browser authoring index');
