import { CrowdyError } from '../errors.js';

/** The realtime server a fleet session connects to: `openFleetSession`'s `server`. */
export interface FleetServer {
  /**
   * IPv4 address; used when it is not empty. Every realtime server has one, and it is the
   * address `refreshFleetSession`'s `currentServer` names.
   */
  ip4?: string | null;
  /** IPv6 address; used when there is no IPv4 address. */
  ip6?: string | null;
  /** The UDP port clients connect to. */
  clientPort: number;
}

/** What a {@link FleetSocket} tells the session. */
export interface FleetSocketEvents {
  /** One datagram arrived from the realtime server. */
  onDatagram(datagram: Uint8Array): void;
  /** The socket failed; the session reports it and keeps going. */
  onError(error: Error): void;
}

/**
 * The one thing a fleet session needs from the network: a UDP socket to one realtime server.
 * The default is `node:dgram`; a test passes an in-memory one.
 */
export interface FleetSocket {
  /** Send one datagram to the realtime server the socket was opened for. */
  send(datagram: Uint8Array): void;
  /** Close the socket. No datagram is delivered afterwards. */
  close(): void;
}

/** Opens a {@link FleetSocket} to `server`. */
export type FleetSocketFactory = (
  server: FleetServer,
  events: FleetSocketEvents,
) => Promise<FleetSocket> | FleetSocket;

/** Socket buffer sizes for {@link nodeFleetSocket}. */
export interface NodeFleetSocketOptions {
  /**
   * The socket's receive buffer, in bytes. Default 1,048,576: one session receives for every
   * player it carries. The operating system may give less.
   */
  recvBufferSize?: number;
  /** The socket's send buffer, in bytes. Default 1,048,576. */
  sendBufferSize?: number;
}

/** The address a session dials for `server`: IPv4 when it has one, IPv6 otherwise. */
export function fleetServerAddress(server: FleetServer): { host: string; family: 4 | 6; port: number } {
  const port = server.clientPort;
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new CrowdyError({ message: `the realtime server names no usable clientPort: ${String(port)}` });
  }
  if (server.ip4) return { host: server.ip4, family: 4, port };
  if (server.ip6) return { host: server.ip6, family: 6, port };
  throw new CrowdyError({ message: 'the realtime server names no ip4 and no ip6 address' });
}

const NO_DGRAM =
  '@crowdedkingdoms/crowdyjs/fleet runs on a server your organization runs: it opens a UDP socket ' +
  'with node:dgram, which this runtime does not have. A fleet session never runs in a browser ' +
  'page or a game client, because the fleet token and the org token never go there.';

/** The parts of `node:dgram` this file uses. */
interface Dgram {
  createSocket(options: { type: 'udp4' | 'udp6' }): DgramSocket;
}
interface DgramSocket {
  on(event: 'message', listener: (message: Uint8Array) => void): void;
  on(event: 'error', listener: (error: Error) => void): void;
  once(event: 'error', listener: (error: Error) => void): void;
  removeListener(event: 'error', listener: (error: Error) => void): void;
  connect(port: number, address: string, callback: () => void): void;
  send(message: Uint8Array, callback: (error: Error | null) => void): void;
  setRecvBufferSize(size: number): void;
  setSendBufferSize(size: number): void;
  close(): void;
}

interface ProcessLike {
  versions?: { node?: string };
  getBuiltinModule?(id: string): unknown;
}

function processLike(): ProcessLike | undefined {
  return (globalThis as { process?: ProcessLike }).process;
}

/**
 * Throws unless this runtime can have `node:dgram`: a `process` that says it runs Node's
 * modules (Node, and the runtimes that carry them). The fleet entry point calls it when it
 * is imported, so a bundle for a page fails on its first line instead of at the first send.
 */
export function assertFleetRuntime(): void {
  const proc = processLike();
  if (typeof proc?.getBuiltinModule === 'function' && proc.getBuiltinModule('node:dgram')) return;
  if (typeof proc?.versions?.node === 'string') return;
  throw new CrowdyError({ message: NO_DGRAM });
}

async function loadDgram(): Promise<Dgram> {
  const proc = processLike();
  const builtin = typeof proc?.getBuiltinModule === 'function' ? proc.getBuiltinModule('node:dgram') : null;
  if (builtin) return builtin as Dgram;
  try {
    // Not a literal, so a bundler does not try to resolve it for a page.
    const specifier = 'node:dgram';
    return (await import(/* webpackIgnore: true */ /* @vite-ignore */ specifier)) as Dgram;
  } catch (cause) {
    throw new CrowdyError({ message: NO_DGRAM, cause });
  }
}

/**
 * The default {@link FleetSocketFactory}: a `node:dgram` socket connected to the realtime
 * server, so the operating system delivers only that server's datagrams. Node only.
 */
export function nodeFleetSocket(options: NodeFleetSocketOptions = {}): FleetSocketFactory {
  const recvBufferSize = options.recvBufferSize ?? 1_048_576;
  const sendBufferSize = options.sendBufferSize ?? 1_048_576;
  return async (server, events) => {
    const { host, family, port } = fleetServerAddress(server);
    const dgram = await loadDgram();
    const socket = dgram.createSocket({ type: family === 4 ? 'udp4' : 'udp6' });
    await new Promise<void>((resolve, reject) => {
      const failed = (error: Error) => {
        try {
          socket.close();
        } catch {
          /* never opened */
        }
        reject(new CrowdyError({ message: `could not open a UDP socket to ${host}:${port}`, cause: error }));
      };
      socket.once('error', failed);
      socket.connect(port, host, () => {
        socket.removeListener('error', failed);
        resolve();
      });
    });
    for (const [set, size] of [
      [(n: number) => socket.setRecvBufferSize(n), recvBufferSize],
      [(n: number) => socket.setSendBufferSize(n), sendBufferSize],
    ] as const) {
      try {
        if (size > 0) set(size);
      } catch {
        // The operating system's own size stands.
      }
    }
    socket.on('message', (message) => events.onDatagram(message));
    socket.on('error', (error) => events.onError(error));
    let closed = false;
    return {
      send(datagram) {
        if (closed) return;
        socket.send(datagram, (error) => {
          if (error && !closed) events.onError(error);
        });
      },
      close() {
        if (closed) return;
        closed = true;
        try {
          socket.close();
        } catch {
          /* already closed */
        }
      },
    };
  };
}
