import { parse, type OperationDefinitionNode } from 'graphql';
import {
  GRID_PROGRAM_PROTOCOL_VERSION,
  GRID_PROGRAM_WS_PROTOCOL,
  type GridProgramPort,
  type GridProgramReply,
  type GridProgramRequest,
} from './protocol.js';
import type { GridScope } from '../grid-scope.js';

/** A grid token as the host holds it. */
export interface HeldGridToken {
  token: string;
  expiresAt: string | Date;
  low: { x: string; y: string; z: string };
  high: { x: string; y: string; z: string };
}

export interface GridProgramHostOptions {
  /** The port to the program (the iframe's side of a MessageChannel). */
  port: GridProgramPort;
  appId: string;
  gridId: string;
  /** ck-api GraphQL HTTP endpoint (…/graphql). */
  graphqlUrl: string;
  /** ck-api GraphQL WebSocket endpoint (ws…/graphql). */
  graphqlWsUrl: string;
  /**
   * Mint a grid token. Usually `() => scope.mintToken()` on the PAGE's client,
   * which holds the player's app token; see {@link hostGridProgram}.
   */
  mintToken: () => Promise<HeldGridToken>;
  /** Defaults to the global fetch / WebSocket. */
  fetchImpl?: typeof fetch;
  WebSocketImpl?: new (url: string, protocols?: string | string[]) => WebSocket;
  /** Largest request body relayed (default 256 KiB). */
  maxBodyBytes?: number;
  /** Requests in flight at once (default 16). */
  maxInFlight?: number;
  /** WebSocket frames relayed per second per program (default 200). */
  maxFramesPerSecond?: number;
  /** Diagnostics for refusals (never receives the token). */
  onRefused?: (reason: string) => void;
}

const REFRESH_MARGIN_MS = 60_000;

/**
 * The page side of a grid program. It relays the program's CrowdyJS traffic
 * to ck-api, attaching a GRID-SCOPED token the program never sees, so the
 * server confines everything the program does to the grid (DN-10 §5). Local
 * checks here are cheap refusals of obviously wrong traffic; the server is
 * the authority.
 */
export class GridProgramHost {
  private held: HeldGridToken | null = null;
  private minting: Promise<HeldGridToken> | null = null;
  private inFlight = 0;
  private readonly sockets = new Map<number, WebSocket>();
  private frameWindowStart = 0;
  private framesInWindow = 0;
  private stopped = false;
  private readonly listener = (event: MessageEvent<unknown>) => {
    void this.onRequest(event.data);
  };

  constructor(private readonly options: GridProgramHostOptions) {}

  /** Mint the first token, announce the grid to the program, start relaying. */
  async start(): Promise<void> {
    const held = await this.token();
    this.options.port.addEventListener('message', this.listener);
    this.options.port.start?.();
    this.reply({
      t: 'hello',
      v: GRID_PROGRAM_PROTOCOL_VERSION,
      appId: this.options.appId,
      gridId: this.options.gridId,
      low: held.low,
      high: held.high,
    });
  }

  stop(): void {
    this.stopped = true;
    this.options.port.removeEventListener('message', this.listener);
    for (const socket of this.sockets.values()) socket.close(1000, 'host stopped');
    this.sockets.clear();
  }

  private async token(): Promise<HeldGridToken> {
    const held = this.held;
    if (held && new Date(held.expiresAt).getTime() - Date.now() > REFRESH_MARGIN_MS) {
      return held;
    }
    this.minting ??= this.options.mintToken().finally(() => {
      this.minting = null;
    });
    this.held = await this.minting;
    return this.held;
  }

  private reply(message: GridProgramReply): void {
    if (this.stopped) return;
    this.options.port.postMessage(message);
  }

  private refuse(reason: string): void {
    this.options.onRefused?.(reason);
  }

  private async onRequest(raw: unknown): Promise<void> {
    if (this.stopped || !raw || typeof raw !== 'object') return;
    const msg = raw as GridProgramRequest;
    switch (msg.t) {
      case 'http':
        return this.relayHttp(msg);
      case 'ws-open':
        return this.openSocket(msg);
      case 'ws-send':
        return this.relayFrame(msg);
      case 'ws-close':
        this.sockets.get(msg.sid)?.close(msg.code ?? 1000, msg.reason ?? '');
        return;
      default:
        this.refuse('unknown message');
    }
  }

  private async relayHttp(msg: Extract<GridProgramRequest, { t: 'http' }>) {
    const fail = (message: string) => {
      this.refuse(message);
      this.reply({ t: 'http-error', id: msg.id, message });
    };
    if (!Number.isSafeInteger(msg.id) || typeof msg.body !== 'string') {
      return fail('malformed request');
    }
    if (msg.body.length > (this.options.maxBodyBytes ?? 256 * 1024)) {
      return fail('request body too large');
    }
    if (this.inFlight >= (this.options.maxInFlight ?? 16)) {
      return fail('too many requests in flight');
    }
    let body: { query?: unknown; variables?: unknown; operationName?: unknown };
    try {
      body = JSON.parse(msg.body);
      if (typeof body.query !== 'string') throw new Error('no query');
      const ops = parse(body.query).definitions.filter(
        (d): d is OperationDefinitionNode => d.kind === 'OperationDefinition',
      );
      if (ops.length !== 1 || ops[0].operation === 'subscription') {
        throw new Error('one query or mutation per request');
      }
    } catch (error) {
      return fail(`refused: ${(error as Error).message}`);
    }
    this.inFlight += 1;
    try {
      const held = await this.token();
      const response = await (this.options.fetchImpl ?? fetch)(
        this.options.graphqlUrl,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${held.token}`,
          },
          body: JSON.stringify({
            query: body.query,
            variables: body.variables ?? {},
            ...(typeof body.operationName === 'string'
              ? { operationName: body.operationName }
              : {}),
          }),
        },
      );
      this.reply({
        t: 'http-result',
        id: msg.id,
        status: response.status,
        body: await response.text(),
      });
    } catch (error) {
      this.reply({ t: 'http-error', id: msg.id, message: (error as Error).message });
    } finally {
      this.inFlight -= 1;
    }
  }

  private async openSocket(msg: Extract<GridProgramRequest, { t: 'ws-open' }>) {
    if (
      !Number.isSafeInteger(msg.sid) ||
      this.sockets.has(msg.sid) ||
      !Array.isArray(msg.protocols) ||
      !msg.protocols.includes(GRID_PROGRAM_WS_PROTOCOL)
    ) {
      this.refuse('websocket open refused');
      this.reply({ t: 'ws-closed', sid: msg.sid, code: 4400, reason: 'refused' });
      return;
    }
    const Impl = this.options.WebSocketImpl ?? WebSocket;
    const socket = new Impl(this.options.graphqlWsUrl, GRID_PROGRAM_WS_PROTOCOL);
    this.sockets.set(msg.sid, socket);
    socket.onopen = () =>
      this.reply({ t: 'ws-opened', sid: msg.sid, protocol: socket.protocol });
    socket.onmessage = (event) =>
      this.reply({ t: 'ws-message', sid: msg.sid, data: String(event.data) });
    socket.onerror = () =>
      this.reply({ t: 'ws-error', sid: msg.sid, message: 'websocket error' });
    socket.onclose = (event) => {
      this.sockets.delete(msg.sid);
      this.reply({
        t: 'ws-closed',
        sid: msg.sid,
        code: event.code,
        reason: event.reason,
      });
    };
  }

  private async relayFrame(msg: Extract<GridProgramRequest, { t: 'ws-send' }>) {
    const socket = this.sockets.get(msg.sid);
    if (!socket || typeof msg.data !== 'string') return;
    const now = Date.now();
    if (now - this.frameWindowStart >= 1000) {
      this.frameWindowStart = now;
      this.framesInWindow = 0;
    }
    if (++this.framesInWindow > (this.options.maxFramesPerSecond ?? 200)) {
      this.refuse('websocket frame rate exceeded');
      socket.close(4429, 'rate limited');
      return;
    }
    let frame: { type?: unknown; payload?: unknown };
    try {
      frame = JSON.parse(msg.data);
    } catch {
      this.refuse('malformed websocket frame');
      return;
    }
    if (frame.type === 'connection_init') {
      // The program's credentials are a placeholder: swap in the grid token.
      const held = await this.token();
      socket.send(
        JSON.stringify({
          type: 'connection_init',
          payload: {
            Authorization: `Bearer ${held.token}`,
            appId: this.options.appId,
            clientKind: 'grid-program',
          },
        }),
      );
      return;
    }
    socket.send(msg.data);
  }
}

/**
 * Host a grid program for one grid from the page's own client. Mints grid
 * tokens through `scope.mintToken()` (the page holds the app token) and
 * relays the program's traffic; returns the running host.
 */
export async function hostGridProgram(options: {
  port: GridProgramPort;
  scope: GridScope;
  graphqlUrl: string;
  graphqlWsUrl: string;
  ttlSeconds?: number;
  onRefused?: (reason: string) => void;
  fetchImpl?: typeof fetch;
  WebSocketImpl?: GridProgramHostOptions['WebSocketImpl'];
}): Promise<GridProgramHost> {
  const host = new GridProgramHost({
    port: options.port,
    appId: options.scope.appId,
    gridId: options.scope.gridId,
    graphqlUrl: options.graphqlUrl,
    graphqlWsUrl: options.graphqlWsUrl,
    onRefused: options.onRefused,
    fetchImpl: options.fetchImpl,
    WebSocketImpl: options.WebSocketImpl,
    mintToken: async () => {
      const minted = await options.scope.mintToken(options.ttlSeconds);
      return {
        token: minted.token,
        expiresAt: minted.expiresAt,
        low: minted.lowChunk,
        high: minted.highChunk,
      };
    },
  });
  await host.start();
  return host;
}
