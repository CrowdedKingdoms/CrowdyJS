import type { GraphQLClient } from '../client.js';
import {
  CreateGridChannelDocument,
  type CreateGridChannelMutation,
  type CreateGridChannelMutationVariables,
  GridChannelsDocument,
  type GridChannelsQuery,
  MintGridTokenDocument,
  type MintGridTokenMutation,
  type MintGridTokenMutationVariables,
} from '../generated/graphql.js';

export type GridToken = MintGridTokenMutation['mintGridToken'];
export type GridChannel = GridChannelsQuery['gridChannels'][number];

/**
 * Grid-scoped platform surfaces (DN-10): grid tokens and grid channels. Most
 * code reaches these through `client.grid(appId, gridId)`, which binds the
 * grid once; this class is the raw per-call form.
 */
export class GridsAPI {
  constructor(private readonly gql: GraphQLClient) {}

  /**
   * Narrow the app token this client holds to one grid. The result admits a
   * short fixed list of gameplay fields, each confined to the grid, and is
   * refused by the binary relay. Hand it to code that should act inside the
   * grid and nowhere else — `GridProgramHost` does exactly that. The caller
   * must own the grid or hold `run_client_code` on it.
   */
  async mintToken(
    input: MintGridTokenMutationVariables['input'],
  ): Promise<GridToken> {
    const data = await this.gql.request(MintGridTokenDocument, { input });
    return data.mintGridToken;
  }

  /**
   * Create a channel that belongs to a grid you own. The grid's player
   * modules may `emit_channel` into it; their messages carry the sender uuid
   * `grid:<gridId>`. Membership defaults to `open` so visitors can join.
   */
  async createChannel(
    input: CreateGridChannelMutationVariables['input'],
  ): Promise<CreateGridChannelMutation['createGridChannel']> {
    const data = await this.gql.request(CreateGridChannelDocument, { input });
    return data.createGridChannel;
  }

  /** The active channels of one grid, oldest first. */
  async channels(appId: string, gridId: string): Promise<GridChannel[]> {
    const data = await this.gql.request(GridChannelsDocument, {
      appId,
      gridId,
    });
    return data.gridChannels;
  }
}
