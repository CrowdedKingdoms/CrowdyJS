import type { UdpAPI } from '../../domains/udp.js';
import { decodeBase64, encodeBase64 } from '../../utils.js';
import { EVENT_EMOTE, parseEmoteEvent, type EmoteEvent } from '../wire.js';

/** A chunk, in chunk coordinates. */
export interface KitChunk {
  x: number;
  y: number;
  z: number;
}

const chunkInput = (c: KitChunk) => ({ x: String(Math.trunc(c.x)), y: String(Math.trunc(c.y)), z: String(Math.trunc(c.z)) });

/** How a spectator stays where the world's messages reach them. */
export interface SpectateOptions {
  /** The spectator's actor uuid (32 characters), as with `udp.sendActorUpdate`. */
  uuid: string;
  /** Where to watch from: a chunk inside the app's world grid. */
  chunk: KitChunk;
  /** How often to say so, in milliseconds. Default 2 000. */
  intervalMs?: number;
  /** The actor state to send (base64); empty by default, which registers without a body. */
  state?: string;
  /** Replication distance, 0-8. Default 8. */
  distance?: number;
}

/**
 * Spectating: the realtime tier delivers what happens near an actor only while that actor is
 * live, so a viewer with no avatar of its own (a spectator, a kill-cam, a second screen) sends
 * a small actor update every couple of seconds from a chunk inside the app's world grid.
 * Outside the grid the update is refused and delivery stops.
 */
export class SpectateKit {
  constructor(
    private readonly appId: string,
    private readonly udp: UdpAPI | undefined,
  ) {}

  /** Starts the heartbeat; returns the handle that moves or stops it. */
  observe(options: SpectateOptions): SpectatorHeartbeat {
    if (!this.udp) throw new Error('the kit has no udp client to spectate with');
    return new SpectatorHeartbeat(this.appId, this.udp, options);
  }
}

/** A running spectator heartbeat. */
export class SpectatorHeartbeat {
  private chunk: KitChunk;
  private timer: ReturnType<typeof setInterval> | null;
  private lastError: unknown = null;

  constructor(
    private readonly appId: string,
    private readonly udp: UdpAPI,
    private readonly options: SpectateOptions,
  ) {
    this.chunk = options.chunk;
    this.beat();
    this.timer = setInterval(() => this.beat(), Math.max(250, options.intervalMs ?? 2_000));
  }

  private beat(): void {
    this.udp
      .sendActorUpdate({
        appId: this.appId,
        uuid: this.options.uuid,
        chunk: chunkInput(this.chunk),
        state: this.options.state ?? '',
        distance: this.options.distance ?? 8,
      })
      .then(() => {
        this.lastError = null;
      })
      .catch((e: unknown) => {
        this.lastError = e;
      });
  }

  /** Watches from another chunk from the next beat on (sent at once). */
  moveTo(chunk: KitChunk): void {
    this.chunk = chunk;
    this.beat();
  }

  /** The last send's error, or null when it went out. */
  get error(): unknown {
    return this.lastError;
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}

/** One emote to send. */
export interface EmoteSend {
  /** The sending actor's uuid (32 characters). */
  uuid: string;
  /** The chunk the sender stands in. */
  chunk: KitChunk;
  /** The emote's name, as the game knows it: `wave`, `cheer`, ... */
  emote: string;
  /** The actor it is aimed at, if any. */
  targetUuid?: string;
  /** Replication distance, 0-8. Default 2. */
  distance?: number;
}

/**
 * Emotes: a client event (type {@link EVENT_EMOTE}) with a JSON body `{ emote, targetUuid }`,
 * replicated to the players near the sender. A kit convention, so players on CrowdyJS,
 * CrowdyCPP and CrowdyPy see each other's; no hub is involved.
 */
export class EmotesKit {
  constructor(
    private readonly appId: string,
    private readonly udp: UdpAPI | undefined,
  ) {}

  /** Sends an emote; `true` when it was accepted for sending. */
  send(emote: EmoteSend): Promise<boolean> {
    if (!this.udp) return Promise.reject(new Error('the kit has no udp client to send emotes with'));
    const body = JSON.stringify({ emote: emote.emote, targetUuid: emote.targetUuid ?? null });
    return this.udp.sendClientEvent({
      appId: this.appId,
      uuid: emote.uuid,
      chunk: chunkInput(emote.chunk),
      eventType: EVENT_EMOTE,
      state: encodeBase64(new TextEncoder().encode(body)),
      distance: emote.distance ?? 2,
    });
  }

  /** An emote from a `clientEvent` notification, or null when it is another event. */
  parse(notification: { eventType: number; state: string }): EmoteEvent | null {
    if (notification.eventType !== EVENT_EMOTE) return null;
    const state = decodeBase64(notification.state);
    const bytes = new Uint8Array(2 + state.length);
    bytes[0] = EVENT_EMOTE & 0xff;
    bytes[1] = EVENT_EMOTE >> 8;
    bytes.set(state, 2);
    return parseEmoteEvent(bytes);
  }
}
