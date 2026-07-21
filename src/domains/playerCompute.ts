import type { GraphQLClient } from '../client.js';
import {
  PlayerComputeDeployDocument,
  PlayerComputeSetEnabledDocument,
  PlayerComputeMyModulesDocument,
  PlayerComputeVersionsDocument,
  PlayerComputeDeleteDocument,
  type PlayerComputeDeployMutation,
  type PlayerComputeDeployMutationVariables,
  type PlayerComputeSetEnabledMutation,
  type PlayerComputeSetEnabledMutationVariables,
  type PlayerComputeMyModulesQuery,
  type PlayerComputeMyModulesQueryVariables,
  type PlayerComputeVersionsQuery,
  type PlayerComputeVersionsQueryVariables,
  type PlayerComputeDeleteMutation,
  type PlayerComputeDeleteMutationVariables,
} from '../generated/graphql.js';

/**
 * Player-authored Rust/WASM bound to player-owned grids — exposed as
 * `client.playerCompute` and routed to the Game API.
 *
 * Deploying requires current grid ownership plus the target-specific
 * `write_server_code` or `write_client_code` permission at both the app-tier
 * and grid ACL layers. Enabling separately requires the matching run
 * permission, a successful compile, and app admission when strict allow-list
 * mode is active. Closed source remains visible only to its personal author.
 */
export class PlayerComputeAPI {
  constructor(private readonly graphql: GraphQLClient) {}

  /**
   * Create or update a grid-bound module and publish an immutable pending
   * source version. Compilation is asynchronous.
   */
  async deploy(
    input: PlayerComputeDeployMutationVariables['input'],
  ): Promise<PlayerComputeDeployMutation['playerComputeDeploy']> {
    const data = await this.graphql.request(PlayerComputeDeployDocument, { input });
    return data.playerComputeDeploy;
  }

  /**
   * Request activation or stop execution. Enabling checks ownership, run
   * permission, compile success, and app code admission independently of
   * authoring permission.
   */
  async setEnabled(
    variables: PlayerComputeSetEnabledMutationVariables,
  ): Promise<PlayerComputeSetEnabledMutation['playerComputeSetEnabled']> {
    const data = await this.graphql.request(
      PlayerComputeSetEnabledDocument,
      variables,
    );
    return data.playerComputeSetEnabled;
  }

  /**
   * List modules authored by the caller or installed on grids they currently
   * own. Closed source is not included in this module-level result.
   */
  async myModules(
    variables: PlayerComputeMyModulesQueryVariables,
  ): Promise<PlayerComputeMyModulesQuery['playerComputeMyModules']> {
    const data = await this.graphql.request(PlayerComputeMyModulesDocument, variables);
    return data.playerComputeMyModules;
  }

  /**
   * List immutable versions newest-first. Source and compile logs are redacted
   * unless the caller is the personal author or the version is open source.
   */
  async versions(
    variables: PlayerComputeVersionsQueryVariables,
  ): Promise<PlayerComputeVersionsQuery['playerComputeVersions']> {
    const data = await this.graphql.request(PlayerComputeVersionsDocument, variables);
    return data.playerComputeVersions;
  }

  /**
   * Delete a self-authored module and its versions. The caller must still own
   * the grid. Returns false when no matching module exists.
   */
  async delete(
    variables: PlayerComputeDeleteMutationVariables,
  ): Promise<PlayerComputeDeleteMutation['playerComputeDelete']> {
    const data = await this.graphql.request(PlayerComputeDeleteDocument, variables);
    return data.playerComputeDelete;
  }
}
