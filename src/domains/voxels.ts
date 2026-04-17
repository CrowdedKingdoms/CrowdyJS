import type { GraphQLClient } from '../client.js';

import {
  ListVoxelsDocument,
  type ListVoxelsQuery,
  type ListVoxelsQueryVariables,
  ListVoxelUpdatesByDistanceDocument,
  type ListVoxelUpdatesByDistanceQuery,
  type ListVoxelUpdatesByDistanceQueryVariables,
  UpdateVoxelDocument,
  type UpdateVoxelMutation,
  type UpdateVoxelMutationVariables,
  VoxelUpdateHistoryDocument,
  type VoxelUpdateHistoryQuery,
  type VoxelUpdateHistoryQueryVariables,
  RollbackVoxelUpdatesDocument,
  type RollbackVoxelUpdatesMutation,
  type RollbackVoxelUpdatesMutationVariables,
} from '../generated/graphql.js';

/**
 * Voxel queries and mutations: list, history, rollback, single-voxel update.
 *
 * Exposed as `client.voxels`.
 */
export class VoxelsAPI {
  constructor(private gql: GraphQLClient) {}

  async list(
    input: ListVoxelsQueryVariables['input']
  ): Promise<ListVoxelsQuery['listVoxels']> {
    const data = await this.gql.request(ListVoxelsDocument, { input });
    return data.listVoxels;
  }

  async listByDistance(
    input: ListVoxelUpdatesByDistanceQueryVariables['input']
  ): Promise<ListVoxelUpdatesByDistanceQuery['listVoxelUpdatesByDistance']> {
    const data = await this.gql.request(ListVoxelUpdatesByDistanceDocument, { input });
    return data.listVoxelUpdatesByDistance;
  }

  async update(
    input: UpdateVoxelMutationVariables['input']
  ): Promise<UpdateVoxelMutation['updateVoxel']> {
    const data = await this.gql.request(UpdateVoxelDocument, { input });
    return data.updateVoxel;
  }

  async history(
    args: VoxelUpdateHistoryQueryVariables
  ): Promise<VoxelUpdateHistoryQuery['voxelUpdateHistory']> {
    const data = await this.gql.request(VoxelUpdateHistoryDocument, args);
    return data.voxelUpdateHistory;
  }

  async rollback(
    input: RollbackVoxelUpdatesMutationVariables['input']
  ): Promise<RollbackVoxelUpdatesMutation['rollbackVoxelUpdates']> {
    const data = await this.gql.request(RollbackVoxelUpdatesDocument, { input });
    return data.rollbackVoxelUpdates;
  }
}
