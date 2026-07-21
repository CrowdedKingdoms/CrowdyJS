import type { GraphQLClient } from '../client.js';
import {
  PlayerModelContainersDocument,
  PlayerModelContainerDocument,
  PlayerModelCreateContainerDocument,
  PlayerModelSetPropertyDocument,
  PlayerModelDeleteContainerDocument,
  PlayerAutomationsDocument,
  PlayerAutomationCreateDocument,
  PlayerAutomationSetEnabledDocument,
  PlayerAutomationDeleteDocument,
  type PlayerModelContainersQuery,
  type PlayerModelContainersQueryVariables,
  type PlayerModelContainerQuery,
  type PlayerModelContainerQueryVariables,
  type PlayerModelCreateContainerMutation,
  type PlayerModelCreateContainerMutationVariables,
  type PlayerModelSetPropertyMutation,
  type PlayerModelSetPropertyMutationVariables,
  type PlayerModelDeleteContainerMutation,
  type PlayerModelDeleteContainerMutationVariables,
  type PlayerAutomationsQuery,
  type PlayerAutomationsQueryVariables,
  type PlayerAutomationCreateMutation,
  type PlayerAutomationCreateMutationVariables,
  type PlayerAutomationSetEnabledMutation,
  type PlayerAutomationSetEnabledMutationVariables,
  type PlayerAutomationDeleteMutation,
  type PlayerAutomationDeleteMutationVariables,
} from '../generated/graphql.js';

/**
 * Grid-owner Model data and Automations. Every operation is forced to the
 * current caller + owned grid by game-api; no studio gm_* row is reachable.
 */
export class PlayerModelAPI {
  constructor(private readonly graphql: GraphQLClient) {}

  async containers(
    variables: PlayerModelContainersQueryVariables,
  ): Promise<PlayerModelContainersQuery['playerModelContainers']> {
    const data = await this.graphql.request(
      PlayerModelContainersDocument,
      variables,
    );
    return data.playerModelContainers;
  }

  async container(
    input: PlayerModelContainerQueryVariables['input'],
  ): Promise<PlayerModelContainerQuery['playerModelContainer']> {
    const data = await this.graphql.request(PlayerModelContainerDocument, {
      input,
    });
    return data.playerModelContainer;
  }

  async createContainer(
    input: PlayerModelCreateContainerMutationVariables['input'],
  ): Promise<PlayerModelCreateContainerMutation['playerModelCreateContainer']> {
    const data = await this.graphql.request(
      PlayerModelCreateContainerDocument,
      { input },
    );
    return data.playerModelCreateContainer;
  }

  async setProperty(
    input: PlayerModelSetPropertyMutationVariables['input'],
  ): Promise<PlayerModelSetPropertyMutation['playerModelSetProperty']> {
    const data = await this.graphql.request(PlayerModelSetPropertyDocument, {
      input,
    });
    return data.playerModelSetProperty;
  }

  async deleteContainer(
    input: PlayerModelDeleteContainerMutationVariables['input'],
  ): Promise<PlayerModelDeleteContainerMutation['playerModelDeleteContainer']> {
    const data = await this.graphql.request(
      PlayerModelDeleteContainerDocument,
      { input },
    );
    return data.playerModelDeleteContainer;
  }

  async automations(
    variables: PlayerAutomationsQueryVariables,
  ): Promise<PlayerAutomationsQuery['playerAutomations']> {
    const data = await this.graphql.request(
      PlayerAutomationsDocument,
      variables,
    );
    return data.playerAutomations;
  }

  async createAutomation(
    input: PlayerAutomationCreateMutationVariables['input'],
  ): Promise<PlayerAutomationCreateMutation['playerAutomationCreate']> {
    const data = await this.graphql.request(PlayerAutomationCreateDocument, {
      input,
    });
    return data.playerAutomationCreate;
  }

  async setAutomationEnabled(
    input: PlayerAutomationSetEnabledMutationVariables['input'],
  ): Promise<
    PlayerAutomationSetEnabledMutation['playerAutomationSetEnabled']
  > {
    const data = await this.graphql.request(
      PlayerAutomationSetEnabledDocument,
      { input },
    );
    return data.playerAutomationSetEnabled;
  }

  async deleteAutomation(
    input: PlayerAutomationDeleteMutationVariables['input'],
  ): Promise<PlayerAutomationDeleteMutation['playerAutomationDelete']> {
    const data = await this.graphql.request(PlayerAutomationDeleteDocument, {
      input,
    });
    return data.playerAutomationDelete;
  }
}
