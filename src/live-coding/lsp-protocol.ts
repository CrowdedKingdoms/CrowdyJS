export type JsonRpcId = number | string;

export interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: JsonRpcId;
  method: string;
  params?: unknown;
}

export interface JsonRpcNotification {
  jsonrpc: '2.0';
  method: string;
  params?: unknown;
}

export interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: JsonRpcId | null;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

export type JsonRpcMessage =
  | JsonRpcRequest
  | JsonRpcNotification
  | JsonRpcResponse;

export interface Position {
  line: number;
  character: number;
}

export interface Range {
  start: Position;
  end: Position;
}

export interface Location {
  uri: string;
  range: Range;
}

export interface TextDocumentIdentifier {
  uri: string;
}

export interface VersionedTextDocumentIdentifier
  extends TextDocumentIdentifier {
  version: number;
}

export interface TextDocumentItem extends VersionedTextDocumentIdentifier {
  languageId: string;
  text: string;
}

export interface TextDocumentContentChangeEvent {
  range?: Range;
  text: string;
}

export interface Diagnostic {
  range: Range;
  severity: 1 | 2 | 3 | 4;
  source: 'crowdy-rust';
  code: string;
  message: string;
}

export interface CompletionItem {
  label: string;
  kind: number;
  detail?: string;
  documentation?: string;
  insertText?: string;
  sortText?: string;
}

export interface Hover {
  contents: {
    kind: 'markdown';
    value: string;
  };
  range?: Range;
}

export interface DocumentSymbol {
  name: string;
  detail?: string;
  kind: number;
  range: Range;
  selectionRange: Range;
}

export const JSON_RPC_ERRORS = {
  parseError: -32700,
  invalidRequest: -32600,
  methodNotFound: -32601,
  invalidParams: -32602,
  internalError: -32603,
  requestCancelled: -32800,
  contentModified: -32801,
} as const;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function decodeJsonRpcMessage(
  value: unknown,
):
  | { ok: true; message: JsonRpcMessage }
  | { ok: false; code: number; message: string; id: JsonRpcId | null } {
  let decoded = value;
  if (typeof value === 'string') {
    try {
      decoded = JSON.parse(value) as unknown;
    } catch {
      return {
        ok: false,
        code: JSON_RPC_ERRORS.parseError,
        message: 'Parse error',
        id: null,
      };
    }
  }
  if (!isRecord(decoded) || decoded.jsonrpc !== '2.0') {
    return {
      ok: false,
      code: JSON_RPC_ERRORS.invalidRequest,
      message: 'Invalid Request',
      id: null,
    };
  }
  const hasId = Object.prototype.hasOwnProperty.call(decoded, 'id');
  const id =
    typeof decoded.id === 'number' || typeof decoded.id === 'string'
      ? decoded.id
      : null;
  if (typeof decoded.method === 'string') {
    if (hasId && id === null) {
      return {
        ok: false,
        code: JSON_RPC_ERRORS.invalidRequest,
        message: 'Invalid Request',
        id: null,
      };
    }
    return {
      ok: true,
      message: {
        jsonrpc: '2.0',
        ...(id === null ? {} : { id }),
        method: decoded.method,
        ...('params' in decoded ? { params: decoded.params } : {}),
      } as JsonRpcRequest | JsonRpcNotification,
    };
  }
  if (
    hasId &&
    (id !== null || decoded.id === null) &&
    ('result' in decoded || isRecord(decoded.error))
  ) {
    return { ok: true, message: decoded as unknown as JsonRpcResponse };
  }
  return {
    ok: false,
    code: JSON_RPC_ERRORS.invalidRequest,
    message: 'Invalid Request',
    id,
  };
}
