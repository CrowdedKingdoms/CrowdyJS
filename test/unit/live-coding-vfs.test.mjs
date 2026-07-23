import test from 'node:test';
import assert from 'node:assert/strict';
import {
  VfsLimitError,
  VirtualFileSystem,
} from '../../dist/live-coding/vfs.js';
import {
  modStudioFileUri,
} from '../../dist/mod-studio/models.js';

const uri = (path) => `file:///player-mod/${path}`;
const item = (path, version, text) => ({
  uri: uri(path),
  languageId: 'rust',
  version,
  text,
});

test('VFS enforces file count, per-file bytes, and workspace bytes', () => {
  const vfs = new VirtualFileSystem('file:///player-mod', {
    maxFiles: 2,
    maxFileBytes: 10,
    maxWorkspaceBytes: 12,
  });
  vfs.open(item('a.rs', 1, '1234'));
  vfs.open(item('b.rs', 1, '5678'));
  assert.throws(() => vfs.open(item('c.rs', 1, 'x')), VfsLimitError);
  assert.throws(() => vfs.open(item('b.rs', 2, '12345678901')), VfsLimitError);
  assert.equal(vfs.require(uri('b.rs')).text, '5678', 'failed writes are atomic');
  assert.throws(() => vfs.open(item('b.rs', 2, '123456789')), VfsLimitError);
  assert.equal(vfs.bytes, 8);
});

test('VFS ignores stale versions and applies UTF-16 incremental changes', () => {
  const vfs = new VirtualFileSystem();
  vfs.open(item('src/lib.rs', 3, 'fn café() {}\n'));
  const stale = vfs.change(uri('src/lib.rs'), 2, [{ text: 'stale' }]);
  assert.equal(stale.applied, false);
  assert.equal(stale.document.version, 3);
  const changed = vfs.change(uri('src/lib.rs'), 4, [
    {
      range: {
        start: { line: 0, character: 3 },
        end: { line: 0, character: 7 },
      },
      text: 'main',
    },
  ]);
  assert.equal(changed.applied, true);
  assert.equal(changed.document.text, 'fn main() {}\n');
});

test('VFS rejects traversal and closes documents deterministically', () => {
  const vfs = new VirtualFileSystem();
  assert.throws(
    () => vfs.open(item('../secret.rs', 1, 'fn bad() {}')),
    /outside|Unsafe/u,
  );
  assert.throws(
    () =>
      vfs.open({
        ...item('x.rs', 1, ''),
        uri: 'https://example.test/x.rs',
      }),
    /outside/u,
  );
  vfs.open(item('ok.rs', 1, 'fn ok() {}'));
  assert.equal(vfs.close(uri('ok.rs')), true);
  assert.equal(vfs.close(uri('ok.rs')), false);
  assert.equal(vfs.bytes, 0);
});

test('target-prefixed VFS loads duplicate Cargo and lib paths concurrently', () => {
  const vfs = new VirtualFileSystem();
  const serverCargo = modStudioFileUri(
    'file:///player-mod',
    'SERVER',
    'Cargo.toml',
  );
  const clientCargo = modStudioFileUri(
    'file:///player-mod',
    'CLIENT',
    'Cargo.toml',
  );
  const serverLib = modStudioFileUri(
    'file:///player-mod',
    'SERVER',
    'src/lib.rs',
  );
  const clientLib = modStudioFileUri(
    'file:///player-mod',
    'CLIENT',
    'src/lib.rs',
  );
  for (const [fileUri, text] of [
    [serverCargo, 'server cargo'],
    [clientCargo, 'client cargo'],
    [serverLib, 'fn server() {}'],
    [clientLib, 'fn client() {}'],
  ]) {
    vfs.open({ uri: fileUri, languageId: 'rust', version: 1, text });
  }
  assert.equal(vfs.require(serverCargo).path, 'server/Cargo.toml');
  assert.equal(vfs.require(clientCargo).path, 'client/Cargo.toml');
  assert.equal(vfs.require(serverLib).text, 'fn server() {}');
  assert.equal(vfs.require(clientLib).text, 'fn client() {}');
});
