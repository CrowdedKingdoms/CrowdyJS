import { CrowdyError } from './errors.js';

/**
 * Refuses a call that takes an organization's org token when it is made from a browser page.
 *
 * An org token signs in any of the organization's players and opens its fleet sessions, so it
 * stays on a server the organization runs. The Application API refuses one sent with an
 * `Origin` header; this refuses before the token is put on a request at all. It reads only
 * whether the runtime has a page (`window` and `document`), so Node, Deno, Bun and workers
 * pass.
 */
export function assertOrganizationServer(what: string): void {
  const scope = globalThis as { window?: unknown; document?: unknown };
  if (typeof scope.window === 'undefined' || typeof scope.document === 'undefined') return;
  throw new CrowdyError({
    message:
      `${what} takes your organization's org token, which never goes into a browser page or a ` +
      'game client. Call it from a server your organization runs.',
  });
}
