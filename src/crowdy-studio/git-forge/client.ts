import { parseGitSlug, type GitForgeBinding } from './binding.js';

export interface GitTreeEntry {
  path: string;
  type: 'file' | 'dir';
  size?: number;
}

const RUST_SOURCE = /^src\/[^/]+\.rs$/;
const CARGO_TOML = 'Cargo.toml';

function authHeaders(token?: string): HeadersInit {
  if (!token) return {};
  return { Authorization: `token ${token}` };
}

function apiRoot(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '') + '/api/v1';
}

/**
 * Minimal Forgejo/Gitea read client for Studio spike (list tree + read blobs).
 */
export class GitForgeClient {
  constructor(private readonly binding: GitForgeBinding) {}

  private parts() {
    return parseGitSlug(this.binding.slug);
  }

  async listTree(path = ''): Promise<GitTreeEntry[]> {
    const { owner, repo, ref } = this.parts();
    const url = new URL(
      `${apiRoot(this.binding.baseUrl)}/repos/${owner}/${repo}/contents/${path}`,
    );
    url.searchParams.set('ref', ref);
    const res = await fetch(url, { headers: authHeaders(this.binding.token) });
    if (!res.ok) {
      throw new Error(`git tree ${path || '/'}: HTTP ${res.status}`);
    }
    const body = (await res.json()) as unknown;
    if (!Array.isArray(body)) {
      if (body && typeof body === 'object' && 'type' in body) {
        const row = body as { path: string; type: string; size?: number };
        return [
          {
            path: row.path,
            type: row.type === 'dir' ? 'dir' : 'file',
            size: row.size,
          },
        ];
      }
      return [];
    }
    return body.map((row: { path: string; type: string; size?: number }) => ({
      path: row.path,
      type: row.type === 'dir' ? 'dir' : 'file',
      size: row.size,
    }));
  }

  async readBlob(path: string): Promise<string> {
    const { owner, repo, ref } = this.parts();
    const url = new URL(
      `${apiRoot(this.binding.baseUrl)}/repos/${owner}/${repo}/contents/${path}`,
    );
    url.searchParams.set('ref', ref);
    const res = await fetch(url, { headers: authHeaders(this.binding.token) });
    if (!res.ok) {
      throw new Error(`git blob ${path}: HTTP ${res.status}`);
    }
    const row = (await res.json()) as {
      content?: string;
      encoding?: string;
    };
    if (!row.content || row.encoding !== 'base64') {
      throw new Error(`git blob ${path}: unexpected encoding`);
    }
    const binary = atob(row.content);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new TextDecoder('utf-8').decode(bytes);
  }

  /** Collect deployable Rust sources for playerComputeDeploy (spike limits). */
  async collectRustSources(): Promise<Record<string, string>> {
    const out: Record<string, string> = {};
    const root = await this.listTree('');
    for (const entry of root) {
      if (entry.type === 'file' && entry.path === CARGO_TOML) {
        out[CARGO_TOML] = await this.readBlob(CARGO_TOML);
      }
      if (entry.type === 'dir' && entry.path === 'src') {
        const srcFiles = await this.listTree('src');
        for (const file of srcFiles) {
          if (file.type !== 'file' || !RUST_SOURCE.test(file.path)) continue;
          out[file.path] = await this.readBlob(file.path);
        }
      }
    }
    if (!out[CARGO_TOML]) {
      throw new Error('Bound repo has no Cargo.toml at repository root');
    }
    const rsCount = Object.keys(out).filter((p) => p.endsWith('.rs')).length;
    if (rsCount === 0) {
      throw new Error('Bound repo has no src/*.rs files');
    }
    return out;
  }
}
