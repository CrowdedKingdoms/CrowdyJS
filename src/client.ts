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
import { AuthState } from './auth-state.js';

export interface GraphQLClientConfig {
  graphqlEndpoint?: string;
  timeout?: number;
}

export class GraphQLClient {
  private readonly graphqlEndpoint: string;
  private readonly timeout: number;
  private readonly authState: AuthState;

  constructor(config: GraphQLClientConfig = {}, authState: AuthState) {
    this.graphqlEndpoint =
      config.graphqlEndpoint || 'http://localhost:3000/graphql';
    this.timeout = config.timeout || 60000;
    this.authState = authState;
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
  ): Promise<TResult> {
    const queryStr = print(document);
    return this.query<TResult>(queryStr, (variables ?? {}) as Record<string, any>);
  }

  /**
   * Internal escape hatch for raw query strings (used by hand-written
   * adapters that haven't migrated to typed documents yet). Prefer
   * `request()` with a `TypedDocumentNode`.
   */
  async query<T = any>(
    query: string,
    variables: Record<string, any> = {},
  ): Promise<T> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);
    const token = this.authState.getToken();

    try {
      const requestBody = { query, variables };
      const response = await fetch(this.graphqlEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `HTTP error! status: ${response.status}, body: ${errorText}`,
        );
      }

      const result = await response.json();

      if (result.errors) {
        const error = result.errors[0];
        const errorMessage = Array.isArray(error.message)
          ? error.message.join(', ')
          : error.message;
        throw new Error(errorMessage);
      }

      return result.data;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('Request timeout exceeded when trying to connect');
      }
      if (error instanceof Error) {
        throw error;
      }
      throw new Error(`Network error: ${error}`);
    }
  }
}
