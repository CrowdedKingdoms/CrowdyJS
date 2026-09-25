import { decode, encode } from '@msgpack/msgpack';
import type { DecoderOptions } from '@msgpack/msgpack';

import type { GraphQLClient } from '../client.js';
import { CrowdyError } from '../errors.js';
import {
  ExecActivateVersionDocument,
  ExecAppStatusDocument,
  type ExecAppStatusFieldsFragment,
  ExecBuildDocument,
  type ExecBuildFieldsFragment,
  ExecBuildStatusDocument,
  ExecConnectAsDeveloperDocument,
  type ExecConnectAsDeveloperMutation,
  ExecConnectDocument,
  type ExecConnectMutation,
  ExecDeployDocument,
  ExecInstancesDocument,
  type ExecInstancesQuery,
  ExecLogsDocument,
  type ExecLogsQuery,
  ExecSetEnabledDocument,
  ExecStartersDocument,
  ExecVersionsDocument,
  type ExecVersionsQuery,
} from '../generated/graphql.js';

/**
 * ck-exec, the hub-and-spoke execution service (dev-tier preview).
 *
 * An app's code runs as **hubs** (stateful nodes, one per key, one handler at a
 * time) and **spokes** (stateless, replicated) on execution hosts. A player
 * connects to one host's gateway and calls any node of the app through it:
 *
 * ```ts
 * const exec = await client.exec.connect(appId, { nodeType: 'arena', key: 'm1' });
 * const hp = await exec.call('arena', 'm1', 'state');
 * const stop = await exec.subscribe('arena', 'm1', 'hp', (push) => render(push.value));
 * ```
 *
 * `connect` asks the game API for a host (`execConnect`, with the app-scoped token
 * of `appId` as the session token) and opens a WebSocket to its gateway. Frames are
 * ck-exec's client protocol (`ckx-proto/src/client.rs`); payloads are MessagePack.
 * The connection recovers by itself: a closed socket or a `Moved` reply asks for a
 * host again, renews every subscription, and retries the call once.
 */

/** Call statuses as the gateway sends them (`ckx_proto::Status`), by wire value. */
export const EXEC_STATUSES = [
  'Ok',
  'AppError',
  'Busy',
  'Moved',
  'NotFound',
  'DeadlineExceeded',
  'Denied',
  'RateLimited',
  'Unavailable',
  'Internal',
  'Trapped',
  'BadRequest',
] as const;

export type ExecStatus = (typeof EXEC_STATUSES)[number] | 'Unknown';

/** The status name for a wire value. */
export function execStatus(value: number): ExecStatus {
  return EXEC_STATUSES[value] ?? 'Unknown';
}

const RETRYABLE: ReadonlySet<ExecStatus> = new Set([
  'Busy',
  'Moved',
  'Unavailable',
  'RateLimited',
]);

/**
 * A call, subscription or connection that ck-exec refused or could not complete.
 * `status` is the platform's (`AppError` carries the handler's own message);
 * `retryable` says whether trying again later can succeed.
 */
export class CrowdyExecError extends CrowdyError {
  readonly status: ExecStatus;
  readonly retryable: boolean;

  constructor(status: ExecStatus, message: string, cause?: unknown) {
    super({ message: `${status}: ${message}`, cause });
    this.status = status;
    this.retryable = RETRYABLE.has(status);
  }
}

// ---- frames ----

/** A message from a client to a gateway. */
export type ExecClientFrame =
  | {
      kind: 'call';
      rid: number;
      nodeType: string;
      key: string;
      method: string;
      payload: Uint8Array;
    }
  | {
      kind: 'subscribe' | 'unsubscribe';
      rid: number;
      nodeType: string;
      key: string;
      topic: string;
    }
  | { kind: 'ping'; nonce: number };

/** A message from a gateway to a client. */
export type ExecServerFrame =
  | { kind: 'reply'; rid: number; status: number; payload: Uint8Array }
  | {
      kind: 'push';
      nodeType: string;
      key: string;
      topic: string;
      payload: Uint8Array;
    }
  | { kind: 'pong'; nonce: number };

const utf8 = new TextEncoder();
const fromUtf8 = new TextDecoder('utf-8', { fatal: true });

class FrameWriter {
  private parts: number[] = [];

  u8(v: number): this {
    this.parts.push(v & 0xff);
    return this;
  }

  u16(v: number): this {
    return this.u8(v).u8(v >>> 8);
  }

  u32(v: number): this {
    return this.u8(v).u8(v >>> 8).u8(v >>> 16).u8(v >>> 24);
  }

  str8(s: string, what: string): this {
    const b = utf8.encode(s);
    if (b.length > 0xff) throw new RangeError(`${what} is longer than 255 bytes`);
    this.u8(b.length);
    for (const x of b) this.parts.push(x);
    return this;
  }

  str16(s: string, what: string): this {
    const b = utf8.encode(s);
    if (b.length > 0xffff) throw new RangeError(`${what} is longer than 65535 bytes`);
    this.u16(b.length);
    for (const x of b) this.parts.push(x);
    return this;
  }

  finish(rest?: Uint8Array): Uint8Array {
    const out = new Uint8Array(this.parts.length + (rest?.length ?? 0));
    out.set(this.parts, 0);
    if (rest) out.set(rest, this.parts.length);
    return out;
  }
}

/** Encodes a client frame, as `ckx_proto::client::ClientMsg::encode` does. */
export function encodeExecFrame(f: ExecClientFrame): Uint8Array {
  const w = new FrameWriter();
  switch (f.kind) {
    case 'call':
      return w
        .u8(0x01)
        .u32(f.rid)
        .str8(f.nodeType, 'node type')
        .str16(f.key, 'key')
        .str8(f.method, 'method')
        .finish(f.payload);
    case 'subscribe':
    case 'unsubscribe':
      return w
        .u8(f.kind === 'subscribe' ? 0x02 : 0x03)
        .u32(f.rid)
        .str8(f.nodeType, 'node type')
        .str16(f.key, 'key')
        .str8(f.topic, 'topic')
        .finish();
    case 'ping':
      return w.u8(0x04).u32(f.nonce).finish();
  }
}

/** Decodes a gateway frame, as `ckx_proto::client::ServerMsg::decode` does. */
export function decodeExecFrame(bytes: Uint8Array): ExecServerFrame {
  let at = 0;
  const need = (n: number) => {
    if (at + n > bytes.length) throw new CrowdyExecError('BadRequest', 'truncated frame from the gateway');
  };
  const u8 = () => {
    need(1);
    return bytes[at++];
  };
  const u16 = () => {
    need(2);
    const v = bytes[at] | (bytes[at + 1] << 8);
    at += 2;
    return v;
  };
  const u32 = () => {
    need(4);
    const v = (bytes[at] | (bytes[at + 1] << 8) | (bytes[at + 2] << 16) | (bytes[at + 3] << 24)) >>> 0;
    at += 4;
    return v;
  };
  const str = (len: number) => {
    need(len);
    const s = fromUtf8.decode(bytes.subarray(at, at + len));
    at += len;
    return s;
  };
  const rest = () => bytes.slice(at);
  const tag = u8();
  switch (tag) {
    case 0x81: {
      const rid = u32();
      const status = u8();
      return { kind: 'reply', rid, status, payload: rest() };
    }
    case 0x82: {
      const nodeType = str(u8());
      const key = str(u16());
      const topic = str(u8());
      return { kind: 'push', nodeType, key, topic, payload: rest() };
    }
    case 0x84:
      return { kind: 'pong', nonce: u32() };
    default:
      throw new CrowdyExecError('BadRequest', `unknown frame type 0x${tag.toString(16)} from the gateway`);
  }
}

// ---- connection ----

/** A published message on a topic this connection subscribes to. */
export interface ExecPush<T = unknown> {
  nodeType: string;
  key: string;
  topic: string;
  /** The payload decoded from MessagePack (`undefined` when it is not MessagePack). */
  value: T;
  payload: Uint8Array;
}

export type ExecPushHandler<T = unknown> = (push: ExecPush<T>) => void;

/** What {@link ExecAPI.connect} returns for a host: where to dial and with what. */
export interface ExecEndpoint {
  gatewayUrl: string;
  token: string;
  host: string;
}

/** A WebSocket constructor, e.g. the global one or the `ws` package's. */
export type ExecWebSocketCtor = new (url: string) => WebSocket;

export interface ExecConnectOptions {
  /** Put the player on the host running this node type (with `key`), placing it if needed. */
  nodeType?: string;
  /** The instance key within `nodeType`; empty for the root hub or a spoke. */
  key?: string;
  /** How long a call waits for its reply, in milliseconds. Default 10 000. */
  callTimeoutMs?: number;
  /** Connect again when the socket closes unexpectedly. Default true. */
  reconnect?: boolean;
  /** A WebSocket implementation where there is no global one (older Node). */
  WebSocket?: ExecWebSocketCtor;
  /** MessagePack decoding options, e.g. `{ useBigInt64: true }` for 64-bit integers above 2^53. */
  decode?: DecoderOptions;
}

interface Reply {
  status: number;
  payload: Uint8Array;
  /** The socket that answered. */
  ws: WebSocket;
}

interface Pending {
  ws: WebSocket;
  resolve: (reply: Reply) => void;
  reject: (e: unknown) => void;
  timer: ReturnType<typeof setTimeout>;
}

const DEFAULT_CALL_TIMEOUT_MS = 10_000;
const OPEN_TIMEOUT_MS = 10_000;
const MAX_BACKOFF_MS = 5_000;

function subKey(nodeType: string, key: string, topic: string): string {
  return `${nodeType}\u0000${key}\u0000${topic}`;
}

/**
 * One player's connection to a ck-exec host. Calls go to any node of the app;
 * the host routes them. Subscriptions survive reconnects.
 */
export class ExecConnection {
  private ws: WebSocket | null = null;
  private endpoint: ExecEndpoint | null = null;
  private ready: Promise<void> | null = null;
  private readonly pending = new Map<number, Pending>();
  private readonly subs = new Map<string, Set<ExecPushHandler<any>>>();
  private nextRid = 1;
  private closed = false;
  private backoffMs = 250;
  private readonly reconnectListeners = new Set<(host: string) => void>();
  private readonly WS: ExecWebSocketCtor;
  private readonly callTimeoutMs: number;

  /** @internal Use {@link ExecAPI.connect} or {@link ExecConnection.open}. */
  constructor(
    private readonly dial: () => Promise<ExecEndpoint>,
    private readonly options: ExecConnectOptions = {},
  ) {
    const ctor = options.WebSocket ?? (globalThis as { WebSocket?: ExecWebSocketCtor }).WebSocket;
    if (!ctor) {
      throw new CrowdyExecError(
        'Unavailable',
        'no WebSocket implementation: pass options.WebSocket (e.g. the `ws` package) on this runtime',
      );
    }
    this.WS = ctor;
    this.callTimeoutMs = options.callTimeoutMs ?? DEFAULT_CALL_TIMEOUT_MS;
  }

  /**
   * Opens a connection to a known gateway with a connect token, without the game API
   * (tools and tests; a game uses {@link ExecAPI.connect}). It does not reconnect.
   */
  static async open(
    gatewayUrl: string,
    token: string,
    options: Omit<ExecConnectOptions, 'reconnect'> = {},
  ): Promise<ExecConnection> {
    const c = new ExecConnection(async () => ({ gatewayUrl, token, host: '' }), {
      ...options,
      reconnect: false,
    });
    await c.connect();
    return c;
  }

  /** The execution host this connection is on. */
  get host(): string {
    return this.endpoint?.host ?? '';
  }

  /** Called with the new host after every reconnect. */
  onReconnect(listener: (host: string) => void): () => void {
    this.reconnectListeners.add(listener);
    return () => this.reconnectListeners.delete(listener);
  }

  /** @internal */
  async connect(): Promise<void> {
    if (!this.ready) {
      this.ready = this.dialOnce().catch((e) => {
        this.ready = null;
        throw e;
      });
    }
    return this.ready;
  }

  private async dialOnce(): Promise<void> {
    const endpoint = await this.dial();
    const url = `${endpoint.gatewayUrl.replace(/\/+$/, '')}/v1/connect?token=${encodeURIComponent(endpoint.token)}`;
    const ws = new this.WS(url);
    ws.binaryType = 'arraybuffer';
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new CrowdyExecError('Unavailable', `could not reach ${endpoint.gatewayUrl} in ${OPEN_TIMEOUT_MS} ms`));
        try {
          ws.close();
        } catch {
          /* already closed */
        }
      }, OPEN_TIMEOUT_MS);
      ws.onopen = () => {
        clearTimeout(timer);
        resolve();
      };
      ws.onerror = (ev: Event) => {
        clearTimeout(timer);
        reject(new CrowdyExecError('Unavailable', `connecting to ${endpoint.gatewayUrl} failed`, ev));
      };
      ws.onclose = (ev: CloseEvent) => {
        clearTimeout(timer);
        reject(
          new CrowdyExecError(
            ev.code === 4401 ? 'Denied' : 'Unavailable',
            `the gateway closed the connection (${ev.code}${ev.reason ? `: ${ev.reason}` : ''})`,
          ),
        );
      };
    });
    this.ws = ws;
    this.endpoint = endpoint;
    this.backoffMs = 250;
    ws.onmessage = (ev: MessageEvent) => this.onMessage(ev.data);
    ws.onerror = () => {};
    ws.onclose = () => this.onClosed(ws);
  }

  private onMessage(data: unknown): void {
    let frame: ExecServerFrame;
    try {
      const bytes =
        data instanceof ArrayBuffer
          ? new Uint8Array(data)
          : ArrayBuffer.isView(data)
            ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
            : null;
      if (!bytes) return;
      frame = decodeExecFrame(bytes);
    } catch {
      return;
    }
    if (frame.kind === 'reply' || frame.kind === 'pong') {
      const rid = frame.kind === 'reply' ? frame.rid : frame.nonce;
      const p = this.pending.get(rid);
      if (!p) return;
      this.pending.delete(rid);
      clearTimeout(p.timer);
      p.resolve(
        frame.kind === 'reply'
          ? { status: frame.status, payload: frame.payload, ws: p.ws }
          : { status: 0, payload: new Uint8Array(), ws: p.ws },
      );
      return;
    }
    const handlers = this.subs.get(subKey(frame.nodeType, frame.key, frame.topic));
    if (!handlers) return;
    let value: unknown;
    try {
      value = decode(frame.payload, this.options.decode);
    } catch {
      value = undefined;
    }
    for (const h of handlers) {
      try {
        h({ nodeType: frame.nodeType, key: frame.key, topic: frame.topic, value, payload: frame.payload });
      } catch {
        /* a handler's exception is its own */
      }
    }
  }

  private rejectPending(ws: WebSocket, why: string): void {
    for (const [rid, p] of this.pending) {
      if (p.ws !== ws) continue;
      this.pending.delete(rid);
      clearTimeout(p.timer);
      p.reject(new CrowdyExecError('Unavailable', why));
    }
  }

  private onClosed(ws: WebSocket): void {
    this.rejectPending(ws, 'the connection to the execution host closed');
    if (this.ws !== ws) return;
    this.ws = null;
    this.ready = null;
    if (!this.closed && this.options.reconnect !== false) void this.reconnect();
  }

  private async reconnect(): Promise<void> {
    while (!this.closed) {
      try {
        await this.connect();
        await this.renewSubscriptions();
        for (const l of this.reconnectListeners) l(this.host);
        return;
      } catch {
        await new Promise((r) => setTimeout(r, this.backoffMs));
        this.backoffMs = Math.min(this.backoffMs * 2, MAX_BACKOFF_MS);
      }
    }
  }

  /**
   * Leaves the host `from` for the one the game API picks now, unless another
   * caller already has. Calls still waiting on `from` fail as Unavailable.
   */
  private async redial(from: WebSocket): Promise<void> {
    if (this.ws === from) {
      this.ws = null;
      this.ready = null;
      from.onclose = null;
      this.rejectPending(from, 'the connection moved to another host');
      try {
        from.close();
      } catch {
        /* already closed */
      }
      await this.connect();
      await this.renewSubscriptions();
      for (const l of this.reconnectListeners) l(this.host);
      return;
    }
    await this.connect();
  }

  private async renewSubscriptions(): Promise<void> {
    for (const k of this.subs.keys()) {
      const [nodeType, key, topic] = k.split('\u0000');
      await this.request({ kind: 'subscribe', rid: 0, nodeType, key, topic });
    }
  }

  private rid(): number {
    const rid = this.nextRid;
    this.nextRid = this.nextRid >= 0xffffffff ? 1 : this.nextRid + 1;
    return rid;
  }

  /** Sends one frame and waits for the reply with its rid. */
  private async request(frame: ExecClientFrame, timeoutMs = this.callTimeoutMs): Promise<Reply> {
    if (this.closed) throw new CrowdyExecError('Unavailable', 'the connection is closed');
    await this.connect();
    const ws = this.ws;
    if (!ws) throw new CrowdyExecError('Unavailable', 'not connected');
    const rid = this.rid();
    const f = frame.kind === 'ping' ? { ...frame, nonce: rid } : { ...frame, rid };
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(rid);
        reject(new CrowdyExecError('DeadlineExceeded', `no reply in ${timeoutMs} ms`));
      }, timeoutMs);
      this.pending.set(rid, { ws, resolve, reject, timer });
      try {
        ws.send(encodeExecFrame(f));
      } catch (e) {
        this.pending.delete(rid);
        clearTimeout(timer);
        reject(new CrowdyExecError('Unavailable', 'sending to the execution host failed', e));
      }
    });
  }

  /**
   * Calls a node's endpoint with raw bytes and returns the reply's bytes. A call
   * whose connection closes, or that is answered `Moved`, is tried once more on a
   * fresh connection.
   * @throws {CrowdyExecError} for any status but `Ok`.
   */
  async callRaw(
    nodeType: string,
    key: string,
    method: string,
    payload: Uint8Array = new Uint8Array(),
    options: { timeoutMs?: number } = {},
  ): Promise<Uint8Array> {
    const frame: ExecClientFrame = { kind: 'call', rid: 0, nodeType, key, method, payload };
    const recovers = this.options.reconnect !== false;
    let reply: Reply;
    try {
      reply = await this.request(frame, options.timeoutMs);
    } catch (e) {
      if (!recovers || !(e instanceof CrowdyExecError) || e.status !== 'Unavailable') throw e;
      reply = await this.request(frame, options.timeoutMs);
    }
    if (recovers && execStatus(reply.status) === 'Moved') {
      await this.redial(reply.ws);
      reply = await this.request(frame, options.timeoutMs);
    }
    const status = execStatus(reply.status);
    if (status !== 'Ok') {
      throw new CrowdyExecError(status, fromUtf8Lossy(reply.payload));
    }
    return reply.payload;
  }

  /**
   * Calls a node's endpoint: `args` go as MessagePack, the reply comes back decoded.
   * @throws {CrowdyExecError} for any status but `Ok`; `AppError` carries the handler's message.
   */
  async call<T = unknown>(
    nodeType: string,
    key: string,
    method: string,
    args?: unknown,
    options: { timeoutMs?: number } = {},
  ): Promise<T> {
    const payload = encode(args ?? null, { useBigInt64: true });
    const reply = await this.callRaw(nodeType, key, method, payload, options);
    return decode(reply, this.options.decode) as T;
  }

  /**
   * Receives what a node publishes on `topic`. Returns a function that stops
   * this handler (and the subscription, when it was the last one).
   */
  async subscribe<T = unknown>(
    nodeType: string,
    key: string,
    topic: string,
    onPush: ExecPushHandler<T>,
  ): Promise<() => Promise<void>> {
    const k = subKey(nodeType, key, topic);
    let handlers = this.subs.get(k);
    const first = !handlers;
    if (!handlers) {
      handlers = new Set();
      this.subs.set(k, handlers);
    }
    handlers.add(onPush);
    if (first) {
      try {
        const reply = await this.request({ kind: 'subscribe', rid: 0, nodeType, key, topic });
        const status = execStatus(reply.status);
        if (status !== 'Ok') throw new CrowdyExecError(status, fromUtf8Lossy(reply.payload));
      } catch (e) {
        handlers.delete(onPush);
        if (handlers.size === 0) this.subs.delete(k);
        throw e;
      }
    }
    return async () => {
      const set = this.subs.get(k);
      if (!set?.delete(onPush) || set.size > 0) return;
      this.subs.delete(k);
      if (this.ws) {
        await this.request({ kind: 'unsubscribe', rid: 0, nodeType, key, topic }).catch(() => undefined);
      }
    };
  }

  /** Round trip to the gateway, in milliseconds. */
  async ping(): Promise<number> {
    const t = Date.now();
    await this.request({ kind: 'ping', nonce: 0 });
    return Date.now() - t;
  }

  /** Closes the connection; it does not reconnect. */
  close(): void {
    this.closed = true;
    this.ws?.close();
    this.ws = null;
    this.ready = null;
  }
}

function fromUtf8Lossy(b: Uint8Array): string {
  return new TextDecoder().decode(b);
}

// ---- the domain ----

/** One node type of a deploy: its module and its manifest settings. */
export interface ExecNodeTypeInput {
  kind: 'hub' | 'spoke';
  /** The compiled module (`wasm32-unknown-unknown`, built with `ckx-sdk`). */
  wasm?: Uint8Array;
  /** Instead of `wasm`: a crate of the deploy's `buildId`. */
  crate?: string;
  /** The type that owns this one; none for the root. */
  parent?: string;
  /** Clients may call it through the gateway. */
  client?: boolean;
  /** Types it may call (and subscribe to); `*` for any. */
  calls?: string[];
  /** Any other manifest field (`persist_every_ms`, `replicas`, `seed_b64`, ...). */
  [field: string]: unknown;
}

export interface ExecDeployOptions {
  appId: string;
  /** The root hub's type name. */
  root: string;
  types: Record<string, ExecNodeTypeInput>;
  /** A succeeded {@link ExecAPI.build} of this app whose crates the types may name. */
  buildId?: string;
}

/** One crate for {@link ExecAPI.build}: its files by path (`Cargo.toml`, `src/lib.rs`, ...). */
export interface ExecCrate {
  name: string;
  files: Record<string, string> | ExecSourceFile[];
}

export interface ExecSourceFile {
  path: string;
  content: string;
}

/** A build: `queued`, `building`, `succeeded` or `failed`, its log, and one module per crate. */
export type ExecBuild = Omit<ExecBuildFieldsFragment, '__typename' | 'artifacts'> & {
  artifacts: Array<{ crate: string; digest: string; sizeBytes: number }>;
};

/** A starter crate, with its files ready for {@link ExecAPI.build}. */
export interface ExecStarter {
  crate: string;
  nodeType: string;
  description: string;
  files: ExecSourceFile[];
}

/** The starter packs, and the manifest that deploys them as one app, its types naming their crates. */
export interface ExecStarterPack {
  manifest: { root: string; types: Record<string, ExecNodeTypeInput> };
  starters: ExecStarter[];
}

function base64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(s);
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes as BufferSource));
  return Array.from(d, (x) => x.toString(16).padStart(2, '0')).join('');
}

/** One guest log line (`ctx.log`); `level` is 0 error, 1 warn, 2 info, 3 debug. */
export type ExecLogLine = Omit<ExecLogsQuery['execLogs'][number], '__typename'>;
/** An instance the execution manager has placed. */
export type ExecInstance = Omit<ExecInstancesQuery['execInstances'][number], '__typename'>;
/** A deployed version. */
export type ExecVersion = Omit<ExecVersionsQuery['execVersions'][number], '__typename'>;
/** An app's active version, kill switches and budget pause. */
export type ExecAppStatus = Omit<ExecAppStatusFieldsFragment, '__typename'>;

export interface ExecLogsOptions {
  nodeType?: string;
  key?: string;
  /** The least severe level included: 0 errors only … 3 everything (the default). */
  maxLevel?: number;
  /** Only lines older than this line id, to page back. */
  before?: string;
  /** At most this many lines (default 100, at most 500). */
  limit?: number;
}

function strip<T extends { __typename?: string }>(v: T): Omit<T, '__typename'> {
  const { __typename: _, ...rest } = v;
  return rest;
}

function build(b: ExecBuildFieldsFragment): ExecBuild {
  const { __typename: _, artifacts, ...rest } = b;
  return { ...rest, artifacts: artifacts.map(strip) };
}

/**
 * `client.exec`: connecting players to ck-exec, building and deploying an app's nodes (and
 * the starter packs), and operating them (logs, instances, versions, rollback, the kill
 * switch, developer connections).
 */
export class ExecAPI {
  constructor(private readonly graphql: GraphQLClient) {}

  /**
   * A host and a developer connect token for `appId` (valid for about a minute). The
   * session's calls arrive as `Caller::Developer` with your user id and may reach any
   * node type, not only `client` ones. Requires the org `manage_compute` permission and
   * your own session token, not an app token.
   */
  async developerEndpoint(
    appId: string,
    options: { nodeType?: string; key?: string } = {},
  ): Promise<ExecEndpoint & { expiresAt: string }> {
    const data: ExecConnectAsDeveloperMutation = await this.graphql.request(ExecConnectAsDeveloperDocument, {
      appId,
      nodeType: options.nodeType,
      key: options.key,
    });
    return data.execConnectAsDeveloper;
  }

  /**
   * Connects as one of the app's developers, for studio tools, manual runs and admin
   * endpoints. The same connection as {@link connect}, reconnecting with a fresh
   * developer token.
   */
  async connectAsDeveloper(appId: string, options: ExecConnectOptions = {}): Promise<ExecConnection> {
    const c = new ExecConnection(
      () => this.developerEndpoint(appId, { nodeType: options.nodeType, key: options.key }),
      options,
    );
    await c.connect();
    return c;
  }

  /** Guest log lines, newest first, kept for 24 hours. Requires `view_compute_diagnostics`. */
  async logs(appId: string, options: ExecLogsOptions = {}): Promise<ExecLogLine[]> {
    const data = await this.graphql.request(ExecLogsDocument, { appId, ...options });
    return data.execLogs.map(strip);
  }

  /** What the manager has placed for the app. Requires `view_compute_diagnostics`. */
  async instances(appId: string): Promise<ExecInstance[]> {
    const data = await this.graphql.request(ExecInstancesDocument, { appId });
    return data.execInstances.map(strip);
  }

  /** The app's versions, newest first. Requires `view_compute_diagnostics`. */
  async versions(appId: string): Promise<ExecVersion[]> {
    const data = await this.graphql.request(ExecVersionsDocument, { appId });
    return data.execVersions.map(strip);
  }

  /** The active version and the switches. Requires `view_compute_diagnostics`. */
  async status(appId: string): Promise<ExecAppStatus> {
    const data = await this.graphql.request(ExecAppStatusDocument, { appId });
    return strip(data.execAppStatus);
  }

  /**
   * Makes an earlier version active again, a rollback; instances pick it up when they
   * next start. Requires `manage_compute`.
   */
  async activateVersion(appId: string, version: number): Promise<ExecAppStatus> {
    const data = await this.graphql.request(ExecActivateVersionDocument, { appId, version });
    return strip(data.execActivateVersion);
  }

  /**
   * The kill switch, for the whole app or one node type. Off: nothing of it is placed,
   * what runs is persisted and stopped, and calls are refused with `Denied`. Requires
   * `manage_compute`.
   */
  async setEnabled(appId: string, enabled: boolean, nodeType?: string): Promise<ExecAppStatus> {
    const data = await this.graphql.request(ExecSetEnabledDocument, { appId, enabled, nodeType });
    return strip(data.execSetEnabled);
  }

  /**
   * The starter packs, which replace the compute templates: a world tick (the root hub), a
   * matchmaker, game sessions and an NPC and mob engine. Build them with {@link build} and
   * deploy the build with `manifest`. Requires `manage_compute`.
   */
  async starters(appId: string): Promise<ExecStarterPack> {
    const data = await this.graphql.request(ExecStartersDocument, { appId });
    return {
      manifest: JSON.parse(data.execStarters.manifestJson) as ExecStarterPack['manifest'],
      starters: data.execStarters.starters.map((s) => ({
        crate: s.crate,
        nodeType: s.nodeType,
        description: s.description,
        files: s.files.map(strip),
      })),
    };
  }

  /**
   * Builds crates into modules on the platform (`ckx-sdk`, `wasm32-unknown-unknown`), so you
   * need no Rust toolchain. Returns at once with the build queued; wait with
   * {@link waitForBuild}, then {@link deploy} with its `buildId`. Requires `manage_compute`.
   */
  async build(appId: string, crates: ExecCrate[]): Promise<ExecBuild> {
    const data = await this.graphql.request(ExecBuildDocument, {
      input: {
        appId,
        crates: crates.map((c) => ({
          name: c.name,
          files: Array.isArray(c.files)
            ? c.files
            : Object.entries(c.files).map(([path, content]) => ({ path, content })),
        })),
      },
    });
    return build(data.execBuild);
  }

  /** A build's status, log and modules, or null. Requires `view_compute_diagnostics`. */
  async buildStatus(appId: string, buildId: string): Promise<ExecBuild | null> {
    const data = await this.graphql.request(ExecBuildStatusDocument, { appId, buildId });
    return data.execBuildStatus ? build(data.execBuildStatus) : null;
  }

  /**
   * Polls a build until it succeeds or fails, and returns it either way; a failed build's
   * `log` says why. Throws when it is not done in `timeoutMs` (default 10 minutes).
   */
  async waitForBuild(
    appId: string,
    buildId: string,
    options: { intervalMs?: number; timeoutMs?: number } = {},
  ): Promise<ExecBuild> {
    const until = Date.now() + (options.timeoutMs ?? 600_000);
    for (;;) {
      const b = await this.buildStatus(appId, buildId);
      if (!b) throw new CrowdyError({ message: `no build ${buildId} in app ${appId}` });
      if (b.status === 'succeeded' || b.status === 'failed') return b;
      if (Date.now() > until) throw new CrowdyError({ message: `build ${buildId} is still ${b.status}` });
      await new Promise((r) => setTimeout(r, options.intervalMs ?? 2_000));
    }
  }

  /** A host for this player and its connect token (valid for about a minute). */
  async endpoint(
    appId: string,
    options: { nodeType?: string; key?: string } = {},
  ): Promise<ExecEndpoint & { expiresAt: string }> {
    const data: ExecConnectMutation = await this.graphql.request(ExecConnectDocument, {
      appId,
      nodeType: options.nodeType,
      key: options.key,
    });
    return data.execConnect;
  }

  /**
   * Connects the signed-in player to ck-exec for `appId`. The session token must be
   * that app's app-scoped token. With `nodeType` (and `key`) the player lands on the
   * host that runs that instance.
   */
  async connect(appId: string, options: ExecConnectOptions = {}): Promise<ExecConnection> {
    const c = new ExecConnection(
      () => this.endpoint(appId, { nodeType: options.nodeType, key: options.key }),
      options,
    );
    await c.connect();
    return c;
  }

  /**
   * Deploys a new version of the app's nodes and makes it active: the manifest, and
   * each distinct module once. A type gives its module as `wasm`, or names a `crate` of
   * `buildId`, whose modules the platform already holds. Running instances pick it up
   * when they next start. Requires the org `manage_compute` permission.
   */
  async deploy(options: ExecDeployOptions): Promise<{ version: number }> {
    const types: Record<string, unknown> = {};
    const artifacts = new Map<string, string>();
    for (const [name, t] of Object.entries(options.types)) {
      const { wasm, ...spec } = t;
      if (!wasm) {
        if (!spec.crate || !options.buildId) {
          throw new CrowdyError({ message: `type '${name}' needs its wasm, or a crate of the deploy's buildId` });
        }
        types[name] = spec;
        continue;
      }
      const digest = await sha256Hex(wasm);
      if (!artifacts.has(digest)) artifacts.set(digest, base64(wasm));
      types[name] = { ...spec, digest };
    }
    const data = await this.graphql.request(ExecDeployDocument, {
      input: {
        appId: options.appId,
        manifestJson: JSON.stringify({ root: options.root, types }),
        artifacts: [...artifacts].map(([digest, wasmBase64]) => ({ digest, wasmBase64 })),
        buildId: options.buildId,
      },
    });
    return data.execDeploy;
  }
}
