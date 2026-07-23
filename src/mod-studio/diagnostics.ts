import {
  normalizeModStudioPath,
  type ModStudioTarget,
} from './models.js';

export type ModStudioDiagnosticSeverity = 'error' | 'warning' | 'info' | 'hint';
export type ModStudioDiagnosticSource = 'rustc' | 'local-advisory';

export interface ModStudioDiagnostic {
  target: ModStudioTarget;
  path: string;
  line: number;
  column: number;
  endLine?: number;
  endColumn?: number;
  severity: ModStudioDiagnosticSeverity;
  message: string;
  code?: string;
  source: ModStudioDiagnosticSource;
}

/**
 * Parse rustc's authoritative human or JSON output. Locations are converted to
 * one-based project paths for UI lists; Monaco adapters convert back to marker
 * ranges. Non-location summary lines remain in the Build output, not Problems.
 */
export function parseRustcDiagnostics(
  output: string | null | undefined,
  defaultTarget: ModStudioTarget,
): ModStudioDiagnostic[] {
  if (!output) return [];
  const diagnostics: ModStudioDiagnostic[] = [];
  const lines = output.replace(/\r\n?/gu, '\n').split('\n');
  let pending:
    | {
        severity: ModStudioDiagnosticSeverity;
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

function parseJsonDiagnostic(
  line: string,
  defaultTarget: ModStudioTarget,
): ModStudioDiagnostic[] {
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
  defaultTarget: ModStudioTarget,
): { target: ModStudioTarget; path: string } {
  let path = value.trim().replace(/\\/gu, '/');
  let target = defaultTarget;
  const targetMatch = path.match(/(?:^|\/)(server|client)\/(.+)$/iu);
  if (targetMatch) {
    target = targetMatch[1].toUpperCase() as ModStudioTarget;
    path = targetMatch[2];
  } else {
    const sourceIndex = path.lastIndexOf('/src/');
    if (sourceIndex >= 0) path = path.slice(sourceIndex + 1);
    else if (path.includes('/')) path = path.replace(/^.*\/(?=Cargo\.toml$)/u, '');
  }
  return { target, path: normalizeModStudioPath(path) };
}

function normalizeSeverity(value: string): ModStudioDiagnosticSeverity {
  if (value === 'warning') return 'warning';
  if (value === 'info' || value === 'note' || value === 'help') return 'info';
  return 'error';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
