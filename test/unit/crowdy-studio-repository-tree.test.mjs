import assert from 'node:assert/strict';
import { test } from 'node:test';

const { repositoryTree } = await import('../../dist/crowdy-studio/repository-tree.js');

test('the repository tree lists directories before files', () => {
  const tree = repositoryTree(
    ['src', 'src/scenes', 'src/game'],
    ['package.json', 'src/main.ts', 'src/scenes/pool.mjs', 'src/game/programs.ts'],
  );
  assert.deepEqual(
    tree.children.map((node) => node.name),
    ['src', 'package.json'],
  );
  const src = tree.children[0];
  assert.equal(src.type, 'directory');
  assert.deepEqual(
    src.children.map((node) => node.path),
    ['src/game', 'src/scenes', 'src/main.ts'],
  );
  const scenes = src.children.find((node) => node.name === 'scenes');
  assert.equal(scenes.children[0].path, 'src/scenes/pool.mjs');
});
