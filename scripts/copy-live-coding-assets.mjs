import { copyFile, mkdir, rm, stat, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const destination = resolve(root, 'dist/live-coding/assets');
await rm(destination, { recursive: true, force: true });
await mkdir(destination, { recursive: true });

const assets = [
  {
    name: 'web-tree-sitter.wasm',
    source: require.resolve('web-tree-sitter/web-tree-sitter.wasm'),
    provenance: 'web-tree-sitter@0.26.11',
  },
  {
    name: 'tree-sitter-rust.wasm',
    source: require.resolve(
      '@vscode/tree-sitter-wasm/wasm/tree-sitter-rust.wasm',
    ),
    provenance:
      '@vscode/tree-sitter-wasm@0.3.1 (VS Code generated Rust grammar)',
  },
  {
    name: 'browser-authoring-index.json',
    source: resolve(
      root,
      'src/live-coding/assets/browser-authoring-index.json',
    ),
    provenance: 'cks-game-api generated browser authoring index',
  },
];

const manifest = [];
for (const asset of assets) {
  const target = resolve(destination, asset.name);
  await copyFile(asset.source, target);
  const info = await stat(target);
  manifest.push({
    name: asset.name,
    bytes: info.size,
    provenance: asset.provenance,
  });
}
await writeFile(
  resolve(destination, 'manifest.json'),
  `${JSON.stringify({ assets: manifest }, null, 2)}\n`,
);
