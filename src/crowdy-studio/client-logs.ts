/**
 * Last-N `crowdy::log` lines from a Test draft client run.
 * The glue worker already decodes them; this is the page-side ring.
 */

export type CrowdyStudioClientLogTarget = 'CLIENT' | 'SERVER';

export interface CrowdyStudioClientLogLine {
  at: string;
  level: number;
  message: string;
  target: CrowdyStudioClientLogTarget;
}

export const CLIENT_LOG_DEFAULT_LIMIT = 80;
export const CLIENT_LOG_MAX_LINES = 200;

const LEVEL_LABEL: Record<number, string> = {
  0: 'trace',
  1: 'debug',
  2: 'info',
  3: 'warn',
  4: 'error',
};

export function clientLogLevelLabel(level: number): string {
  return LEVEL_LABEL[level] ?? `l${level}`;
}

export function formatClientLogTail(
  lines: readonly CrowdyStudioClientLogLine[],
): string {
  if (lines.length === 0) {
    return 'No client module logs yet. Run Test draft so crowdy::log lines can arrive.';
  }
  return lines
    .map((line) => {
      const stamp = line.at.slice(11, 19) || line.at;
      return `[${stamp}] ${line.target} ${clientLogLevelLabel(line.level)} ${line.message}`;
    })
    .join('\n');
}

export class CrowdyStudioClientLogBuffer {
  private lines: CrowdyStudioClientLogLine[] = [];

  constructor(private readonly maxLines = CLIENT_LOG_MAX_LINES) {}

  append(line: CrowdyStudioClientLogLine): void {
    const message = line.message.trim();
    if (!message) return;
    this.lines.push({
      at: line.at || new Date().toISOString(),
      level: Number.isFinite(line.level) ? line.level : 2,
      message: message.slice(0, 2000),
      target: line.target === 'SERVER' ? 'SERVER' : 'CLIENT',
    });
    if (this.lines.length > this.maxLines) {
      this.lines = this.lines.slice(-this.maxLines);
    }
  }

  tail(limit = CLIENT_LOG_DEFAULT_LIMIT): CrowdyStudioClientLogLine[] {
    const cap = Math.max(1, Math.min(this.maxLines, Math.floor(limit) || CLIENT_LOG_DEFAULT_LIMIT));
    return this.lines.slice(-cap);
  }

  clear(): void {
    this.lines = [];
  }

  format(limit?: number): string {
    return formatClientLogTail(this.tail(limit));
  }
}

export interface CrowdyStudioClientLogTransport {
  appendClientLogs?(input: {
    projectId: string;
    lines: ReadonlyArray<CrowdyStudioClientLogLine>;
  }): Promise<void>;
}

/**
 * Batch `crowdy::log` lines onto the DSH sidecar so the Harness `client_logs`
 * tool can read them. Fire-and-forget: a failed post must not stop the draft.
 */
export function bindClientLogShipper(
  getProjectId: () => string | null | undefined,
  transport: CrowdyStudioClientLogTransport | undefined,
  next?: (line: CrowdyStudioClientLogLine) => void,
): {
  onClientLog: (line: CrowdyStudioClientLogLine) => void;
  dispose: () => void;
} {
  const pending: CrowdyStudioClientLogLine[] = [];
  let timer: ReturnType<typeof setTimeout> | null = null;
  let disposed = false;

  const flush = (): void => {
    timer = null;
    const lines = pending.splice(0);
    const projectId = getProjectId()?.trim();
    if (disposed || !projectId || lines.length === 0) return;
    void transport?.appendClientLogs?.({ projectId, lines }).catch(() => undefined);
  };

  return {
    onClientLog(line) {
      next?.(line);
      if (!transport?.appendClientLogs) return;
      pending.push(line);
      if (!timer) timer = setTimeout(flush, 50);
    },
    dispose() {
      disposed = true;
      if (timer) clearTimeout(timer);
      timer = null;
      pending.length = 0;
    },
  };
}
