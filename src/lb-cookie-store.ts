import { CrowdyNetworkError, CrowdyTimeoutError } from './errors.js';

/**
 * In-memory store for the Caddy load-balancer sticky cookie (`cks_ga`).
 *
 * CKS shared game LBs set `cks_ga` on the first HTTP response so GraphQL
 * mutations and the graphql-transport-ws upgrade for the same client land on
 * one game-api. Browsers persist this automatically; Node `fetch` and `ws` do
 * not — this store bridges that gap for bots, e2e tests, and other non-browser
 * runtimes.
 */
const CKS_GA_NAME = 'cks_ga';

export class LbCookieStore {
  private value: string | null = null;

  /** Current `cks_ga=…` header value, or null when unset. */
  headerValue(): string | null {
    return this.value ? `${CKS_GA_NAME}=${this.value}` : null;
  }

  /** Parse `Set-Cookie` response headers and retain `cks_ga` when present. */
  ingestSetCookie(headers: Headers): void {
    const setCookies =
      typeof headers.getSetCookie === 'function'
        ? headers.getSetCookie()
        : parseSetCookieFallback(headers.get('set-cookie'));
    for (const raw of setCookies) {
      const pair = raw.split(';', 1)[0]?.trim();
      if (!pair?.startsWith(`${CKS_GA_NAME}=`)) continue;
      this.value = pair.slice(CKS_GA_NAME.length + 1);
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

function parseSetCookieFallback(header: string | null): string[] {
  if (!header) return [];
  return [header];
}

function toHttpGraphqlEndpoint(endpoint: string): string {
  return endpoint.replace(/^wss:/i, 'https:').replace(/^ws:/i, 'http:');
}
