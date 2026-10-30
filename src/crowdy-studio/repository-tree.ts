/**
 * The Files pane tree for a bound game repository.
 *
 * Directories come first. The root node is the repository itself and is not
 * drawn; its children are the top of the list.
 */

export interface RepositoryNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children: RepositoryNode[];
}

export function repositoryTree(
  directories: readonly string[],
  files: readonly string[],
): RepositoryNode {
  const root: RepositoryNode = { name: '', path: '', type: 'directory', children: [] };
  const dirs = new Map<string, RepositoryNode>([['', root]]);
  const ensureDir = (path: string): RepositoryNode => {
    const existing = dirs.get(path);
    if (existing) return existing;
    const slash = path.lastIndexOf('/');
    const name = slash === -1 ? path : path.slice(slash + 1);
    const parentPath = slash === -1 ? '' : path.slice(0, slash);
    const node: RepositoryNode = { name, path, type: 'directory', children: [] };
    dirs.set(path, node);
    ensureDir(parentPath).children.push(node);
    return node;
  };
  for (const dir of directories) {
    if (dir) ensureDir(dir);
  }
  for (const file of files) {
    const slash = file.lastIndexOf('/');
    const name = slash === -1 ? file : file.slice(slash + 1);
    const parentPath = slash === -1 ? '' : file.slice(0, slash);
    ensureDir(parentPath).children.push({ name, path: file, type: 'file', children: [] });
  }
  const sort = (node: RepositoryNode): void => {
    node.children.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    for (const child of node.children) {
      if (child.type === 'directory') sort(child);
    }
  };
  sort(root);
  return root;
}
