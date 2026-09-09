import type { CrowdyAgentSessionV1 } from './types.js';

/** Statuses that can be reattached after Studio closes. */
const REOPENABLE = new Set(['ACTIVE', 'PAUSED']);

/**
 * Fresh create+attach usually writes SESSION_CREATED, CLIENT_ATTACHED, and
 * maybe MODE_SELECTED. Anything above this has a real turn.
 */
export const AGENT_SESSION_EMPTYISH_LAST_SEQ = 3n;

export interface StudioSessionMemory {
  get(key: string): string | null;
  set(key: string, value: string): void;
}

export interface AgentSessionResumeBinding {
  readonly projectId?: string;
  readonly gridId?: string;
  readonly preferredSessionId?: string | null;
}

export function agentSessionMemoryKey(
  appId: string,
  projectId?: string,
): string {
  return `ck-crowdy-studio-agent-session:${appId}:${projectId ?? '_'}`;
}

export function browserSessionMemory(): StudioSessionMemory | null {
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

/**
 * Choose the session Studio should reopen instead of creating another empty
 * one. Preferred id wins; otherwise a session that already has turns beats a
 * pile of unused create-on-open leftovers; then latest `updatedAt`.
 */
export function pickResumableAgentSession(
  sessions: readonly CrowdyAgentSessionV1[],
  binding: AgentSessionResumeBinding,
): CrowdyAgentSessionV1 | null {
  const candidates = sessions.filter((session) =>
    sessionMatchesBinding(session, binding),
  );
  if (candidates.length === 0) return null;

  const preferredId = binding.preferredSessionId;
  if (preferredId) {
    const preferred = candidates.find(
      (session) => session.sessionId === preferredId,
    );
    if (preferred) return preferred;
  }

  const withTurns = candidates.filter(
    (session) => eventSeq(session.lastEventSeq) > AGENT_SESSION_EMPTYISH_LAST_SEQ,
  );
  const pool = withTurns.length > 0 ? withTurns : candidates;
  return (
    [...pool].sort((left, right) => {
      const updated = right.updatedAt.localeCompare(left.updatedAt);
      if (updated !== 0) return updated;
      const seq = eventSeq(right.lastEventSeq) - eventSeq(left.lastEventSeq);
      return seq > 0n ? 1 : seq < 0n ? -1 : 0;
    })[0] ?? null
  );
}

function sessionMatchesBinding(
  session: CrowdyAgentSessionV1,
  binding: AgentSessionResumeBinding,
): boolean {
  if (!REOPENABLE.has(session.status)) return false;
  if (binding.projectId) {
    if (session.projectId !== binding.projectId) return false;
  } else if (session.projectId) {
    return false;
  }
  if (
    binding.gridId &&
    session.gridId &&
    session.gridId !== binding.gridId
  ) {
    return false;
  }
  return true;
}

function eventSeq(value: string): bigint {
  try {
    return BigInt(value);
  } catch {
    return 0n;
  }
}
