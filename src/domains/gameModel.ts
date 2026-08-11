import type { GraphQLClient } from '../client.js';
import { createClient as createWsClient } from 'graphql-ws';
import { print } from 'graphql';

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
  GameModelDeleteContainerDocument,
  type GameModelDeleteContainerMutation,
  type GameModelDeleteContainerMutationVariables,
  GameModelSetPropertyDocument,
  type GameModelSetPropertyMutation,
  type GameModelSetPropertyMutationVariables,
  GameModelAddEdgeDocument,
  type GameModelAddEdgeMutation,
  type GameModelAddEdgeMutationVariables,
  GameModelDeleteEdgeDocument,
  type GameModelDeleteEdgeMutation,
  type GameModelDeleteEdgeMutationVariables,
  GameModelInvokeDocument,
  type GameModelInvokeMutation,
  type GameModelInvokeMutationVariables,
  GameModelContainerDocument,
  type GameModelContainerQuery,
  type GameModelContainerQueryVariables,
  GameModelContainerChangedDocument,
  GameModelContainerChangedSubscription,
  GameModelContainerChangedSubscriptionVariables,
  GameModelActivePlayerCountDocument,
  type GameModelActivePlayerCountQuery,
  type GameModelActivePlayerCountQueryVariables,
  GameModelActivePlayerCountChangedDocument,
  type GameModelActivePlayerCountChangedSubscription,
  type GameModelActivePlayerCountChangedSubscriptionVariables,
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
  GameModelFlowDocument,
  type GameModelFlowQuery,
  type GameModelFlowQueryVariables,
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
  GameModelDeletePropertyDefDocument,
  type GameModelDeletePropertyDefMutation,
  type GameModelDeletePropertyDefMutationVariables,
  GameModelDeleteContainerTypeDocument,
  type GameModelDeleteContainerTypeMutation,
  type GameModelDeleteContainerTypeMutationVariables,
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
  GameModelContainerTypesDocument,
  type GameModelContainerTypesQuery,
  type GameModelContainerTypesQueryVariables,
  GameModelPropertyDefsDocument,
  type GameModelPropertyDefsQuery,
  type GameModelPropertyDefsQueryVariables,
  GameModelFunctionDocument,
  type GameModelFunctionQuery,
  type GameModelFunctionQueryVariables,
  GameModelFunctionsDocument,
  type GameModelFunctionsQuery,
  type GameModelFunctionsQueryVariables,
  GameModelFeaturesDocument,
  type GameModelFeaturesQuery,
  type GameModelFeaturesQueryVariables,
  GameModelTierFeaturesDocument,
  type GameModelTierFeaturesQuery,
  type GameModelTierFeaturesQueryVariables,
  GameModelPolicyDocument,
  type GameModelPolicyQuery,
  type GameModelPolicyQueryVariables,
  GameModelRevokeTierFeatureDocument,
  type GameModelRevokeTierFeatureMutation,
  type GameModelRevokeTierFeatureMutationVariables,
  GameModelEventsConnectionDocument,
  type GameModelEventsConnectionQuery,
  type GameModelEventsConnectionQueryVariables,
  // Automations (autonomous processes / NPCs)
  GameModelUpsertAutomationDocument,
  type GameModelUpsertAutomationMutation,
  type GameModelUpsertAutomationMutationVariables,
  GameModelDeleteAutomationDocument,
  type GameModelDeleteAutomationMutation,
  type GameModelDeleteAutomationMutationVariables,
  GameModelSetAutomationEnabledDocument,
  type GameModelSetAutomationEnabledMutation,
  type GameModelSetAutomationEnabledMutationVariables,
  GameModelUpsertAutomationTriggerDocument,
  type GameModelUpsertAutomationTriggerMutation,
  type GameModelUpsertAutomationTriggerMutationVariables,
  GameModelDeleteAutomationTriggerDocument,
  type GameModelDeleteAutomationTriggerMutation,
  type GameModelDeleteAutomationTriggerMutationVariables,
  GameModelSetAutomationPolicyDocument,
  type GameModelSetAutomationPolicyMutation,
  type GameModelSetAutomationPolicyMutationVariables,
  GameModelRunAutomationDocument,
  type GameModelRunAutomationMutation,
  type GameModelRunAutomationMutationVariables,
  GameModelAutomationsDocument,
  type GameModelAutomationsQuery,
  type GameModelAutomationsQueryVariables,
  GameModelAutomationDocument,
  type GameModelAutomationQuery,
  type GameModelAutomationQueryVariables,
  GameModelAutomationTriggersDocument,
  type GameModelAutomationTriggersQuery,
  type GameModelAutomationTriggersQueryVariables,
  GameModelAutomationPolicyDocument,
  type GameModelAutomationPolicyQuery,
  type GameModelAutomationPolicyQueryVariables,
  GameModelAutomationRunsDocument,
  type GameModelAutomationRunsQuery,
  type GameModelAutomationRunsQueryVariables,
  GameModelAutomationStatsDocument,
  type GameModelAutomationStatsQuery,
  type GameModelAutomationStatsQueryVariables,
  GameModelAppDiagnosticsDocument,
  type GameModelAppDiagnosticsQuery,
  type GameModelAppDiagnosticsQueryVariables,
  GameModelScheduleInvokeDocument,
  type GameModelScheduleInvokeMutation,
  type GameModelScheduleInvokeMutationVariables,
  GameModelCancelTimerDocument,
  type GameModelCancelTimerMutation,
  type GameModelCancelTimerMutationVariables,
  GameModelTimersDocument,
  type GameModelTimersQuery,
  type GameModelTimersQueryVariables,
} from '../generated/graphql.js';

/**
 * Abstract **game-model** sub-client on the **game-api** — a schema-driven,
 * server-authoritative layer for modelling game/world logic on top of the
 * spatial voxel world. Studios *author* the model; players *query* state and
 * *invoke* functions at runtime. Exposed as `client.gameModel`.
 *
 * The model is a typed graph of entities:
 * - **Container types** are the schemas (like classes) for a kind of entity.
 *   **Property definitions** are their typed fields, each with a default value,
 *   a read **visibility** (`public | owner | hidden`) and a **writability**
 *   (`function | owner | admin`). See {@link upsertContainerType} /
 *   {@link upsertPropertyDef} / {@link typeSchema}.
 * - **Containers** are the runtime instances of a type, optionally scoped to a
 *   session and carrying property values. See {@link createContainer},
 *   {@link container}, {@link containers}, {@link containerState}.
 * - **Functions** are named, sandboxed behaviours over containers: typed
 *   parameters, declared property **mutations** (expressions compiled to an AST
 *   server-side — never `eval`'d), an optional return expression, an
 *   `invokeScope` (`player | server | internal`), and an **invoke policy** — an
 *   authority rule tree of `owner_of_self`, `is_host`, `is_current_turn`,
 *   `is_participant`, `tier_feature`, `group_permission`, `grid_permission`, and
 *   `condition` rules. {@link invoke} is the primary, *safe* way for players to
 *   mutate state: the server checks the policy, evaluates the expressions,
 *   applies the mutations atomically, and logs an **event**.
 * - **Sessions** are isolated instance scopes (a match, room, or save) with
 *   **participants**, a creator, and an optional current-**turn** user for
 *   turn-based play. See {@link createSession}, {@link joinSession},
 *   {@link setSessionTurn}, {@link session}, {@link sessions}.
 * - **Edges** are directed, typed relationships between containers (the model is
 *   a graph); {@link traverse} walks them from a root up to a depth. See
 *   {@link addEdge}.
 * - **Events** are an audit log of every function invocation and its outcome.
 *   See {@link events}.
 * - **App features** are keys functions gate on (via `tier_feature` rules) and
 *   that **access tiers** can be granted ({@link defineFeature},
 *   {@link grantTierFeature}); **policy** governs who may create sessions and the
 *   default participant role ({@link setPolicy}).
 * - {@link seed} bulk-creates definitions *and* instances in one transaction for
 *   model init/import.
 *
 * **Encoding.** `BigInt` ids (`appId`, `tierId`, every `*UserId`) are sent and
 * received as decimal **strings**. Container, session, function, edge, and event
 * ids are opaque **UUID strings**. All structured values travel as JSON-encoded
 * strings in the `*Json` fields (`metadataJson`, `propertiesJson`, `paramsJson`,
 * `valueJson`, `returnValueJson`, `invokePolicyJson`, `idMapJson`, …) — callers
 * `JSON.parse` / `JSON.stringify` around them. (Unlike actor/state blobs, these
 * are JSON text, not base64.)
 *
 * **Auth.** Every call requires an authenticated session (a Bearer token set via
 * `client.auth.login()` or `client.setToken()`) scoped to the target app, or it
 * throws {@link CrowdyGraphQLError} (`UNAUTHENTICATED` / `SCOPE_MISSING`). The
 * **studio-authoring** methods ({@link seed}, {@link upsertContainerType},
 * {@link upsertPropertyDef}, {@link deletePropertyDef}, {@link upsertFunction},
 * {@link deleteFunction}, {@link deleteContainerType}, {@link defineFeature},
 * {@link grantTierFeature}, {@link setPolicy}) and the
 * {@link typeSchema} query additionally require the app-admin **`manage_apps`**
 * permission (otherwise `FORBIDDEN`, with `extensions.requiredPermission ===
 * 'manage_apps'`); the runtime/player methods need only a valid token plus
 * whatever per-operation policy applies (session-creation policy, a type's
 * `instantiableBy` rule, a property's `writable` rule, or a function's invoke
 * policy).
 *
 * @example
 * ```ts
 * // Studio authors a type, then a player creates a session and invokes a function.
 * await client.gameModel.upsertContainerType({ appId, typeName: 'Player', displayName: 'Player' });
 * const session = await client.gameModel.createSession({ appId, name: 'Match 1' });
 * const result = await client.gameModel.invoke({
 *   appId,
 *   functionName: 'takeDamage',
 *   selfContainerId,
 *   paramsJson: JSON.stringify({ amount: 10 }),
 * });
 * // Authority and evaluation failures do NOT throw — they come back in band, because
 * // the result still carries an event id and any writes that did apply.
 * const fault = playerFaultOf(result);
 * if (fault) {
 *   // `fault.blame` is the platform's attribution: AUTHOR (this app's code), PLATFORM
 *   // (ours) or BUDGET (an allowance). Choose your own wording — the server no longer
 *   // sends engine text, deliberately.
 *   if (fault.retryable) scheduleRetry();
 * }
 * ```
 */
/** One container-change push from {@link GameModelAPI.containerChanged}. */
export type GmContainerChangeEvent =
  GameModelContainerChangedSubscription['gameModelContainerChanged'];

/** Handlers for {@link GameModelAPI.containerChanged}. */
export interface ContainerChangedHandlers {
  /** A container changed (metadata only — pull state on receipt). */
  next: (change: GmContainerChangeEvent) => void;
  /** Transport/GraphQL errors (the subscription retries on socket drops). */
  error?: (error: unknown) => void;
  /** The server ended the stream. */
  complete?: () => void;
  /**
   * WebSocket constructor for runtimes without a global `WebSocket` (Node
   * ≤ 21): pass `(await import('ws')).default`.
   */
  webSocketImpl?: unknown;
}

/** A snapshot returned by {@link GameModelAPI.activePlayerCount}. */
export type GmActivePlayerCountSnapshot =
  GameModelActivePlayerCountQuery['gameModelActivePlayerCount'];

/** One count transition from {@link GameModelAPI.activePlayerCountChanged}. */
export type GmActivePlayerCountChangeEvent =
  GameModelActivePlayerCountChangedSubscription['gameModelActivePlayerCountChanged'];

/** Handlers for {@link GameModelAPI.activePlayerCountChanged}. */
export interface ActivePlayerCountChangedHandlers {
  /** A complete app-scoped active-session count transition. */
  next: (change: GmActivePlayerCountChangeEvent) => void;
  /** Transport/GraphQL errors (the subscription retries on socket drops). */
  error?: (error: unknown) => void;
  /** The server ended the stream. */
  complete?: () => void;
  /**
   * WebSocket constructor for runtimes without a global `WebSocket` (Node
   * ≤ 21): pass `(await import('ws')).default`.
   */
  webSocketImpl?: unknown;
}

export class GameModelAPI {
  constructor(
    private gql: GraphQLClient,
    private readonly ws?: { wsUrl?: string; getToken: () => string | null },
  ) {}

  /**
   * **Player count** — read the best-known number of active gameplay sessions
   * for one app. Requires a bearer token scoped to exactly `appId`.
   *
   * This is a **session count**, not a distinct-user or actor count: one user
   * with multiple active sessions contributes more than once. A session that
   * disappears without a clean disconnect can remain counted for approximately
   * 120 seconds while its inactivity is recognized.
   *
   * Treat the result as authoritative only when `status === 'FRESH'`.
   * `PARTIAL` is an incomplete best-known count and `UNAVAILABLE` means no fresh
   * observation exists; neither status is an authoritative zero. `appId` and
   * the monotonic `revision` are generated `BigInt` scalars represented as
   * decimal strings.
   *
   * @param appId - App to count, as a decimal-string `BigInt`; it must match
   *   the app scope of the bearer token.
   * @returns The generated snapshot payload: `appId`, `activePlayerCount`,
   *   `status`, nullable `observedAt`, and `revision`.
   * @throws {CrowdyGraphQLError} `UNAUTHENTICATED` / `SCOPE_MISSING` when the
   *   token is missing or is not scoped to `appId`.
   */
  async activePlayerCount(
    appId: GameModelActivePlayerCountQueryVariables['appId'],
  ): Promise<GmActivePlayerCountSnapshot> {
    const data = await this.gql.request(GameModelActivePlayerCountDocument, {
      appId,
    });
    return data.gameModelActivePlayerCount;
  }

  /**
   * **Player-count subscription** — stream complete active-session count
   * transitions for one app. Requires a bearer token scoped to exactly
   * `variables.appId` and a game-api `wsUrl` in the client config.
   *
   * This stream counts gameplay **sessions**, not distinct users or actors;
   * abandoned sessions can remain counted for approximately 120 seconds while
   * inactivity is recognized. It emits no initial/bootstrap event, so establish
   * the stream and then call {@link activePlayerCount} for the current snapshot.
   * `PARTIAL` and `UNAVAILABLE` observations neither emit transitions nor
   * represent an authoritative zero.
   *
   * Delivery is best-effort and may miss or repeat events across reconnects.
   * Deduplicate by the decimal-string `revision`. Requery
   * {@link activePlayerCount} after every reconnect or whenever revisions have
   * a gap; the query is the source of truth.
   *
   * @param variables - Exact call shape `{ appId }`, where `appId` is the
   *   decimal-string `BigInt` matching the app-scoped bearer token.
   * @param handlers - `next` per transition; optional `error`, `complete`, and
   *   `webSocketImpl` for runtimes without a global `WebSocket`.
   * @returns An unsubscribe function that disposes this subscription and its
   *   graphql-transport-ws client.
   * @throws {Error} Synchronously when the client config has no `wsUrl`.
   */
  activePlayerCountChanged(
    variables: GameModelActivePlayerCountChangedSubscriptionVariables,
    handlers: ActivePlayerCountChangedHandlers,
  ): () => void {
    if (!this.ws?.wsUrl) {
      throw new Error(
        'activePlayerCountChanged requires a wsUrl in the client config (graphql-transport-ws endpoint)',
      );
    }
    const client = createWsClient({
      url: this.ws.wsUrl,
      lazy: false,
      retryAttempts: 8,
      ...(handlers.webSocketImpl
        ? { webSocketImpl: handlers.webSocketImpl as never }
        : {}),
      connectionParams: () => {
        const token = this.ws?.getToken();
        return token ? { Authorization: `Bearer ${token}` } : {};
      },
    });
    const dispose = client.subscribe(
      { query: print(GameModelActivePlayerCountChangedDocument), variables },
      {
        next: (msg: { data?: unknown; errors?: unknown }) => {
          const data = msg.data as
            | GameModelActivePlayerCountChangedSubscription
            | undefined;
          if (data?.gameModelActivePlayerCountChanged) {
            handlers.next(data.gameModelActivePlayerCountChanged);
          } else if (msg.errors) {
            handlers.error?.(msg.errors);
          }
        },
        error: (err) => handlers.error?.(err),
        complete: () => handlers.complete?.(),
      },
    );
    return () => {
      dispose();
      void client.dispose();
    };
  }

  /**
   * **Subscriptions** — stream container-change notifications for an app
   * (`gameModelContainerChanged`): an invoke mutated a container, a direct
   * `setProperty` wrote it, or it was created/deleted. Events are
   * **metadata only** (containerId, typeName, changedKeys — no property
   * values): pull the visibility-filtered state with {@link containerState}
   * on receipt. Post-commit and best-effort, exactly like model-driven
   * notifications — replaces interval polling with pull-on-push. Requires a
   * game-api with the container-change feed (2026-07+) and a `wsUrl` in the
   * client config.
   *
   * @param variables - `{ appId, typeName?, sessionId? }` delivery filters.
   * @param handlers - `next` per change; optional `error` / `complete`.
   * @returns An unsubscribe function (closes this subscription's socket).
   */
  containerChanged(
    variables: GameModelContainerChangedSubscriptionVariables,
    handlers: ContainerChangedHandlers,
  ): () => void {
    if (!this.ws?.wsUrl) {
      throw new Error(
        'containerChanged requires a wsUrl in the client config (graphql-transport-ws endpoint)',
      );
    }
    const client = createWsClient({
      url: this.ws.wsUrl,
      lazy: false,
      retryAttempts: 8,
      ...(handlers.webSocketImpl
        ? { webSocketImpl: handlers.webSocketImpl as never }
        : {}),
      connectionParams: () => {
        const token = this.ws?.getToken();
        return token ? { Authorization: `Bearer ${token}` } : {};
      },
    });
    const dispose = client.subscribe(
      { query: print(GameModelContainerChangedDocument), variables },
      {
        next: (msg: { data?: unknown; errors?: unknown }) => {
          const data = msg.data as GameModelContainerChangedSubscription | undefined;
          if (data?.gameModelContainerChanged) {
            handlers.next(data.gameModelContainerChanged);
          } else if (msg.errors) {
            handlers.error?.(msg.errors);
          }
        },
        error: (err) => handlers.error?.(err),
        complete: () => handlers.complete?.(),
      },
    );
    return () => {
      dispose();
      void client.dispose();
    };
  }

  // -- Runtime (player) -------------------------------------------------------

  /**
   * **Sessions** — create a runtime session: an isolated instance scope for
   * containers (e.g. a match, room, or save). Subject to the app's
   * session-creation policy ({@link setPolicy}); the caller becomes the creator
   * and a participant.
   *
   * @param input - {@link CreateSessionInput}: `appId` (decimal string), an
   *   optional `name`, optional `metadataJson` (a JSON-object string), and
   *   optional `participantUserIds` (decimal-string ids of initial participants
   *   besides the creator).
   * @returns The created {@link GmSession} (`sessionId`, `status`, creator,
   *   current turn, metadata, …).
   * @throws {CrowdyGraphQLError} `UNAUTHENTICATED` / `SCOPE_MISSING` if the token
   *   is missing or not scoped to the app, `FORBIDDEN` if the session-creation
   *   policy disallows the caller, or `BAD_USER_INPUT` for malformed input.
   */
  async createSession(
    input: GameModelCreateSessionMutationVariables['input'],
  ): Promise<GameModelCreateSessionMutation['gameModelCreateSession']> {
    const data = await this.gql.request(GameModelCreateSessionDocument, { input });
    return data.gameModelCreateSession;
  }

  /**
   * **Sessions** — join an existing session as a participant, optionally with a
   * role. Requires a valid token and access to the app.
   *
   * @param input - {@link JoinSessionInput}: `appId` (decimal string),
   *   `sessionId`, and an optional participant `role`.
   * @returns The {@link GmSessionParticipant} record (`sessionId`, `userId`,
   *   `role`).
   * @throws {CrowdyGraphQLError} `UNAUTHENTICATED` / `SCOPE_MISSING`,
   *   `NOT_FOUND` if no such session, or `FORBIDDEN` if joining isn't permitted.
   */
  async joinSession(
    input: GameModelJoinSessionMutationVariables['input'],
  ): Promise<GameModelJoinSessionMutation['gameModelJoinSession']> {
    const data = await this.gql.request(GameModelJoinSessionDocument, { input });
    return data.gameModelJoinSession;
  }

  /**
   * **Sessions** — set or clear the session's current-turn user, for turn-based
   * play (turn authority is enforced by the service).
   *
   * @param input - {@link SetSessionTurnInput}: `appId` (decimal string),
   *   `sessionId`, and `userId` (the decimal-string id of the user whose turn it
   *   now is) — pass `userId: null` to **clear** the turn.
   * @returns The updated {@link GmSession} (with `currentTurnUserId` reflecting
   *   the change).
   * @throws {CrowdyGraphQLError} `UNAUTHENTICATED` / `SCOPE_MISSING`,
   *   `NOT_FOUND` if the session doesn't exist, or `FORBIDDEN` if the caller may
   *   not change the turn.
   */
  async setSessionTurn(
    input: GameModelSetSessionTurnMutationVariables['input'],
  ): Promise<GameModelSetSessionTurnMutation['gameModelSetSessionTurn']> {
    const data = await this.gql.request(GameModelSetSessionTurnDocument, { input });
    return data.gameModelSetSessionTurn;
  }

  /**
   * **Containers** — instantiate a container (a runtime entity of a given type),
   * optionally within a session, with an owner and initial property values.
   * Subject to the type's `instantiableBy` rule (`admin | member | owner`).
   *
   * @param input - {@link CreateContainerInput}: `appId` (decimal string), an
   *   optional `sessionId` (omit for an app-global container), the `typeName` to
   *   instantiate, a `displayName`, optional `description`, optional
   *   `ownerUserId` (decimal string; defaults to the caller for member/owner
   *   instantiation), optional `metadataJson` (JSON-object string), and optional
   *   initial `properties` (each `{ key, valueType, valueJson }` with a
   *   JSON-encoded value).
   * @returns The created {@link GmContainer}.
   * @throws {CrowdyGraphQLError} `UNAUTHENTICATED` / `SCOPE_MISSING`,
   *   `FORBIDDEN` if `instantiableBy` disallows the caller, `NOT_FOUND` for an
   *   unknown type, or `BAD_USER_INPUT` for malformed properties.
   */
  async createContainer(
    input: GameModelCreateContainerMutationVariables['input'],
  ): Promise<GameModelCreateContainerMutation['gameModelCreateContainer']> {
    const data = await this.gql.request(GameModelCreateContainerDocument, { input });
    return data.gameModelCreateContainer;
  }

  /**
   * **Containers** — delete a container instance. Cascades its instance
   * properties and any edges connected to it. Allowed for an app admin or the
   * container owner. **Destructive.**
   *
   * @param variables - `{ appId, containerId }`: `appId` (decimal string) and
   *   the container UUID to delete.
   * @returns `true` if a container was deleted, `false` if none matched.
   * @throws {CrowdyGraphQLError} `UNAUTHENTICATED` / `SCOPE_MISSING`, or
   *   `FORBIDDEN` if the caller is neither an app admin nor the owner.
   */
  async deleteContainer(
    variables: GameModelDeleteContainerMutationVariables,
  ): Promise<GameModelDeleteContainerMutation['gameModelDeleteContainer']> {
    const data = await this.gql.request(GameModelDeleteContainerDocument, variables);
    return data.gameModelDeleteContainer;
  }

  /**
   * **Containers** — set a single property value on a container directly (outside
   * a function). Allowed only when the property's `writable` rule
   * (`function | owner | admin`) permits the caller; the value is JSON-encoded
   * and coerced to the property's declared value type. For game-logic changes
   * prefer {@link invoke}, which enforces an authority policy and logs an event.
   *
   * @param input - {@link SetContainerPropertyInput}: `appId` (decimal string),
   *   `containerId`, the property `key`, its `valueType` (must match the property
   *   definition), and `valueJson` (the JSON-encoded value to write).
   * @returns The updated {@link GmContainer}.
   * @throws {CrowdyGraphQLError} `UNAUTHENTICATED` / `SCOPE_MISSING`,
   *   `FORBIDDEN` if the property's `writable` rule forbids a direct write,
   *   `NOT_FOUND` for an unknown container/property, or `BAD_USER_INPUT` for a
   *   value-type mismatch.
   */
  async setProperty(
    input: GameModelSetPropertyMutationVariables['input'],
  ): Promise<GameModelSetPropertyMutation['gameModelSetProperty']> {
    const data = await this.gql.request(GameModelSetPropertyDocument, { input });
    return data.gameModelSetProperty;
  }

  /**
   * **Edges** — create a directed relationship edge between two containers (the
   * game model is a graph), with a relationship type and optional weight.
   *
   * @param input - {@link AddEdgeInput}: `appId` (decimal string),
   *   `fromContainerId` (source) and `toContainerId` (target), a
   *   `relationshipType` label, an optional numeric `weight`, and optional
   *   `metadataJson` (JSON-object string).
   * @returns The created {@link GmEdge} (`edgeId`, endpoints, type, weight).
   * @throws {CrowdyGraphQLError} `UNAUTHENTICATED` / `SCOPE_MISSING`,
   *   `NOT_FOUND` if either container is unknown, or `BAD_USER_INPUT`.
   */
  async addEdge(
    input: GameModelAddEdgeMutationVariables['input'],
  ): Promise<GameModelAddEdgeMutation['gameModelAddEdge']> {
    const data = await this.gql.request(GameModelAddEdgeDocument, { input });
    return data.gameModelAddEdge;
  }

  /**
   * **Edges** — delete a directed relationship edge. Allowed for an app admin or
   * the owner of the source (`from`) container. **Destructive.**
   *
   * @param variables - `{ appId, edgeId }`: `appId` (decimal string) and the
   *   edge UUID to delete.
   * @returns `true` if an edge was deleted, `false` if none matched.
   * @throws {CrowdyGraphQLError} `UNAUTHENTICATED` / `SCOPE_MISSING`, or
   *   `FORBIDDEN` if the caller may not delete the edge.
   */
  async deleteEdge(
    variables: GameModelDeleteEdgeMutationVariables,
  ): Promise<GameModelDeleteEdgeMutation['gameModelDeleteEdge']> {
    const data = await this.gql.request(GameModelDeleteEdgeDocument, variables);
    return data.gameModelDeleteEdge;
  }

  /**
   * **Functions** — invoke a studio-defined function against a `self` container
   * with JSON params. This is the primary, *safe* way for players to mutate game
   * state: the server enforces the function's invoke policy (the authority rule
   * tree — `owner_of_self` / `is_host` / `is_current_turn` / `is_participant` /
   * `tier_feature` / `group_permission` / `grid_permission` / `condition`),
   * evaluates its expressions, atomically applies its declared property
   * mutations, and logs an {@link events | event}. Only `player`-scope functions
   * are invocable here.
   *
   * Note: an authority denial or an expression-evaluation error is **not** a
   * thrown exception — it comes back as a resolved result with `success: false`
   * and an `errorMessage`. Inspect `result.success` rather than relying on
   * `try/catch` for those cases.
   *
   * @param input - {@link InvokeFunctionInput}: `appId` (decimal string), the
   *   `functionName`, the `selfContainerId` (the container the function runs
   *   against, referenced as `self` in expressions), an optional `sessionId`
   *   context, and `paramsJson` (a JSON-object string of params).
   * @returns A {@link GmInvokeResult}: `success`, the logged `eventId`, the
   *   JSON-encoded `returnValueJson`, the `mutationsApplied` (each with
   *   before/after JSON values), and `errorMessage` when `success` is `false`.
   * @throws {CrowdyGraphQLError} `UNAUTHENTICATED` / `SCOPE_MISSING`,
   *   `NOT_FOUND` for an unknown function/container, `FORBIDDEN` if the function
   *   isn't `player`-scope, or `BAD_USER_INPUT` for malformed params. (Authority
   *   and evaluation failures surface as `success: false`, see above.)
   */
  async invoke(
    input: GameModelInvokeMutationVariables['input'],
  ): Promise<GameModelInvokeMutation['gameModelInvoke']> {
    const data = await this.gql.request(GameModelInvokeDocument, { input });
    return data.gameModelInvoke;
  }

  /**
   * **Containers** — fetch one container (instance) by id, with its full record
   * (unfiltered metadata). For a player-facing view whose property values are
   * filtered to what the caller may see, use {@link containerState} instead.
   *
   * @param variables - `{ appId, containerId }`: `appId` (decimal string) is the
   *   owning app and `containerId` is the container UUID to fetch.
   * @returns The {@link GmContainer}.
   * @throws {CrowdyGraphQLError} `UNAUTHENTICATED` / `SCOPE_MISSING`, or
   *   `NOT_FOUND` if no such container.
   */
  async container(
    variables: GameModelContainerQueryVariables,
  ): Promise<GameModelContainerQuery['gameModelContainer']> {
    const data = await this.gql.request(GameModelContainerDocument, variables);
    return data.gameModelContainer;
  }

  /**
   * **Containers** — list containers in an app, optionally narrowed by container
   * type and/or session, filtered by property predicates, and paged.
   *
   * @param variables - `{ appId, typeName?, sessionId?, where?, limit?, offset? }`:
   *   `appId` (decimal string); optional `typeName` (omit for all types);
   *   optional `sessionId` (omit for all containers, including app-global
   *   ones); optional `where` (max 8 AND-combined
   *   `{ key, op, valueJson }` predicates — ops `==`, `!=`, `<`, `>`, `<=`,
   *   `>=`; requires `typeName`; missing properties fall back to the type
   *   default — the same predicate shape automation selectors use); optional
   *   `limit`/`offset` paging applied after filtering over the stable
   *   created-at ordering. Requires game-api with container predicates
   *   (2026-07 or later); older servers reject the new arguments.
   * @returns The matching {@link GmContainer}s.
   * @throws {CrowdyGraphQLError} `UNAUTHENTICATED` / `SCOPE_MISSING`, or
   *   `BAD_USER_INPUT` for `where` without `typeName` / unsupported ops.
   */
  async containers(
    variables: GameModelContainersQueryVariables,
  ): Promise<GameModelContainersQuery['gameModelContainers']> {
    const data = await this.gql.request(GameModelContainersDocument, variables);
    return data.gameModelContainers;
  }

  /**
   * **Containers** — fetch a container together with its property values
   * filtered to what the **calling** user is allowed to see (`public` always;
   * `owner`/`hidden` depend on the caller's relationship to the container). Use
   * this for a player-facing view of an entity.
   *
   * @param variables - `{ appId, containerId }`: `appId` (decimal string) and
   *   the `containerId` UUID whose visible state to fetch.
   * @returns A {@link GmContainerState}; its `propertiesJson` is a JSON-object
   *   string of the properties visible to the caller (`JSON.parse` it).
   * @throws {CrowdyGraphQLError} `UNAUTHENTICATED` / `SCOPE_MISSING`, or
   *   `NOT_FOUND` if no such container.
   */
  async containerState(
    variables: GameModelContainerStateQueryVariables,
  ): Promise<GameModelContainerStateQuery['gameModelContainerState']> {
    const data = await this.gql.request(GameModelContainerStateDocument, variables);
    return data.gameModelContainerState;
  }

  /**
   * **Edges** — traverse the container graph from a root container along a
   * relationship type up to a given depth, returning the reachable nodes and the
   * edges between them.
   *
   * @param variables - `{ appId, rootId, relationshipType, depth? }`: `appId`
   *   (decimal string); the `rootId` container UUID to start from; the
   *   `relationshipType` edge label to follow; and optional `depth`, the number
   *   of edge hops to follow from the root (defaults to `1`).
   * @returns A {@link GmTraverseResult}: the `rootId`, the reachable `nodes`
   *   ({@link GmContainer}[]), and the traversed `edges` ({@link GmEdge}[]).
   * @throws {CrowdyGraphQLError} `UNAUTHENTICATED` / `SCOPE_MISSING`, or
   *   `NOT_FOUND` if the root container is unknown.
   */
  async traverse(
    variables: GameModelTraverseQueryVariables,
  ): Promise<GameModelTraverseQuery['gameModelTraverse']> {
    const data = await this.gql.request(GameModelTraverseDocument, variables);
    return data.gameModelTraverse;
  }

  /**
   * **Sessions** — fetch one session by id.
   *
   * @param variables - `{ appId, sessionId }`: `appId` (decimal string) and the
   *   `sessionId` to fetch.
   * @returns The {@link GmSession}.
   * @throws {CrowdyGraphQLError} `UNAUTHENTICATED` / `SCOPE_MISSING`, or
   *   `NOT_FOUND` if no such session.
   */
  async session(
    variables: GameModelSessionQueryVariables,
  ): Promise<GameModelSessionQuery['gameModelSession']> {
    const data = await this.gql.request(GameModelSessionDocument, variables);
    return data.gameModelSession;
  }

  /**
   * **Sessions** — list sessions in an app, optionally filtered by status.
   *
   * @param variables - `{ appId, status? }`: `appId` (decimal string) and an
   *   optional `status` filter (e.g. `'active'`; omit for all statuses).
   * @returns The matching {@link GmSession}s.
   * @throws {CrowdyGraphQLError} `UNAUTHENTICATED` / `SCOPE_MISSING`.
   */
  async sessions(
    variables: GameModelSessionsQueryVariables,
  ): Promise<GameModelSessionsQuery['gameModelSessions']> {
    const data = await this.gql.request(GameModelSessionsDocument, variables);
    return data.gameModelSessions;
  }

  /**
   * **Events** — query the function-invocation event log (audit trail) with
   * optional filters and pagination. Useful for debugging functions or showing
   * recent activity.
   *
   * @param variables - `{ appId, sessionId?, selfContainerId?, functionName?,
   *   success?, limit?, offset? }`: `appId` (decimal string); optional
   *   `sessionId`; optional `selfContainerId` (the UUID the function ran
   *   against); optional `functionName`; optional `success` (`true` = succeeded,
   *   `false` = failed). `limit` (page size) and `offset` (rows to skip) are
   *   **deprecated** — see below.
   * @returns The matching {@link GmEvent}s (each with `paramsJson`,
   *   `mutationsAppliedJson`, `returnValueJson`, `success`, `errorMessage`, and
   *   `executedAt`).
   * @throws {CrowdyGraphQLError} `UNAUTHENTICATED` / `SCOPE_MISSING`.
   * @remarks The `limit`/`offset` fields use deprecated offset pagination. For
   *   large logs prefer the Relay-style `gameModelEventsConnection(first:, after:)`
   *   cursor query (available on the schema via `client.graphql`). See
   *   https://docs.crowdedkingdoms.com/overview/pagination.
   */
  async events(
    variables: GameModelEventsQueryVariables,
  ): Promise<GameModelEventsQuery['gameModelEvents']> {
    const data = await this.gql.request(GameModelEventsDocument, variables);
    return data.gameModelEvents;
  }

  /**
   * **Events** — Relay-style cursor pagination over the function-invocation
   * event log; the preferred alternative to {@link events} for large logs. Page
   * with `first` plus the previous page's `pageInfo.endCursor` as `after`. See
   * https://docs.crowdedkingdoms.com/overview/pagination.
   *
   * @param variables - `{ appId, first?, after?, sessionId?, selfContainerId?,
   *   functionName?, success? }`.
   * @returns A {@link GameModelEventsConnection} (`edges { cursor node }`,
   *   `pageInfo`, `totalCount`).
   * @throws {CrowdyGraphQLError} `UNAUTHENTICATED` / `SCOPE_MISSING`.
   */
  async eventsConnection(
    variables: GameModelEventsConnectionQueryVariables,
  ): Promise<GameModelEventsConnectionQuery['gameModelEventsConnection']> {
    const data = await this.gql.request(
      GameModelEventsConnectionDocument,
      variables,
    );
    return data.gameModelEventsConnection;
  }

  /**
   * **Diagnostics** — stitch one flow correlation id into a single
   * cross-engine timeline: the model **events** ({@link events} rows), the
   * **automationRuns**, and the compute **moduleRuns** that share the
   * `flowId` minted at the entry edge (a player {@link invoke}, an automation
   * run, or a `computeInvoke`) and propagated across `model_invoke`, the
   * event bus, and `emit_compute_event`. Each array is ordered by time
   * ascending, so the three together read as one causal trace — "what
   * happened to this kill's reward" in one query instead of three
   * hand-joined ones. Take the `flowId` from the `flowId` field on any
   * {@link GmEvent}, {@link GmAutomationRun}, or {@link WasmModuleRun}
   * (selected by the default fragments since SDK 8.13.0).
   *
   * Requires the app-admin **`manage_apps`** permission (a diagnostics
   * surface, like {@link automationRuns}) and a game-api with the
   * `gameModelFlow` query (2026-07-19 or later; older servers reject the
   * operation with a validation error).
   *
   * @param variables - `{ appId, flowId }`: `appId` (decimal string) and the
   *   flow correlation id (a UUID string). An unknown `flowId` returns three
   *   empty arrays.
   * @returns The {@link GmFlowTimeline}: `flowId`, `events`,
   *   `automationRuns`, and `moduleRuns`, each time-ascending.
   * @throws {CrowdyGraphQLError} `UNAUTHENTICATED` / `SCOPE_MISSING`,
   *   `FORBIDDEN` (`requiredPermission === 'manage_apps'`), or `BAD_REQUEST`
   *   if `flowId` is not a UUID.
   */
  async flow(
    variables: GameModelFlowQueryVariables,
  ): Promise<GameModelFlowQuery['gameModelFlow']> {
    const data = await this.gql.request(GameModelFlowDocument, variables);
    return data.gameModelFlow;
  }

  // -- Studio authoring -------------------------------------------------------

  /**
   * **Seed** — bulk-create game-model definitions (container types, property
   * defs, functions) and optionally instances (containers + edges) in one
   * transaction; used to initialize or import a model.
   *
   * Requires the app-admin **`manage_apps`** permission.
   *
   * @param input - {@link SeedGameModelInput}: `appId` (decimal string); an
   *   optional `sessionId` to seed instances into (omit/`null` = app-global);
   *   and arrays of `containerTypes`, `propertyDefinitions`, `functions`,
   *   `containers`, and `edges` to create. Seed containers carry a developer
   *   `tempId`; seed edges reference containers by those temp ids
   *   (`fromTempId`/`toTempId`).
   * @returns A {@link GmSeedResult}: the counts created, non-fatal `warnings`,
   *   and `idMapJson` — a JSON-object string mapping each seed `tempId` to the
   *   created container UUID (`JSON.parse` it to wire up follow-up calls).
   * @throws {CrowdyGraphQLError} `UNAUTHENTICATED` / `SCOPE_MISSING`,
   *   `FORBIDDEN` (with `extensions.requiredPermission === 'manage_apps'`) if the
   *   caller lacks app-admin, or `BAD_USER_INPUT` for malformed definitions.
   */
  async seed(
    input: GameModelSeedMutationVariables['input'],
  ): Promise<GameModelSeedMutation['gameModelSeed']> {
    const data = await this.gql.request(GameModelSeedDocument, { input });
    return data.gameModelSeed;
  }

  /**
   * **Container types** — create or update a container type: the studio-defined
   * schema for a kind of runtime entity (like a class). Idempotent on
   * `(appId, typeName)`.
   *
   * Requires the app-admin **`manage_apps`** permission.
   *
   * @param input - {@link UpsertContainerTypeInput}: `appId` (decimal string);
   *   the `typeName` (the stable upsert key, unique per app); a `displayName`;
   *   optional `description`; optional `instantiableBy` (`admin | member |
   *   owner`); optional `defaultPropertyVisibility` (`public | owner | hidden`);
   *   and optional `metadataJson` (JSON-object string).
   * @returns The upserted {@link GmContainerType}.
   * @throws {CrowdyGraphQLError} `UNAUTHENTICATED` / `SCOPE_MISSING`,
   *   `FORBIDDEN` (`requiredPermission === 'manage_apps'`), or `BAD_USER_INPUT`.
   */
  async upsertContainerType(
    input: GameModelUpsertContainerTypeMutationVariables['input'],
  ): Promise<GameModelUpsertContainerTypeMutation['gameModelUpsertContainerType']> {
    const data = await this.gql.request(GameModelUpsertContainerTypeDocument, { input });
    return data.gameModelUpsertContainerType;
  }

  /**
   * **Property definitions** — create or update a typed property on a container
   * type (a field with a default value, read visibility, and writability).
   * Idempotent on `(appId, containerTypeName, key)`.
   *
   * Requires the app-admin **`manage_apps`** permission.
   *
   * @param input - {@link UpsertPropertyDefInput}: `appId` (decimal string); the
   *   `containerTypeName` to define on; the property `key` (part of the upsert
   *   key); a `valueType` (`int | float | string | bool | array | object |
   *   container_ref`); optional `defaultValueJson` (JSON-encoded default);
   *   optional `visibility` (`public | owner | hidden`); optional `writable`
   *   (`function | owner | admin`); and optional `description`.
   * @returns The upserted {@link GmPropertyDef}.
   * @throws {CrowdyGraphQLError} `UNAUTHENTICATED` / `SCOPE_MISSING`,
   *   `FORBIDDEN` (`requiredPermission === 'manage_apps'`), `NOT_FOUND` for an
   *   unknown container type, or `BAD_USER_INPUT`.
   */
  async upsertPropertyDef(
    input: GameModelUpsertPropertyDefMutationVariables['input'],
  ): Promise<GameModelUpsertPropertyDefMutation['gameModelUpsertPropertyDef']> {
    const data = await this.gql.request(GameModelUpsertPropertyDefDocument, { input });
    return data.gameModelUpsertPropertyDef;
  }

  /**
   * **Property definitions** — delete a property definition from a container
   * type. Does **not** remove instance property values already stored on
   * containers. **Destructive.**
   *
   * Requires the app-admin **`manage_apps`** permission.
   *
   * @param variables - `{ appId, containerTypeName, key }`.
   * @returns `true` if a definition was deleted, `false` if none matched.
   * @throws {CrowdyGraphQLError} `UNAUTHENTICATED` / `SCOPE_MISSING`, or
   *   `FORBIDDEN` (`requiredPermission === 'manage_apps'`).
   */
  async deletePropertyDef(
    variables: GameModelDeletePropertyDefMutationVariables,
  ): Promise<GameModelDeletePropertyDefMutation['gameModelDeletePropertyDef']> {
    const data = await this.gql.request(GameModelDeletePropertyDefDocument, variables);
    return data.gameModelDeletePropertyDef;
  }

  /**
   * **Container types** — delete a container type and its property definitions.
   * Refuses if live containers of that type exist, or if functions are bound to
   * it — delete those first. **Destructive.**
   *
   * Requires the app-admin **`manage_apps`** permission.
   *
   * @param variables - `{ appId, typeName }`.
   * @returns `true` if a type was deleted, `false` if none matched.
   * @throws {CrowdyGraphQLError} `UNAUTHENTICATED` / `SCOPE_MISSING`,
   *   `FORBIDDEN` (`requiredPermission === 'manage_apps'`), or `BAD_USER_INPUT`
   *   when containers or bound functions still exist.
   */
  async deleteContainerType(
    variables: GameModelDeleteContainerTypeMutationVariables,
  ): Promise<GameModelDeleteContainerTypeMutation['gameModelDeleteContainerType']> {
    const data = await this.gql.request(GameModelDeleteContainerTypeDocument, variables);
    return data.gameModelDeleteContainerType;
  }

  /**
   * **Functions** — create or update a studio-defined function: a named,
   * sandboxed behaviour with typed parameters, declared property mutations
   * (expressions compiled to an AST server-side — never `eval`'d), an optional
   * return expression, an invoke scope, and an invoke policy (authority rule
   * tree). Idempotent on `(appId, name)`. Players run these via {@link invoke}.
   *
   * Requires the app-admin **`manage_apps`** permission.
   *
   * @param input - {@link UpsertFunctionInput}: `appId` (decimal string); the
   *   `name` (upsert key, used to invoke it); optional `containerTypeName` to
   *   bind to (omit for a global function); optional `description`; optional
   *   `returnType`; `parameters` (typed `{ name, valueType, required?,
   *   defaultValueJson?, … }`); `mutations` (declared writes `{ target, property,
   *   expression }`, applied atomically); optional `returnExpression`;
   *   `invokeScope` (`player | server | internal`); and `invokePolicyJson` (a
   *   JSON-encoded authority rule tree).
   * @returns The upserted {@link GmFunction}, including any non-fatal
   *   static-analysis `warnings` from this upload.
   * @throws {CrowdyGraphQLError} `UNAUTHENTICATED` / `SCOPE_MISSING`,
   *   `FORBIDDEN` (`requiredPermission === 'manage_apps'`), or `BAD_USER_INPUT`
   *   for an expression/policy that fails to compile.
   */
  async upsertFunction(
    input: GameModelUpsertFunctionMutationVariables['input'],
  ): Promise<GameModelUpsertFunctionMutation['gameModelUpsertFunction']> {
    const data = await this.gql.request(GameModelUpsertFunctionDocument, { input });
    return data.gameModelUpsertFunction;
  }

  /**
   * **Functions** — delete a studio-defined function by name. **Destructive.**
   *
   * Requires the app-admin **`manage_apps`** permission.
   *
   * @param variables - `{ appId, name }`: `appId` (decimal string) and the
   *   function `name` to delete.
   * @returns `true` if a function was deleted, `false` if none matched.
   * @throws {CrowdyGraphQLError} `UNAUTHENTICATED` / `SCOPE_MISSING`, or
   *   `FORBIDDEN` (`requiredPermission === 'manage_apps'`) if the caller lacks
   *   app-admin.
   */
  async deleteFunction(
    variables: GameModelDeleteFunctionMutationVariables,
  ): Promise<GameModelDeleteFunctionMutation['gameModelDeleteFunction']> {
    const data = await this.gql.request(GameModelDeleteFunctionDocument, variables);
    return data.gameModelDeleteFunction;
  }

  /**
   * **App features** — define an app feature key that functions can gate on (via
   * a `tier_feature` authority rule) and that access tiers can be granted.
   * Idempotent on `(appId, featureKey)`.
   *
   * Requires the app-admin **`manage_apps`** permission.
   *
   * @param input - {@link DefineAppFeatureInput}: `appId` (decimal string); the
   *   `featureKey` (referenced by `tier_feature` rules); and an optional
   *   `description`.
   * @returns The defined {@link GmAppFeature}.
   * @throws {CrowdyGraphQLError} `UNAUTHENTICATED` / `SCOPE_MISSING`,
   *   `FORBIDDEN` (`requiredPermission === 'manage_apps'`), or `BAD_USER_INPUT`.
   */
  async defineFeature(
    input: GameModelDefineFeatureMutationVariables['input'],
  ): Promise<GameModelDefineFeatureMutation['gameModelDefineFeature']> {
    const data = await this.gql.request(GameModelDefineFeatureDocument, { input });
    return data.gameModelDefineFeature;
  }

  /**
   * **App features** — grant a feature key to an access tier, so users on that
   * tier satisfy `tier_feature` authority checks for it.
   *
   * Requires the app-admin **`manage_apps`** permission.
   *
   * @param input - {@link GrantTierFeatureInput}: `appId` (decimal string); the
   *   `tierId` (decimal string) of the access tier; and the `featureKey` to
   *   grant to that tier.
   * @returns The {@link GmTierFeature} grant record.
   * @throws {CrowdyGraphQLError} `UNAUTHENTICATED` / `SCOPE_MISSING`,
   *   `FORBIDDEN` (`requiredPermission === 'manage_apps'`), or `NOT_FOUND` for an
   *   unknown tier/feature.
   */
  async grantTierFeature(
    input: GameModelGrantTierFeatureMutationVariables['input'],
  ): Promise<GameModelGrantTierFeatureMutation['gameModelGrantTierFeature']> {
    const data = await this.gql.request(GameModelGrantTierFeatureDocument, { input });
    return data.gameModelGrantTierFeature;
  }

  /**
   * **Policy** — set the app's game-model runtime policy: who may create
   * sessions and the default role assigned to new session participants.
   *
   * Requires the app-admin **`manage_apps`** permission.
   *
   * @param input - {@link SetGameModelPolicyInput}: `appId` (decimal string); an
   *   optional `sessionCreationPolicy` (`admin | member | anyone`); and an
   *   optional `defaultParticipantRole`.
   * @returns The updated {@link GmAppPolicy}.
   * @throws {CrowdyGraphQLError} `UNAUTHENTICATED` / `SCOPE_MISSING`,
   *   `FORBIDDEN` (`requiredPermission === 'manage_apps'`), or `BAD_USER_INPUT`.
   */
  async setPolicy(
    input: GameModelSetPolicyMutationVariables['input'],
  ): Promise<GameModelSetPolicyMutation['gameModelSetPolicy']> {
    const data = await this.gql.request(GameModelSetPolicyDocument, { input });
    return data.gameModelSetPolicy;
  }

  /**
   * **Container types** — fetch a container type's full schema: its property
   * definitions plus the functions available on it. A studio/authoring read.
   *
   * Requires the app-admin **`manage_apps`** permission.
   *
   * @param variables - `{ appId, typeName }`: `appId` (decimal string) and the
   *   `typeName` whose schema to fetch.
   * @returns A {@link GmTypeSchema}: the `typeName`, its `propertyDefinitions`
   *   ({@link GmPropertyDef}[]), and its `functions` ({@link GmFunction}[]).
   * @throws {CrowdyGraphQLError} `UNAUTHENTICATED` / `SCOPE_MISSING`,
   *   `FORBIDDEN` (`requiredPermission === 'manage_apps'`), or `NOT_FOUND` for an
   *   unknown type.
   */
  async typeSchema(
    variables: GameModelTypeSchemaQueryVariables,
  ): Promise<GameModelTypeSchemaQuery['gameModelTypeSchema']> {
    const data = await this.gql.request(GameModelTypeSchemaDocument, variables);
    return data.gameModelTypeSchema;
  }

  /**
   * **Container types** — list every container type defined for an app. A
   * studio/authoring read. Requires the app-admin **`manage_apps`** permission.
   *
   * @param variables - `{ appId }`.
   * @returns The app's {@link GmContainerType}s.
   */
  async containerTypes(
    variables: GameModelContainerTypesQueryVariables,
  ): Promise<GameModelContainerTypesQuery['gameModelContainerTypes']> {
    const data = await this.gql.request(
      GameModelContainerTypesDocument,
      variables,
    );
    return data.gameModelContainerTypes;
  }

  /**
   * **Property definitions** — list the property definitions for one container
   * type. A studio/authoring read. Requires the app-admin **`manage_apps`**
   * permission.
   *
   * @param variables - `{ appId, typeName }`.
   * @returns The type's {@link GmPropertyDef}s.
   */
  async propertyDefs(
    variables: GameModelPropertyDefsQueryVariables,
  ): Promise<GameModelPropertyDefsQuery['gameModelPropertyDefs']> {
    const data = await this.gql.request(
      GameModelPropertyDefsDocument,
      variables,
    );
    return data.gameModelPropertyDefs;
  }

  /**
   * **Functions** — fetch one studio-defined function by name (including its
   * parameters, mutations, and notification effects). Requires the app-admin
   * **`manage_apps`** permission.
   *
   * @param variables - `{ appId, name }`.
   * @returns The {@link GmFunction}.
   */
  async getFunction(
    variables: GameModelFunctionQueryVariables,
  ): Promise<GameModelFunctionQuery['gameModelFunction']> {
    const data = await this.gql.request(GameModelFunctionDocument, variables);
    return data.gameModelFunction;
  }

  /**
   * **Functions** — list studio-defined functions for an app, optionally
   * filtered to those bound to a container type. Requires the app-admin
   * **`manage_apps`** permission.
   *
   * @param variables - `{ appId, containerTypeName? }`.
   * @returns The matching {@link GmFunction}s.
   */
  async functions(
    variables: GameModelFunctionsQueryVariables,
  ): Promise<GameModelFunctionsQuery['gameModelFunctions']> {
    const data = await this.gql.request(GameModelFunctionsDocument, variables);
    return data.gameModelFunctions;
  }

  /**
   * **App features** — list the feature keys defined for an app. Requires the
   * app-admin **`manage_apps`** permission.
   *
   * @param variables - `{ appId }`.
   * @returns The app's {@link GmAppFeature}s.
   */
  async features(
    variables: GameModelFeaturesQueryVariables,
  ): Promise<GameModelFeaturesQuery['gameModelFeatures']> {
    const data = await this.gql.request(GameModelFeaturesDocument, variables);
    return data.gameModelFeatures;
  }

  /**
   * **App features** — list tier→feature grants for an app, optionally filtered
   * to one tier. Requires the app-admin **`manage_apps`** permission.
   *
   * @param variables - `{ appId, tierId? }`.
   * @returns The {@link GmTierFeature} grants.
   */
  async tierFeatures(
    variables: GameModelTierFeaturesQueryVariables,
  ): Promise<GameModelTierFeaturesQuery['gameModelTierFeatures']> {
    const data = await this.gql.request(
      GameModelTierFeaturesDocument,
      variables,
    );
    return data.gameModelTierFeatures;
  }

  /**
   * **App features** — revoke a feature key from an access tier (the inverse of
   * {@link grantTierFeature}). Requires the app-admin **`manage_apps`**
   * permission.
   *
   * @param input - {@link GrantTierFeatureInput} (`appId`, `tierId`, `featureKey`).
   * @returns `true` if a grant was removed.
   */
  async revokeTierFeature(
    input: GameModelRevokeTierFeatureMutationVariables['input'],
  ): Promise<GameModelRevokeTierFeatureMutation['gameModelRevokeTierFeature']> {
    const data = await this.gql.request(GameModelRevokeTierFeatureDocument, {
      input,
    });
    return data.gameModelRevokeTierFeature;
  }

  /**
   * **Policy** — read the app's game-model runtime policy (session-creation
   * policy + default participant role). Requires the app-admin **`manage_apps`**
   * permission.
   *
   * @param variables - `{ appId }`.
   * @returns The {@link GmAppPolicy}.
   */
  async policy(
    variables: GameModelPolicyQueryVariables,
  ): Promise<GameModelPolicyQuery['gameModelPolicy']> {
    const data = await this.gql.request(GameModelPolicyDocument, variables);
    return data.gameModelPolicy;
  }

  // -- Automations (autonomous processes / NPCs) ------------------------------

  /**
   * **Automations** — create or update an autonomous process ("automation" /
   * NPC): a server-driven entry-point function bound to a trigger
   * (`schedule | event | manual`), an optional run-as identity, a target/
   * candidate selector, and a per-automation safety budget. The entry-point
   * function must be marked `autonomousInvocable` (see {@link upsertFunction}).
   * Idempotent on `(appId, name)`. The game-api dispatcher runs it headlessly;
   * a tick is just "invoke a function on behalf of the server".
   *
   * Requires the app-admin **`manage_apps`** permission.
   *
   * @param input - {@link UpsertAutomationInput}: `appId`; `name` (upsert key);
   *   the action — `actionKind: 'model_function'` (default) with
   *   `functionName`, or `actionKind: 'compute_invoke'` with
   *   `computeModuleName` + `computeExport` (invokes a compute-module invoke
   *   export on the trusted server path; `targetMode` forced to `global`,
   *   selectors don't apply — requires game-api 2026-07+); `targetMode`
   *   (`container | type | global`) with `selfContainerId` /
   *   `targetTypeName`; optional `sessionId`, `paramsJson`, `selectorJson`
   *   (model-data candidate selection), `runAsUserId`; the trigger
   *   (`triggerType`, `scheduleKind`, `intervalMs` / `cronExpr`); and the safety
   *   budget (`maxTargets`, `maxFnDepth`, `gasLimit`, `runTimeoutMs`,
   *   `maxRunsPerMinute`, `failureThreshold`, `cooldownMs`).
   * @returns The upserted {@link GmAutomation}, including circuit-breaker state.
   */
  async upsertAutomation(
    input: GameModelUpsertAutomationMutationVariables['input'],
  ): Promise<GameModelUpsertAutomationMutation['gameModelUpsertAutomation']> {
    const data = await this.gql.request(GameModelUpsertAutomationDocument, { input });
    return data.gameModelUpsertAutomation;
  }

  /**
   * **Automations** — delete an automation by name (also removes its event
   * triggers). **Destructive.** Requires the app-admin **`manage_apps`**
   * permission.
   *
   * @param variables - `{ appId, name }`.
   * @returns `true` if one was deleted.
   */
  async deleteAutomation(
    variables: GameModelDeleteAutomationMutationVariables,
  ): Promise<GameModelDeleteAutomationMutation['gameModelDeleteAutomation']> {
    const data = await this.gql.request(GameModelDeleteAutomationDocument, variables);
    return data.gameModelDeleteAutomation;
  }

  /**
   * **Automations** — enable or disable an automation. Re-enabling also resets
   * its circuit breaker so a tripped automation resumes. Requires the app-admin
   * **`manage_apps`** permission.
   *
   * @param variables - `{ appId, name, enabled }`.
   * @returns The updated {@link GmAutomation}.
   */
  async setAutomationEnabled(
    variables: GameModelSetAutomationEnabledMutationVariables,
  ): Promise<GameModelSetAutomationEnabledMutation['gameModelSetAutomationEnabled']> {
    const data = await this.gql.request(GameModelSetAutomationEnabledDocument, variables);
    return data.gameModelSetAutomationEnabled;
  }

  /**
   * **Automations** — create an event trigger that fires an automation in
   * reaction to model activity (`function_invoked` | `property_changed` |
   * `container_created` | `player_count_changed`), matched in the API server
   * post-commit. Requires the app-admin **`manage_apps`** permission.
   *
   * Each event matches on its own filters, and a filter the event does not
   * match on is rejected rather than silently never firing:
   * `function_invoked` takes `functionName` and `containerTypeName` (the type
   * of the invocation's `self` container); `property_changed` takes
   * `containerTypeName`, `propertyKey`, and `writeSource`;
   * `container_created` takes `containerTypeName`; `player_count_changed`
   * takes none.
   *
   * `writeSource` decides which writes a `property_changed` trigger sees:
   * `direct` (a {@link GameModelAPI.setProperty} call), `function` (a mutation
   * applied inside an invoke, automation run, or timer fire), or `any`
   * (default). Most game logic writes properties from inside functions, so a
   * trigger watching such a property needs `function` or `any`.
   *
   * @param input - {@link UpsertAutomationTriggerInput}: `appId`,
   *   `automationName`, `onEvent`, the filters valid for that event, and
   *   `debounceMs`.
   * @returns The created {@link GmAutomationTrigger}.
   */
  async upsertAutomationTrigger(
    input: GameModelUpsertAutomationTriggerMutationVariables['input'],
  ): Promise<GameModelUpsertAutomationTriggerMutation['gameModelUpsertAutomationTrigger']> {
    const data = await this.gql.request(GameModelUpsertAutomationTriggerDocument, { input });
    return data.gameModelUpsertAutomationTrigger;
  }

  /**
   * **Automations** — delete an event trigger by id. Requires the app-admin
   * **`manage_apps`** permission.
   *
   * @param variables - `{ appId, triggerId }`.
   * @returns `true` if one was deleted.
   */
  async deleteAutomationTrigger(
    variables: GameModelDeleteAutomationTriggerMutationVariables,
  ): Promise<GameModelDeleteAutomationTriggerMutation['gameModelDeleteAutomationTrigger']> {
    const data = await this.gql.request(GameModelDeleteAutomationTriggerDocument, variables);
    return data.gameModelDeleteAutomationTrigger;
  }

  /**
   * **Automations** — set the app's automation policy (platform guardrails: the
   * kill switch, max automations, the minimum schedule interval floor, max
   * fan-out, max event cascade depth, the aggregate per-minute run ceiling, and
   * the timer floor / pending-timer ceiling).
   * Requires the app-admin **`manage_apps`** permission.
   *
   * @param input - {@link SetAutomationPolicyInput}.
   * @returns The updated {@link GmAutomationPolicy}.
   */
  async setAutomationPolicy(
    input: GameModelSetAutomationPolicyMutationVariables['input'],
  ): Promise<GameModelSetAutomationPolicyMutation['gameModelSetAutomationPolicy']> {
    const data = await this.gql.request(GameModelSetAutomationPolicyDocument, { input });
    return data.gameModelSetAutomationPolicy;
  }

  /**
   * **Automations** — run an automation once, immediately (manual trigger),
   * regardless of its schedule. Applies the same guard chain and records a run.
   * Useful for testing an NPC. Requires the app-admin **`manage_apps`**
   * permission.
   *
   * @param variables - `{ appId, name }`.
   * @returns The recorded {@link GmAutomationRun}.
   */
  async runAutomation(
    variables: GameModelRunAutomationMutationVariables,
  ): Promise<GameModelRunAutomationMutation['gameModelRunAutomation']> {
    const data = await this.gql.request(GameModelRunAutomationDocument, variables);
    return data.gameModelRunAutomation;
  }

  /**
   * **Automations** — list the automations defined for an app (with
   * circuit-breaker state). Requires the app-admin **`manage_apps`** permission.
   *
   * @param variables - `{ appId }`.
   * @returns The {@link GmAutomation}s.
   */
  async automations(
    variables: GameModelAutomationsQueryVariables,
  ): Promise<GameModelAutomationsQuery['gameModelAutomations']> {
    const data = await this.gql.request(GameModelAutomationsDocument, variables);
    return data.gameModelAutomations;
  }

  /**
   * **Automations** — fetch one automation by name. Requires the app-admin
   * **`manage_apps`** permission.
   *
   * @param variables - `{ appId, name }`.
   * @returns The {@link GmAutomation}.
   */
  async automation(
    variables: GameModelAutomationQueryVariables,
  ): Promise<GameModelAutomationQuery['gameModelAutomation']> {
    const data = await this.gql.request(GameModelAutomationDocument, variables);
    return data.gameModelAutomation;
  }

  /**
   * **Automations** — list event triggers for an app, optionally filtered to one
   * automation by name. Requires the app-admin **`manage_apps`** permission.
   *
   * Use this to debug a trigger that isn't firing: `warnings` reports filters
   * that can never match, `lastMatchedAt` is null until the trigger has
   * actually dispatched a run, and `matchCount24h` shows recent activity.
   *
   * @param variables - `{ appId, automationName? }`.
   * @returns The {@link GmAutomationTrigger}s.
   */
  async automationTriggers(
    variables: GameModelAutomationTriggersQueryVariables,
  ): Promise<GameModelAutomationTriggersQuery['gameModelAutomationTriggers']> {
    const data = await this.gql.request(GameModelAutomationTriggersDocument, variables);
    return data.gameModelAutomationTriggers;
  }

  /**
   * **Automations** — read the app's automation policy. Requires the app-admin
   * **`manage_apps`** permission.
   *
   * @param variables - `{ appId }`.
   * @returns The {@link GmAutomationPolicy}.
   */
  async automationPolicy(
    variables: GameModelAutomationPolicyQueryVariables,
  ): Promise<GameModelAutomationPolicyQuery['gameModelAutomationPolicy']> {
    const data = await this.gql.request(GameModelAutomationPolicyDocument, variables);
    return data.gameModelAutomationPolicy;
  }

  /**
   * **Automations** — list automation runs (the monitoring/audit trail), newest
   * first, optionally filtered by automation name and/or outcome. Requires the
   * app-admin **`manage_apps`** permission.
   *
   * @param variables - `{ appId, automationName?, success?, limit?, offset? }`.
   * @returns The {@link GmAutomationRun}s.
   */
  async automationRuns(
    variables: GameModelAutomationRunsQueryVariables,
  ): Promise<GameModelAutomationRunsQuery['gameModelAutomationRuns']> {
    const data = await this.gql.request(GameModelAutomationRunsDocument, variables);
    return data.gameModelAutomationRuns;
  }

  /**
   * **Automations** — aggregate automation activity over a recent window
   * (throughput, failure rate, compute, per-automation breakdown). The
   * "what are my NPCs doing" view. Requires the app-admin **`manage_apps`**
   * permission.
   *
   * @param variables - `{ appId, windowMinutes? }` (default 60, max 1440).
   * @returns The {@link GmAutomationStats}.
   */
  async automationStats(
    variables: GameModelAutomationStatsQueryVariables,
  ): Promise<GameModelAutomationStatsQuery['gameModelAutomationStats']> {
    const data = await this.gql.request(GameModelAutomationStatsDocument, variables);
    return data.gameModelAutomationStats;
  }

  /**
   * **Diagnostics** — a snapshot of an app's game-model footprint and recent
   * activity (row counts + 24h invocation activity + top functions). Helps
   * developers understand what is in their game and their database. Requires the
   * app-admin **`manage_apps`** permission.
   *
   * @param variables - `{ appId }`.
   * @returns The {@link GmAppDiagnostics}.
   */
  async appDiagnostics(
    variables: GameModelAppDiagnosticsQueryVariables,
  ): Promise<GameModelAppDiagnosticsQuery['gameModelAppDiagnostics']> {
    const data = await this.gql.request(GameModelAppDiagnosticsDocument, variables);
    return data.gameModelAppDiagnostics;
  }

  /**
   * **Timers** — arm a one-shot timer: invoke a function once, after a delay.
   * The timer is durable (it survives an API restart) and claimed by exactly one
   * replica, so it fires once. Requires the app-admin **`manage_apps`**
   * permission, because a timer fires headlessly with system authority rather
   * than a player's.
   *
   * For player-driven delays, declare a `timers` effect on the function instead
   * (see {@link GameModelAPI.upsertFunction}) so the delay is part of your game
   * logic and is armed atomically with that invocation's mutations.
   *
   * The target function must be `autonomousInvocable`. Pass `dedupeKey` to make
   * re-arming replace the pending timer instead of queueing another fire, which
   * is how you implement "reset the countdown".
   *
   * @param input - {@link ScheduleInvokeInput}: `appId`, `functionName`,
   *   `selfContainerId`, `delayMs`, and optional `paramsJson`, `sessionId`, and
   *   `dedupeKey`.
   * @returns The armed {@link GmTimer}.
   */
  async scheduleInvoke(
    input: GameModelScheduleInvokeMutationVariables['input'],
  ): Promise<GameModelScheduleInvokeMutation['gameModelScheduleInvoke']> {
    const data = await this.gql.request(GameModelScheduleInvokeDocument, { input });
    return data.gameModelScheduleInvoke;
  }

  /**
   * **Timers** — cancel pending timers by id or by dedupe key. A timer already
   * claimed for execution cannot be cancelled. Requires the app-admin
   * **`manage_apps`** permission.
   *
   * @param variables - `{ appId, timerId?, dedupeKey? }` (supply at least one
   *   selector).
   * @returns How many pending timers were removed.
   */
  async cancelTimer(
    variables: GameModelCancelTimerMutationVariables,
  ): Promise<GameModelCancelTimerMutation['gameModelCancelTimer']> {
    const data = await this.gql.request(GameModelCancelTimerDocument, variables);
    return data.gameModelCancelTimer;
  }

  /**
   * **Timers** — list pending one-shot timers, soonest first. A timer leaves
   * this list the instant it is claimed for execution, so an empty list means
   * nothing is *scheduled* — not that nothing ran. Fires that already happened
   * appear in {@link GameModelAPI.automationRuns} with
   * `triggerSource: 'timer'`. Requires the app-admin **`manage_apps`**
   * permission.
   *
   * @param variables - `{ appId, sessionId?, limit? }` (limit 1-200, default 50).
   * @returns The pending {@link GmTimer}s.
   */
  async timers(
    variables: GameModelTimersQueryVariables,
  ): Promise<GameModelTimersQuery['gameModelTimers']> {
    const data = await this.gql.request(GameModelTimersDocument, variables);
    return data.gameModelTimers;
  }
}
