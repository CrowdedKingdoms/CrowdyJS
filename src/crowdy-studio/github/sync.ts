/**
 * Map Crowdy Studio SERVER/CLIENT files onto the repository bound to the
 * project, and move files both ways through the game API.
 *
 * Layout (from `crowdy.json` at the repo root, else inferred):
 *   SERVER src/lib.rs  <->  server/src/lib.rs
 *   CLIENT src/lib.rs  <->  client/src/lib.rs
 *
 * The repository itself is never named here: every call carries only
 * `(appId, projectId)` and the game API resolves the bind.
 */

import type { CrowdyStudioProjectFile, CrowdyStudioTarget } from '../models.js';
import type {
  CrowdyStudioGitHubProjectScope,
  CrowdyStudioGitHubTransport,
  CrowdyStudioGitHubTreeEntry,
} from './transport.js';

export interface GitHubLayout {
  serverRoot: string | null;
  clientRoot: string | null;
}

/** Minimal surface the sync needs; the transport satisfies it. */
export type GitHubFiles = Pick<CrowdyStudioGitHubTransport, 'tree' | 'getFile' | 'putFile'>;

const SKIP_DIRS = new Set(['.git', 'node_modules', 'target', 'dist', '.cursor']);
const SKIP_FILES = new Set(['crowdy.json', 'readme.md', 'license', '.gitignore']);

export const DEFAULT_FULL_STACK_CROWDY_JSON = `{
  "server": "server",
  "client": "client"
}
`;

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

export function parseCrowdyJson(content: string): GitHubLayout | null {
  try {
    const parsed = JSON.parse(content) as { server?: unknown; client?: unknown };
    const server = typeof parsed.server === 'string' ? parsed.server.trim() || '.' : null;
    const clientRoot = typeof parsed.client === 'string' ? parsed.client.trim() || '.' : null;
    if (server == null && clientRoot == null) return null;
    return { serverRoot: server, clientRoot };
  } catch {
    return null;
  }
}

export function layoutFromTree(entries: ReadonlyArray<CrowdyStudioGitHubTreeEntry>): GitHubLayout {
  const hasDir = (name: string) => entries.some((e) => e.type === 'tree' && e.path === name);
  const hasClient = hasDir('client');
  const hasServer = hasDir('server');
  if (hasServer && hasClient) return { serverRoot: 'server', clientRoot: 'client' };
  if (hasClient) return { serverRoot: '.', clientRoot: 'client' };
  if (hasServer) return { serverRoot: 'server', clientRoot: null };
  return { serverRoot: '.', clientRoot: null };
}

export function repoPathToStudioFile(
  layout: GitHubLayout,
  repoPath: string,
): { target: CrowdyStudioTarget; path: string } | null {
  const segments = repoPath.split('/');
  if (segments.some((s) => SKIP_DIRS.has(s))) return null;
  const name = segments[segments.length - 1]?.toLowerCase() ?? '';
  if (SKIP_FILES.has(name) || SKIP_FILES.has(repoPath.toLowerCase())) return null;
  const clientRel = underRoot(repoPath, layout.clientRoot);
  if (clientRel != null && clientRel !== '') return { target: 'CLIENT', path: clientRel };
  const serverRel = underRoot(repoPath, layout.serverRoot);
  if (serverRel != null && serverRel !== '') return { target: 'SERVER', path: serverRel };
  return null;
}

export function studioFileToRepoPath(
  layout: GitHubLayout,
  target: CrowdyStudioTarget,
  path: string,
): string | null {
  const root = target === 'CLIENT' ? layout.clientRoot : layout.serverRoot;
  if (root == null) return null;
  return joinRepo(root, path);
}

export function mergeStudioFilesFromGitHub(
  current: readonly CrowdyStudioProjectFile[],
  incoming: readonly CrowdyStudioProjectFile[],
): { files: CrowdyStudioProjectFile[]; changed: boolean } {
  const keyOf = (file: CrowdyStudioProjectFile) => `${file.target}:${file.path}`;
  const next = new Map(current.map((file) => [keyOf(file), { ...file }]));
  let changed = false;
  for (const file of incoming) {
    const key = keyOf(file);
    const existing = next.get(key);
    if (!existing) {
      next.set(key, { ...file });
      changed = true;
      continue;
    }
    if (existing.content !== file.content) {
      next.set(key, { ...existing, content: file.content });
      changed = true;
    }
  }
  return { files: [...next.values()], changed };
}

/** Files present in Studio that the repository no longer has (for the UI to list). */
export function studioFilesMissingOnGitHub(
  layout: GitHubLayout,
  current: readonly CrowdyStudioProjectFile[],
  tree: ReadonlyArray<CrowdyStudioGitHubTreeEntry>,
): CrowdyStudioProjectFile[] {
  const blobs = new Set(tree.filter((e) => e.type === 'blob').map((e) => e.path));
  return current.filter((file) => {
    const repoPath = studioFileToRepoPath(layout, file.target, file.path);
    return repoPath != null && !blobs.has(repoPath);
  });
}

export async function resolveGitHubLayout(
  github: GitHubFiles,
  scope: CrowdyStudioGitHubProjectScope,
  tree?: ReadonlyArray<CrowdyStudioGitHubTreeEntry>,
): Promise<{ layout: GitHubLayout; tree: CrowdyStudioGitHubTreeEntry[] }> {
  const entries = tree ? [...tree] : await github.tree(scope);
  if (entries.some((e) => e.type === 'blob' && e.path === 'crowdy.json')) {
    try {
      const file = await github.getFile({ ...scope, path: 'crowdy.json' });
      const parsed = parseCrowdyJson(file.content);
      if (parsed) return { layout: parsed, tree: entries };
    } catch {
      // Unreadable crowdy.json: infer from the tree.
    }
  }
  return { layout: layoutFromTree(entries), tree: entries };
}

/** One tree call, then one read per mapped blob. */
export async function pullStudioFilesFromGitHub(
  github: GitHubFiles,
  scope: CrowdyStudioGitHubProjectScope,
): Promise<{ files: CrowdyStudioProjectFile[]; layout: GitHubLayout; tree: CrowdyStudioGitHubTreeEntry[] }> {
  const { layout, tree } = await resolveGitHubLayout(github, scope);
  const files: CrowdyStudioProjectFile[] = [];
  for (const entry of tree) {
    if (entry.type !== 'blob') continue;
    const mapped = repoPathToStudioFile(layout, entry.path);
    if (!mapped) continue;
    try {
      const body = await github.getFile({ ...scope, path: entry.path });
      files.push({ target: mapped.target, path: mapped.path, content: body.content });
    } catch {
      continue;
    }
  }
  return { files, layout, tree };
}

async function putFileCreateOrUpdate(
  github: GitHubFiles,
  scope: CrowdyStudioGitHubProjectScope,
  path: string,
  content: string,
  message: string,
  knownSha: string | null | undefined,
): Promise<boolean> {
  let sha: string | undefined = knownSha ?? undefined;
  if (knownSha) {
    // Skip the write when the blob already matches.
    try {
      const existing = await github.getFile({ ...scope, path });
      if (existing.content === content) return false;
      sha = existing.sha;
    } catch {
      sha = undefined;
    }
  }
  await github.putFile({ ...scope, path, content, message, ...(sha ? { sha } : {}) });
  return true;
}

/** Push the given Studio files to the bound repository. Returns files written. */
export async function pushStudioFilesToGitHub(
  github: GitHubFiles,
  scope: CrowdyStudioGitHubProjectScope,
  files: readonly CrowdyStudioProjectFile[],
): Promise<number> {
  const resolved = await resolveGitHubLayout(github, scope);
  let layout = resolved.layout;
  const shaByPath = new Map(
    resolved.tree.filter((e) => e.type === 'blob').map((e) => [e.path, e.sha]),
  );
  let pushed = 0;
  const wantsFullStack =
    files.some((f) => f.target === 'SERVER') && files.some((f) => f.target === 'CLIENT');
  if (wantsFullStack && !shaByPath.has('crowdy.json')) {
    // A full-stack project on a repo with no layout file: declare server/ +
    // client/ first so both trees land under their roots from this push on.
    await github.putFile({
      ...scope,
      path: 'crowdy.json',
      content: DEFAULT_FULL_STACK_CROWDY_JSON,
      message: 'studio: add crowdy.json layout',
    });
    pushed += 1;
    layout = { serverRoot: 'server', clientRoot: 'client' };
  }
  for (const file of files) {
    const path = studioFileToRepoPath(layout, file.target, file.path);
    if (!path) continue;
    const wrote = await putFileCreateOrUpdate(
      github,
      scope,
      path,
      file.content,
      `studio: update ${file.target} ${file.path}`,
      shaByPath.get(path),
    );
    if (wrote) pushed += 1;
  }
  return pushed;
}
