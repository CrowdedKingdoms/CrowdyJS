import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatRuntimeFailureDisplay,
  formatRuntimeFailureForAgentChat,
  parseRuntimeFailureFromExtensions,
} from '../../dist/crowdy-studio/runtime-failure.js';

test('parseRuntimeFailureFromExtensions reads GraphQL extensions shape', () => {
  const failure = parseRuntimeFailureFromExtensions({
    code: 'WATCHDOG_TERMINATED',
    remediation: 'Place voxels in an owned chunk',
    runtimeFailure: {
      code: 'WATCHDOG_TERMINATED',
      summary: 'WATCHDOG_TERMINATED: Module invoke killed after host failures',
      cause: {
        hostCall: 'voxel_set',
        kind: 'out_of_grid',
        message: 'Chunk (-8,1,17) is outside the owned grid',
        detail: { chunkX: -8, chunkY: 1, chunkZ: 17 },
      },
      remediation: 'Place voxels in an owned chunk',
      hintClass: 'GRID_BOUNDS',
    },
  });
  assert.equal(failure?.code, 'WATCHDOG_TERMINATED');
  assert.equal(failure?.cause?.hostCall, 'voxel_set');
  assert.equal(failure?.cause?.kind, 'out_of_grid');
  assert.equal(failure?.hintClass, 'GRID_BOUNDS');
});

test('formatRuntimeFailureDisplay shows cause and hint', () => {
  const text = formatRuntimeFailureDisplay({
    code: 'WATCHDOG_TERMINATED',
    summary: 'WATCHDOG_TERMINATED: Module invoke killed after host failures',
    cause: {
      hostCall: 'voxel_set',
      kind: 'out_of_grid',
      detail: { chunkX: -8, chunkY: 1, chunkZ: 17 },
    },
    remediation: 'Place voxels in an owned chunk\n\nAPI_DOC · voxel_set\n…',
  });
  assert.match(text, /WATCHDOG_TERMINATED/);
  assert.match(text, /Cause: voxel_set → out_of_grid \(chunk -8,1,17\)/);
  assert.match(text, /Hint: Place voxels in an owned chunk/);
});

test('formatRuntimeFailureForAgentChat seeds a structured invoke-failure prompt', () => {
  const source = [
    'use crowdy::api::voxel_set;',
    '',
    'fn on_invoke(_params: Value) -> Result<Value, HostError> {',
    '  generate_house()?;',
    '  Ok(Value::Null)',
    '}',
    '',
    'fn generate_house() -> Result<(), HostError> {',
    '  let _ = voxel_set((-8, 1, 17), (0, 0, 0), 1, None);',
    '  Ok(())',
    '}',
  ].join('\n');
  const text = formatRuntimeFailureForAgentChat(
    {
      code: 'WATCHDOG_TERMINATED',
      summary: 'WATCHDOG_TERMINATED: Module invoke killed after host failures',
      cause: {
        hostCall: 'voxel_set',
        kind: 'out_of_grid',
        detail: { chunkX: -8, chunkY: 1, chunkZ: 17 },
      },
      hintClass: 'GRID_BOUNDS',
      remediation:
        'Place voxels in an owned chunk\n\nAPI_DOC · voxel_set\nSignature: crowdy::api::voxel_set',
    },
    {
      exportName: 'invoke',
      serverSource: source,
      projectRevision: '42',
    },
  );
  assert.match(text, /Fix ONLY this Crowdy Studio runtime\/invoke failure/);
  assert.match(text, /Code: WATCHDOG_TERMINATED/);
  assert.match(text, /Export: invoke/);
  assert.match(text, /hostCall=voxel_set kind=out_of_grid/);
  assert.match(text, /API_DOC · voxel_set/);
  assert.match(text, /BEGIN_BLOCK path=SERVER\/src\/lib\.rs/);
  assert.match(text, /END_BLOCK/);
  assert.match(text, /Test draft/);
  assert.match(text, /Project revision \(for test_draft\): 42/);
});
