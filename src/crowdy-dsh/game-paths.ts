/**
 * Paths the game dock may read and commit, and playbook pages it may read.
 *
 * `isRepoPath` is the bound repository. `.git`, dotenv files and `node_modules`
 * stay out. `isWritableGamePath` is the older scene allowlist, kept so a caller
 * that still names only those files can ask the same question.
 */

const SAFE_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._/-]*$/;

export function isWritableGamePath(path: string): boolean {
  if (!SAFE_SEGMENT.test(path) || path.includes('..') || path.endsWith('/')) return false;
  if (path === 'model/catalog.mjs') return true;
  if (path === 'exec/construct' || path.startsWith('exec/construct/')) return true;
  return path.startsWith('src/scenes/') && /\.(?:mjs|js|ts)$/.test(path);
}

function deniedRepoSegment(segment: string): boolean {
  return segment === '.git' || segment === 'node_modules' || segment === '.env' || segment.startsWith('.env.');
}

/** A relative path in the bound game repository. The mod crate rules do not apply. */
export function isRepoPath(path: string): boolean {
  if (!SAFE_SEGMENT.test(path) || path.includes('..') || path.endsWith('/')) return false;
  return !path.split('/').some(deniedRepoSegment);
}

/** A repository directory, including the root. */
export function isRepoDir(path: string): boolean {
  if (path === '') return true;
  return isRepoPath(path);
}

/** A playbook page shipped at `/mmo/<page>`. Refuses anything that leaves that tree. */
export function assertPlaybookPage(page: string): string {
  const trimmed = page.trim().replace(/^\/+/, '');
  if (
    !trimmed ||
    trimmed.includes('..') ||
    trimmed.includes('\\') ||
    /[?#\0]/.test(trimmed) ||
    trimmed.startsWith('.')
  ) {
    throw new Error('Playbook pages are markdown files shipped with the game.');
  }
  if (!/^[\w./-]+\.md$/.test(trimmed)) {
    throw new Error('Name a playbook page such as playbook/authoring-loop.md.');
  }
  return trimmed;
}
