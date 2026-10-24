import { CrowdyNetworkError, CrowdyTimeoutError } from './errors.js';

/**
 * In-memory store for the game load balancer's sticky cookie (`cks_ga`).
 *
 * CKS game balancers set `cks_ga` on the first HTTP response so GraphQL
 * mutations and the graphql-transport-ws upgrade for the same client land on
 * one game-api. Browsers persist this automatically; Node `fetch` and `ws` do
 * not — this store bridges that gap for bots, e2e tests, and other non-browser
 * runtimes.
 *
 * A draining game-api expires the cookie on its responses, and a client that
 * is told to move clears it, so the next balancer request is placed on an
 * instance that is staying. An expired cookie is honoured here the way a
 * browser honours it.
 */
const CKS_GA_NAME = 'cks_ga';

export class LbCookieStore {
  private value: string | null = null;

  /** Current `cks_ga=…` header value, or null when unset. */
  headerValue(): string | null {
    return this.value ? `${CKS_GA_NAME}=${this.value}` : null;
  }

  /** Forget the affinity: the next balancer request is placed afresh. */
  clear(): void {
    this.value = null;
  }

  /**
   * Parse `Set-Cookie` response headers: retain `cks_ga` when present, forget it
   * when the response expires it (an empty value, `Max-Age` of zero or less, or
   * an `Expires` in the past).
   */
  ingestSetCookie(headers: Headers): void {
    const setCookies =
      typeof headers.getSetCookie === 'function'
        ? headers.getSetCookie()
        : parseSetCookieFallback(headers.get('set-cookie'));
    for (const raw of setCookies) {
      const pair = raw.split(';', 1)[0]?.trim();
      if (!pair?.startsWith(`${CKS_GA_NAME}=`)) continue;
      const value = pair.slice(CKS_GA_NAME.length + 1);
      this.value = value === '' || isExpired(raw) ? null : value;
    }
  }

  /** @internal test helper */
  getValue(): string | null {
    return this.value;
  }

  /**
   * Obtain `cks_ga` from the game-api before opening a WebSocket so the
   * upgrade lands on the same upstream as subsequent HTTP mutations.
   *
   * Failures (timeout / abort / network) throw {@link CrowdyTimeoutError} or
   * {@link CrowdyNetworkError} — never a raw `AbortError`/`DOMException`.
   * Callers that treat sticky cookies as best-effort should catch and continue.
   */
  async primeFromGraphql(args: {
    endpoint: string;
    token?: string | null;
    timeoutMs?: number;
    signal?: AbortSignal;
  }): Promise<void> {
    if (this.value) return;
    const httpEndpoint = toHttpGraphqlEndpoint(args.endpoint);
    const controller = new AbortController();
    const timeoutMs = args.timeoutMs ?? 10_000;
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    const signal = args.signal ?? controller.signal;
    try {
      const response = await fetch(httpEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(args.token ? { Authorization: `Bearer ${args.token}` } : {}),
        },
        body: JSON.stringify({ query: '{ __typename }' }),
        credentials: 'include',
        signal,
      });
      this.ingestSetCookie(response.headers);
      await response.arrayBuffer().catch(() => undefined);
    } catch (error) {
      if (isAbortError(error) || signal.aborted) {
        throw new CrowdyTimeoutError(timeoutMs);
      }
      throw new CrowdyNetworkError(error);
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

function isAbortError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const name = (error as { name?: unknown }).name;
  return name === 'AbortError' || name === 'TimeoutError';
}

/** True when a `Set-Cookie` line's attributes say the cookie is already gone. */
function isExpired(setCookie: string, now = Date.now()): boolean {
  for (const part of setCookie.split(';').slice(1)) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    const name = part.slice(0, eq).trim().toLowerCase();
    const value = part.slice(eq + 1).trim();
    if (name === 'max-age') {
      const seconds = Number.parseInt(value, 10);
      if (Number.isFinite(seconds) && seconds <= 0) return true;
    } else if (name === 'expires') {
      const at = Date.parse(value);
      if (Number.isFinite(at) && at <= now) return true;
    }
  }
  return false;
}

function parseSetCookieFallback(header: string | null): string[] {
  if (!header) return [];
  return [header];
}

function toHttpGraphqlEndpoint(endpoint: string): string {
  return endpoint.replace(/^wss:/i, 'https:').replace(/^ws:/i, 'http:');
}
