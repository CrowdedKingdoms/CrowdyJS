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

export interface GraphQLClientConfig {
  httpUrl?: string;
  graphqlEndpoint?: string;
  timeout?: number;
  logger?: CrowdyLogger;
}

export class GraphQLClient {
  private readonly graphqlEndpoint: string;
  private readonly timeout: number;
  private readonly session: SessionStore;
  private readonly logger: CrowdyLogger;

  constructor(config: GraphQLClientConfig = {}, session: SessionStore) {
    this.graphqlEndpoint =
      config.httpUrl || config.graphqlEndpoint || 'http://localhost:3000/graphql';
    this.timeout = config.timeout || 60000;
    this.session = session;
    this.logger = config.logger ?? silentLogger;
  }

  getEndpoint(): string {
    return this.graphqlEndpoint;
  }

  /**
   * Execute a typed GraphQL operation produced by codegen and return the
   * `data` payload. Throws on transport errors, GraphQL errors, or timeouts.
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
   * Internal escape hatch for raw query strings (used by hand-written
   * adapters that haven't migrated to typed documents yet). Prefer
   * `request()` with a `TypedDocumentNode`.
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

    try {
      const requestBody = { query, variables };
      const response = await fetch(this.graphqlEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(requestBody),
        signal,
      });

      clearTimeout(timeoutId);

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

export { GraphQLClient as GraphQLTransport };
