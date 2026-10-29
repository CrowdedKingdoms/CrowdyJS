import assert from 'node:assert/strict';
import { test } from 'node:test';

const { assertPlaybookPage } = await import('../../dist/crowdy-dsh/game-paths.js');
const { isRepoPath, isRepoDir, normalizeRepoPath, isLikelyBinaryPath } = await import(
  '../../dist/crowdy-studio/draft/paths.js'
);

test('the game editor lists and writes the repository and refuses secrets, dependencies and workflows', () => {
  assert.equal(isRepoPath('src/main.ts'), true);
  assert.equal(isRepoPath('src/scenes/pool/PoolScene.ts'), true);
  assert.equal(isRepoPath('model/catalog.mjs'), true);
  assert.equal(isRepoPath('exec/construct/src/lib.rs'), true);
  assert.equal(isRepoPath('.git/config'), false);
  assert.equal(isRepoPath('src/.git/HEAD'), false);
  assert.equal(isRepoPath('node_modules/left-pad/index.js'), false);
  assert.equal(isRepoPath('.env'), false);
  assert.equal(isRepoPath('config/.env.local'), false);
  assert.equal(isRepoPath('.github/workflows/ci.yml'), false);
  assert.equal(isRepoPath('../secrets'), false);
  assert.equal(isRepoPath('/etc/passwd'), false);
  assert.equal(isRepoPath('src//main.ts'), false);
  assert.equal(isRepoDir(''), true);
  assert.equal(normalizeRepoPath('./src//scenes/./a.ts'), 'src/scenes/a.ts');
  assert.equal(normalizeRepoPath('src/../x.ts'), null);
  assert.equal(isLikelyBinaryPath('public/logo.png'), true);
  assert.equal(isLikelyBinaryPath('src/main.ts'), false);
});

test('playbook pages stay under the shipped markdown', () => {
  assert.equal(assertPlaybookPage('playbook/authoring-loop.md'), 'playbook/authoring-loop.md');
  assert.equal(assertPlaybookPage('/skills/dock-scene/SKILL.md'), 'skills/dock-scene/SKILL.md');
  assert.throws(() => assertPlaybookPage('../README.md'));
  assert.throws(() => assertPlaybookPage('https://example.com/a.md'));
  assert.throws(() => assertPlaybookPage('playbook/notes.txt'));
});
