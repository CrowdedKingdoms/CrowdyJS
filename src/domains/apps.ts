import type { GraphQLClient } from '../client.js';

import {
  AppDocument,
  type AppQuery,
  type AppQueryVariables,
  AppBySlugDocument,
  type AppBySlugQuery,
  type AppBySlugQueryVariables,
  MyAppsDocument,
  type MyAppsQuery,
  AppsForOrgDocument,
  type AppsForOrgQuery,
  type AppsForOrgQueryVariables,
  MarketplaceAppsDocument,
  type MarketplaceAppsQuery,
  type MarketplaceAppsQueryVariables,
  CreateAppDocument,
  type CreateAppMutation,
  type CreateAppMutationVariables,
  UpdateAppDocument,
  type UpdateAppMutation,
  type UpdateAppMutationVariables,
  ArchiveAppDocument,
  type ArchiveAppMutationVariables,
  SetAppVisibilityDocument,
  type SetAppVisibilityMutation,
  type SetAppVisibilityMutationVariables,
} from '../generated/graphql.js';

/**
 * App (game / world) lifecycle and discovery. Exposed as `client.apps`.
 *
 * `marketplace()` is a public listing (no auth) of every app where
 * visibility = PUBLIC and status = LIVE; the rest of the methods require
 * either org-membership permissions or super admin.
 */
export class AppsAPI {
  constructor(private gql: GraphQLClient) {}

  async marketplace(
    args: MarketplaceAppsQueryVariables = {},
  ): Promise<MarketplaceAppsQuery['apps']> {
    const data = await this.gql.request(MarketplaceAppsDocument, args);
    return data.apps;
  }

  async byId(appId: AppQueryVariables['appId']): Promise<AppQuery['app']> {
    const data = await this.gql.request(AppDocument, { appId });
    return data.app;
  }

  async bySlug(
    args: AppBySlugQueryVariables,
  ): Promise<AppBySlugQuery['appBySlug']> {
    const data = await this.gql.request(AppBySlugDocument, args);
    return data.appBySlug;
  }

  async myApps(): Promise<MyAppsQuery['myApps']> {
    const data = await this.gql.request(MyAppsDocument, undefined);
    return data.myApps;
  }

  async forOrg(
    orgSlug: AppsForOrgQueryVariables['orgSlug'],
  ): Promise<AppsForOrgQuery['appsForOrg']> {
    const data = await this.gql.request(AppsForOrgDocument, { orgSlug });
    return data.appsForOrg;
  }

  async create(
    input: CreateAppMutationVariables['input'],
  ): Promise<CreateAppMutation['createApp']> {
    const data = await this.gql.request(CreateAppDocument, { input });
    return data.createApp;
  }

  async update(
    args: UpdateAppMutationVariables,
  ): Promise<UpdateAppMutation['updateApp']> {
    const data = await this.gql.request(UpdateAppDocument, args);
    return data.updateApp;
  }

  async archive(
    appId: ArchiveAppMutationVariables['appId'],
  ): Promise<{ appId: any; status: string; updatedAt: any }> {
    const data = await this.gql.request(ArchiveAppDocument, { appId });
    return data.archiveApp;
  }

  async setVisibility(
    args: SetAppVisibilityMutationVariables,
  ): Promise<SetAppVisibilityMutation['setAppVisibility']> {
    const data = await this.gql.request(SetAppVisibilityDocument, args);
    return data.setAppVisibility;
  }
}
