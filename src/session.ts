export type SessionListener = (token: string | null) => void;

export interface TokenStore {
  get(): string | null | Promise<string | null>;
  set(token: string): void | Promise<void>;
  clear(): void | Promise<void>;
}

export class BrowserLocalStorageTokenStore implements TokenStore {
  constructor(private readonly key = 'crowdyjs:token') {}

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

export class SessionStore {
  private token: string | null = null;
  private readonly listeners = new Set<SessionListener>();

  constructor(private readonly tokenStore?: TokenStore) {}

  async restore(): Promise<string | null> {
    const token = (await this.tokenStore?.get()) ?? null;
    this.setToken(token, { persist: false });
    return token;
  }

  getToken(): string | null {
    return this.token;
  }

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

  clear(): void {
    this.setToken(null);
  }

  onChange(listener: SessionListener): () => void {
    this.listeners.add(listener);
    listener(this.token);
    return () => {
      this.listeners.delete(listener);
    };
  }
}
