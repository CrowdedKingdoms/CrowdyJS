import type { GraphQLClient } from '../client.js';
import {
  GridUserPermissionsDocument,
  NearbyGridPermissionsDocument,
  GridPermissionLimitsDocument,
  GridGroupGrantsDocument,
  CreateGridDocument,
  GrantGridPermissionsDocument,
  RevokeGridPermissionsDocument,
  SetGridPermissionLimitsDocument,
  AssignGroupToGridDocument,
  RevokeGroupFromGridDocument,
  type GridUserPermissionsQuery,
  type NearbyGridPermissionsQuery,
  type GridPermissionLimitsQuery,
  type GridGroupGrantsQuery,
  type CreateGridMutation,
  type GrantGridPermissionsMutation,
  type RevokeGridPermissionsMutation,
  type SetGridPermissionLimitsMutation,
  type AssignGroupToGridMutation,
  type RevokeGroupFromGridMutation,
  type NearbyGridPermissionsInput,
  type CreateGridInput,
  type GrantGridPermissionsInput,
  type RevokeGridPermissionsInput,
  type SetGridPermissionLimitsInput,
  type AssignGroupToGridInput,
  type RevokeGroupFromGridInput,
} from '../generated/graphql.js';

/**
 * App grids + grid runtime-permission administration — exposed as
 * `client.gameApps` (and grouped under `client.admin`).
 *
 * Targets the **game-api**. A grid is a named 3D box of chunks that runtime
 * (voxel) permissions are scoped to. EVERY operation requires app-admin
 * (`manage_apps` on the owning org). Mutations recompute the materialized
 * effective ACL that Buddy enforces. `BigInt` ids are decimal strings.
 *
 * @throws {CrowdyGraphQLError} `UNAUTHENTICATED` / `FORBIDDEN` / `SCOPE_MISSING`
 *   when the caller lacks `manage_apps`.
 */
export class GameAppsAPI {
  constructor(private readonly graphql: GraphQLClient) {}

  /**
   * Read a user's effective (materialized) runtime permission keys on a grid.
   *
   * @param appId - App that owns the grid.
   * @param gridId - Grid to read permissions on.
   * @param userId - User whose effective permissions to read.
   * @returns The user's effective grid permissions.
   */
  async userPermissions(
    appId: string,
    gridId: string,
    userId: string,
  ): Promise<GridUserPermissionsQuery['gridUserPermissions']> {
    const data = await this.graphql.request(GridUserPermissionsDocument, {
      appId,
      gridId,
      userId,
    });
    return data.gridUserPermissions;
  }

  /**
   * List grids overlapping a chunk-coordinate box with a user's effective keys
   * on each.
   *
   * @param input - {@link NearbyGridPermissionsInput} (app, user, corners).
   * @returns The overlapping grids with effective permissions.
   */
  async nearbyPermissions(
    input: NearbyGridPermissionsInput,
  ): Promise<NearbyGridPermissionsQuery['nearbyGridPermissions']> {
    const data = await this.graphql.request(NearbyGridPermissionsDocument, {
      input,
    });
    return data.nearbyGridPermissions;
  }

  /**
   * Read the permission-key whitelist configured for a grid (empty = no limit).
   *
   * @param appId - App that owns the grid.
   * @param gridId - Grid whose whitelist to read.
   * @returns The grid's permission limits.
   */
  async permissionLimits(
    appId: string,
    gridId: string,
  ): Promise<GridPermissionLimitsQuery['gridPermissionLimits']> {
    const data = await this.graphql.request(GridPermissionLimitsDocument, {
      appId,
      gridId,
    });
    return data.gridPermissionLimits;
  }

  /**
   * List a group's grants on a grid (rows of the group-grants input table).
   *
   * @param appId - App that owns the grid.
   * @param gridId - Grid to list group grants on.
   * @param groupId - Group whose grants to list.
   * @returns The group's grid grants.
   */
  async groupGrants(
    appId: string,
    gridId: string,
    groupId: string,
  ): Promise<GridGroupGrantsQuery['gridGroupGrants']> {
    const data = await this.graphql.request(GridGroupGrantsDocument, {
      appId,
      gridId,
      groupId,
    });
    return data.gridGroupGrants;
  }

  /**
   * Create a grid (a named box of chunks). Returns a hybrid response: on success
   * `grid` is set and `error` is `NO_ERROR`; on failure `grid` is `null`.
   *
   * @param input - {@link CreateGridInput} (app + two opposite corners).
   * @returns The create-grid result.
   */
  async createGrid(
    input: CreateGridInput,
  ): Promise<CreateGridMutation['createGrid']> {
    const data = await this.graphql.request(CreateGridDocument, { input });
    return data.createGrid;
  }

  /**
   * Grant runtime permission keys directly to a user on a grid; recomputes the
   * effective ACL.
   *
   * @param input - {@link GrantGridPermissionsInput}.
   * @returns The user's effective grid permissions after the grant.
   */
  async grantPermissions(
    input: GrantGridPermissionsInput,
  ): Promise<GrantGridPermissionsMutation['grantGridPermissions']> {
    const data = await this.graphql.request(GrantGridPermissionsDocument, {
      input,
    });
    return data.grantGridPermissions;
  }

  /**
   * Revoke a user's direct grants on a grid (omit keys to revoke all);
   * recomputes the effective ACL.
   *
   * @param input - {@link RevokeGridPermissionsInput}.
   * @returns The user's remaining effective grid permissions.
   */
  async revokePermissions(
    input: RevokeGridPermissionsInput,
  ): Promise<RevokeGridPermissionsMutation['revokeGridPermissions']> {
    const data = await this.graphql.request(RevokeGridPermissionsDocument, {
      input,
    });
    return data.revokeGridPermissions;
  }

  /**
   * Replace a grid's permission-key whitelist (empty = no limit); recomputes the
   * effective ACL.
   *
   * @param input - {@link SetGridPermissionLimitsInput}.
   * @returns The grid's updated permission limits.
   */
  async setPermissionLimits(
    input: SetGridPermissionLimitsInput,
  ): Promise<SetGridPermissionLimitsMutation['setGridPermissionLimits']> {
    const data = await this.graphql.request(SetGridPermissionLimitsDocument, {
      input,
    });
    return data.setGridPermissionLimits;
  }

  /**
   * Grant permission keys to a group (optionally a single role) on a grid;
   * recomputes the effective ACL.
   *
   * @param input - {@link AssignGroupToGridInput}.
   * @returns The group's grid grants after the assignment.
   */
  async assignGroup(
    input: AssignGroupToGridInput,
  ): Promise<AssignGroupToGridMutation['assignGroupToGrid']> {
    const data = await this.graphql.request(AssignGroupToGridDocument, {
      input,
    });
    return data.assignGroupToGrid;
  }

  /**
   * Revoke a group/role's grants on a grid (omit keys to revoke all); recomputes
   * the effective ACL.
   *
   * @param input - {@link RevokeGroupFromGridInput}.
   * @returns The group's remaining grid grants.
   */
  async revokeGroup(
    input: RevokeGroupFromGridInput,
  ): Promise<RevokeGroupFromGridMutation['revokeGroupFromGrid']> {
    const data = await this.graphql.request(RevokeGroupFromGridDocument, {
      input,
    });
    return data.revokeGroupFromGrid;
  }
}
