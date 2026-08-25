/**
 * GraphQL transport for the parallel DeepSeek Harness Studio dock.
 *
 * Uses raw query strings so this surface can ship without waiting on codegen
 * for the DEV-only crowdyStudioDsh* fields.
 */

import type { GraphQLClient } from '../../client.js';
import type {
  CrowdyStudioDshMessage,
  CrowdyStudioDshMessageKind,
  CrowdyStudioDshSessionSummary,
  CrowdyStudioDshTransport,
} from './controller.js';

const SESSION_FIELDS = `
  sessionId
  appId
  projectId
  title
  createdAt
  updatedAt
`;

const LIST_SESSIONS = `
  query CrowdyStudioDshSessions($appId: BigInt!, $projectId: String) {
    crowdyStudioDshSessions(appId: $appId, projectId: $projectId) {
      ${SESSION_FIELDS}
    }
  }
`;

const CREATE_SESSION = `
  mutation CrowdyStudioDshCreateSession($input: CreateCrowdyStudioDshSessionInput!) {
    crowdyStudioDshCreateSession(input: $input) {
      ${SESSION_FIELDS}
    }
  }
`;

const SEND_MESSAGE = `
  mutation CrowdyStudioDshSendMessage($input: SendCrowdyStudioDshMessageInput!) {
    crowdyStudioDshSendMessage(input: $input) {
      ${SESSION_FIELDS}
    }
  }
`;

const CANCEL = `
  mutation CrowdyStudioDshCancel($input: CancelCrowdyStudioDshSessionInput!) {
    crowdyStudioDshCancel(input: $input) {
      ${SESSION_FIELDS}
    }
  }
`;

const HISTORY = `
  query CrowdyStudioDshHistory($sessionId: String!, $maxMessages: Float) {
    crowdyStudioDshHistory(sessionId: $sessionId, maxMessages: $maxMessages) {
      session { ${SESSION_FIELDS} }
      messages { seq role kind title text }
    }
  }
`;

function mapSession(raw: {
  sessionId: string;
  appId: string | number;
  projectId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}): CrowdyStudioDshSessionSummary {
  return {
    sessionId: raw.sessionId,
    projectId: raw.projectId,
    title: raw.title,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
  };
}

const KINDS: readonly CrowdyStudioDshMessageKind[] = [
  'user',
  'assistant',
  'tool',
  'todo',
  'thinking',
  'system',
  'turn-end',
  'error',
  'question',
];

function mapMessage(raw: {
  seq: number;
  role: string;
  kind?: string | null;
  title?: string | null;
  text: string;
}): CrowdyStudioDshMessage {
  const role = raw.role.toUpperCase();
  const mappedRole =
    role === 'USER' || role === 'ASSISTANT' || role === 'SYSTEM'
      ? role
      : 'UNKNOWN';
  const kindRaw = (raw.kind ?? '').toLowerCase();
  const kind = KINDS.includes(kindRaw as CrowdyStudioDshMessageKind)
    ? (kindRaw as CrowdyStudioDshMessageKind)
    : mappedRole === 'USER'
      ? 'user'
      : mappedRole === 'ASSISTANT'
        ? 'assistant'
        : mappedRole === 'SYSTEM'
          ? 'system'
          : 'system';
  return {
    seq: raw.seq,
    role: mappedRole,
    kind,
    title: raw.title ?? null,
    text: raw.text,
  };
}

export class CrowdyStudioDshGraphQLTransport
  implements CrowdyStudioDshTransport
{
  constructor(private readonly graphql: GraphQLClient) {}

  async listSessions(input: {
    appId: string;
    projectId: string;
  }): Promise<CrowdyStudioDshSessionSummary[]> {
    const data = await this.graphql.query<{
      crowdyStudioDshSessions: Array<Parameters<typeof mapSession>[0]>;
    }>(LIST_SESSIONS, {
      appId: input.appId,
      projectId: input.projectId,
    });
    return (data.crowdyStudioDshSessions ?? []).map(mapSession);
  }

  async createSession(input: {
    appId: string;
    projectId: string;
    idempotencyKey: string;
  }): Promise<CrowdyStudioDshSessionSummary> {
    const data = await this.graphql.query<{
      crowdyStudioDshCreateSession: Parameters<typeof mapSession>[0];
    }>(CREATE_SESSION, {
      input: {
        appId: input.appId,
        projectId: input.projectId,
        idempotencyKey: input.idempotencyKey,
      },
    });
    return mapSession(data.crowdyStudioDshCreateSession);
  }

  async sendMessage(input: {
    sessionId: string;
    content: string;
    idempotencyKey: string;
  }): Promise<CrowdyStudioDshSessionSummary> {
    const data = await this.graphql.query<{
      crowdyStudioDshSendMessage: Parameters<typeof mapSession>[0];
    }>(SEND_MESSAGE, {
      input: {
        sessionId: input.sessionId,
        content: input.content,
        idempotencyKey: input.idempotencyKey,
      },
    });
    return mapSession(data.crowdyStudioDshSendMessage);
  }

  async cancel(input: {
    sessionId: string;
  }): Promise<CrowdyStudioDshSessionSummary> {
    const data = await this.graphql.query<{
      crowdyStudioDshCancel: Parameters<typeof mapSession>[0];
    }>(CANCEL, {
      input: { sessionId: input.sessionId },
    });
    return mapSession(data.crowdyStudioDshCancel);
  }

  async history(input: {
    sessionId: string;
    maxMessages?: number;
  }): Promise<{
    session: CrowdyStudioDshSessionSummary;
    messages: CrowdyStudioDshMessage[];
  }> {
    const data = await this.graphql.query<{
      crowdyStudioDshHistory: {
        session: Parameters<typeof mapSession>[0];
        messages: Array<Parameters<typeof mapMessage>[0]>;
      };
    }>(HISTORY, {
      sessionId: input.sessionId,
      maxMessages: input.maxMessages,
    });
    const history = data.crowdyStudioDshHistory;
    return {
      session: mapSession(history.session),
      messages: (history.messages ?? []).map(mapMessage),
    };
  }
}
