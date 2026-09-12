/**
 * Map Crowdy Studio SERVER/CLIENT files onto the bound repository using the
 * layout returned by `crowdyStudioGitHubLayout`. Do not infer `crowdy.json`
 * here — that contract lives on ck-api.
 *
 *   SERVER src/lib.rs  <->  <layout.server>/src/lib.rs
 *   CLIENT src/lib.rs  <->  <layout.client>/src/lib.rs
 *
 * The repository itself is never named: every call carries only
 * `(appId, projectId)` and the game API resolves the bind.
 */

import type { CrowdyStudioProjectFile, CrowdyStudioTarget } from '../models.js';
import type {
  CrowdyStudioGitHubLayout,
  CrowdyStudioGitHubProjectScope,
  CrowdyStudioGitHubTransport,
  CrowdyStudioGitHubTreeEntry,
} from './transport.js';

export interface GitHubLayout {
  serverRoot: string;
  clientRoot: string | null;
  assets: string;
}

/** Minimal surface persist/load need; the transport satisfies it. */
export type GitHubFiles = Pick<
  CrowdyStudioGitHubTransport,
  'tree' | 'getFile' | 'putFile' | 'layout'
>;

const SKIP_DIRS = new Set(['.git', 'node_modules', 'target', 'dist', '.cursor']);
const SKIP_FILES = new Set(['crowdy.json', 'readme.md', 'license', '.gitignore']);

export const DEFAULT_FULL_STACK_CROWDY_JSON = `{
  "server": "server",
  "client": "client",
  "assets": "assets"
}
`;

export function layoutFromApi(layout: CrowdyStudioGitHubLayout): GitHubLayout {
  return {
    serverRoot: layout.server,
    clientRoot: layout.client,
    assets: layout.assets,
  };
}

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

/** Studio rust authoring path: Cargo.toml or src/*.rs, no traversal. */
export function isRustAuthoringPath(rel: string): boolean {
  if (!rel || rel.includes('..')) return false;
  if (rel === 'Cargo.toml') return true;
  return rel.startsWith('src/') && rel.endsWith('.rs');
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
  if (clientRel != null && clientRel !== '' && isRustAuthoringPath(clientRel)) {
    return { target: 'CLIENT', path: clientRel };
  }
  const serverRel = underRoot(repoPath, layout.serverRoot);
  if (serverRel != null && serverRel !== '' && isRustAuthoringPath(serverRel)) {
    return { target: 'SERVER', path: serverRel };
  }
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

export function studioFilesToRepoSeed(
  layout: GitHubLayout,
  files: readonly CrowdyStudioProjectFile[],
): Array<{ path: string; content: string }> {
  const out: Array<{ path: string; content: string }> = [];
  for (const file of files) {
    const path = studioFileToRepoPath(layout, file.target, file.path);
    if (path) out.push({ path, content: file.content });
  }
  return out;
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

/** One layout query, then one tree call, then one read per mapped blob. */
export async function loadStudioFilesFromGitHub(
  github: GitHubFiles,
  scope: CrowdyStudioGitHubProjectScope,
): Promise<{
  files: CrowdyStudioProjectFile[];
  layout: GitHubLayout;
  tree: CrowdyStudioGitHubTreeEntry[];
  commitSha: string;
  blobShaByPath: Map<string, string>;
}> {
  const apiLayout = await github.layout(scope);
  const layout = layoutFromApi(apiLayout);
  const tree = await github.tree({
    ...scope,
    ...(scope.commitSha ? { commitSha: scope.commitSha } : { commitSha: apiLayout.commitSha }),
  });
  const files: CrowdyStudioProjectFile[] = [];
  const blobShaByPath = new Map<string, string>();
  for (const entry of tree) {
    if (entry.type !== 'blob') continue;
    const mapped = repoPathToStudioFile(layout, entry.path);
    if (!mapped) continue;
    if (entry.sha) blobShaByPath.set(entry.path, entry.sha);
    try {
      const body = await github.getFile({ ...scope, path: entry.path, commitSha: apiLayout.commitSha });
      files.push({ target: mapped.target, path: mapped.path, content: body.content });
      blobShaByPath.set(entry.path, body.sha);
    } catch {
      continue;
    }
  }
  return { files, layout, tree, commitSha: apiLayout.commitSha, blobShaByPath };
}

export async function persistStudioFilesToGitHub(
  github: GitHubFiles,
  scope: CrowdyStudioGitHubProjectScope,
  files: readonly CrowdyStudioProjectFile[],
  opts: {
    expectedCommitSha?: string | null;
    blobShaByPath?: ReadonlyMap<string, string>;
    previous?: readonly CrowdyStudioProjectFile[];
  } = {},
): Promise<{
  written: number;
  commitSha: string | null;
  blobShaByPath: Map<string, string>;
}> {
  const apiLayout = await github.layout(scope);
  const layout = layoutFromApi(apiLayout);
  const blobShaByPath = new Map(opts.blobShaByPath ?? []);
  const previousByKey = new Map(
    (opts.previous ?? []).map((file) => [`${file.target}:${file.path}`, file.content]),
  );
  let expected = opts.expectedCommitSha ?? apiLayout.commitSha;
  let written = 0;
  for (const file of files) {
    const path = studioFileToRepoPath(layout, file.target, file.path);
    if (!path) continue;
    const prior = previousByKey.get(`${file.target}:${file.path}`);
    if (prior === file.content && blobShaByPath.has(path)) continue;
    const sha = blobShaByPath.get(path);
    const result = await github.putFile({
      ...scope,
      path,
      content: file.content,
      message: `studio: update ${file.target} ${file.path}`,
      ...(sha ? { sha } : {}),
      ...(expected ? { expectedCommitSha: expected } : {}),
    });
    written += 1;
    if (result.commitSha) expected = result.commitSha;
    blobShaByPath.set(path, result.sha);
  }
  return { written, commitSha: expected ?? null, blobShaByPath };
}
