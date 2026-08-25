import {
  normalizeCrowdyStudioPath,
  type CrowdyStudioTarget,
} from './models.js';
import {
  extractEnclosingRustBlock,
  type ExtractedRustBlock,
} from './rust-block-extract.js';
import { formatApiDocCards, matchApiDocCards } from './api-doc-cards.js';

export type CrowdyStudioDiagnosticSeverity = 'error' | 'warning' | 'info' | 'hint';
export type CrowdyStudioDiagnosticSource = 'rustc' | 'local-advisory';

export interface CrowdyStudioDiagnostic {
  target: CrowdyStudioTarget;
  path: string;
  line: number;
  column: number;
  endLine?: number;
  endColumn?: number;
  severity: CrowdyStudioDiagnosticSeverity;
  message: string;
  code?: string;
  source: CrowdyStudioDiagnosticSource;
}

/**
 * Parse rustc's authoritative human or JSON output. Locations are converted to
 * one-based project paths for UI lists; Monaco adapters convert back to marker
 * ranges. Non-location summary lines remain in the Build output, not Problems.
 */
export function parseRustcDiagnostics(
  output: string | null | undefined,
  defaultTarget: CrowdyStudioTarget,
): CrowdyStudioDiagnostic[] {
  if (!output) return [];
  const diagnostics: CrowdyStudioDiagnostic[] = [];
  const lines = output.replace(/\r\n?/gu, '\n').split('\n');
  let pending:
    | {
        severity: CrowdyStudioDiagnosticSeverity;
        message: string;
        code?: string;
      }
    | undefined;

  for (const line of lines) {
    const json = parseJsonDiagnostic(line, defaultTarget);
    if (json.length > 0) {
      diagnostics.push(...json);
      pending = undefined;
      continue;
    }

    const header = line.match(
      /^\s*(error|warning|info|note)(?:\[([^\]]+)\])?:\s*(.+?)\s*$/u,
    );
    if (header) {
      pending = {
        severity: normalizeSeverity(header[1]),
        message: header[3],
        ...(header[2] ? { code: header[2] } : {}),
      };
      continue;
    }

    const arrow = line.match(/^\s*-->\s+(.+?):(\d+):(\d+)(?:-(\d+))?\s*$/u);
    if (arrow && pending) {
      const location = normalizeLocation(arrow[1], defaultTarget);
      diagnostics.push({
        ...location,
        line: Number(arrow[2]),
        column: Number(arrow[3]),
        ...(arrow[4] ? { endColumn: Number(arrow[4]) } : {}),
        ...pending,
        source: 'rustc',
      });
      pending = undefined;
      continue;
    }

    const compact = line.match(
      /^\s*(.+?):(\d+):(\d+):\s*(error|warning|info|note)(?:\[([^\]]+)\])?:\s*(.+?)\s*$/u,
    );
    if (compact) {
      diagnostics.push({
        ...normalizeLocation(compact[1], defaultTarget),
        line: Number(compact[2]),
        column: Number(compact[3]),
        severity: normalizeSeverity(compact[4]),
        message: compact[6],
        ...(compact[5] ? { code: compact[5] } : {}),
        source: 'rustc',
      });
    }
  }

  const seen = new Set<string>();
  return diagnostics.filter((diagnostic) => {
    const key = [
      diagnostic.target,
      diagnostic.path,
      diagnostic.line,
      diagnostic.column,
      diagnostic.severity,
      diagnostic.code,
      diagnostic.message,
    ].join(':');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const DEFAULT_AGENT_CHAT_INTRO =
  'Fix these Crowdy Studio Problems. Use read/write/edit on the project files. After each write the human will Test draft. Do not add crates to clear unresolved imports; rewrite to crowdy::api::* only (SERVER: crowdy::api::voxel_set for world writes).';

const DEFAULT_SINGLE_PROBLEM_INTRO =
  'Fix ONLY this one Crowdy Studio problem. Do not mention or anticipate other compile errors — one edit, one diagnostic.';

const SINGLE_PROBLEM_WORKFLOW =
  'You must edit this file in this turn (read, then write or edit). If BEGIN_SOURCE is present, that is the editor buffer. After the write, the human will Test draft. If compile still fails, use the Problems list — do not add crates; rewrite to crowdy::api::* only.';

const SERVER_CLOSED_WORLD_REMINDER =
  'SERVER closed-world: world block writes use crowdy::api::voxel_set((cx,cy,cz), (vx,vy,vz), block_i32, None) (4-arg horse pattern) — not voxel_set::set_block, string block names, or invented SDK paths.';

const PARSE_ERROR_NOTE =
  'Note: parse error — unmatched delimiters need surrounding source. The attached window (or full file if small) is the editor buffer; patch this file only.';

/** ±N lines around the rustc caret when the file is too large to send whole. */
export const DIAGNOSTIC_SOURCE_WINDOW_RADIUS = 40;
const SMALL_FILE_MAX_LINES = 120;
const SMALL_FILE_MAX_CHARS = 8_192;
const PARSE_ERROR_MAX_LINES = 250;
const PARSE_ERROR_MAX_CHARS = 16_384;
const MAX_SNIPPET_LINE_CHARS = 240;

export interface FormatDiagnosticsOptions {
  intro?: string;
  maxChars?: number;
  /** Per-row Add / Fix with AI: one focused diagnostic with structured fields. */
  singleProblem?: boolean;
  /** Current file source for BEGIN_SOURCE / block extraction (single-problem). */
  fileContent?: string | null;
  /** sha256:… of the extracted block when available. */
  blockContentHash?: string | null;
  /** Full-file content hash when known. */
  fileContentHash?: string | null;
}

export interface DiagnosticSourceSnippet {
  kind: 'file' | 'window';
  startLine: number;
  endLine: number;
  caretLine: number;
  text: string;
}

/** rustc parse failures where a brace-balanced block is usually missing. */
export function isParseStyleDiagnosticMessage(message: string): boolean {
  return /unclosed delimiter|unexpected closing delimiter|mismatched closing delimiter|this file contains an unclosed|expected one of/iu.test(
    message,
  );
}

/**
 * Numbered source for Fix with AI: whole file when small, else ±40 lines.
 * Parse-style rustc messages get a slightly larger "small file" budget so
 * CLIENT lib.rs-sized buffers are sent intact.
 */
export function extractDiagnosticSourceSnippet(
  source: string,
  line: number,
  options: { parseStyle?: boolean } = {},
): DiagnosticSourceSnippet | null {
  if (!source) return null;
  const normalized = source.replace(/\r\n?/gu, '\n');
  const lines = normalized.split('\n');
  if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop();
  if (lines.length === 0) return null;

  const caretLine = Math.max(1, Math.min(Math.trunc(line) || 1, lines.length));
  const maxLines = options.parseStyle ? PARSE_ERROR_MAX_LINES : SMALL_FILE_MAX_LINES;
  const maxChars = options.parseStyle ? PARSE_ERROR_MAX_CHARS : SMALL_FILE_MAX_CHARS;
  const fits = lines.length <= maxLines && normalized.length <= maxChars;

  const startLine = fits
    ? 1
    : Math.max(1, caretLine - DIAGNOSTIC_SOURCE_WINDOW_RADIUS);
  const endLine = fits
    ? lines.length
    : Math.min(lines.length, caretLine + DIAGNOSTIC_SOURCE_WINDOW_RADIUS);
  const width = String(endLine).length;
  const text = lines
    .slice(startLine - 1, endLine)
    .map((raw, index) => {
      const n = startLine + index;
      const mark = n === caretLine ? '>' : ' ';
      const clipped =
        raw.length > MAX_SNIPPET_LINE_CHARS
          ? `${raw.slice(0, MAX_SNIPPET_LINE_CHARS)}…`
          : raw;
      return `${mark}${String(n).padStart(width, ' ')} | ${clipped}`;
    })
    .join('\n');

  return {
    kind: fits ? 'file' : 'window',
    startLine,
    endLine,
    caretLine,
    text,
  };
}

/**
 * True when composer text is a project-write request. ASK mode has no
 * mutating tools, so the dock must switch to BUILD before Send.
 */
export function agentChatRequiresBuildMode(content: string): boolean {
  return (
    content.includes('Fix ONLY this one Crowdy Studio problem') ||
    content.includes('one patch, one diagnostic') ||
    content.includes('one edit, one diagnostic') ||
    content.includes('workspace.file.patch')
  );
}

/**
 * Format Problems-panel diagnostics into a bounded chat composer message.
 * Shared by Add to chat / Fix with AI on Harness and Crowdy Agent.
 */
export function formatDiagnosticsForAgentChat(
  diagnostics: readonly CrowdyStudioDiagnostic[],
  options: FormatDiagnosticsOptions = {},
): string {
  const maxChars = options.maxChars ?? 32_768;
  if (options.singleProblem && diagnostics.length === 1) {
    return formatSingleDiagnosticForAgentChat(diagnostics[0], options).slice(
      0,
      maxChars,
    );
  }
  const intro = options.intro ?? DEFAULT_AGENT_CHAT_INTRO;
  if (diagnostics.length === 0) {
    return intro.slice(0, maxChars);
  }
  const lines = diagnostics.map((diagnostic) => {
    const code = diagnostic.code ? `[${diagnostic.code}] ` : '';
    return `- ${diagnostic.source} ${diagnostic.severity} ${diagnostic.target.toLowerCase()}/${diagnostic.path}:${diagnostic.line}:${diagnostic.column} ${code}${diagnostic.message}`;
  });
  const header = `${intro}\n\nProblems (${diagnostics.length}):\n`;
  let body = '';
  for (const line of lines) {
    const next = body ? `${body}\n${line}` : line;
    if (header.length + next.length > maxChars) {
      const remaining = Math.max(0, maxChars - header.length - body.length - 20);
      if (remaining > 8 && !body) {
        body = `${line.slice(0, remaining)}…`;
      } else if (body) {
        body = `${body}\n…`;
      }
      break;
    }
    body = next;
  }
  return `${header}${body}`.slice(0, maxChars);
}

function formatSingleDiagnosticForAgentChat(
  diagnostic: CrowdyStudioDiagnostic,
  options: FormatDiagnosticsOptions = {},
): string {
  const intro = options.intro ?? DEFAULT_SINGLE_PROBLEM_INTRO;
  const location = `${diagnostic.target.toLowerCase()}/${diagnostic.path}:${diagnostic.line}:${diagnostic.column}`;
  const code = diagnostic.code ? diagnostic.code : undefined;
  const spanEndLine = diagnostic.endLine ?? diagnostic.line;
  const spanEndColumn = diagnostic.endColumn ?? diagnostic.column;
  const hasSpan =
    diagnostic.endLine !== undefined ||
    diagnostic.endColumn !== undefined ||
    spanEndLine !== diagnostic.line ||
    spanEndColumn !== diagnostic.column;

  let block: ExtractedRustBlock | null = null;
  if (typeof options.fileContent === 'string' && options.fileContent.length > 0) {
    block = extractEnclosingRustBlock(
      options.fileContent,
      diagnostic.line,
      diagnostic.column,
    );
  }

  const cards = matchApiDocCards({
    message: diagnostic.message,
    code: diagnostic.code,
    path: diagnostic.path,
    target: diagnostic.target,
    blockText: block?.text ?? null,
  });

  const parseStyle = isParseStyleDiagnosticMessage(diagnostic.message);
  const snippet =
    typeof options.fileContent === 'string' && options.fileContent.length > 0
      ? extractDiagnosticSourceSnippet(options.fileContent, diagnostic.line, {
          parseStyle,
        })
      : null;

  const sections = [
    intro,
    '',
    `Target: ${diagnostic.target}`,
    `Path: ${diagnostic.path}`,
    `Location: ${diagnostic.line}:${diagnostic.column}`,
    `File: ${location}`,
    ...(hasSpan
      ? [
          `Span: ${diagnostic.line}:${diagnostic.column}–${spanEndLine}:${spanEndColumn}`,
        ]
      : []),
    `Source: ${diagnostic.source}`,
    `Severity: ${diagnostic.severity}${code ? ` (${code})` : ''}`,
    `Message: ${diagnostic.message}`,
    ...(parseStyle ? ['', PARSE_ERROR_NOTE] : []),
    '',
    SINGLE_PROBLEM_WORKFLOW,
  ];

  if (snippet) {
    const hashBits = options.fileContentHash
      ? ` expectedContentHash=${options.fileContentHash}`
      : '';
    sections.push(
      '',
      `BEGIN_SOURCE path=${diagnostic.target}/${diagnostic.path} startLine=${snippet.startLine} endLine=${snippet.endLine} kind=${snippet.kind} caretLine=${snippet.caretLine}${hashBits}`,
      snippet.text,
      'END_SOURCE',
    );
  } else {
    sections.push(
      '',
      `Source snippet unavailable — read ${diagnostic.target}/${diagnostic.path} before editing.`,
    );
  }

  if (block?.kind === 'brace') {
    const hashBits = [
      options.blockContentHash
        ? ` expectedBlockHash=${options.blockContentHash}`
        : '',
      options.fileContentHash
        ? ` expectedContentHash=${options.fileContentHash}`
        : '',
    ].join('');
    sections.push(
      '',
      `BEGIN_BLOCK path=${diagnostic.target}/${diagnostic.path} startLine=${block.startLine} endLine=${block.endLine} spanStart=${block.spanStart} spanEnd=${block.spanEnd} kind=${block.kind}${hashBits}`,
      block.text,
      'END_BLOCK',
    );
  }

  if (cards.length > 0) {
    sections.push('', formatApiDocCards(cards));
  }

  if (diagnostic.target === 'SERVER') {
    sections.push('', SERVER_CLOSED_WORLD_REMINDER);
  }

  return sections.join('\n');
}

function parseJsonDiagnostic(
  line: string,
  defaultTarget: CrowdyStudioTarget,
): CrowdyStudioDiagnostic[] {
  if (!line.trimStart().startsWith('{')) return [];
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    return [];
  }
  if (!isRecord(value)) return [];
  const message = isRecord(value.message) ? value.message : value;
  if (!isRecord(message) || typeof message.message !== 'string') return [];
  const level =
    typeof message.level === 'string' ? normalizeSeverity(message.level) : 'error';
  const code =
    isRecord(message.code) && typeof message.code.code === 'string'
      ? message.code.code
      : undefined;
  const spans = Array.isArray(message.spans) ? message.spans : [];
  return spans
    .filter(
      (span): span is Record<string, unknown> =>
        isRecord(span) &&
        span.is_primary === true &&
        typeof span.file_name === 'string' &&
        Number.isSafeInteger(span.line_start) &&
        Number.isSafeInteger(span.column_start),
    )
    .map((span) => ({
      ...normalizeLocation(span.file_name as string, defaultTarget),
      line: span.line_start as number,
      column: span.column_start as number,
      ...(Number.isSafeInteger(span.line_end)
        ? { endLine: span.line_end as number }
        : {}),
      ...(Number.isSafeInteger(span.column_end)
        ? { endColumn: span.column_end as number }
        : {}),
      severity: level,
      message: message.message as string,
      ...(code ? { code } : {}),
      source: 'rustc' as const,
    }));
}

function normalizeLocation(
  value: string,
  defaultTarget: CrowdyStudioTarget,
): { target: CrowdyStudioTarget; path: string } {
  let path = value.trim().replace(/\\/gu, '/');
  let target = defaultTarget;
  const targetMatch = path.match(/(?:^|\/)(server|client)\/(.+)$/iu);
  if (targetMatch) {
    target = targetMatch[1].toUpperCase() as CrowdyStudioTarget;
    path = targetMatch[2];
  } else {
    const sourceIndex = path.lastIndexOf('/src/');
    if (sourceIndex >= 0) path = path.slice(sourceIndex + 1);
    else if (path.includes('/')) path = path.replace(/^.*\/(?=Cargo\.toml$)/u, '');
  }
  return { target, path: normalizeCrowdyStudioPath(path) };
}

function normalizeSeverity(value: string): CrowdyStudioDiagnosticSeverity {
  if (value === 'warning') return 'warning';
  if (value === 'info' || value === 'note' || value === 'help') return 'info';
  return 'error';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
