import type { GraphQLClient } from '../client.js';

import {
  GetChunkDocument,
  type GetChunkQuery,
  type GetChunkQueryVariables,
  GetChunkLodsDocument,
  type GetChunkLodsQuery,
  type GetChunkLodsQueryVariables,
  GetChunksByDistanceDocument,
  type GetChunksByDistanceQuery,
  type GetChunksByDistanceQueryVariables,
  GetVoxelListDocument,
  type GetVoxelListQuery,
  type GetVoxelListQueryVariables,
  UpdateChunkDocument,
  type UpdateChunkMutation,
  type UpdateChunkMutationVariables,
  UpdateChunkStateDocument,
  type UpdateChunkStateMutation,
  type UpdateChunkStateMutationVariables,
  UpdateChunkLodsDocument,
  type UpdateChunkLodsMutation,
  type UpdateChunkLodsMutationVariables,
} from '../generated/graphql.js';

/**
 * Chunk-level queries and mutations: lookup, LODs, distance scans,
 * voxel lists, and chunk state/LOD updates.
 *
 * Exposed as `client.chunks`.
 */
export class ChunksAPI {
  constructor(private gql: GraphQLClient) {}

  async get(
    input: GetChunkQueryVariables['input']
  ): Promise<GetChunkQuery['getChunk']> {
    const data = await this.gql.request(GetChunkDocument, { input });
    return data.getChunk;
  }

  async getLods(
    input: GetChunkLodsQueryVariables['input']
  ): Promise<GetChunkLodsQuery['getChunkLods']> {
    const data = await this.gql.request(GetChunkLodsDocument, { input });
    return data.getChunkLods;
  }

  async byDistance(
    input: GetChunksByDistanceQueryVariables['input']
  ): Promise<GetChunksByDistanceQuery['getChunksByDistance']> {
    const data = await this.gql.request(GetChunksByDistanceDocument, { input });
    return data.getChunksByDistance;
  }

  async voxelList(
    input: GetVoxelListQueryVariables['input']
  ): Promise<GetVoxelListQuery['getVoxelList']> {
    const data = await this.gql.request(GetVoxelListDocument, { input });
    return data.getVoxelList;
  }

  async update(
    input: UpdateChunkMutationVariables['input']
  ): Promise<UpdateChunkMutation['updateChunk']> {
    const data = await this.gql.request(UpdateChunkDocument, { input });
    return data.updateChunk;
  }

  async updateState(
    input: UpdateChunkStateMutationVariables['input']
  ): Promise<UpdateChunkStateMutation['updateChunkState']> {
    const data = await this.gql.request(UpdateChunkStateDocument, { input });
    return data.updateChunkState;
  }

  async updateLods(
    input: UpdateChunkLodsMutationVariables['input']
  ): Promise<UpdateChunkLodsMutation['updateChunkLods']> {
    const data = await this.gql.request(UpdateChunkLodsDocument, { input });
    return data.updateChunkLods;
  }
}
