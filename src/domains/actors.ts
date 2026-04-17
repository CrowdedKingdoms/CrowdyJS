import type { GraphQLClient } from '../client.js';

import {
  ActorDocument,
  type ActorQuery,
  type ActorQueryVariables,
  ActorsDocument,
  type ActorsQuery,
  type ActorsQueryVariables,
  BatchLookupActorsDocument,
  type BatchLookupActorsQuery,
  type BatchLookupActorsQueryVariables,
  CreateActorDocument,
  type CreateActorMutation,
  type CreateActorMutationVariables,
  UpdateActorDocument,
  type UpdateActorMutation,
  type UpdateActorMutationVariables,
  DeleteActorDocument,
  type DeleteActorMutation,
  type DeleteActorMutationVariables,
  UpdateActorStateDocument,
  type UpdateActorStateMutation,
  type UpdateActorStateMutationVariables,
} from '../generated/graphql.js';

/**
 * Actor (player / NPC) CRUD and filtering.
 *
 * Note: this is the persisted-actor API. For high-frequency replication see
 * the existing `client.sendActorUpdate()` UDP path (unchanged).
 *
 * Exposed as `client.actors`.
 */
export class ActorsAPI {
  constructor(private gql: GraphQLClient) {}

  async get(uuid: ActorQueryVariables['uuid']): Promise<ActorQuery['actor']> {
    const data = await this.gql.request(ActorDocument, { uuid });
    return data.actor;
  }

  async list(filter?: ActorsQueryVariables['filter']): Promise<ActorsQuery['actors']> {
    const data = await this.gql.request(ActorsDocument, { filter });
    return data.actors;
  }

  async batchLookup(
    input: BatchLookupActorsQueryVariables['input']
  ): Promise<BatchLookupActorsQuery['batchLookupActors']> {
    const data = await this.gql.request(BatchLookupActorsDocument, { input });
    return data.batchLookupActors;
  }

  async create(
    input: CreateActorMutationVariables['input']
  ): Promise<CreateActorMutation['createActor']> {
    const data = await this.gql.request(CreateActorDocument, { input });
    return data.createActor;
  }

  async update(
    uuid: UpdateActorMutationVariables['uuid'],
    input: UpdateActorMutationVariables['input']
  ): Promise<UpdateActorMutation['updateActor']> {
    const data = await this.gql.request(UpdateActorDocument, { uuid, input });
    return data.updateActor;
  }

  async delete(
    uuid: DeleteActorMutationVariables['uuid']
  ): Promise<DeleteActorMutation['deleteActor']> {
    const data = await this.gql.request(DeleteActorDocument, { uuid });
    return data.deleteActor;
  }

  async updateState(
    uuid: UpdateActorStateMutationVariables['uuid'],
    input: UpdateActorStateMutationVariables['input']
  ): Promise<UpdateActorStateMutation['updateActorState']> {
    const data = await this.gql.request(UpdateActorStateDocument, { uuid, input });
    return data.updateActorState;
  }
}
