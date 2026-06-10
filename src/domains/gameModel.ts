import type { GraphQLClient } from '../client.js';

import {
  // Runtime (player) ops
  GameModelCreateSessionDocument,
  type GameModelCreateSessionMutation,
  type GameModelCreateSessionMutationVariables,
  GameModelJoinSessionDocument,
  type GameModelJoinSessionMutation,
  type GameModelJoinSessionMutationVariables,
  GameModelSetSessionTurnDocument,
  type GameModelSetSessionTurnMutation,
  type GameModelSetSessionTurnMutationVariables,
  GameModelCreateContainerDocument,
  type GameModelCreateContainerMutation,
  type GameModelCreateContainerMutationVariables,
  GameModelSetPropertyDocument,
  type GameModelSetPropertyMutation,
  type GameModelSetPropertyMutationVariables,
  GameModelAddEdgeDocument,
  type GameModelAddEdgeMutation,
  type GameModelAddEdgeMutationVariables,
  GameModelInvokeDocument,
  type GameModelInvokeMutation,
  type GameModelInvokeMutationVariables,
  GameModelContainerDocument,
  type GameModelContainerQuery,
  type GameModelContainerQueryVariables,
  GameModelContainersDocument,
  type GameModelContainersQuery,
  type GameModelContainersQueryVariables,
  GameModelContainerStateDocument,
  type GameModelContainerStateQuery,
  type GameModelContainerStateQueryVariables,
  GameModelTraverseDocument,
  type GameModelTraverseQuery,
  type GameModelTraverseQueryVariables,
  GameModelSessionDocument,
  type GameModelSessionQuery,
  type GameModelSessionQueryVariables,
  GameModelSessionsDocument,
  type GameModelSessionsQuery,
  type GameModelSessionsQueryVariables,
  GameModelEventsDocument,
  type GameModelEventsQuery,
  type GameModelEventsQueryVariables,
  // Studio authoring ops
  GameModelSeedDocument,
  type GameModelSeedMutation,
  type GameModelSeedMutationVariables,
  GameModelUpsertContainerTypeDocument,
  type GameModelUpsertContainerTypeMutation,
  type GameModelUpsertContainerTypeMutationVariables,
  GameModelUpsertPropertyDefDocument,
  type GameModelUpsertPropertyDefMutation,
  type GameModelUpsertPropertyDefMutationVariables,
  GameModelUpsertFunctionDocument,
  type GameModelUpsertFunctionMutation,
  type GameModelUpsertFunctionMutationVariables,
  GameModelDeleteFunctionDocument,
  type GameModelDeleteFunctionMutation,
  type GameModelDeleteFunctionMutationVariables,
  GameModelDefineFeatureDocument,
  type GameModelDefineFeatureMutation,
  type GameModelDefineFeatureMutationVariables,
  GameModelGrantTierFeatureDocument,
  type GameModelGrantTierFeatureMutation,
  type GameModelGrantTierFeatureMutationVariables,
  GameModelSetPolicyDocument,
  type GameModelSetPolicyMutation,
  type GameModelSetPolicyMutationVariables,
  GameModelTypeSchemaDocument,
  type GameModelTypeSchemaQuery,
  type GameModelTypeSchemaQueryVariables,
} from '../generated/graphql.js';

/**
 * Abstract game model sub-client (cks-game-api). Studios author the model
 * (container types, property schemas, functions, tier features) and players
 * query state + invoke functions at runtime.
 *
 * Arbitrary JSON values are passed/returned as JSON-encoded strings (the
 * `*Json` fields); callers JSON.parse / JSON.stringify around them.
 *
 * Exposed as `client.gameModel`.
 */
export class GameModelAPI {
  constructor(private gql: GraphQLClient) {}

  // -- Runtime (player) -------------------------------------------------------

  async createSession(
    input: GameModelCreateSessionMutationVariables['input'],
  ): Promise<GameModelCreateSessionMutation['gameModelCreateSession']> {
    const data = await this.gql.request(GameModelCreateSessionDocument, { input });
    return data.gameModelCreateSession;
  }

  async joinSession(
    input: GameModelJoinSessionMutationVariables['input'],
  ): Promise<GameModelJoinSessionMutation['gameModelJoinSession']> {
    const data = await this.gql.request(GameModelJoinSessionDocument, { input });
    return data.gameModelJoinSession;
  }

  async setSessionTurn(
    input: GameModelSetSessionTurnMutationVariables['input'],
  ): Promise<GameModelSetSessionTurnMutation['gameModelSetSessionTurn']> {
    const data = await this.gql.request(GameModelSetSessionTurnDocument, { input });
    return data.gameModelSetSessionTurn;
  }

  async createContainer(
    input: GameModelCreateContainerMutationVariables['input'],
  ): Promise<GameModelCreateContainerMutation['gameModelCreateContainer']> {
    const data = await this.gql.request(GameModelCreateContainerDocument, { input });
    return data.gameModelCreateContainer;
  }

  async setProperty(
    input: GameModelSetPropertyMutationVariables['input'],
  ): Promise<GameModelSetPropertyMutation['gameModelSetProperty']> {
    const data = await this.gql.request(GameModelSetPropertyDocument, { input });
    return data.gameModelSetProperty;
  }

  async addEdge(
    input: GameModelAddEdgeMutationVariables['input'],
  ): Promise<GameModelAddEdgeMutation['gameModelAddEdge']> {
    const data = await this.gql.request(GameModelAddEdgeDocument, { input });
    return data.gameModelAddEdge;
  }

  async invoke(
    input: GameModelInvokeMutationVariables['input'],
  ): Promise<GameModelInvokeMutation['gameModelInvoke']> {
    const data = await this.gql.request(GameModelInvokeDocument, { input });
    return data.gameModelInvoke;
  }

  async container(
    variables: GameModelContainerQueryVariables,
  ): Promise<GameModelContainerQuery['gameModelContainer']> {
    const data = await this.gql.request(GameModelContainerDocument, variables);
    return data.gameModelContainer;
  }

  async containers(
    variables: GameModelContainersQueryVariables,
  ): Promise<GameModelContainersQuery['gameModelContainers']> {
    const data = await this.gql.request(GameModelContainersDocument, variables);
    return data.gameModelContainers;
  }

  async containerState(
    variables: GameModelContainerStateQueryVariables,
  ): Promise<GameModelContainerStateQuery['gameModelContainerState']> {
    const data = await this.gql.request(GameModelContainerStateDocument, variables);
    return data.gameModelContainerState;
  }

  async traverse(
    variables: GameModelTraverseQueryVariables,
  ): Promise<GameModelTraverseQuery['gameModelTraverse']> {
    const data = await this.gql.request(GameModelTraverseDocument, variables);
    return data.gameModelTraverse;
  }

  async session(
    variables: GameModelSessionQueryVariables,
  ): Promise<GameModelSessionQuery['gameModelSession']> {
    const data = await this.gql.request(GameModelSessionDocument, variables);
    return data.gameModelSession;
  }

  async sessions(
    variables: GameModelSessionsQueryVariables,
  ): Promise<GameModelSessionsQuery['gameModelSessions']> {
    const data = await this.gql.request(GameModelSessionsDocument, variables);
    return data.gameModelSessions;
  }

  async events(
    variables: GameModelEventsQueryVariables,
  ): Promise<GameModelEventsQuery['gameModelEvents']> {
    const data = await this.gql.request(GameModelEventsDocument, variables);
    return data.gameModelEvents;
  }

  // -- Studio authoring -------------------------------------------------------

  async seed(
    input: GameModelSeedMutationVariables['input'],
  ): Promise<GameModelSeedMutation['gameModelSeed']> {
    const data = await this.gql.request(GameModelSeedDocument, { input });
    return data.gameModelSeed;
  }

  async upsertContainerType(
    input: GameModelUpsertContainerTypeMutationVariables['input'],
  ): Promise<GameModelUpsertContainerTypeMutation['gameModelUpsertContainerType']> {
    const data = await this.gql.request(GameModelUpsertContainerTypeDocument, { input });
    return data.gameModelUpsertContainerType;
  }

  async upsertPropertyDef(
    input: GameModelUpsertPropertyDefMutationVariables['input'],
  ): Promise<GameModelUpsertPropertyDefMutation['gameModelUpsertPropertyDef']> {
    const data = await this.gql.request(GameModelUpsertPropertyDefDocument, { input });
    return data.gameModelUpsertPropertyDef;
  }

  async upsertFunction(
    input: GameModelUpsertFunctionMutationVariables['input'],
  ): Promise<GameModelUpsertFunctionMutation['gameModelUpsertFunction']> {
    const data = await this.gql.request(GameModelUpsertFunctionDocument, { input });
    return data.gameModelUpsertFunction;
  }

  async deleteFunction(
    variables: GameModelDeleteFunctionMutationVariables,
  ): Promise<GameModelDeleteFunctionMutation['gameModelDeleteFunction']> {
    const data = await this.gql.request(GameModelDeleteFunctionDocument, variables);
    return data.gameModelDeleteFunction;
  }

  async defineFeature(
    input: GameModelDefineFeatureMutationVariables['input'],
  ): Promise<GameModelDefineFeatureMutation['gameModelDefineFeature']> {
    const data = await this.gql.request(GameModelDefineFeatureDocument, { input });
    return data.gameModelDefineFeature;
  }

  async grantTierFeature(
    input: GameModelGrantTierFeatureMutationVariables['input'],
  ): Promise<GameModelGrantTierFeatureMutation['gameModelGrantTierFeature']> {
    const data = await this.gql.request(GameModelGrantTierFeatureDocument, { input });
    return data.gameModelGrantTierFeature;
  }

  async setPolicy(
    input: GameModelSetPolicyMutationVariables['input'],
  ): Promise<GameModelSetPolicyMutation['gameModelSetPolicy']> {
    const data = await this.gql.request(GameModelSetPolicyDocument, { input });
    return data.gameModelSetPolicy;
  }

  async typeSchema(
    variables: GameModelTypeSchemaQueryVariables,
  ): Promise<GameModelTypeSchemaQuery['gameModelTypeSchema']> {
    const data = await this.gql.request(GameModelTypeSchemaDocument, variables);
    return data.gameModelTypeSchema;
  }
}
