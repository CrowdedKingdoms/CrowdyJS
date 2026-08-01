/**
 * Minimal HTTP GraphQL client. Reads its bearer token from `AuthState` so the
 * WebSocket subscription manager and HTTP client always agree on who's
 * authenticated. The `login` / `register` / `connectUdpProxy` /
 * `sendActorUpdate` / etc. shortcuts that used to live here are gone -
 * everything goes through the typed sub-clients on `CrowdyClient` (e.g.
 * `client.auth.login`, `client.udp.sendActorUpdate`).
 */

import { print } from 'graphql';
import type { TypedDocumentNode } from '@graphql-typed-document-node/core';
import type { SessionStore } from './session.js';
import type { CrowdyLogger } from './logger.js';
import { silentLogger } from './logger.js';
import {
  CrowdyError,
  CrowdyGraphQLError,
  CrowdyHttpError,
  CrowdyNetworkError,
  CrowdyTimeoutError,
  type CrowdyGraphQLErrorPayload,
} from './errors.js';
import type { LbCookieStore } from './lb-cookie-store.js';

/**
 * Configuration for {@link GraphQLClient}, the low-level HTTP transport. You
 * normally don't build this yourself — `CrowdyClient` constructs the transport
 * from its own config — but it is exported for advanced or standalone use.
 */
export interface GraphQLClientConfig {
  /**
   * Absolute base URL of the GraphQL HTTP service (e.g.
   * `https://game.example.com/graphql`). Used when {@link graphqlEndpoint} is
   * not set. When both are omitted the client falls back to
   * `http://localhost:3000/graphql`.
   */
  httpUrl?: string;
  /**
   * Explicit GraphQL endpoint URL. Takes precedence over {@link httpUrl} when
   * both are provided.
   */
  graphqlEndpoint?: string;
  /**
   * Per-request timeout in **milliseconds**. When it elapses the request is
   * aborted and a {@link CrowdyTimeoutError} is thrown. Defaults to `60000`
   * (60 seconds).
   */
  timeout?: number;
  /**
   * Optional logger for transport diagnostics. Defaults to a silent logger
   * that discards all output.
   */
  logger?: CrowdyLogger;
  /**
   * Optional sticky-LB cookie jar for game-api requests. When set, the
   * client forwards `cks_ga` on HTTP and ingests `Set-Cookie` from responses
   * so mutations stay pinned to the same upstream as the WS subscription.
   */
  lbCookieStore?: LbCookieStore;
}

/**
 * Low-level HTTP transport for GraphQL operations against the game or
 * management API. It POSTs operations to a single endpoint, attaches the
 * shared Bearer token read fresh from the {@link SessionStore} on every
 * request (so the HTTP client and the realtime socket never disagree about who
 * is authenticated), enforces a timeout, and normalizes every failure into a
 * typed {@link CrowdyError} subclass.
 *
 * Most consumers should use the typed sub-clients on `CrowdyClient` instead;
 * reach for this directly only via the low-level escape hatch
 * (`client.graphql.request(...)`).
 *
 * Failure modes:
 * - {@link CrowdyHttpError} — the endpoint returned a non-2xx HTTP status.
 * - {@link CrowdyGraphQLError} — a 200 response whose `errors[]` was non-empty.
 * - {@link CrowdyNetworkError} — `fetch` itself failed (DNS, TLS, refused).
 * - {@link CrowdyTimeoutError} — the request exceeded
 *   {@link GraphQLClientConfig.timeout}.
 *
 * Also exported under the alias {@link GraphQLTransport}.
 */
export class GraphQLClient {
  /** Mutable: direct-connect re-discovery moves it to another instance. */
  private graphqlEndpoint: string;
  private readonly timeout: number;
  private readonly session: SessionStore;
  private readonly logger: CrowdyLogger;
  private readonly lbCookieStore?: LbCookieStore;

  /**
   * @param config - Endpoint, timeout, and logger options; see
   *   {@link GraphQLClientConfig}.
   * @param session - Shared session/token store. Its current token is read
   *   fresh on every request and sent as `Authorization: Bearer <token>`, so
   *   HTTP auth always tracks the active session.
   */
  constructor(config: GraphQLClientConfig = {}, session: SessionStore) {
    this.graphqlEndpoint =
      config.graphqlEndpoint ||
      config.httpUrl ||
      'http://localhost:3000/graphql';
    this.timeout = config.timeout || 60000;
    this.session = session;
    this.logger = config.logger ?? silentLogger;
    this.lbCookieStore = config.lbCookieStore;
  }

  /**
   * The resolved GraphQL endpoint URL this client POSTs to.
   *
   * @returns The absolute endpoint URL.
   */
  getEndpoint(): string {
    return this.graphqlEndpoint;
  }

  /**
   * Point subsequent requests at a different instance.
   *
   * Only meaningful under direct connect, where the endpoint names one api
   * instance rather than a load balancer. It exists so HTTP can be moved in
   * the SAME step as the WebSocket: the UDP proxy session and the relay
   * session are per-process, so a client with its HTTP on one instance and
   * its subscription on another gets no realtime traffic at all — the exact
   * failure the sticky LB cookie was invented to prevent.
   *
   * @param endpoint Absolute GraphQL URL to POST to from now on.
   */
  setEndpoint(endpoint: string): void {
    this.graphqlEndpoint = endpoint;
  }

  /**
   * Execute a typed GraphQL operation produced by codegen and return its
   * `data` payload. This is the preferred entry point: the
   * {@link TypedDocumentNode} ties `variables` and the result together so both
   * are fully type-checked.
   *
   * @typeParam TResult - The operation's result (`data`) type.
   * @typeParam TVariables - The operation's variables type.
   * @param document - The typed operation document (e.g. `ActorDocument`).
   * @param variables - Variables for the operation; omit for operations that
   *   take none.
   * @param options - Optional `signal` to abort the request from your own
   *   `AbortController` (in addition to the built-in timeout).
   * @returns The operation's `data` payload.
   * @throws {CrowdyHttpError} on a non-2xx HTTP status.
   * @throws {CrowdyGraphQLError} when the response carries a non-empty
   *   `errors[]` array.
   * @throws {CrowdyNetworkError} on a network-level `fetch` failure.
   * @throws {CrowdyTimeoutError} when the request exceeds the configured
   *   timeout.
   */
  async request<TResult, TVariables>(
    document: TypedDocumentNode<TResult, TVariables>,
    variables?: TVariables,
    options: { signal?: AbortSignal } = {},
  ): Promise<TResult> {
    const queryStr = print(document);
    return this.query<TResult>(
      queryStr,
      (variables ?? {}) as Record<string, unknown>,
      options,
    );
  }

  /**
   * Escape hatch for executing a **raw** GraphQL query string. Prefer
   * {@link request} with a {@link TypedDocumentNode}; this exists for
   * hand-written adapters that haven't migrated to typed documents yet. It
   * POSTs `{ query, variables }`, attaches the Bearer token, applies the
   * timeout, and unwraps the response's `data`.
   *
   * @typeParam T - Expected shape of the returned `data` (defaults to `any`).
   * @param query - The GraphQL document text.
   * @param variables - Variable values keyed by name. Defaults to `{}`.
   * @param options - Optional `signal` to abort from your own
   *   `AbortController`; otherwise the internal timeout controls abortion.
   * @returns The response's `data` payload, typed as `T`.
   * @throws {CrowdyHttpError} on a non-2xx HTTP status.
   * @throws {CrowdyGraphQLError} when the response carries a non-empty
   *   `errors[]` array.
   * @throws {CrowdyNetworkError} on a network-level `fetch` failure.
   * @throws {CrowdyTimeoutError} when the request exceeds the configured
   *   timeout.
   */
  async query<T = any>(
    query: string,
    variables: Record<string, unknown> = {},
    options: { signal?: AbortSignal } = {},
  ): Promise<T> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);
    const token = this.session.getToken();
    const signal = options.signal ?? controller.signal;
    const lbCookie = this.lbCookieStore?.headerValue();

    try {
      const requestBody = { query, variables };
      const response = await fetch(this.graphqlEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(lbCookie ? { Cookie: lbCookie } : {}),
        },
        body: JSON.stringify(requestBody),
        credentials: this.lbCookieStore ? 'include' : 'same-origin',
        signal,
      });

      clearTimeout(timeoutId);
      this.lbCookieStore?.ingestSetCookie(response.headers);

      if (!response.ok) {
        const errorText = await response.text();
        throw new CrowdyHttpError(response.status, errorText);
      }

      const result = await response.json();

      if (result.errors) {
        throw new CrowdyGraphQLError(result.errors as CrowdyGraphQLErrorPayload[]);
      }

      return result.data;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === 'AbortError') {
        throw new CrowdyTimeoutError(this.timeout);
      }
      if (error instanceof CrowdyError) {
        throw error;
      }
      if (error instanceof Error) {
        throw new CrowdyNetworkError(error);
      }
      this.logger.error?.('GraphQL request failed', error);
      throw new CrowdyNetworkError(error);
    }
  }
}

/**
 * Alias for {@link GraphQLClient}, provided so callers can refer to the HTTP
 * layer as a "transport". The two names are the exact same class.
 */
export { GraphQLClient as GraphQLTransport };
