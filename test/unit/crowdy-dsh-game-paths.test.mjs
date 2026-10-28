import assert from 'node:assert/strict';
import { test } from 'node:test';

const { isWritableGamePath, isRepoPath, assertPlaybookPage } = await import('../../dist/crowdy-dsh/game-paths.js');

test('game writes are scenes, the catalog, and the world hub', () => {
  assert.equal(isWritableGamePath('src/scenes/holodeck.mjs'), true);
  assert.equal(isWritableGamePath('model/catalog.mjs'), true);
  assert.equal(isWritableGamePath('exec/construct'), true);
  assert.equal(isWritableGamePath('exec/construct/lib.rs'), true);
  assert.equal(isWritableGamePath('src/main.rs'), false);
  assert.equal(isWritableGamePath('../secrets.env'), false);
  assert.equal(isWritableGamePath('/etc/passwd'), false);
});

test('the repository listing accepts the copied game and refuses secrets', () => {
  assert.equal(isRepoPath('src/main.ts'), true);
  assert.equal(isRepoPath('src/scenes/pool.mjs'), true);
  assert.equal(isRepoPath('src/game/programs.ts'), true);
  assert.equal(isRepoPath('.git/config'), false);
  assert.equal(isRepoPath('node_modules/left-pad/index.js'), false);
  assert.equal(isRepoPath('.env'), false);
});

test('playbook pages stay under the shipped markdown', () => {
  assert.equal(assertPlaybookPage('playbook/authoring-loop.md'), 'playbook/authoring-loop.md');
  assert.equal(assertPlaybookPage('/skills/mmo-scene/SKILL.md'), 'skills/mmo-scene/SKILL.md');
  assert.throws(() => assertPlaybookPage('../README.md'));
  assert.throws(() => assertPlaybookPage('https://example.com/a.md'));
  assert.throws(() => assertPlaybookPage('playbook/notes.txt'));
});
