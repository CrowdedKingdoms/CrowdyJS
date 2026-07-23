import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRustcDiagnostics } from '../../dist/crowdy-studio/diagnostics.js';

test('rustc human output becomes authoritative target/path diagnostics', () => {
  const output = [
    'error[E0425]: cannot find value `missing` in this scope',
    '  --> /build/server/src/lib.rs:12:9',
    'warning: unused variable: `dt`',
    '  --> src/tick.rs:4:17',
    'src/direct.rs:8:3: error[E0308]: mismatched types',
  ].join('\n');
  const diagnostics = parseRustcDiagnostics(output, 'CLIENT');

  assert.deepEqual(
    diagnostics.map((item) => ({
      target: item.target,
      path: item.path,
      line: item.line,
      column: item.column,
      severity: item.severity,
      code: item.code,
      source: item.source,
    })),
    [
      {
        target: 'SERVER',
        path: 'src/lib.rs',
        line: 12,
        column: 9,
        severity: 'error',
        code: 'E0425',
        source: 'rustc',
      },
      {
        target: 'CLIENT',
        path: 'src/tick.rs',
        line: 4,
        column: 17,
        severity: 'warning',
        code: undefined,
        source: 'rustc',
      },
      {
        target: 'CLIENT',
        path: 'src/direct.rs',
        line: 8,
        column: 3,
        severity: 'error',
        code: 'E0308',
        source: 'rustc',
      },
    ],
  );
});

test('rustc JSON messages use primary spans and preserve end positions', () => {
  const output = JSON.stringify({
    reason: 'compiler-message',
    message: {
      level: 'error',
      message: 'borrowed value does not live long enough',
      code: { code: 'E0597' },
      spans: [
        {
          file_name: 'client/src/lib.rs',
          is_primary: true,
          line_start: 3,
          column_start: 5,
          line_end: 3,
          column_end: 12,
        },
        {
          file_name: 'client/src/lib.rs',
          is_primary: false,
          line_start: 1,
          column_start: 1,
        },
      ],
    },
  });
  assert.deepEqual(parseRustcDiagnostics(output, 'SERVER'), [
    {
      target: 'CLIENT',
      path: 'src/lib.rs',
      line: 3,
      column: 5,
      endLine: 3,
      endColumn: 12,
      severity: 'error',
      message: 'borrowed value does not live long enough',
      code: 'E0597',
      source: 'rustc',
    },
  ]);
});
