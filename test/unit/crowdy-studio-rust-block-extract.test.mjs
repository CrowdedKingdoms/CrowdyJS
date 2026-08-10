import test from 'node:test';
import assert from 'node:assert/strict';
import { extractEnclosingRustBlock } from '../../dist/crowdy-studio/rust-block-extract.js';

test('extractEnclosingRustBlock finds nearest brace body', () => {
  const source = [
    'fn place() {',
    '  for h in 0..3 {',
    '    api::voxel_set((1,2,3), (0,0,0), 1, None);',
    '  }',
    '}',
  ].join('\n');
  const block = extractEnclosingRustBlock(source, 3, 10);
  assert.ok(block);
  assert.equal(block.kind, 'brace');
  assert.match(block.text, /^\{/);
  assert.match(block.text, /voxel_set/);
  assert.ok(block.spanEnd > block.spanStart);
});

test('extractEnclosingRustBlock falls back to context window', () => {
  const source = 'let x = 1;\nlet y = 2;\nlet z = 3;\n';
  const block = extractEnclosingRustBlock(source, 2, 1);
  assert.ok(block);
  assert.equal(block.kind, 'context');
  assert.match(block.text, /let y = 2/);
});
