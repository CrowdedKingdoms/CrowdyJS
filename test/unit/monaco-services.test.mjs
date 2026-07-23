import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  MonacoServicesBootstrap,
  MonacoWorkspacePool,
} from '../../dist/live-coding/monaco-services.js';

test('Monaco services initialize once across concurrent and repeated mounts', async () => {
  const bootstrap = new MonacoServicesBootstrap();
  let calls = 0;
  let finish;
  const initialized = new Promise((resolve) => {
    finish = resolve;
  });
  const initializer = async () => {
    calls++;
    await initialized;
  };

  const first = bootstrap.ensure(initializer);
  const concurrent = bootstrap.ensure(initializer);
  assert.equal(first, concurrent);
  await Promise.resolve();
  assert.equal(calls, 1);
  finish();
  await Promise.all([first, concurrent]);
  await bootstrap.ensure(async () => {
    calls++;
  });
  assert.equal(calls, 1, 'a repeated mount reuses ready global services');
});

test('failed Monaco initialization remains deterministic for fallback', async () => {
  const bootstrap = new MonacoServicesBootstrap();
  let calls = 0;
  const failure = new Error('setDefaultCodeBlockRenderer is not supported');
  await assert.rejects(
    bootstrap.ensure(async () => {
      calls++;
      throw failure;
    }),
    failure,
  );
  await assert.rejects(
    bootstrap.ensure(async () => {
      calls++;
    }),
    failure,
  );
  assert.equal(calls, 1);
});

test('concurrent Monaco mounts receive isolated model roots', () => {
  const pool = new MonacoWorkspacePool();
  const first = pool.acquire();
  const concurrent = pool.acquire();
  assert.equal(first.uri, 'file:///player-mod');
  assert.equal(concurrent.uri, 'file:///player-mod-2');
  first.release();
  first.release();
  const repeated = pool.acquire();
  assert.equal(repeated.uri, 'file:///player-mod');
  concurrent.release();
  repeated.release();
});

test('Mod Studio awaits package service initialization before Monaco', async () => {
  const [source, packageJson] = await Promise.all([
    readFile(
      new URL('../../src/mod-studio/monaco-editor.ts', import.meta.url),
      'utf8',
    ),
    readFile(new URL('../../package.json', import.meta.url), 'utf8'),
  ]);
  const initializeAt = source.indexOf('await ensureMonacoServicesInitialized()');
  const editorImportAt = source.indexOf(
    "import('@codingame/monaco-vscode-editor-api')",
    initializeAt,
  );
  assert.ok(initializeAt >= 0 && initializeAt < editorImportAt);
  assert.match(
    packageJson,
    /"@codingame\/monaco-vscode-api": "25\.1\.2"/u,
  );
});
