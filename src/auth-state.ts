import { SessionStore, type SessionListener, type TokenStore } from './session.js';

export type AuthStateListener = SessionListener;

/**
 * Backwards-compatible internal name for the v3 SessionStore. Public callers
 * should use `client.session`; older domain wrappers still accept AuthState.
 */
export class AuthState extends SessionStore {
  constructor(tokenStore?: TokenStore) {
    super(tokenStore);
  }

  subscribe(listener: AuthStateListener): () => void {
    return this.onChange(listener);
  }
}
