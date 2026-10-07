import { createCrowdyClient, type CrowdyClient } from '../crowdy-client.js';
import {
  GRID_PROGRAM_ORIGIN,
  GRID_PROGRAM_PLACEHOLDER_TOKEN,
  GRID_PROGRAM_WS_PROTOCOL,
  type GridProgramPort,
  type GridProgramReply,
  type GridProgramRequest,
} from './protocol.js';
import type { GridScope, GridBox } from '../grid-scope.js';

/**
 * The program side of a grid program: real CrowdyJS whose network is a
 * MessagePort. Everything it sends is relayed by `GridProgramHost` with a grid
 * token; nothing here holds a credential.
 */
class PortDemux {
  private nextId = 1;
  private readonly http = new Map<
    number,
    { resolve: (r: Response) => void; reject: (e: Error) => void }
  >();
  readonly sockets = new Map<number, PortWebSocketBase>();
  private helloResolve!: (hello: Extract<GridProgramReply, { t: 'hello' }>) => void;
  readonly hello: Promise<Extract<GridProgramReply, { t: 'hello' }>>;

  constructor(readonly port: GridProgramPort) {
    this.hello = new Promise((resolve) => (this.helloResolve = resolve));
    port.addEventListener('message', (event) => this.onMessage(event.data));
    port.start?.();
  }

  id(): number {
    return this.nextId++;
  }

  send(message: GridProgramRequest): void {
    this.port.postMessage(message);
  }

  fetchVia(body: string): Promise<Response> {
    const id = this.id();
    return new Promise((resolve, reject) => {
      this.http.set(id, { resolve, reject });
      this.send({ t: 'http', id, body });
    });
  }

  private onMessage(raw: unknown): void {
    if (!raw || typeof raw !== 'object') return;
    const msg = raw as GridProgramReply;
    switch (msg.t) {
      case 'hello':
        this.helloResolve(msg);
        return;
      case 'http-result': {
        const pending = this.http.get(msg.id);
        if (!pending) return;
        this.http.delete(msg.id);
        pending.resolve(
          new Response(msg.body, {
            status: msg.status,
            headers: { 'content-type': 'application/json' },
          }),
        );
        return;
      }
      case 'http-error': {
        const pending = this.http.get(msg.id);
        if (!pending) return;
        this.http.delete(msg.id);
        pending.reject(new TypeError(msg.message));
        return;
      }
      case 'ws-opened':
      case 'ws-message':
      case 'ws-closed':
      case 'ws-error':
        this.sockets.get(msg.sid)?.receive(msg);
        return;
    }
  }
}

abstract class PortWebSocketBase {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  readyState = 0;
  protocol = '';
  onopen: ((event: unknown) => void) | null = null;
  onclose: ((event: { code: number; reason: string; wasClean: boolean }) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  protected abstract readonly demux: PortDemux;
  protected sid = 0;

  protected open(protocols?: string | string[]): void {
    const list = protocols === undefined ? [] : Array.isArray(protocols) ? protocols : [protocols];
    this.sid = this.demux.id();
    this.demux.sockets.set(this.sid, this);
    this.demux.send({ t: 'ws-open', sid: this.sid, protocols: list });
  }

  send(data: string): void {
    if (this.readyState !== 1) throw new Error('WebSocket is not open');
    this.demux.send({ t: 'ws-send', sid: this.sid, data: String(data) });
  }

  close(code?: number, reason?: string): void {
    if (this.readyState >= 2) return;
    this.readyState = 2;
    this.demux.send({ t: 'ws-close', sid: this.sid, code, reason });
  }

  receive(msg: GridProgramReply): void {
    switch (msg.t) {
      case 'ws-opened':
        this.readyState = 1;
        this.protocol = msg.protocol;
        this.onopen?.({});
        return;
      case 'ws-message':
        this.onmessage?.({ data: msg.data });
        return;
      case 'ws-error':
        this.onerror?.(new Error(msg.message));
        return;
      case 'ws-closed':
        this.readyState = 3;
        this.demux.sockets.delete(this.sid);
        this.onclose?.({ code: msg.code, reason: msg.reason, wasClean: msg.code === 1000 });
        return;
    }
  }
}

export interface GridProgramClient {
  /** Real CrowdyJS; every request leaves through the host. */
  client: CrowdyClient;
  /** The grid, bound: `client.grid(appId, gridId, box)`. */
  grid: GridScope;
  appId: string;
  gridId: string;
  box: GridBox;
}

/**
 * Build CrowdyJS inside a grid program. Waits for the host's `hello` (which
 * names the app, the grid and its box), then returns a client whose HTTP and
 * realtime ride the port. Call it once per program.
 */
export async function createGridProgramClient(
  port: GridProgramPort,
): Promise<GridProgramClient> {
  const demux = new PortDemux(port);
  const hello = await demux.hello;
  class PortWebSocket extends PortWebSocketBase {
    protected readonly demux = demux;
    constructor(_url: string, protocols?: string | string[]) {
      super();
      this.open(protocols ?? GRID_PROGRAM_WS_PROTOCOL);
    }
  }
  const portFetch = ((_input: unknown, init?: { body?: unknown }) =>
    demux.fetchVia(String(init?.body ?? ''))) as typeof fetch;

  const client = createCrowdyClient({
    httpUrl: GRID_PROGRAM_ORIGIN,
    wsUrl: GRID_PROGRAM_ORIGIN.replace(/^https/, 'wss'),
    fetch: portFetch,
    embeddedHost: false,
    realtime: { webSocketImpl: PortWebSocket, binaryTransport: false },
  });
  client.session.setToken(GRID_PROGRAM_PLACEHOLDER_TOKEN, { persist: false });
  const box: GridBox = {
    low: { x: BigInt(hello.low.x), y: BigInt(hello.low.y), z: BigInt(hello.low.z) },
    high: { x: BigInt(hello.high.x), y: BigInt(hello.high.y), z: BigInt(hello.high.z) },
  };
  return {
    client,
    grid: client.grid(hello.appId, hello.gridId, box),
    appId: hello.appId,
    gridId: hello.gridId,
    box,
  };
}
