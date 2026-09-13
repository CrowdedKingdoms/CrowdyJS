/**
 * Path arithmetic between a Crowdy Studio project (per-target files such as
 * `SERVER src/lib.rs`) and the bound repository, driven by the layout the
 * game API resolved (`crowdyStudioGitHubLayout`). This module does NOT parse
 * `crowdy.json`: the API is the only layout grammar, and the three client
 * copies that existed until 17.0.0 had already begun to disagree.
 */

import type { CrowdyStudioTarget } from '../models.js';
import type { CrowdyStudioGitHubLayout } from './transport.js';

export function trimSlash(path: string): string {
  let start = 0;
  let end = path.length;
  while (start < end && path.charCodeAt(start) === 47) start += 1;
  while (end > start && path.charCodeAt(end - 1) === 47) end -= 1;
  return start === 0 && end === path.length ? path : path.slice(start, end);
}

export function joinRepo(root: string, rel: string): string {
  const base = trimSlash(root);
  const rest = trimSlash(rel);
  if (!base || base === '.') return rest;
  return rest ? `${base}/${rest}` : base;
}

export function underRoot(path: string, root: string | null): string | null {
  if (root == null) return null;
  const base = trimSlash(root);
  if (!base || base === '.') return path;
  if (path === base) return '';
  if (path.startsWith(`${base}/`)) return path.slice(base.length + 1);
  return null;
}

/** The repository path of a project file, or null when the layout has no root for its target. */
export function studioFileToRepoPath(
  layout: Pick<CrowdyStudioGitHubLayout, 'server' | 'client'>,
  target: CrowdyStudioTarget,
  path: string,
): string | null {
  const root = target === 'SERVER' ? layout.server : layout.client;
  if (root == null) return null;
  return joinRepo(root, path);
}

/** The project file a repository path is, or null when it is not one (README, assets, …). */
export function repoPathToStudioFile(
  layout: Pick<CrowdyStudioGitHubLayout, 'server' | 'client'>,
  repoPath: string,
): { target: CrowdyStudioTarget; path: string } | null {
  const client = underRoot(repoPath, layout.client);
  if (client != null && isRustAuthoringPath(client)) return { target: 'CLIENT', path: client };
  const server = underRoot(repoPath, layout.server);
  if (server != null && isRustAuthoringPath(server)) {
    if (layout.client && (layout.server === '.' || layout.server === '') && server.startsWith(`${trimSlash(layout.client)}/`)) {
      return null;
    }
    return { target: 'SERVER', path: server };
  }
  return null;
}

/** `Cargo.toml` or a `.rs` under `src/`, no traversal — what Crowdy Studio compiles. */
export function isRustAuthoringPath(rel: string): boolean {
  if (!rel || rel.includes('..') || rel.startsWith('/')) return false;
  if (rel === 'Cargo.toml') return true;
  if (rel === 'Cargo.lock' || rel === 'build.rs' || rel.endsWith('/build.rs')) return false;
  return rel.startsWith('src/') && rel.endsWith('.rs');
}
