import { CrowdyError } from './errors.js';

/** The globals {@link organizationServerRefusal} reads, so a test can describe a runtime. */
export interface RuntimeScope {
  window?: unknown;
  document?: unknown;
  process?: { versions?: { node?: unknown } } | null;
  Deno?: { version?: { deno?: unknown } } | null;
  Bun?: { version?: unknown } | null;
  EdgeRuntime?: unknown;
  navigator?: { userAgent?: unknown } | null;
}

/**
 * Why a call that takes an organization's org token may not be made from this runtime, or
 * null when it may.
 *
 * An org token signs in any of the organization's players and opens its fleet sessions, so it
 * is used only on a server the organization runs. The call is made when the runtime says it
 * is one, and refused everywhere else:
 *
 * - **A browser page** (`window` and `document`): refused, whatever else the page defines.
 *   That covers a desktop shell's page and a test's simulated one.
 * - **Node, and a Node worker thread** (`process.versions.node`): allowed.
 * - **Bun** (`Bun.version`; it also reports a Node version): allowed.
 * - **Deno** (`Deno.version.deno`; Deno 2 also reports a Node version): allowed.
 * - **A server-side worker** that says what it is, the Cloudflare Workers runtime
 *   (`navigator.userAgent` is `Cloudflare-Workers`) and Vercel's Edge Runtime (`EdgeRuntime`):
 *   allowed. An organization deploys those itself, and no browser reports either.
 * - **A browser's web worker or service worker**, and any runtime that names itself in none
 *   of these ways: refused. A page's worker has no `window`, so the absence of a page proves
 *   nothing; only a server's own mark does.
 *
 * This guards against a mistake, before the token is put on a request. A page that lies
 * about its globals is stopped by the Application API, which refuses an org token sent with
 * an `Origin` header.
 */
export function organizationServerRefusal(scope: RuntimeScope = globalThis as RuntimeScope): string | null {
  if (typeof scope.window !== 'undefined' && typeof scope.document !== 'undefined') {
    return 'this is a browser page';
  }
  if (typeof scope.process?.versions?.node === 'string') return null;
  if (typeof scope.Deno?.version?.deno === 'string') return null;
  if (typeof scope.Bun?.version === 'string') return null;
  if (typeof scope.EdgeRuntime === 'string') return null;
  if (scope.navigator?.userAgent === 'Cloudflare-Workers') return null;
  return 'this runtime does not say it is a server (Node, Bun, Deno, or a server-side worker)';
}

/**
 * Refuses a call that takes an organization's org token unless the runtime is a server's
 * ({@link organizationServerRefusal}): an org token and a fleet token never go into a browser
 * page, a page's worker or a game client.
 */
export function assertOrganizationServer(what: string): void {
  const why = organizationServerRefusal();
  if (!why) return;
  throw new CrowdyError({
    message:
      `${what} takes your organization's org token, which never goes into a browser page or a ` +
      `game client, and ${why}. Call it from a server your organization runs.`,
  });
}
