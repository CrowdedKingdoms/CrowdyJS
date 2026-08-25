/**
 * Client for the parallel DeepSeek Harness chat dock inside Crowdy Studio.
 *
 * Independent of CrowdyStudioAgentController: same project binding, different
 * backend (game-api → local dsh web host).
 */

import {
  decodeAskUserQuestionMessage,
  looksLikeAskUserQuestion,
} from './ask-user-question.js';
import { pinAskUserAnswers } from './pin-answers.js';

export { pinAskUserAnswers } from './pin-answers.js';

export type CrowdyStudioDshConnectionStatus =
  | 'idle'
  | 'connecting'
  | 'ready'
  | 'error';

export type CrowdyStudioDshMessageKind =
  | 'user'
  | 'assistant'
  | 'tool'
  | 'question'
  | 'todo'
  | 'thinking'
  | 'system'
  | 'turn-end'
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
  kind: CrowdyStudioDshMessageKind;
  title: string | null;
  text: string;
  /** Submitted Q+A pinned to this question card. */
  answeredText?: string;
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
  cancel?(input: { sessionId: string }): Promise<CrowdyStudioDshSessionSummary>;
  history(input: {
    sessionId: string;
    maxMessages?: number;
  }): Promise<{
    session: CrowdyStudioDshSessionSummary;
    messages: CrowdyStudioDshMessage[];
  }>;
}

export type CrowdyStudioDshListener = (state: CrowdyStudioDshState) => void;

export interface CrowdyStudioDshSessionMemory {
  get(key: string): string | null;
  set(key: string, value: string): void;
}

export interface CrowdyStudioDshControllerOptions {
  transport: CrowdyStudioDshTransport;
  appId: string;
  /** Called each time a session is created or a message is sent, so the dock always targets the open project. */
  resolveProjectId: () => string | null | undefined;
  pollIntervalMs?: number;
  /**
   * After the last card is a finished assistant reply and history has not
   * grown for this long, drop Writing. DSH often omits `turn/end`.
   * Mid-turn tool cards arriving sooner keep the badge up.
   */
  quietSettleMs?: number;
  /** Remember the last Harness session so Studio remount can reopen it. */
  sessionMemory?: CrowdyStudioDshSessionMemory;
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
  private waitGeneration = 0;
  private pendingUser: CrowdyStudioDshMessage | null = null;
  /** True only while this tab is waiting on a prompt it sent. Restore/poll must not inherit it. */
  private waitingForTurn = false;
  private historyKey = '';
  private historyQuietSince = 0;

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
      await this.restoreLastSession();
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
      this.pendingUser = null;
      await this.refreshSessions();
      await this.selectSession(session.sessionId);
    } catch (error) {
      this.patch({
        lastError: error instanceof Error ? error.message : String(error),
      });
    } finally {
      this.patch({
        busy:
          Boolean(this.pendingUser) || dshTurnInProgress(this.state.messages),
      });
    }
  }

  async selectSession(sessionId: string): Promise<void> {
    this.patch({ activeSessionId: sessionId, lastError: null });
    this.pendingUser = null;
    this.waitingForTurn = false;
    try {
      const history = await this.options.transport.history({ sessionId });
      this.applyHistory(history);
      this.rememberSession(history.session);
    } catch (error) {
      this.patch({
        lastError: error instanceof Error ? error.message : String(error),
        busy: false,
      });
    }
  }

  async sendMessage(content: string): Promise<void> {
    const encoded = content.trim();
    if (!encoded) return;
    const decoded = decodeAskUserQuestionMessage(encoded);
    const text = decoded.display.trim() || encoded;
    const waitingOnQuestion = decoded.answers !== null;
    let sessionId = this.state.activeSessionId;
    if (!sessionId) {
      await this.createSession();
      sessionId = this.state.activeSessionId;
    }
    if (!sessionId) return;

    const optimistic: CrowdyStudioDshMessage = {
      seq: (this.state.messages.at(-1)?.seq ?? 0) + 1,
      role: 'USER',
      kind: 'user',
      title: null,
      text,
    };
    this.pendingUser = optimistic;
    this.waitingForTurn = true;
    const generation = ++this.waitGeneration;
    this.patch({
      messages: mergePendingUser(this.state.messages, optimistic),
      busy: true,
      lastError: null,
    });

    try {
      await this.options.transport.sendMessage({
        sessionId,
        content: encoded,
        idempotencyKey: `dsh-msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      });
      // Wait for THIS prompt to land, then for its reply. A prior turn that
      // already has tool errors must not look "settled" and drop the bubble.
      await this.waitForAssistant(sessionId, generation, text, waitingOnQuestion);
    } catch (error) {
      this.waitingForTurn = false;
      this.pendingUser = null;
      this.patch({
        lastError: error instanceof Error ? error.message : String(error),
        busy: false,
      });
    } finally {
      if (
        this.waitGeneration === generation &&
        (this.turnHasSettled(text) || !this.waitingForTurn)
      ) {
        this.waitingForTurn = false;
        this.patch({ busy: false });
      }
    }
  }

  async cancel(): Promise<void> {
    const sessionId = this.state.activeSessionId;
    const cancel = this.options.transport.cancel;
    if (!sessionId || !cancel) return;
    const generation = ++this.waitGeneration;
    this.waitingForTurn = false;
    try {
      await cancel({ sessionId });
      const history = await this.options.transport.history({ sessionId });
      this.applyHistory(history);
    } catch (error) {
      this.patch({
        lastError: error instanceof Error ? error.message : String(error),
      });
    } finally {
      if (this.waitGeneration === generation) {
        this.patch({ busy: false });
      }
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
      this.pendingUser = null;
      this.patch({ activeSessionId: null, messages: [] });
    }
  }

  private async restoreLastSession(): Promise<void> {
    if (this.state.activeSessionId) return;
    const projectId = this.state.projectId;
    const picked = pickLastDshSession(
      this.state.sessions,
      projectId ? this.readRememberedSession(projectId) : null,
    );
    if (!picked) return;
    await this.selectSession(picked.sessionId);
  }

  private sessionMemory(): CrowdyStudioDshSessionMemory | null {
    return this.options.sessionMemory ?? browserDshSessionMemory();
  }

  private readRememberedSession(projectId: string): string | null {
    try {
      return (
        this.sessionMemory()?.get(
          dshSessionMemoryKey(this.options.appId, projectId),
        ) ?? null
      );
    } catch {
      return null;
    }
  }

  private rememberSession(session: CrowdyStudioDshSessionSummary): void {
    try {
      this.sessionMemory()?.set(
        dshSessionMemoryKey(this.options.appId, session.projectId),
        session.sessionId,
      );
    } catch {
      // Private mode / missing storage must not block the dock.
    }
  }

  private async readHistory(sessionId: string): Promise<{
    session: CrowdyStudioDshSessionSummary;
    messages: CrowdyStudioDshMessage[];
  }> {
    let lastError: unknown;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      try {
        return await this.options.transport.history({ sessionId });
      } catch (error) {
        lastError = error;
        const message = error instanceof Error ? error.message : String(error);
        if (!/Network error|Failed to fetch|Failed to load|ECONNREFUSED|ECONNRESET/i.test(message)) {
          throw error;
        }
        await new Promise((resolve) => setTimeout(resolve, 750));
      }
    }
    throw lastError instanceof Error
      ? lastError
      : new Error(String(lastError ?? 'Harness history failed'));
  }

  private async waitForAssistant(
    sessionId: string,
    generation: number,
    sentText: string,
    waitingOnQuestion = false,
  ): Promise<void> {
    const warnAt = Date.now() + 120_000;
    let warned = false;
    while (!this.disposed) {
      if (this.waitGeneration !== generation) return;
      const history = await this.readHistory(sessionId);
      if (this.waitGeneration !== generation) return;
      this.applyHistory(history);
      if (
        turnSettledAfter(history.messages, sentText) ||
        (waitingOnQuestion && dshQuestionTurnContinued(history.messages)) ||
        !this.waitingForTurn
      ) {
        this.pendingUser = null;
        this.waitingForTurn = false;
        return;
      }
      if (!warned && Date.now() >= warnAt) {
        warned = true;
        this.patch({
          lastError:
            'Harness is still working. The Working badge stays on until this turn ends.',
        });
      }
      await new Promise((resolve) => setTimeout(resolve, 750));
    }
  }

  private startPolling(): void {
    const interval = this.options.pollIntervalMs ?? 4000;
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.pollTimer = setInterval(() => {
      if (this.disposed) return;
      const sessionId = this.state.activeSessionId;
      if (!sessionId) return;
      void this.options.transport
        .history({ sessionId })
        .then((history) => {
          if (this.disposed) return;
          this.applyHistory(history);
        })
        .catch(() => undefined);
    }, interval);
  }

  private applyHistory(history: {
    session: CrowdyStudioDshSessionSummary;
    messages: CrowdyStudioDshMessage[];
  }): void {
    const messages = mergePendingUser(history.messages, this.pendingUser);
    if (
      this.pendingUser &&
      history.messages.some(
        (message) =>
          message.kind === 'user' && message.text === this.pendingUser?.text,
      )
    ) {
      this.pendingUser = null;
    }
    const key = dshHistoryFingerprint(messages);
    const now = Date.now();
    if (key !== this.historyKey) {
      this.historyKey = key;
      this.historyQuietSince = now;
    }
    const quietMs = now - this.historyQuietSince;
    const quietLimit = this.options.quietSettleMs ?? 2_500;
    if (
      this.waitingForTurn &&
      !this.pendingUser &&
      dshLastCardIsFinishedAssistant(messages) &&
      quietMs >= quietLimit
    ) {
      this.waitingForTurn = false;
    }
    const awaiting = this.pendingUser?.text ?? lastUserText(messages);
    const settled = awaiting ? turnSettledAfter(messages, awaiting) : true;
    // A finished assistant reply is not a live turn. After refresh, DSH may
    // have no turn/end (host restarted) even though nothing is generating.
    const busy = Boolean(this.pendingUser)
      ? true
      : this.waitingForTurn
        ? !settled
        : dshTranscriptLooksActive(messages);
    this.patch({
      messages,
      sessions: this.upsertSession(history.session),
      busy,
    });
  }

  private turnHasSettled(sentText: string): boolean {
    return turnSettledAfter(this.state.messages, sentText);
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

/** True when a Harness card is a project mutation (stock write/edit tools). */
export function dshSessionMemoryKey(appId: string, projectId: string): string {
  return `ck-crowdy-studio-dsh-session:${appId}:${projectId}`;
}

export function pickLastDshSession(
  sessions: readonly CrowdyStudioDshSessionSummary[],
  preferredSessionId?: string | null,
): CrowdyStudioDshSessionSummary | null {
  if (sessions.length === 0) return null;
  if (preferredSessionId) {
    const preferred = sessions.find(
      (session) => session.sessionId === preferredSessionId,
    );
    if (preferred) return preferred;
  }
  return sessions[0] ?? null;
}

function browserDshSessionMemory(): CrowdyStudioDshSessionMemory | null {
  try {
    if (typeof window === 'undefined') return null;
    const storage = window.localStorage;
    return {
      get: (key) => storage.getItem(key),
      set: (key, value) => {
        storage.setItem(key, value);
      },
    };
  } catch {
    return null;
  }
}

export function dshMessageLooksLikeMutation(
  message: CrowdyStudioDshMessage,
): boolean {
  if (message.kind !== 'tool') return false;
  const title = (message.title ?? '').trim().toLowerCase();
  return (
    title === 'write' ||
    title === 'edit' ||
    title.startsWith('write ') ||
    title.startsWith('edit ')
  );
}

export function mergePendingUser(
  messages: CrowdyStudioDshMessage[],
  pending: CrowdyStudioDshMessage | null,
): CrowdyStudioDshMessage[] {
  if (!pending) return pinAskUserAnswers(messages);
  if (
    messages.some(
      (message) =>
        (message.kind === 'user' && message.text === pending.text) ||
        message.answeredText === pending.text,
    )
  ) {
    return pinAskUserAnswers(messages);
  }
  return pinAskUserAnswers([...messages, pending]);
}

/** True when the latest human prompt has no terminal reply yet. */
export function dshTurnInProgress(
  messages: readonly CrowdyStudioDshMessage[],
): boolean {
  let lastUserSeq = -1;
  for (const message of messages) {
    if (message.kind === 'user' && message.text.trim()) lastUserSeq = message.seq;
  }
  if (lastUserSeq < 0) return false;
  return !messages.some(
    (message) => message.seq > lastUserSeq && isTurnTerminal(message),
  );
}

/**
 * Working-strip visibility. A completed assistant bubble is idle unless this
 * tab is still waiting (`busy`). Tool/thinking cards can still light the
 * strip after a dumped question JSON, so later Read/Grep is visible.
 */
export function dshShouldShowWorking(
  messages: readonly CrowdyStudioDshMessage[],
  busy = false,
): boolean {
  if (busy) return true;
  const last = lastVisibleMessage(messages);
  if (!last) return false;
  if (last.kind === 'question') return false;
  if (last.kind === 'user') return false;
  if (last.kind === 'assistant') return false;
  if (last.kind === 'system' && last.text === 'Stopped.') return false;
  if (last.kind === 'error' && last.title === 'Add an OpenRouter API key') {
    return false;
  }
  return (
    last.kind === 'tool' ||
    last.kind === 'thinking' ||
    last.kind === 'todo' ||
    last.kind === 'error'
  );
}

export function dshHistoryFingerprint(
  messages: readonly CrowdyStudioDshMessage[],
): string {
  return messages
    .map((message) =>
      [
        message.seq,
        message.kind,
        message.title ?? '',
        message.text,
        message.answeredText ?? '',
      ].join('\u0001'),
    )
    .join('\u0002');
}

export function dshLastCardIsFinishedAssistant(
  messages: readonly CrowdyStudioDshMessage[],
): boolean {
  const last = lastVisibleMessage(messages);
  if (!last || last.kind !== 'assistant') return false;
  return !looksLikeAskUserQuestion(last);
}

/** True when the latest visible card looks like an in-flight tool step. */
export function dshTranscriptLooksActive(
  messages: readonly CrowdyStudioDshMessage[],
): boolean {
  const last = lastVisibleMessage(messages);
  if (!last) return false;
  if (last.kind === 'thinking' || last.kind === 'todo') return true;
  if (last.kind === 'tool') return true;
  return false;
}

function lastVisibleMessage(
  messages: readonly CrowdyStudioDshMessage[],
): CrowdyStudioDshMessage | null {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i]?.kind !== 'turn-end') return messages[i] ?? null;
  }
  return null;
}

/** Last meaningful step for the Working strip (skip generic Result cards). */
export function dshWorkingLabel(
  messages: readonly CrowdyStudioDshMessage[],
): string {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (message.kind === 'thinking') return 'Thinking';
    if (message.kind === 'tool') {
      const title = (message.title ?? '').trim();
      if (title && !isIdleToolTitle(title)) return title;
    }
    if (message.kind === 'assistant') return 'Writing';
  }
  return 'Working';
}

function isIdleToolTitle(title: string): boolean {
  const normalized = title.trim().toLowerCase();
  return (
    normalized === 'result' ||
    normalized === 'tool' ||
    normalized === 'error' ||
    normalized === 'todos'
  );
}

/** True once the agent moved on after an ask_user_question card. */
export function dshQuestionTurnContinued(
  messages: readonly CrowdyStudioDshMessage[],
): boolean {
  let lastQuestionSeq = -1;
  for (const message of messages) {
    if (message.kind === 'question' || looksLikeAskUserQuestion(message)) {
      lastQuestionSeq = message.seq;
    }
  }
  if (lastQuestionSeq < 0) return false;
  return messages.some((message) => {
    if (message.seq <= lastQuestionSeq) return false;
    if (message.kind === 'question' || looksLikeAskUserQuestion(message)) {
      return false;
    }
    return (
      message.kind === 'assistant' ||
      message.kind === 'tool' ||
      message.kind === 'thinking' ||
      message.kind === 'todo' ||
      message.kind === 'turn-end' ||
      message.kind === 'user'
    );
  });
}

export function turnSettledAfter(
  messages: CrowdyStudioDshMessage[],
  sentText: string,
): boolean {
  let lastUserSeq = -1;
  for (const message of messages) {
    if (
      (message.kind === 'user' && message.text === sentText) ||
      message.answeredText === sentText
    ) {
      lastUserSeq = message.seq;
    }
  }
  if (lastUserSeq < 0) return false;
  return messages.some(
    (message) => message.seq > lastUserSeq && isTurnTerminal(message),
  );
}

function lastUserText(messages: CrowdyStudioDshMessage[]): string | null {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (message?.kind === 'user' && message.text.trim()) return message.text;
  }
  return null;
}

function isTurnTerminal(message: CrowdyStudioDshMessage): boolean {
  if (message.kind === 'turn-end') return true;
  if (message.kind === 'question' || looksLikeAskUserQuestion(message)) {
    return true;
  }
  if (message.kind === 'system' && message.text === 'Stopped.') return true;
  return (
    message.kind === 'error' && message.title === 'Add an OpenRouter API key'
  );
}
