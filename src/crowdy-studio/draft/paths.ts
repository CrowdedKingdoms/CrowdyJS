/**
 * Which repository paths the game editor and the agent may touch. One copy,
 * used by the draft stores, the controller and the bridge; the server applies
 * its own checks on commit (`crowdyStudioGitHubCommitFiles`).
 *
 * Listed and writable: relative paths whose segments do not name `.git`,
 * `node_modules` or a dotenv file, starting with a letter or digit (so
 * dotfiles at the root, `.github/` included, are out). Workflow files are
 * refused even where a dotfile rule would allow them: the Studio GitHub App
 * has no `workflows` permission.
 */

const SAFE_PATH = /^[A-Za-z0-9][A-Za-z0-9._/-]*$/;

function deniedSegment(segment: string): boolean {
  return segment === '.git' || segment === 'node_modules' || segment === '.env' || segment.startsWith('.env.');
}

/** A relative path in the bound repository the dock may list and write. */
export function isRepoPath(path: string): boolean {
  if (typeof path !== 'string' || !SAFE_PATH.test(path) || path.includes('..') || path.endsWith('/')) return false;
  if (path.split('/').some((segment) => segment === '' || deniedSegment(segment))) return false;
  return !/^\.github\/workflows(\/|$)/i.test(path);
}

/** A repository directory, including the root (`''`). */
export function isRepoDir(path: string): boolean {
  return path === '' || isRepoPath(path);
}

/** Normalise `./a//b` to `a/b`; returns null for anything isRepoPath refuses. */
export function normalizeRepoPath(path: string): string | null {
  if (typeof path !== 'string') return null;
  const cleaned = path
    .replace(/\\/g, '/')
    .split('/')
    .filter((segment) => segment !== '' && segment !== '.')
    .join('/');
  return isRepoPath(cleaned) ? cleaned : null;
}

const BINARY_EXTENSIONS = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'ico', 'bmp', 'tif', 'tiff', 'psd',
  'glb', 'gltf.bin', 'bin', 'fbx', 'obj.bin', 'ktx', 'ktx2', 'basis', 'hdr', 'exr',
  'mp3', 'ogg', 'wav', 'flac', 'm4a', 'aac', 'mp4', 'webm', 'mov',
  'woff', 'woff2', 'ttf', 'otf', 'eot',
  'wasm', 'zip', 'gz', 'tgz', 'br', 'zst', '7z', 'rar', 'tar', 'pdf', 'jar', 'class', 'so', 'dll', 'exe',
]);

/** A path that is binary by extension, before its bytes are known. */
export function isLikelyBinaryPath(path: string): boolean {
  const name = path.slice(path.lastIndexOf('/') + 1).toLowerCase();
  const dot = name.indexOf('.');
  if (dot === -1) return false;
  const ext = name.slice(name.lastIndexOf('.') + 1);
  return BINARY_EXTENSIONS.has(ext) || BINARY_EXTENSIONS.has(name.slice(dot + 1));
}
