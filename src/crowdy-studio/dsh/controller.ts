/**
 * Client for the parallel DeepSeek Harness chat dock inside Crowdy Studio.
 *
 * Independent of CrowdyStudioAgentController: same project binding, different
 * backend (game-api → local dsh web host).
 */

export type CrowdyStudioDshConnectionStatus =
  | 'idle'
  | 'connecting'
  | 'ready'
  | 'error';

export interface CrowdyStudioDshSessionSummary {
  sessionId: string;
  projectId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface CrowdyStudioDshMessage {
  seq: number;
  role: 'USER' | 'ASSISTANT' | 'SYSTEM' | 'UNKNOWN';
  text: string;
}

export interface CrowdyStudioDshState {
  connection: CrowdyStudioDshConnectionStatus;
  projectId: string | null;
  sessions: CrowdyStudioDshSessionSummary[];
  activeSessionId: string | null;
  messages: CrowdyStudioDshMessage[];
  busy: boolean;
  lastError: string | null;
}

export interface CrowdyStudioDshTransport {
  listSessions(input: {
    appId: string;
    projectId: string;
  }): Promise<CrowdyStudioDshSessionSummary[]>;
  createSession(input: {
    appId: string;
    projectId: string;
    idempotencyKey: string;
  }): Promise<CrowdyStudioDshSessionSummary>;
  sendMessage(input: {
    sessionId: string;
    content: string;
    idempotencyKey: string;
  }): Promise<CrowdyStudioDshSessionSummary>;
  history(input: {
    sessionId: string;
    maxMessages?: number;
  }): Promise<{
    session: CrowdyStudioDshSessionSummary;
    messages: CrowdyStudioDshMessage[];
  }>;
}

export type CrowdyStudioDshListener = (state: CrowdyStudioDshState) => void;

export interface CrowdyStudioDshControllerOptions {
  transport: CrowdyStudioDshTransport;
  appId: string;
  /** Called each time a session is created or a message is sent, so the dock always targets the open project. */
  resolveProjectId: () => string | null | undefined;
  pollIntervalMs?: number;
}

const emptyState = (): CrowdyStudioDshState => ({
  connection: 'idle',
  projectId: null,
  sessions: [],
  activeSessionId: null,
  messages: [],
  busy: false,
  lastError: null,
});

export class CrowdyStudioDshController {
  private state: CrowdyStudioDshState = emptyState();
  private readonly listeners = new Set<CrowdyStudioDshListener>();
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private disposed = false;

  constructor(private readonly options: CrowdyStudioDshControllerOptions) {}

  getState(): CrowdyStudioDshState {
    return this.state;
  }

  subscribe(listener: CrowdyStudioDshListener): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  async initialize(): Promise<void> {
    this.patch({ connection: 'connecting', lastError: null });
    try {
      await this.refreshSessions();
      this.patch({ connection: 'ready' });
      this.startPolling();
    } catch (error) {
      this.patch({
        connection: 'error',
        lastError: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async createSession(): Promise<void> {
    const projectId = this.requireProjectId();
    this.patch({ busy: true, lastError: null });
    try {
      const session = await this.options.transport.createSession({
        appId: this.options.appId,
        projectId,
        idempotencyKey: `dsh-create-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      });
      await this.refreshSessions();
      await this.selectSession(session.sessionId);
    } catch (error) {
      this.patch({
        lastError: error instanceof Error ? error.message : String(error),
      });
    } finally {
      this.patch({ busy: false });
    }
  }

  async selectSession(sessionId: string): Promise<void> {
    this.patch({ activeSessionId: sessionId, busy: true, lastError: null });
    try {
      const history = await this.options.transport.history({ sessionId });
      this.patch({
        messages: history.messages,
        sessions: this.upsertSession(history.session),
      });
    } catch (error) {
      this.patch({
        lastError: error instanceof Error ? error.message : String(error),
      });
    } finally {
      this.patch({ busy: false });
    }
  }

  async sendMessage(content: string): Promise<void> {
    const text = content.trim();
    if (!text) return;
    let sessionId = this.state.activeSessionId;
    if (!sessionId) {
      await this.createSession();
      sessionId = this.state.activeSessionId;
    }
    if (!sessionId) return;

    const optimistic: CrowdyStudioDshMessage = {
      seq: (this.state.messages.at(-1)?.seq ?? 0) + 1,
      role: 'USER',
      text,
    };
    this.patch({
      messages: [...this.state.messages, optimistic],
      busy: true,
      lastError: null,
    });

    try {
      await this.options.transport.sendMessage({
        sessionId,
        content: text,
        idempotencyKey: `dsh-msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      });
      // Harness commits assistant text after tools finish; poll until it appears.
      await this.waitForAssistant(sessionId, optimistic.seq);
    } catch (error) {
      this.patch({
        lastError: error instanceof Error ? error.message : String(error),
      });
    } finally {
      this.patch({ busy: false });
    }
  }

  destroy(): void {
    this.disposed = true;
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.pollTimer = null;
    this.listeners.clear();
  }

  private async refreshSessions(): Promise<void> {
    const projectId = this.requireProjectId();
    const sessions = await this.options.transport.listSessions({
      appId: this.options.appId,
      projectId,
    });
    this.patch({ projectId, sessions });
    if (
      this.state.activeSessionId &&
      !sessions.some((session) => session.sessionId === this.state.activeSessionId)
    ) {
      this.patch({ activeSessionId: null, messages: [] });
    }
  }

  private async waitForAssistant(
    sessionId: string,
    afterSeq: number,
  ): Promise<void> {
    const deadline = Date.now() + 120_000;
    while (!this.disposed && Date.now() < deadline) {
      const history = await this.options.transport.history({ sessionId });
      this.patch({
        messages: history.messages,
        sessions: this.upsertSession(history.session),
      });
      const hasAssistant = history.messages.some(
        (message) => message.role === 'ASSISTANT' && message.seq > afterSeq,
      );
      if (hasAssistant) return;
      await new Promise((resolve) => setTimeout(resolve, 750));
    }
  }

  private startPolling(): void {
    const interval = this.options.pollIntervalMs ?? 4000;
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.pollTimer = setInterval(() => {
      if (this.disposed || this.state.busy) return;
      const sessionId = this.state.activeSessionId;
      if (!sessionId) return;
      void this.options.transport
        .history({ sessionId })
        .then((history) => {
          if (this.disposed) return;
          this.patch({
            messages: history.messages,
            sessions: this.upsertSession(history.session),
          });
        })
        .catch(() => undefined);
    }, interval);
  }

  private requireProjectId(): string {
    const projectId = this.options.resolveProjectId();
    if (!projectId) {
      throw new Error('Open a Crowdy Studio project before using Harness chat.');
    }
    return projectId;
  }

  private upsertSession(
    session: CrowdyStudioDshSessionSummary,
  ): CrowdyStudioDshSessionSummary[] {
    const others = this.state.sessions.filter(
      (item) => item.sessionId !== session.sessionId,
    );
    return [session, ...others];
  }

  private patch(partial: Partial<CrowdyStudioDshState>): void {
    this.state = { ...this.state, ...partial };
    for (const listener of this.listeners) listener(this.state);
  }
}
