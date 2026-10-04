import type { GridsAPI, GridChannel, GridToken } from './domains/grids.js';
import type { ChannelsAPI } from './domains/channels.js';
import type { UdpAPI } from './domains/udp.js';

/** A chunk address as CrowdyJS passes it on the wire (decimal strings). */
export interface GridChunk {
  x: string | number | bigint;
  y: string | number | bigint;
  z: string | number | bigint;
}

export interface GridBox {
  low: { x: bigint; y: bigint; z: bigint };
  high: { x: bigint; y: bigint; z: bigint };
}

/** The domain clients a GridScope binds (a CrowdyClient satisfies this). */
export interface GridScopeClients {
  grids: GridsAPI;
  channels: ChannelsAPI;
  udp: UdpAPI;
}

/** Thrown locally, before any request, when a call would leave the grid. */
export class GridScopeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GridScopeError';
  }
}

/**
 * One grid, bound once (DN-10: grid scope is app scope intersected with grid
 * confinement). Every method is the ordinary CrowdyJS call with the app and
 * grid filled in, and — where the call addresses the world — a local check
 * that it stays in the grid. The local check is UX; the server enforces the
 * same rule for grid tokens, and grid-owner rules for everyone.
 *
 * Get one from `client.grid(appId, gridId)`. The box is learned from the
 * first grid token minted (or passed in); world helpers need it.
 */
export class GridScope {
  private box: GridBox | null;

  constructor(
    private readonly clients: GridScopeClients,
    readonly appId: string,
    readonly gridId: string,
    box?: GridBox,
  ) {
    this.box = box ?? null;
  }

  /** The grid box, when known (after `mintToken`, or when passed in). */
  get bounds(): GridBox | null {
    return this.box;
  }

  /** Whether a chunk is inside the grid. False while the box is unknown. */
  contains(chunk: GridChunk): boolean {
    const box = this.box;
    if (!box) return false;
    const x = BigInt(chunk.x);
    const y = BigInt(chunk.y);
    const z = BigInt(chunk.z);
    return (
      x >= box.low.x &&
      x <= box.high.x &&
      y >= box.low.y &&
      y <= box.high.y &&
      z >= box.low.z &&
      z <= box.high.z
    );
  }

  /** Throws GridScopeError unless the chunk is inside the (known) grid box. */
  assertContains(chunk: GridChunk): void {
    if (!this.box) {
      throw new GridScopeError(
        'grid box unknown: call mintToken() first or pass the box to client.grid()',
      );
    }
    if (!this.contains(chunk)) {
      throw new GridScopeError(
        `chunk (${chunk.x},${chunk.y},${chunk.z}) is outside grid ${this.gridId}`,
      );
    }
  }

  /** Mint a grid-scoped token for this grid; also learns the box. */
  async mintToken(ttlSeconds?: number): Promise<GridToken> {
    const token = await this.clients.grids.mintToken({
      appId: this.appId,
      gridId: this.gridId,
      ...(ttlSeconds !== undefined ? { ttlSeconds } : {}),
    });
    this.box = {
      low: {
        x: BigInt(token.lowChunk.x),
        y: BigInt(token.lowChunk.y),
        z: BigInt(token.lowChunk.z),
      },
      high: {
        x: BigInt(token.highChunk.x),
        y: BigInt(token.highChunk.y),
        z: BigInt(token.highChunk.z),
      },
    };
    return token;
  }

  /** Grid channels: the only channels this grid's modules may post into. */
  readonly channels = {
    list: (): Promise<GridChannel[]> =>
      this.clients.grids.channels(this.appId, this.gridId),
    create: (
      name: string,
      options: { description?: string; membershipPolicy?: string; membersCanSend?: boolean } = {},
    ) =>
      this.clients.grids.createChannel({
        appId: this.appId,
        gridId: this.gridId,
        name,
        ...options,
      }),
    join: (channelId: string) => this.clients.channels.join(channelId),
    leave: (channelId: string) => this.clients.channels.leave(channelId),
    send: (channelId: string, uuid: string, payloadBase64: string) =>
      this.clients.udp.sendChannelMessage({
        channelId,
        uuid,
        payload: payloadBase64,
      }),
  };

  /**
   * Replication that ORIGINATES in the grid. Each send checks its chunk
   * locally, then goes out as the ordinary udp call; reach still follows
   * `distance`.
   */
  readonly send = {
    actorUpdate: (input: Omit<Parameters<UdpAPI['sendActorUpdate']>[0], 'appId'>) => {
      this.assertContains(input.chunk);
      return this.clients.udp.sendActorUpdate({ ...input, appId: this.appId });
    },
    voxelUpdate: (input: Omit<Parameters<UdpAPI['sendVoxelUpdate']>[0], 'appId'>) => {
      this.assertContains(input.chunk);
      return this.clients.udp.sendVoxelUpdate({ ...input, appId: this.appId });
    },
    text: (input: Omit<Parameters<UdpAPI['sendTextPacket']>[0], 'appId'>) => {
      this.assertContains(input.chunk);
      return this.clients.udp.sendTextPacket({ ...input, appId: this.appId });
    },
    clientEvent: (input: Omit<Parameters<UdpAPI['sendClientEvent']>[0], 'appId'>) => {
      this.assertContains(input.chunk);
      return this.clients.udp.sendClientEvent({ ...input, appId: this.appId });
    },
  };
}
