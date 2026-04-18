/**
 * Single source of truth for the auth token within one CrowdyClient instance.
 *
 * Both the HTTP client (`GraphQLClient`) and the WebSocket subscription
 * manager observe this. Anything that mutates auth state - the typed
 * `client.auth.login()` / `register()` / `logout()` family, or external
 * callers - flows through `setToken()` so subscription requests can never
 * silently fail with "Must be authenticated to subscribe".
 *
 * (Replaces the previous arrangement where GraphQLClient and
 * SubscriptionManager each held their own copy of the token.)
 */
export type AuthStateListener = (token: string | null) => void;

export class AuthState {
  private token: string | null = null;
  private listeners = new Set<AuthStateListener>();

  getToken(): string | null {
    return this.token;
  }

  setToken(token: string | null): void {
    if (token === this.token) return;
    this.token = token;
    for (const listener of this.listeners) {
      try {
        listener(token);
      } catch (error) {
        console.error('AuthState listener threw:', error);
      }
    }
  }

  subscribe(listener: AuthStateListener): () => void {
    this.listeners.add(listener);
    // Replay current value immediately so listeners initialize correctly.
    listener(this.token);
    return () => {
      this.listeners.delete(listener);
    };
  }
}
