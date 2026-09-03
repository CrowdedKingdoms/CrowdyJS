/** Client-held git binding for a Studio project (spike: no server column). */

export interface GitForgeBinding {
  /** Forgejo origin, e.g. https://forge.example.com */
  baseUrl: string;
  /** `owner/repo@ref` — ref is branch, tag, or commit SHA */
  slug: string;
  /** Optional read token for private repos (stored in localStorage; spike only). */
  token?: string;
}

const STORAGE_KEY = 'crowdy.studio.gitForgeBindings.v1';

function readAll(): Record<string, GitForgeBinding> {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, GitForgeBinding>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeAll(map: Record<string, GitForgeBinding>): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
}

export function getGitForgeBinding(projectId: string): GitForgeBinding | null {
  const row = readAll()[projectId];
  if (!row?.baseUrl || !row?.slug) return null;
  return row;
}

export function setGitForgeBinding(
  projectId: string,
  binding: GitForgeBinding | null,
): void {
  const map = readAll();
  if (!binding) {
    delete map[projectId];
  } else {
    map[projectId] = binding;
  }
  writeAll(map);
}

/** Parse `owner/repo@ref` into parts. */
export function parseGitSlug(slug: string): {
  owner: string;
  repo: string;
  ref: string;
} {
  const trimmed = slug.trim();
  const at = trimmed.lastIndexOf('@');
  if (at <= 0) {
    throw new Error('Git slug must be owner/repo@ref');
  }
  const repoPath = trimmed.slice(0, at);
  const ref = trimmed.slice(at + 1).trim();
  const slash = repoPath.indexOf('/');
  if (slash <= 0 || slash === repoPath.length - 1) {
    throw new Error('Git slug must be owner/repo@ref');
  }
  return {
    owner: repoPath.slice(0, slash),
    repo: repoPath.slice(slash + 1),
    ref: ref || 'main',
  };
}
