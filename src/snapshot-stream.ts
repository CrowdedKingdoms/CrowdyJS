/**
 * Experiment client for game-api regional `/poses` binary snapshots.
 *
 * Off by default — enable via {@link SnapshotStreamConfig.enabled} or
 * `CROWDY_SNAPSHOT_STREAM=1`. Pair with server `UDP_PROXY_SNAPSHOT_STREAM=1`.
 * Easy to abandon: leave disabled / do not merge this branch.
 */

import type { SessionStore } from './session.js';
import type { CrowdyLogger } from './logger.js';
import { silentLogger } from './logger.js';

export const SNAPSHOT_MAGIC = new Uint8Array([0x43, 0x4b, 0x53, 0x50]); // CKSP
export const SNAPSHOT_VERSION = 1;
export const SNAPSHOT_UUID_SIZE = 32;

export type SnapshotInterestTier = 0 | 1 | 2;

export interface SnapshotPoseEntry {
  uuid: string;
  tier: SnapshotInterestTier;
  chunkX: number;
  chunkY: number;
  chunkZ: number;
  x: number;
  y: number;
  z: number;
  /** Opaque actor state bytes (same as GraphQL state before base64). */
  payload: Uint8Array;
  /** Base64 of {@link payload} for World Stores codecs. */
  stateBase64: string;
}

export interface DecodedSnapshotFrame {
  version: number;
  flags: number;
  tickMs: number;
  appId: bigint;
  regionChunkX: number;
  regionChunkZ: number;
  entries: SnapshotPoseEntry[];
}

export interface SnapshotStreamConfig {
  /**
   * When true, open `/poses`. Defaults to env `CROWDY_SNAPSHOT_STREAM=1` or
   * false.
   */
  enabled?: boolean;
  /**
   * Full WS URL for poses (e.g. `wss://game…/poses`). When omitted, derived
   * from {@link graphqlWsUrl} by replacing a trailing `/graphql` with `/poses`.
   */
  posesUrl?: string;
  /** GraphQL WS URL used only to derive {@link posesUrl}. */
  graphqlWsUrl?: string;
  logger?: CrowdyLogger;
}

function envSnapshotEnabled(): boolean {
  try {
    const g = globalThis as { process?: { env?: Record<string, string | undefined> } };
    const v = (g.process?.env?.CROWDY_SNAPSHOT_STREAM ?? '').trim().toLowerCase();
    return v === '1' || v === 'true' || v === 'yes' || v === 'on';
  } catch {
    return false;
  }
}

function derivePosesUrl(graphqlWsUrl: string): string {
  if (/\/graphql\/?$/i.test(graphqlWsUrl)) {
    return graphqlWsUrl.replace(/\/graphql\/?$/i, '/poses');
  }
  return graphqlWsUrl.replace(/\/?$/, '') + '/poses';
}

function bytesToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64');
  }
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary);
}

function readUuidPadded(view: DataView, offset: number): string {
  const bytes = new Uint8Array(view.buffer, view.byteOffset + offset, SNAPSHOT_UUID_SIZE);
  let end = SNAPSHOT_UUID_SIZE;
  for (let i = 0; i < SNAPSHOT_UUID_SIZE; i++) {
    if (bytes[i] === 0) {
      end = i;
      break;
    }
  }
  return new TextDecoder().decode(bytes.subarray(0, end));
}

/** Decode a CKSP snapshot frame; returns null on mismatch/truncation. */
export function decodeSnapshotFrame(buf: ArrayBuffer | Uint8Array): DecodedSnapshotFrame | null {
  const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  if (u8.length < 4 + 1 + 1 + 4 + 8 + 8 + 2) return null;
  for (let i = 0; i < 4; i++) {
    if (u8[i] !== SNAPSHOT_MAGIC[i]) return null;
  }
  const view = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  let o = 4;
  const version = view.getUint8(o++);
  if (version !== SNAPSHOT_VERSION) return null;
  const flags = view.getUint8(o++);
  const tickMs = view.getUint32(o, true);
  o += 4;
  const appIdLo = view.getUint32(o, true);
  const appIdHi = view.getUint32(o + 4, true);
  o += 8;
  const appId = (BigInt(appIdHi) << 32n) | BigInt(appIdLo);
  const regionChunkX = view.getInt32(o, true);
  o += 4;
  const regionChunkZ = view.getInt32(o, true);
  o += 4;
  const count = view.getUint16(o, true);
  o += 2;
  const entries: SnapshotPoseEntry[] = [];
  for (let i = 0; i < count; i++) {
    if (o + SNAPSHOT_UUID_SIZE + 1 + 12 + 12 + 2 > u8.length) return null;
    const uuid = readUuidPadded(view, o);
    o += SNAPSHOT_UUID_SIZE;
    const tier = view.getUint8(o++) as SnapshotInterestTier;
    const chunkX = view.getInt32(o, true);
    o += 4;
    const chunkY = view.getInt32(o, true);
    o += 4;
    const chunkZ = view.getInt32(o, true);
    o += 4;
    const x = view.getFloat32(o, true);
    o += 4;
    const y = view.getFloat32(o, true);
    o += 4;
    const z = view.getFloat32(o, true);
    o += 4;
    const payloadLen = view.getUint16(o, true);
    o += 2;
    if (o + payloadLen > u8.length) return null;
    const payload = u8.subarray(o, o + payloadLen);
    o += payloadLen;
    entries.push({
      uuid,
      tier,
      chunkX,
      chunkY,
      chunkZ,
      x,
      y,
      z,
      payload,
      stateBase64: bytesToBase64(payload),
    });
  }
  return { version, flags, tickMs, appId, regionChunkX, regionChunkZ, entries };
}

export type SnapshotPoseHandler = (entry: SnapshotPoseEntry, frame: DecodedSnapshotFrame) => void;

/**
 * Opens the experiment `/poses` WebSocket, auths with the session app token,
 * and fans decoded pose entries to a handler (typically World Stores
 * `actors.ingestSnapshotPose`).
 */
export class SnapshotStreamClient {
  private readonly enabled: boolean;
  private readonly posesUrl: string;
  private readonly logger: CrowdyLogger;
  private ws: WebSocket | null = null;
  private desired = false;
  private appId: string | null = null;
  private chunk = { x: 0, y: 0, z: 0 };
  private handler: SnapshotPoseHandler | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    config: SnapshotStreamConfig = {},
    private readonly session: SessionStore,
  ) {
    this.enabled = config.enabled ?? envSnapshotEnabled();
    const gql =
      config.graphqlWsUrl ||
      config.posesUrl?.replace(/\/poses\/?$/i, '/graphql') ||
      'ws://localhost:3000/graphql';
    this.posesUrl = config.posesUrl || derivePosesUrl(gql);
    this.logger = config.logger ?? silentLogger;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Start receiving snapshots for `appId`. No-op when disabled.
   * @returns off function
   */
  start(
    appId: string,
    handler: SnapshotPoseHandler,
    chunk?: { x: number; y: number; z: number },
  ): () => void {
    if (!this.enabled) {
      return () => undefined;
    }
    this.desired = true;
    this.appId = appId;
    this.handler = handler;
    if (chunk) this.chunk = { ...chunk };
    this.open();
    return () => this.stop();
  }

  stop(): void {
    this.desired = false;
    this.handler = null;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        /* ignore */
      }
      this.ws = null;
    }
  }

  /** Tell the composer which region cell this client occupies. */
  setChunk(chunkX: number, chunkY: number, chunkZ: number): void {
    this.chunk = { x: chunkX, y: chunkY, z: chunkZ };
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(
        JSON.stringify({
          type: 'chunk',
          chunkX,
          chunkY,
          chunkZ,
        }),
      );
    }
  }

  private open(): void {
    if (!this.desired || !this.appId) return;
    const token = this.session.getToken();
    if (!token) {
      this.logger.warn?.('Snapshot stream: no session token yet');
      this.scheduleReconnect();
      return;
    }
    try {
      const ws = new WebSocket(this.posesUrl);
      this.ws = ws;
      ws.binaryType = 'arraybuffer';
      ws.onopen = () => {
        ws.send(
          JSON.stringify({
            type: 'hello',
            token,
            appId: this.appId,
            chunkX: this.chunk.x,
            chunkY: this.chunk.y,
            chunkZ: this.chunk.z,
          }),
        );
      };
      ws.onmessage = (ev) => {
        if (typeof ev.data === 'string') {
          return;
        }
        const frame = decodeSnapshotFrame(ev.data as ArrayBuffer);
        if (!frame || !this.handler) return;
        for (const entry of frame.entries) {
          try {
            this.handler(entry, frame);
          } catch (err) {
            this.logger.warn?.('Snapshot pose handler failed', err);
          }
        }
      };
      ws.onclose = () => {
        this.ws = null;
        if (this.desired) this.scheduleReconnect();
      };
      ws.onerror = (err) => {
        this.logger.warn?.('Snapshot stream socket error', err);
      };
    } catch (err) {
      this.logger.warn?.('Snapshot stream open failed', err);
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (!this.desired || this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.open();
    }, 1000);
  }
}
