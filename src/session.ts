/** Callback notified whenever the active token changes (`null` on sign-out). */
export type SessionListener = (token: string | null) => void;

/**
 * Pluggable persistence for the Bearer token. Implement this to back the
 * session with whatever storage your runtime offers (cookies, secure storage,
 * a database for SSR, etc.). All three methods may be sync or async.
 *
 * `BrowserLocalStorageTokenStore` is provided for browser apps.
 */
export interface TokenStore {
  /** Return the persisted token, or `null`/`undefined` if none. */
  get(): string | null | Promise<string | null>;
  /** Persist a token (called on login and token refresh). */
  set(token: string): void | Promise<void>;
  /** Remove the persisted token (called on logout). */
  clear(): void | Promise<void>;
}

/**
 * {@link TokenStore} backed by the browser `localStorage`. No-ops gracefully
 * when `localStorage` is unavailable (e.g. SSR), so it's safe to construct
 * unconditionally.
 */
export class BrowserLocalStorageTokenStore implements TokenStore {
  /** @param key - localStorage key under which the token is stored. */
  constructor(private readonly key = 'crowdyjs:token') {}

  /**
   * The key an IDENTITY session token belongs under: one per origin, shared by every
   * game on it.
   *
   * WHY THIS EXISTS AS A NAMED CONSTANT. Games were storing their credential under
   * `'crowdyjs:app:' + import.meta.env.BASE_URL` — the game's own PATH — so two games on
   * `crowdy.games` had different keys on the SAME origin and could not see each other's
   * login. What was stored was an app token anyway, which is per-game by definition, so
   * there was nothing cross-app to share even if the key had matched. A player who
   * signed in for one game was anonymous to the next and got bounced back to the portal.
   *
   * The schema split makes the fix structural rather than a workaround: the identity
   * session token is now its own object with its own lifetime, so it belongs under one
   * origin-wide key, while app tokens stay per-game. The storage split mirrors the
   * database split.
   *
   * Deliberately NOT parameterised by BASE_URL. That parameter was the bug.
   */
  static readonly SESSION_KEY = 'crowdyjs:session';

  /** The key a game's app-scoped token belongs under. Per game, on purpose. */
  static appKey(basePath: string): string {
    return `crowdyjs:app:${basePath}`;
  }

  get(): string | null {
    if (typeof localStorage === 'undefined') return null;
    return localStorage.getItem(this.key);
  }

  set(token: string): void {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(this.key, token);
  }

  clear(): void {
    if (typeof localStorage === 'undefined') return;
    localStorage.removeItem(this.key);
  }
}

/**
 * In-memory token holder with change notifications and optional persistence via
 * a {@link TokenStore}. Setting the token fans out to every {@link onChange}
 * listener, which is how the HTTP client and the WebSocket stay in lock-step
 * (their auth can never drift).
 */
export class SessionStore {
  private token: string | null = null;
  private readonly listeners = new Set<SessionListener>();

  /** @param tokenStore - Optional persistence; when omitted the token is memory-only. */
  constructor(private readonly tokenStore?: TokenStore) {}

  /**
   * Load the token from the {@link TokenStore} into memory (without re-persisting)
   * and notify listeners. Call once on startup to resume a saved session.
   *
   * @returns The restored token, or `null` if none was stored.
   */
  async restore(): Promise<string | null> {
    const token = (await this.tokenStore?.get()) ?? null;
    this.setToken(token, { persist: false });
    return token;
  }

  /** The current in-memory token, or `null` if there's no active session. */
  getToken(): string | null {
    return this.token;
  }

  /**
   * Set (or clear, with `null`) the active token. Persists to the
   * {@link TokenStore} unless `options.persist` is `false`, then notifies all
   * listeners. A no-op if the token is unchanged.
   *
   * @param token - The new Bearer token, or `null` to sign out.
   * @param options - `persist: false` updates memory + listeners only.
   */
  setToken(token: string | null, options: { persist?: boolean } = {}): void {
    if (token === this.token) return;
    this.token = token;

    if (options.persist !== false) {
      if (token) {
        void this.tokenStore?.set(token);
      } else {
        void this.tokenStore?.clear();
      }
    }

    for (const listener of [...this.listeners]) {
      listener(token);
    }
  }

  /** Clear the active token (equivalent to `setToken(null)`). */
  clear(): void {
    this.setToken(null);
  }

  /**
   * Subscribe to token changes. The listener fires immediately with the current
   * token, then on every change.
   *
   * @returns An unsubscribe function.
   */
  onChange(listener: SessionListener): () => void {
    this.listeners.add(listener);
    listener(this.token);
    return () => {
      this.listeners.delete(listener);
    };
  }
}
