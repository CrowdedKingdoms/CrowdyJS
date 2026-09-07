/**
 * Brace-balanced enclosing-block extraction for Problems→chat seeds.
 * v1 heuristic — not a full Rust parser.
 */

export interface ExtractedRustBlock {
  text: string;
  /** 1-based inclusive start line */
  startLine: number;
  /** 1-based inclusive end line */
  endLine: number;
  /** 0-based inclusive JS string index */
  spanStart: number;
  /** 0-based exclusive JS string index */
  spanEnd: number;
  /** How the span was chosen */
  kind: 'brace' | 'context';
}

const MAX_BLOCK_LINES = 80;
const CONTEXT_RADIUS = 8;

/**
 * Extract the nearest outer `{ ... }` covering `line` (1-based), or ±CONTEXT_RADIUS lines.
 */
export function extractEnclosingRustBlock(
  source: string,
  line: number,
  column = 1,
): ExtractedRustBlock | null {
  if (!source || !Number.isFinite(line) || line < 1) return null;
  const normalized = source.replace(/\r\n?/gu, '\n');
  const lines = normalized.split('\n');
  if (line > lines.length) return null;

  const lineStarts: number[] = [];
  let offset = 0;
  for (const entry of lines) {
    lineStarts.push(offset);
    offset += entry.length + 1;
  }

  const errorOffset =
    lineStarts[line - 1] +
    Math.max(0, Math.min(column - 1, lines[line - 1]?.length ?? 0));

  const braceSpan = findEnclosingBraceSpan(normalized, errorOffset);
  if (braceSpan) {
    const startLine = offsetToLine(lineStarts, braceSpan.start);
    const endLine = offsetToLine(lineStarts, Math.max(braceSpan.start, braceSpan.end - 1));
    const lineCount = endLine - startLine + 1;
    if (lineCount <= MAX_BLOCK_LINES) {
      return {
        text: normalized.slice(braceSpan.start, braceSpan.end),
        startLine,
        endLine,
        spanStart: braceSpan.start,
        spanEnd: braceSpan.end,
        kind: 'brace',
      };
    }
  }

  const startLine = Math.max(1, line - CONTEXT_RADIUS);
  const endLine = Math.min(lines.length, line + CONTEXT_RADIUS);
  const spanStart = lineStarts[startLine - 1];
  const spanEnd =
    endLine >= lines.length
      ? normalized.length
      : lineStarts[endLine];
  return {
    text: normalized.slice(spanStart, spanEnd).replace(/\n$/u, ''),
    startLine,
    endLine,
    spanStart,
    spanEnd: spanEnd > spanStart && normalized[spanEnd - 1] === '\n' ? spanEnd - 1 : spanEnd,
    kind: 'context',
  };
}

function offsetToLine(lineStarts: number[], offset: number): number {
  let lo = 0;
  let hi = lineStarts.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const start = lineStarts[mid];
    const next = mid + 1 < lineStarts.length ? lineStarts[mid + 1] : Number.POSITIVE_INFINITY;
    if (offset < start) hi = mid - 1;
    else if (offset >= next) lo = mid + 1;
    else return mid + 1;
  }
  return Math.max(1, lo);
}

function findEnclosingBraceSpan(
  source: string,
  pivot: number,
): { start: number; end: number } | null {
  let depth = 0;
  let openIndex = -1;
  for (let i = Math.min(pivot, source.length - 1); i >= 0; i -= 1) {
    const ch = source[i];
    if (ch === '}') depth += 1;
    else if (ch === '{') {
      if (depth === 0) {
        openIndex = i;
        break;
      }
      depth -= 1;
    }
  }
  if (openIndex < 0) return null;
  depth = 0;
  for (let i = openIndex; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        return { start: openIndex, end: i + 1 };
      }
    }
  }
  return null;
}

/** Browser-safe sha256 hex digest of UTF-8 text (Web Crypto). */
export async function sha256DigestHex(content: string): Promise<string> {
  const data = new TextEncoder().encode(content);
  const digest = await crypto.subtle.digest('SHA-256', data);
  const bytes = new Uint8Array(digest);
  let hex = '';
  for (const byte of bytes) {
    hex += byte.toString(16).padStart(2, '0');
  }
  return `sha256:${hex}`;
}

/** Sync sha256 for Node unit tests (and SSR). */
export function sha256DigestHexSync(content: string): string {
  // Lazy require keeps browser bundles free of node:crypto when tree-shaken.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createHash } = require('node:crypto') as typeof import('node:crypto');
  return `sha256:${createHash('sha256').update(content, 'utf8').digest('hex')}`;
}
