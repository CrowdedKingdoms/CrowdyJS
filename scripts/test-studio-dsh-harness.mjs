#!/usr/bin/env node
/**
 * Isolated Crowdy Studio Harness regression loop.
 * Mocks DSH / Game API at the boundary; no live host required.
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const gameApi = resolve(
  root,
  '..',
  'cks-game-api-ben-studio-dsh-test',
);
const rounds = Number(process.env.HARNESS_TEST_ROUNDS ?? 2);

function run(cmd, args, cwd) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(cmd, args, { cwd, stdio: 'inherit' });
    child.on('exit', (code) => {
      if (code === 0) resolvePromise(undefined);
      else reject(new Error(`${cmd} ${args.join(' ')} exited ${code}`));
    });
  });
}

const crowdyTests = [
  'test/unit/crowdy-studio-dsh-ask-user-question.test.mjs',
  'test/unit/crowdy-studio-dsh-controller.test.mjs',
  'test/unit/crowdy-studio-dsh-harness-loop.test.mjs',
  'test/unit/crowdy-studio-dsh-pin-answers.test.mjs',
  'test/e2e/crowdy-studio-dsh-dock-questions.test.mjs',
];

console.log(`Building CrowdyJS (Harness isolation)…`);
await run('npx', ['tsc', '--pretty', 'false'], root);

for (let round = 1; round <= rounds; round += 1) {
  console.log(`\n=== Harness loop ${round}/${rounds} ===`);
  await run('node', ['--test', ...crowdyTests], root);
  await run(
    'npx',
    ['jest', 'src/crowdy-studio-dsh/dsh-question-respond.spec.ts', '--runInBand'],
    gameApi,
  );
}

console.log(`\nHarness isolation loop passed (${rounds} rounds).`);
