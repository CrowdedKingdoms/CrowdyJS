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
  CrowdyStudioDshModel,
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

const GET_MODEL = `
  query CrowdyStudioDshModel {
    crowdyStudioDshModel {
      provider
      model
      options { id name }
    }
  }
`;

const SET_MODEL = `
  mutation CrowdyStudioDshSetModel($input: SetCrowdyStudioDshModelInput!) {
    crowdyStudioDshSetModel(input: $input) {
      provider
      model
      options { id name }
    }
  }
`;

const APPEND_CLIENT_LOGS = `
  mutation CrowdyStudioDshAppendClientLogs($input: AppendCrowdyStudioDshClientLogsInput!) {
    crowdyStudioDshAppendClientLogs(input: $input) {
      text
    }
  }
`;

const UPDATE_GAME_CONTEXT = `
  mutation CrowdyStudioDshUpdateGameContext($input: UpdateCrowdyStudioDshGameContextInput!) {
    crowdyStudioDshUpdateGameContext(input: $input) {
      text
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

  async getModel(): Promise<CrowdyStudioDshModel> {
    const data = await this.graphql.query<{
      crowdyStudioDshModel: {
        model: string;
        options: Array<{ id: string; name: string }>;
      };
    }>(GET_MODEL);
    return {
      modelId: data.crowdyStudioDshModel.model,
      options: data.crowdyStudioDshModel.options ?? [],
    };
  }

  async setModel(input: { modelId: string }): Promise<CrowdyStudioDshModel> {
    const data = await this.graphql.query<{
      crowdyStudioDshSetModel: {
        model: string;
        options: Array<{ id: string; name: string }>;
      };
    }>(SET_MODEL, { input: { model: input.modelId } });
    return {
      modelId: data.crowdyStudioDshSetModel.model,
      options: data.crowdyStudioDshSetModel.options ?? [],
    };
  }

  async appendClientLogs(input: {
    projectId: string;
    lines: ReadonlyArray<{
      at: string;
      level: number;
      message: string;
      target: string;
    }>;
  }): Promise<void> {
    if (!input.projectId.trim() || input.lines.length === 0) return;
    await this.graphql.query(APPEND_CLIENT_LOGS, {
      input: {
        projectId: input.projectId,
        lines: input.lines.map((line) => ({
          at: line.at,
          level: line.level,
          message: line.message,
          target: line.target === 'SERVER' ? 'SERVER' : 'CLIENT',
        })),
      },
    });
  }

  async updateGameContext(input: {
    projectId: string;
    currentChunk: { x: number; y: number; z: number };
    playerPosition?: { x: number; y: number; z: number } | null;
    gridId?: string | null;
    gridBounds?: {
      lowChunk: { x: number; y: number; z: number };
      highChunk: { x: number; y: number; z: number };
    } | null;
    blockCatalog?: ReadonlyArray<{ id: number; name: string }> | null;
  }): Promise<void> {
    if (!input.projectId.trim()) return;
    await this.graphql.query(UPDATE_GAME_CONTEXT, {
      input: {
        projectId: input.projectId,
        currentChunk: input.currentChunk,
        ...(input.playerPosition ? { playerPosition: input.playerPosition } : {}),
        ...(input.gridId ? { gridId: input.gridId } : {}),
        ...(input.gridBounds ? { gridBounds: input.gridBounds } : {}),
        ...(input.blockCatalog?.length ? { blockCatalog: [...input.blockCatalog] } : {}),
      },
    });
  }
}
