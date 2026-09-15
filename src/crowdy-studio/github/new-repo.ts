/**
 * The GitHub "new repository" page, prefilled for a Crowdy Studio mod.
 *
 * The Crowdy Studio GitHub App holds installation tokens only, which can act
 * on repositories already granted to the installation and can never create
 * one — that needs a user token this platform does not mint. So "create a
 * repository" is the modder's own click on GitHub; this makes it a short one:
 * owner, name and description arrive prefilled, visibility defaults to
 * private. After GitHub returns, the bind form is prefilled with the same
 * `owner/name` and PUSH_PROJECT seeds `crowdy.json`, a README and the files.
 *
 * GitHub's `/new` page reads `owner`, `name`, `description` and `visibility`
 * from the query string; unknown or refused values fall back to its defaults,
 * so a stale parameter never breaks the page.
 */

export interface GitHubNewRepositoryOptions {
  /** Account the repository should be created under (the connected login). */
  owner?: string | null;
  /** Repository name; slugged to GitHub's grammar (`[A-Za-z0-9._-]`). */
  name: string;
  description?: string | null;
  visibility?: 'private' | 'public';
}

/** GitHub repository-name grammar: letters, digits, `.`, `-`, `_`; at most 100 chars. */
export function githubRepositorySlug(value: string): string {
  let out = '';
  let dash = false;
  for (const ch of value.trim().toLowerCase()) {
    const code = ch.charCodeAt(0);
    const ok =
      (code >= 97 && code <= 122) || (code >= 48 && code <= 57) || ch === '.' || ch === '_' || ch === '-';
    if (ok) {
      out += ch;
      dash = ch === '-';
    } else if (!dash && out.length > 0) {
      out += '-';
      dash = true;
    }
  }
  out = out.replace(/^[-._]+|[-._]+$/g, '');
  return out.slice(0, 100) || 'crowdy-mod';
}

export function githubNewRepositoryUrl(options: GitHubNewRepositoryOptions): string {
  const params = new URLSearchParams();
  if (options.owner) params.set('owner', options.owner);
  params.set('name', githubRepositorySlug(options.name));
  if (options.description?.trim()) params.set('description', options.description.trim().slice(0, 350));
  params.set('visibility', options.visibility ?? 'private');
  return `https://github.com/new?${params.toString()}`;
}
