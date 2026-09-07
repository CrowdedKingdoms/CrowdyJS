import test from 'node:test';
import assert from 'node:assert/strict';
import {
  agentChatRequiresBuildMode,
  extractDiagnosticSourceSnippet,
  formatDiagnosticsForAgentChat,
  isParseStyleDiagnosticMessage,
  parseRustcDiagnostics,
} from '../../dist/crowdy-studio/diagnostics.js';

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

test('agentChatRequiresBuildMode detects one-diag write prompts', () => {
  assert.equal(
    agentChatRequiresBuildMode(
      'Fix ONLY this one Crowdy Studio problem. Do not mention or anticipate other compile errors — one edit, one diagnostic.',
    ),
    true,
  );
  assert.equal(agentChatRequiresBuildMode('What does voxel_set do?'), false);
});

test('formatDiagnosticsForAgentChat singleProblem omits SERVER reminder for CLIENT', () => {
  const text = formatDiagnosticsForAgentChat(
    [
      {
        target: 'CLIENT',
        path: 'src/tick.rs',
        line: 4,
        column: 1,
        severity: 'error',
        code: 'E0308',
        message: 'mismatched types',
        source: 'rustc',
      },
    ],
    { singleProblem: true },
  );
  assert.match(text, /Target: CLIENT/);
  assert.match(text, /Path: src\/tick\.rs/);
  assert.match(text, /File: client\/src\/tick\.rs:4:1/);
  assert.match(text, /Never read `\/home`, `\/home\/ubuntu`/);
  assert.match(text, /CLIENT `src\/lib\.rs` is `client\/src\/lib\.rs`/);
  assert.match(text, /sdk_lookup/);
  assert.doesNotMatch(text, /rewrite to crowdy::api::\*/);
  assert.doesNotMatch(text, /voxel_set/);
});

test('formatDiagnosticsForAgentChat respects maxChars', () => {
  const long = 'x'.repeat(200);
  const text = formatDiagnosticsForAgentChat(
    [
      {
        target: 'SERVER',
        path: 'src/a.rs',
        line: 1,
        column: 1,
        severity: 'error',
        message: long,
        source: 'rustc',
      },
      {
        target: 'SERVER',
        path: 'src/b.rs',
        line: 2,
        column: 1,
        severity: 'error',
        message: long,
        source: 'rustc',
      },
    ],
    { intro: 'Fix.', maxChars: 120 },
  );
  assert.ok(text.length <= 120);
  assert.match(text, /^Fix\./);
});

test('extractDiagnosticSourceSnippet sends small files whole with caret', () => {
  const src = ['fn a() {', '  let x = 1;', '}'].join('\n');
  const snippet = extractDiagnosticSourceSnippet(src, 2);
  assert.equal(snippet?.kind, 'file');
  assert.equal(snippet?.startLine, 1);
  assert.equal(snippet?.endLine, 3);
  assert.equal(snippet?.caretLine, 2);
  assert.match(snippet.text, />2 \|   let x = 1;/);
  assert.equal(isParseStyleDiagnosticMessage('this file contains an unclosed delimiter'), true);
  assert.equal(isParseStyleDiagnosticMessage('mismatched types'), false);
});

test('formatDiagnosticsForAgentChat singleProblem attaches full small file for unclosed delimiter', () => {
  const src = [
    'pub fn draw_box(pos: (i32, i32, i32), w: i32) {',
    '    crowdy::api::draw_box(pos, w, 1, 1);',
    '    if true {',
    '        let _ = w;',
    '    // missing closers',
  ].join('\n');
  const text = formatDiagnosticsForAgentChat(
    [
      {
        target: 'CLIENT',
        path: 'src/lib.rs',
        line: 5,
        column: 1,
        severity: 'error',
        message: 'this file contains an unclosed delimiter',
        source: 'rustc',
      },
    ],
    { singleProblem: true, fileContent: src },
  );
  assert.match(text, /Target: CLIENT/);
  assert.match(text, /Path: src\/lib\.rs/);
  assert.match(text, /Location: 5:1/);
  assert.match(text, /Message: this file contains an unclosed delimiter/);
  assert.match(text, /parse error — unmatched delimiters/);
  assert.match(text, /BEGIN_SOURCE path=CLIENT\/src\/lib\.rs startLine=1 endLine=5 kind=file caretLine=5/);
  assert.match(text, />5 \|/);
  assert.match(text, /draw_box/);
  assert.doesNotMatch(text, /BEGIN_BLOCK/);
});

test('formatDiagnosticsForAgentChat singleProblem windows large files to ±40 lines', () => {
  const lines = Array.from({ length: 300 }, (_, i) => `// line ${i + 1}`);
  lines[99] = 'fn broken( {';
  const src = lines.join('\n');
  const text = formatDiagnosticsForAgentChat(
    [
      {
        target: 'CLIENT',
        path: 'src/lib.rs',
        line: 100,
        column: 12,
        severity: 'error',
        message: 'this file contains an unclosed delimiter',
        source: 'rustc',
      },
    ],
    { singleProblem: true, fileContent: src },
  );
  assert.match(
    text,
    /BEGIN_SOURCE path=CLIENT\/src\/lib\.rs startLine=60 endLine=140 kind=window caretLine=100/,
  );
  assert.match(text, />100 \| fn broken/);
  assert.doesNotMatch(text, /\| \/\/ line 1$/m);
  assert.doesNotMatch(text, /\| \/\/ line 300$/m);
  assert.doesNotMatch(text, /\| \/\/ line 59$/m);
});
