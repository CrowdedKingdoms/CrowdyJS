import { decode, encode } from '@msgpack/msgpack';
import type { DecoderOptions } from '@msgpack/msgpack';

import { isSameEstate } from '../binary-relay.js';
import type { GraphQLClient } from '../client.js';
import { CROWDY_DEFAULT_HTTP_ORIGIN } from '../default-origin.js';
import { CrowdyError, CrowdyProtocolError } from '../errors.js';
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
  ExecConsentClientModDocument,
  ExecDeployDocument,
  ExecEndpointStatsDocument,
  type ExecEndpointStatsQuery,
  ExecGridClientModsDocument,
  type ExecGridClientModFieldsFragment,
  ExecInstancesDocument,
  type ExecInstancesQuery,
  ExecLogsDocument,
  type ExecLogsQuery,
  ExecAppModsDocument,
  ExecModBuildDocument,
  ExecModBuildStatusDocument,
  ExecModClientArtifactDocument,
  type ExecModClientArtifactQuery,
  ExecModClientBuildDocument,
  ExecModClientDeleteDocument,
  ExecModClientDeployDocument,
  type ExecModClientFieldsFragment,
  ExecModDeleteDocument,
  ExecModDeployDocument,
  type ExecModFieldsFragment,
  ExecModInstallDocument,
  type ExecModListingFieldsFragment,
  ExecModListingsDocument,
  ExecModLogsDocument,
  ExecModPublishDocument,
  ExecModScope,
  ExecModSetEnabledDocument,
  ExecModSetSwitchDocument,
  ExecModStarterDocument,
  type ExecModSwitchFieldsFragment,
  ExecModSwitchesDocument,
  ExecModUnpublishDocument,
  ExecModsDocument,
  ExecMyModsDocument,
  ExecRevokeAuthorTrustDocument,
  ExecRevokeClientModConsentDocument,
  ExecSetEnabledDocument,
  ExecStartersDocument,
  ExecTrustAuthorDocument,
  ExecVersionsDocument,
  type ExecVersionsQuery,
} from '../generated/graphql.js';

export { ExecModScope };

/**
 * ck-exec, the hub-and-spoke execution service.
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
 * of `appId` as the session token) and opens a WebSocket to its gateway, once the
 * gateway passes {@link execGatewayRefusal}. Frames are
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

const RETRY_IN = /retry in (\d+) ms/;

/**
 * A call, subscription or connection that ck-exec refused or could not complete.
 * `status` is the platform's (`AppError` carries the handler's own message);
 * `retryable` says whether trying again later can succeed.
 *
 * The SDK never retries a `Busy` reply. A gateway refuses a player's call over its
 * limit (120 calls per 10 s per player and app on a host) as `Busy` with a message
 * starting `rate limited`: `rateLimited` is then true and `retryAfterMs` says how long
 * to wait. Calling again sooner is refused again and does not shorten the wait.
 */
export class CrowdyExecError extends CrowdyError {
  readonly status: ExecStatus;
  readonly retryable: boolean;
  /** The caller's call limit refused it (`Busy` "rate limited …", or `RateLimited`). */
  readonly rateLimited: boolean;
  /** How long to wait before calling again, when the refusal says (`retry in N ms`). */
  readonly retryAfterMs: number | undefined;

  constructor(status: ExecStatus, message: string, cause?: unknown) {
    super({ message: `${status}: ${message}`, cause });
    this.status = status;
    this.retryable = RETRYABLE.has(status);
    this.rateLimited =
      status === 'RateLimited' || (status === 'Busy' && message.startsWith('rate limited'));
    const retryIn = this.rateLimited ? RETRY_IN.exec(message) : null;
    this.retryAfterMs = retryIn ? Number(retryIn[1]) : undefined;
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
  /**
   * A WebSocket implementation where there is no global one (older Node). With Node's `ws`
   * package, a gateway that refuses the connect token (`HTTP 401`) is reported as `Denied`
   * with the gateway's reason; a browser, and Node's built-in WebSocket, cannot read a refused
   * upgrade, so there it is `Unavailable`. A gateway before ck-exec 0.10.0 closed with 4401,
   * which is `Denied` everywhere.
   */
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

// ---- where a connect token may go ----

function parseUrl(raw: string, base?: string): URL | null {
  try {
    return new URL(raw, base);
  } catch {
    return null;
  }
}

function isIpLiteral(host: string): boolean {
  return host.startsWith('[') || /^\d{1,3}(\.\d{1,3}){3}$/.test(host);
}

function isLoopback(host: string): boolean {
  return (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host === '[::1]' ||
    /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)
  );
}

/** One host, or two DNS names that {@link isSameEstate} puts on one estate. Never two IPs. */
function sameEstate(a: URL, b: URL): boolean {
  if (a.hostname === b.hostname) return true;
  if (isIpLiteral(a.hostname) || isIpLiteral(b.hostname)) return false;
  return isSameEstate(a.href, b.href);
}

/**
 * Why {@link ExecAPI.connect} will not send a connect token to `gatewayUrl`, or null when it
 * will. The game API names the gateway, and the token rides in its query string, so a gateway
 * must be `ws:` or `wss:` (`wss:` whenever the game API is `https:`), carry no credentials,
 * and be on the estate of the game API or of this release's default origin
 * (`CROWDY_DEFAULT_HTTP_ORIGIN`, the tier the SDK was published for), as
 * `BinaryRelayTransport` holds a reconnect directive to its estate. A game API on loopback
 * (ck-exec's local cluster) may also name a loopback gateway. `gameApiUrl` may be relative to
 * the page.
 */
export function execGatewayRefusal(gameApiUrl: string, gatewayUrl: string): string | null {
  const gateway = parseUrl(gatewayUrl);
  if (!gateway) return 'it is not an absolute URL';
  if (gateway.protocol !== 'ws:' && gateway.protocol !== 'wss:') {
    return `${gateway.protocol} is not a WebSocket scheme`;
  }
  if (gateway.username || gateway.password) return 'it carries credentials';
  const page = (globalThis as { location?: { href?: string } }).location?.href;
  const api = parseUrl(gameApiUrl, page);
  if (!api) return `the game API URL ${gameApiUrl} is not absolute`;
  if (api.protocol === 'https:' && gateway.protocol !== 'wss:') {
    return 'a game API on https: hands out wss: gateways only';
  }
  if (sameEstate(api, gateway)) return null;
  const tier = parseUrl(CROWDY_DEFAULT_HTTP_ORIGIN);
  if (tier && sameEstate(tier, gateway)) return null;
  if (isLoopback(api.hostname) && isLoopback(gateway.hostname)) return null;
  const estates = tier && tier.hostname !== api.hostname ? `${api.hostname} and ${tier.hostname}` : api.hostname;
  return `${gateway.hostname} is outside the estate of ${estates}`;
}

/**
 * A gateway's close as an error. 4401 is how a gateway before ck-exec 0.10.0 refused a token:
 * it upgraded, then closed, so a call already in flight learns of it here.
 */
function closedError(ev: { code: number; reason?: string }): CrowdyExecError {
  return new CrowdyExecError(
    ev.code === 4401 ? 'Denied' : 'Unavailable',
    `the gateway closed the connection (${ev.code}${ev.reason ? `: ${ev.reason}` : ''})`,
  );
}

const REFUSAL_REASON_MAX_CHARS = 500;
const REFUSAL_BODY_WAIT_MS = 1_000;

/** The answer to a refused upgrade, as Node's `ws` package hands it to `unexpected-response`. */
interface UpgradeAnswer {
  statusCode?: number;
  setEncoding?(encoding: string): void;
  on(event: 'data', listener: (chunk: string) => void): void;
  on(event: 'end' | 'error' | 'close', listener: () => void): void;
}

/**
 * Calls `refused` with the status and body of an upgrade the gateway answered with something
 * other than 101. Since ck-exec 0.10.0 a gateway answers a refused connect token `401` and a
 * player past their session cap `429`, each with the reason as its body, before any
 * WebSocket exists. Only Node's `ws` package can read that answer; a browser's WebSocket, and
 * Node's built-in one, see a failed connection and nothing else.
 */
function onUpgradeRefused(ws: WebSocket, refused: (status: number, reason: string) => void): void {
  const node = ws as unknown as {
    on?: (event: 'unexpected-response', listener: (req: unknown, res: UpgradeAnswer) => void) => void;
    terminate?: () => void;
  };
  if (typeof node.on !== 'function') return;
  node.on('unexpected-response', (_req, res) => {
    let body = '';
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      refused(res.statusCode ?? 0, body.replace(/\s+/g, ' ').trim().slice(0, REFUSAL_REASON_MAX_CHARS));
      // With a listener, `ws` leaves the handshake to it: end it, which also closes the socket.
      node.terminate?.();
    };
    const timer = setTimeout(finish, REFUSAL_BODY_WAIT_MS);
    res.setEncoding?.('utf8');
    res.on('data', (chunk) => {
      body += chunk;
      if (body.length > REFUSAL_REASON_MAX_CHARS) finish();
    });
    res.on('end', finish);
    res.on('error', finish);
    res.on('close', finish);
  });
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
   * (tools and tests; a game uses {@link ExecAPI.connect}). It does not reconnect, and it
   * dials the URL it is given: {@link execGatewayRefusal} judges only what the game API names.
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
      onUpgradeRefused(ws, (status, reason) => {
        clearTimeout(timer);
        reject(
          new CrowdyExecError(
            status === 401 ? 'Denied' : 'Unavailable',
            `the gateway refused the connection (HTTP ${status}${reason ? `: ${reason}` : ''})`,
          ),
        );
      });
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
        reject(closedError(ev));
      };
    });
    this.ws = ws;
    this.endpoint = endpoint;
    this.backoffMs = 250;
    ws.onmessage = (ev: MessageEvent) => this.onMessage(ev.data);
    ws.onerror = () => {};
    ws.onclose = (ev: CloseEvent) => this.onClosed(ws, ev);
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

  private rejectPending(ws: WebSocket, why: string | CrowdyExecError): void {
    for (const [rid, p] of this.pending) {
      if (p.ws !== ws) continue;
      this.pending.delete(rid);
      clearTimeout(p.timer);
      p.reject(typeof why === 'string' ? new CrowdyExecError('Unavailable', why) : why);
    }
  }

  private onClosed(ws: WebSocket, ev?: CloseEvent): void {
    this.rejectPending(ws, ev?.code === 4401 ? closedError(ev) : 'the connection to the execution host closed');
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
   * fresh connection. A `Busy` reply is not retried: see {@link CrowdyExecError.retryAfterMs}.
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

/**
 * A CLIENT half's capability summary, which the build derives from the module and its author
 * cannot declare: the module's imports, the client host calls it can reach, their capability
 * groups, its presentation hooks and exports. Visitors consent to its hash.
 */
export interface ExecClientCapabilitySummary {
  version: number;
  target: 'client';
  /** The module's WASM imports as `module.name`. */
  imports: string[];
  /** The client host calls it can reach. */
  hostFunctions: string[];
  /** The host catalog groups of those calls. */
  capabilityGroups: string[];
  /** HUD and overlay hooks among them. */
  presentationHooks: string[];
  /** The functions the module exports. */
  exportedFunctions: string[];
  [field: string]: unknown;
}

/**
 * One module of a build. A CLIENT build's (`kind` `client`) carries its capability summary,
 * the hash visitors consent to and its tick interval; a ck-exec module's are null.
 */
export type ExecBuildArtifact = Omit<ExecBuildFieldsFragment['artifacts'][number], '__typename'> & {
  capabilitySummary: ExecClientCapabilitySummary | null;
};

/**
 * A build: `queued`, `building`, `succeeded` or `failed`, its log, and one module per crate.
 * `kind` is `exec` for ck-exec modules and `client` for the CLIENT half of a mod.
 */
export type ExecBuild = Omit<ExecBuildFieldsFragment, '__typename' | 'artifacts'> & {
  artifacts: ExecBuildArtifact[];
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

function fromBase64(b64: string): Uint8Array {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes as BufferSource));
  return Array.from(d, (x) => x.toString(16).padStart(2, '0')).join('');
}

/**
 * One guest log line (`ctx.log`); `level` is 0 error, 1 warn, 2 info, 3 debug. `flow` is the
 * call it was written in (32 lowercase hex digits, shared by everything that call caused, on
 * any host), or null outside a call; pass it as {@link ExecLogsOptions.flow} to follow it.
 */
export type ExecLogLine = Omit<ExecLogsQuery['execLogs'][number], '__typename'>;
/** An instance the execution manager has placed. */
export type ExecInstance = Omit<ExecInstancesQuery['execInstances'][number], '__typename'>;
/** A node type in a deployed manifest, as {@link ExecVersion.manifest} shows it. */
export interface ExecManifestType {
  kind: 'hub' | 'spoke';
  parent?: string;
  client?: boolean;
  calls?: string[];
  /** The spawn seed's size in bytes; the seed itself is not returned. */
  seed_bytes?: number;
  /** Node API scopes, limits and any other manifest field. */
  [field: string]: unknown;
}

/** A deployed manifest: the root hub and each node type. */
export interface ExecManifest {
  root: string;
  types: Record<string, ExecManifestType>;
  [field: string]: unknown;
}

/**
 * A deployed version. `manifestJson` is its manifest as the game API returns it, and
 * `manifest` the same parsed; both are null when the version's row is gone.
 */
export type ExecVersion = Omit<ExecVersionsQuery['execVersions'][number], '__typename'> & {
  manifest: ExecManifest | null;
};
/**
 * Calls to one endpoint (a node type's `method`) over a window, by outcome. `busy` includes
 * calls refused by the caller's call limit; the latencies are over `timedCalls` and null
 * when none was timed.
 */
export type ExecEndpointStat = Omit<ExecEndpointStatsQuery['execEndpointStats'][number], '__typename'>;
/** An app's active version, kill switches and budget pause. */
export type ExecAppStatus = Omit<ExecAppStatusFieldsFragment, '__typename'>;
/**
 * A mod: a player's code on a grid they own, the node type `mod:<name>` keyed by the grid id
 * (call it with {@link execModType}). It runs as its owner while `enabled` and `blocked` is null.
 */
export type ExecMod = Omit<ExecModFieldsFragment, '__typename'>;
/**
 * A published mod other grid owners may install (no payments). `clientDigest` and the other
 * `client*` fields describe the CLIENT half it had when published (null without one), which an
 * install attaches to the installer's mod; `clientCapabilitySummary` is that summary parsed,
 * for an installer to review first.
 */
export type ExecModListing = Omit<ExecModListingFieldsFragment, '__typename'> & {
  clientCapabilitySummary: ExecClientCapabilitySummary | null;
};
/** A rung of the app's mods kill ladder that is off. */
export type ExecModSwitch = Omit<ExecModSwitchFieldsFragment, '__typename'>;

/**
 * The CLIENT half attached to a mod: browser WASM built from a `crowdy-client-sdk` crate, which
 * the mod's grid serves to visitors who consent to its `capabilityHash` or trust its author.
 */
export type ExecModClient = Omit<ExecModClientFieldsFragment, '__typename'> & {
  capabilitySummary: ExecClientCapabilitySummary | null;
};

/**
 * A CLIENT half a grid serves, with the caller's consent and their trust in its author.
 * `capabilitySummary` and `authorCapabilitySummary` are the two JSON fields parsed (null when
 * they do not parse); the author's is the union a one-per-author trust prompt shows.
 */
export type ExecGridClientMod = Omit<ExecGridClientModFieldsFragment, '__typename'> & {
  capabilitySummary: ExecClientCapabilitySummary | null;
  authorCapabilitySummary: ExecClientCapabilitySummary | null;
};

/**
 * A served CLIENT half's module as the game API returns it: `wasmBase64`, the `digest` to check
 * it against, and `fuelPerDispatch` (a decimal string) to load into its `ck_fuel` global.
 */
export type ExecModClientArtifact = Omit<ExecModClientArtifactQuery['execModClientArtifact'], '__typename'> & {
  capabilitySummary: ExecClientCapabilitySummary | null;
};

/** {@link ExecModClientArtifact} decoded and checked for `PlayerCodeBroker` (`engine: 'ck-exec'`). */
export interface ExecModClientArtifactBytes {
  modId: string;
  /** The mod's name: its name on the page's grid event bus. */
  name: string;
  gridId: string;
  clientVersion: number;
  /** The module; its SHA-256 is `digest`. */
  bytes: ArrayBuffer;
  /** SHA-256 of `bytes`, lowercase hex. */
  digest: string;
  sizeBytes: number;
  /** Fuel for each dispatch (init, tick, invoke, event). */
  fuelPerDispatch: bigint;
  /** How often to tick it, in milliseconds (16-1000). */
  tickIntervalMs: number;
  capabilitySummaryJson: string;
  /** What the player consented to; its `hostFunctions` bound the module in the broker. */
  capabilitySummary: ExecClientCapabilitySummary;
  capabilityHash: string;
  abiVersion: number;
}

/** The CLIENT ABI version the player runtime's glue implements (crowdy-client-sdk `ABI_VERSION`). */
export const EXEC_CLIENT_ABI_VERSION = 0;

/** The node type players call a mod by: `mod:<name>`, keyed by its grid id. */
export function execModType(name: string): string {
  return `mod:${name}`;
}

export interface ExecLogsOptions {
  nodeType?: string;
  key?: string;
  /** The least severe level included: 0 errors only … 3 everything (the default). */
  maxLevel?: number;
  /** Only lines older than this line id, to page back. */
  before?: string;
  /** At most this many lines (default 100, at most 500). */
  limit?: number;
  /** Only lines of this flow (a line's `flow`, 32 hex digits): one call through every hub and host. */
  flow?: string;
}

export interface ExecEndpointStatsOptions {
  /** Only this node type's endpoints. */
  nodeType?: string;
  /** How far back, in minutes: default 60, at most 10 080 (7 days). */
  sinceMinutes?: number;
}

function parseManifest(json: string | null | undefined): ExecManifest | null {
  if (!json) return null;
  try {
    return JSON.parse(json) as ExecManifest;
  } catch {
    return null;
  }
}

/** An array of strings, as a capability summary's `hostFunctions` must be. */
export function isNameList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((name) => typeof name === 'string');
}

function parseCapabilities(json: string | null | undefined): ExecClientCapabilitySummary | null {
  if (!json) return null;
  try {
    const parsed: unknown = JSON.parse(json);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as ExecClientCapabilitySummary)
      : null;
  } catch {
    return null;
  }
}

// Generated result types carry `__typename` only where an operation selects it, so it is
// optional here; a response that has one still loses it.
function strip<T extends object>(v: T): Omit<T, '__typename'> {
  const { __typename: _, ...rest } = v as T & { __typename?: string };
  return rest;
}

function build(b: ExecBuildFieldsFragment): ExecBuild {
  const { __typename: _, artifacts, ...rest } = b as ExecBuildFieldsFragment & { __typename?: string };
  return {
    ...rest,
    artifacts: artifacts.map((a) => ({
      ...strip(a),
      capabilitySummary: parseCapabilities(a.capabilitySummaryJson),
    })),
  };
}

function listing(l: ExecModListingFieldsFragment): ExecModListing {
  return { ...strip(l), clientCapabilitySummary: parseCapabilities(l.clientCapabilitySummaryJson) };
}

function crateInput(crate: ExecCrate): { name: string; files: ExecSourceFile[] } {
  const files = Array.isArray(crate.files)
    ? crate.files
    : Object.entries(crate.files).map(([path, content]) => ({ path, content }));
  return { name: crate.name, files };
}

/**
 * `client.exec`: connecting players to ck-exec, building and deploying an app's nodes (and
 * the starter packs), operating them (logs, instances, versions, rollback, the kill switch,
 * developer connections), and players' mods with their CLIENT halves.
 */
export class ExecAPI {
  constructor(private readonly graphql: GraphQLClient) {}

  /** `fetch`, refusing a gateway {@link execGatewayRefusal} will not send a token to. */
  private checked(fetch: () => Promise<ExecEndpoint>): () => Promise<ExecEndpoint> {
    return async () => {
      const endpoint = await fetch();
      const why = execGatewayRefusal(this.graphql.endpoint ?? CROWDY_DEFAULT_HTTP_ORIGIN, endpoint.gatewayUrl);
      if (why) throw new CrowdyExecError('Unavailable', `refusing the gateway ${endpoint.gatewayUrl}: ${why}`);
      return endpoint;
    };
  }

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
      this.checked(() => this.developerEndpoint(appId, { nodeType: options.nodeType, key: options.key })),
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

  /** The app's versions, newest first, with their manifests. Requires `view_compute_diagnostics`. */
  async versions(appId: string): Promise<ExecVersion[]> {
    const data = await this.graphql.request(ExecVersionsDocument, { appId });
    return data.execVersions.map((v) => {
      const version = strip(v);
      return { ...version, manifest: parseManifest(version.manifestJson) };
    });
  }

  /**
   * Calls to each endpoint of the app's code over the last `sinceMinutes` (default 60), by
   * outcome and with their latency, most called first. Each host reports a minute once it
   * ends. Requires `view_compute_diagnostics`.
   */
  async endpointStats(appId: string, options: ExecEndpointStatsOptions = {}): Promise<ExecEndpointStat[]> {
    const data = await this.graphql.request(ExecEndpointStatsDocument, { appId, ...options });
    return data.execEndpointStats.map(strip);
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

  // ---- mods: players' code on grids they own ----

  /** The mod starter (`grid-mod`), a crate to build with {@link modBuild}. Requires access to the app. */
  async modStarter(appId: string): Promise<ExecStarter> {
    const data = await this.graphql.request(ExecModStarterDocument, { appId });
    const s = data.execModStarter;
    return { crate: s.crate, nodeType: s.nodeType, description: s.description, files: s.files.map(strip) };
  }

  /**
   * Builds a mod from one `ckx-sdk` crate, as {@link build} does a developer's. Returns at
   * once; wait with {@link waitForModBuild}, then {@link modDeploy}. One build at a time per
   * player. Requires `write_server_code` in the app.
   */
  async modBuild(appId: string, crate: ExecCrate): Promise<ExecBuild> {
    const data = await this.graphql.request(ExecModBuildDocument, { appId, crate: crateInput(crate) });
    return build(data.execModBuild);
  }

  /** A mod build of yours: a mod's (`kind` `exec`) or a CLIENT half's (`kind` `client`). */
  async modBuildStatus(appId: string, buildId: string): Promise<ExecBuild> {
    const data = await this.graphql.request(ExecModBuildStatusDocument, { appId, buildId });
    return build(data.execModBuildStatus);
  }

  /** Polls a mod build, server or CLIENT, until it succeeds or fails, like {@link waitForBuild}. */
  async waitForModBuild(
    appId: string,
    buildId: string,
    options: { intervalMs?: number; timeoutMs?: number } = {},
  ): Promise<ExecBuild> {
    const until = Date.now() + (options.timeoutMs ?? 600_000);
    for (;;) {
      const b = await this.modBuildStatus(appId, buildId);
      if (b.status === 'succeeded' || b.status === 'failed') return b;
      if (Date.now() > until) throw new CrowdyError({ message: `build ${buildId} is still ${b.status}` });
      await new Promise((r) => setTimeout(r, options.intervalMs ?? 2_000));
    }
  }

  /**
   * Deploys a mod build of yours to a grid you own: a new mod starts switched off, and a
   * running one restarts on the new version. Requires being the grid's owner and
   * `write_server_code` on the app tier and the grid.
   */
  async modDeploy(appId: string, gridId: string, name: string, buildId: string): Promise<ExecMod> {
    const data = await this.graphql.request(ExecModDeployDocument, { appId, gridId, name, buildId });
    return strip(data.execModDeploy);
  }

  /**
   * Switches a mod on your grid on or off. On, it runs as you once the app's code admission
   * admits it. Requires `run_server_code` on the app tier and the grid.
   */
  async modSetEnabled(appId: string, gridId: string, name: string, enabled: boolean): Promise<ExecMod> {
    const data = await this.graphql.request(ExecModSetEnabledDocument, { appId, gridId, name, enabled });
    return strip(data.execModSetEnabled);
  }

  /** Stops and removes a mod on your grid, with its state. */
  async modDelete(appId: string, gridId: string, name: string): Promise<boolean> {
    const data = await this.graphql.request(ExecModDeleteDocument, { appId, gridId, name });
    return data.execModDelete;
  }

  /** A grid's mods, which players in it call as `mod:<name>` with the grid id as key. */
  async mods(appId: string, gridId: string): Promise<ExecMod[]> {
    const data = await this.graphql.request(ExecModsDocument, { appId, gridId });
    return data.execMods.map(strip);
  }

  /** Your mods in the app, on every grid. */
  async myMods(appId: string): Promise<ExecMod[]> {
    const data = await this.graphql.request(ExecMyModsDocument, { appId });
    return data.execMyMods.map(strip);
  }

  /** A mod of yours' guest log lines, newest first. */
  async modLogs(
    appId: string,
    gridId: string,
    name: string,
    options: Omit<ExecLogsOptions, 'nodeType' | 'key'> = {},
  ): Promise<ExecLogLine[]> {
    const data = await this.graphql.request(ExecModLogsDocument, { appId, gridId, name, ...options });
    return data.execModLogs.map(strip);
  }

  /** Publishes a mod of yours, at its current version, for other grid owners to install. */
  async modPublish(
    appId: string,
    gridId: string,
    name: string,
    title: string,
    description?: string,
  ): Promise<ExecModListing> {
    const data = await this.graphql.request(ExecModPublishDocument, { appId, gridId, name, title, description });
    return listing(data.execModPublish);
  }

  /** The app's listed mods, most installed first, each with the CLIENT half it carries, if any. */
  async modListings(appId: string): Promise<ExecModListing[]> {
    const data = await this.graphql.request(ExecModListingsDocument, { appId });
    return data.execModListings.map(listing);
  }

  /** Delists a listing you published; installed copies keep running. */
  async modUnpublish(appId: string, listingId: string): Promise<boolean> {
    const data = await this.graphql.request(ExecModUnpublishDocument, { appId, listingId });
    return data.execModUnpublish;
  }

  /**
   * Installs a listing onto a grid you own as your own mod, switched off, with the listing's
   * CLIENT half if it has one; visitors, you too, consent to that CLIENT half afresh.
   */
  async modInstall(appId: string, gridId: string, name: string, listingId: string): Promise<ExecMod> {
    const data = await this.graphql.request(ExecModInstallDocument, { appId, gridId, name, listingId });
    return strip(data.execModInstall);
  }

  /** The app's mods by grid or owner, or all of them. Requires `view_compute_diagnostics`. */
  async appMods(appId: string, options: { gridId?: string; ownerId?: string } = {}): Promise<ExecMod[]> {
    const data = await this.graphql.request(ExecAppModsDocument, { appId, ...options });
    return data.execAppMods.map(strip);
  }

  /** The app's mod switches that are off. Requires `view_compute_diagnostics`. */
  async modSwitches(appId: string): Promise<ExecModSwitch[]> {
    const data = await this.graphql.request(ExecModSwitchesDocument, { appId });
    return data.execModSwitches.map(strip);
  }

  /**
   * The mods kill ladder: switch off (or on) one mod (`target`: its mod id), a player's mods
   * (their user id), a grid's (its id), a listing's installs (its id), or every mod in the
   * app (no target). Returns the switches that are off. Requires `manage_compute`.
   */
  async modSetSwitch(
    appId: string,
    scope: ExecModScope,
    off: boolean,
    options: { target?: string; reason?: string } = {},
  ): Promise<ExecModSwitch[]> {
    const data = await this.graphql.request(ExecModSetSwitchDocument, { appId, scope, off, ...options });
    return data.execModSetSwitch.map(strip);
  }

  // ---- CLIENT halves: a mod's browser half ----

  /**
   * Builds the CLIENT half of a mod from one `crowdy-client-sdk` crate: compiled for
   * `wasm32-unknown-unknown` in the build sandbox, fuel-metered and optimized there, checked
   * against the CLIENT ABI and at most 512 KiB, with its capability summary derived from the
   * module. Its `Cargo.toml` may have only `[package]`, `[lib]` as a cdylib, `[dependencies]` on
   * `crowdy-client-sdk`, `serde` and `serde_json`, and `[package.metadata.crowdy]
   * tick_interval_ms`. Returns at once with the build queued (`kind` `client`); wait with
   * {@link waitForModBuild}, then attach it with {@link modClientDeploy}. One build, server or
   * CLIENT, at a time per player. Requires `write_client_code` in the app.
   */
  async modClientBuild(appId: string, crate: ExecCrate): Promise<ExecBuild> {
    const data = await this.graphql.request(ExecModClientBuildDocument, { appId, crate: crateInput(crate) });
    return build(data.execModClientBuild);
  }

  /**
   * Attaches a succeeded CLIENT build of yours to your mod `name` on a grid you own, replacing
   * the CLIENT half it had; its `clientVersion` rises by one. The mod must exist and run as
   * you. A visitor's consent carries over only while the capability hash is unchanged.
   * Requires being the grid's owner, `write_client_code` on the app tier and the grid, and the
   * app's code admission admitting the new CLIENT version.
   */
  async modClientDeploy(appId: string, gridId: string, name: string, buildId: string): Promise<ExecModClient> {
    const data = await this.graphql.request(ExecModClientDeployDocument, { appId, gridId, name, buildId });
    const c = strip(data.execModClientDeploy);
    return { ...c, capabilitySummary: parseCapabilities(c.capabilitySummaryJson) };
  }

  /** Detaches the CLIENT half of a mod on your grid, with every visitor's consent to it; the mod keeps running. */
  async modClientDelete(appId: string, gridId: string, name: string): Promise<boolean> {
    const data = await this.graphql.request(ExecModClientDeleteDocument, { appId, gridId, name });
    return data.execModClientDelete;
  }

  /**
   * The CLIENT halves a grid serves: those of its mods that are switched on, not stopped by the
   * kill ladder, running as the grid's owner and admitted. Each has its capability summary and
   * hash and whether you consented to it, and its author's union summary and hash and whether
   * you trust them. Prompt once per author ({@link trustAuthor}) or per CLIENT half
   * ({@link consentClientMod}), fetch with {@link modClientArtifactBytes}, cache by `digest`, and
   * poll this to stop the CLIENT halves that are no longer listed or whose digest changed:
   * `ExecClientHalves` does all of that for a game. Requires access to the app.
   */
  async gridClientMods(appId: string, gridId: string): Promise<ExecGridClientMod[]> {
    const data = await this.graphql.request(ExecGridClientModsDocument, { appId, gridId });
    return data.execGridClientMods.map((m) => ({
      ...strip(m),
      capabilitySummary: parseCapabilities(m.capabilitySummaryJson),
      authorCapabilitySummary: parseCapabilities(m.authorCapabilitySummaryJson),
    }));
  }

  /**
   * Consents to run one mod's CLIENT half in your browser at `capabilityHash`, the one
   * {@link gridClientMods} showed you. A CLIENT half whose capabilities change carries a new hash,
   * and the consent stops holding until you consent again; a hash that is not the current one
   * is refused as `CONFLICT` (`CrowdyGraphQLError.code`). Requires access to the app.
   */
  async consentClientMod(appId: string, modId: string, capabilityHash: string): Promise<boolean> {
    const data = await this.graphql.request(ExecConsentClientModDocument, { appId, modId, capabilityHash });
    return data.execConsentClientMod;
  }

  /**
   * Trusts one author's CLIENT halves on a grid you stand in, at the hash of their union
   * (`authorCapabilityHash`): the trust covers their CLIENT halves there while the union is no
   * wider, and consents to each current one at its own hash. A hash that is not the current one
   * is `CONFLICT`; not standing in the grid, or an author with nothing served there, is
   * `NOT_FOUND`. Requires access to the app.
   */
  async trustAuthor(appId: string, gridId: string, authorId: string, capabilityHash: string): Promise<boolean> {
    const data = await this.graphql.request(ExecTrustAuthorDocument, { appId, gridId, authorId, capabilityHash });
    return data.execTrustAuthor;
  }

  /**
   * Takes back your consent to one mod's CLIENT half, whatever hash you consented to; true when
   * you had consented. While you trust its author on its grid it is still served to you:
   * {@link revokeAuthorTrust} takes that back. Needs only the app's app-scoped token.
   */
  async revokeClientModConsent(appId: string, modId: string): Promise<boolean> {
    const data = await this.graphql.request(ExecRevokeClientModConsentDocument, { appId, modId });
    return data.execRevokeClientModConsent;
  }

  /**
   * Stops trusting an author on a grid and takes back your consent to each of their CLIENT halves
   * there, so none is served to you until you consent or trust again; true when anything was
   * taken back. Works from anywhere, not only inside the grid. Needs only the app's app-scoped
   * token.
   */
  async revokeAuthorTrust(appId: string, gridId: string, authorId: string): Promise<boolean> {
    const data = await this.graphql.request(ExecRevokeAuthorTrustDocument, { appId, gridId, authorId });
    return data.execRevokeAuthorTrust;
  }

  /**
   * A served CLIENT half's module, base64, with what the broker needs to run it. Served only to a
   * player holding `run_client_code` in the app, standing in the mod's grid now, who consented
   * to it at its current hash or trusts its author at a union no wider; every refusal is
   * `NOT_FOUND`. At most 12 fetches a minute per player and mod on each API instance
   * (`RATE_LIMITED`): the module never changes for its digest, so cache it by `digest`.
   */
  async modClientArtifact(appId: string, modId: string): Promise<ExecModClientArtifact> {
    const data = await this.graphql.request(ExecModClientArtifactDocument, { appId, modId });
    const a = strip(data.execModClientArtifact);
    return { ...a, capabilitySummary: parseCapabilities(a.capabilitySummaryJson) };
  }

  /**
   * {@link modClientArtifact} decoded for `PlayerCodeBroker`: the module's bytes, their SHA-256
   * recomputed with WebCrypto, and the fuel budget as a bigint; the exec twin of
   * `marketplace.clientArtifactBytes`. Bytes that differ from `digest`, a module built for a
   * CLIENT ABI other than {@link EXEC_CLIENT_ABI_VERSION}, or a capability summary that does not
   * parse are refused with a {@link CrowdyProtocolError} and never returned. Start the broker
   * with `engine: 'ck-exec'`, `artifactHash: digest`, `fuelPerDispatch`, `tickIntervalMs` and
   * `consentedHostCalls: capabilitySummary.hostFunctions`.
   */
  async modClientArtifactBytes(appId: string, modId: string): Promise<ExecModClientArtifactBytes> {
    const a = await this.modClientArtifact(appId, modId);
    if (a.abiVersion !== EXEC_CLIENT_ABI_VERSION) {
      throw new CrowdyProtocolError({
        message: `CLIENT half of mod ${a.modId} is built for CLIENT ABI ${a.abiVersion}; this SDK runs ABI ${EXEC_CLIENT_ABI_VERSION}`,
      });
    }
    const capabilitySummary = a.capabilitySummary;
    if (!capabilitySummary || !isNameList(capabilitySummary.hostFunctions)) {
      throw new CrowdyProtocolError({
        message: `CLIENT half of mod ${a.modId}: its capability summary does not parse, so nothing bounds its host calls`,
      });
    }
    const bytes = fromBase64(a.wasmBase64);
    const digest = a.digest.toLowerCase();
    const actual = await sha256Hex(bytes);
    if (actual !== digest) {
      throw new CrowdyProtocolError({
        message: `CLIENT half of mod ${a.modId}: the module's SHA-256 is ${actual}, not the digest ${digest} it was served with`,
      });
    }
    return {
      modId: a.modId,
      name: a.name,
      gridId: a.gridId,
      clientVersion: a.clientVersion,
      bytes: bytes.buffer as ArrayBuffer,
      digest,
      sizeBytes: a.sizeBytes,
      fuelPerDispatch: BigInt(a.fuelPerDispatch),
      tickIntervalMs: a.tickIntervalMs,
      capabilitySummaryJson: a.capabilitySummaryJson,
      capabilitySummary,
      capabilityHash: a.capabilityHash,
      abiVersion: a.abiVersion,
    };
  }

  /**
   * A host for this player and its connect token (valid for about a minute). {@link connect}
   * dials its gateway only when {@link execGatewayRefusal} passes it; dialing it any other way,
   * apply the same check.
   */
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
   * host that runs that instance. A gateway that {@link execGatewayRefusal} refuses is never
   * dialed: the attempt fails `Unavailable`, and a reconnect asks the game API again.
   * @throws {CrowdyExecError} `Denied` when the gateway refuses the connect token (see
   * {@link ExecConnectOptions.WebSocket}), `Unavailable` when no host could be reached.
   */
  async connect(appId: string, options: ExecConnectOptions = {}): Promise<ExecConnection> {
    const c = new ExecConnection(
      this.checked(() => this.endpoint(appId, { nodeType: options.nodeType, key: options.key })),
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
