/**
 * The MessagePort protocol between a GRID PROGRAM (player-authored JS running
 * in a sandboxed, network-less iframe or worker) and the page that hosts it.
 *
 * The program runs real CrowdyJS. Its `fetch` and `WebSocket` are shims that
 * turn every request into a message on this port; the host relays them to
 * ck-api with a GRID-SCOPED token the program never sees. The program's reach
 * is therefore exactly the grid token's reach (DN-10 §5), however hostile its
 * code is.
 */
export const GRID_PROGRAM_PROTOCOL_VERSION = 1 as const;

/** Program -> host. */
export type GridProgramRequest =
  | { t: 'http'; id: number; body: string }
  | { t: 'ws-open'; sid: number; protocols: string[] }
  | { t: 'ws-send'; sid: number; data: string }
  | { t: 'ws-close'; sid: number; code?: number; reason?: string };

/** Host -> program. */
export type GridProgramReply =
  | {
      t: 'hello';
      v: typeof GRID_PROGRAM_PROTOCOL_VERSION;
      appId: string;
      gridId: string;
      low: { x: string; y: string; z: string };
      high: { x: string; y: string; z: string };
    }
  | { t: 'http-result'; id: number; status: number; body: string }
  | { t: 'http-error'; id: number; message: string }
  | { t: 'ws-opened'; sid: number; protocol: string }
  | { t: 'ws-message'; sid: number; data: string }
  | { t: 'ws-closed'; sid: number; code: number; reason: string }
  | { t: 'ws-error'; sid: number; message: string };

/** The subset of MessagePort both sides use (a Worker or MessagePort fits). */
export interface GridProgramPort {
  postMessage(message: unknown): void;
  addEventListener(
    type: 'message',
    listener: (event: MessageEvent<unknown>) => void,
  ): void;
  removeEventListener(
    type: 'message',
    listener: (event: MessageEvent<unknown>) => void,
  ): void;
  start?(): void;
}

/** The only WebSocket subprotocol a grid program may speak. */
export const GRID_PROGRAM_WS_PROTOCOL = 'graphql-transport-ws';

/** Placeholder origin the program's client is pointed at; never dialed. */
export const GRID_PROGRAM_ORIGIN = 'https://grid-program.invalid';

/** Placeholder bearer the program's client sends; the host replaces it. */
export const GRID_PROGRAM_PLACEHOLDER_TOKEN = 'grid-program';
