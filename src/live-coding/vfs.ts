import type {
  Position,
  TextDocumentContentChangeEvent,
  TextDocumentItem,
} from './lsp-protocol.js';

export interface VirtualFileSystemLimits {
  maxFiles: number;
  maxFileBytes: number;
  maxWorkspaceBytes: number;
}

export const DEFAULT_VFS_LIMITS: Readonly<VirtualFileSystemLimits> = {
  maxFiles: 32,
  maxFileBytes: 256 * 1024,
  maxWorkspaceBytes: 1024 * 1024,
};

export interface VirtualDocument extends TextDocumentItem {
  readonly path: string;
  readonly bytes: number;
}

export class VfsLimitError extends Error {
  readonly code = 'VFS_LIMIT';

  constructor(message: string) {
    super(message);
    this.name = 'VfsLimitError';
  }
}

export class VirtualFileSystem {
  private readonly files = new Map<string, VirtualDocument>();
  private readonly encoder = new TextEncoder();
  private totalBytes = 0;
  readonly workspaceUri: string;
  readonly limits: Readonly<VirtualFileSystemLimits>;

  constructor(
    workspaceUri = 'file:///player-mod',
    limits: Partial<VirtualFileSystemLimits> = {},
  ) {
    this.workspaceUri = workspaceUri.replace(/\/+$/, '');
    const root = new URL(this.workspaceUri);
    if (
      root.protocol !== 'file:' ||
      root.search ||
      root.hash ||
      !root.pathname.startsWith('/') ||
      root.pathname === '/'
    ) {
      throw new Error('workspaceUri must be a non-root file URI');
    }
    this.limits = { ...DEFAULT_VFS_LIMITS, ...limits };
    this.assertLimits();
  }

  get size(): number {
    return this.files.size;
  }

  get bytes(): number {
    return this.totalBytes;
  }

  open(item: TextDocumentItem): VirtualDocument {
    const path = this.pathForUri(item.uri);
    const previous = this.files.get(item.uri);
    if (!previous && this.files.size >= this.limits.maxFiles) {
      throw new VfsLimitError(`Workspace file limit is ${this.limits.maxFiles}`);
    }
    if (previous && item.version <= previous.version) {
      return previous;
    }
    const next = this.makeDocument(item, path);
    this.ensureFits(next.bytes, previous?.bytes ?? 0);
    if (previous) this.totalBytes -= previous.bytes;
    this.files.set(item.uri, next);
    this.totalBytes += next.bytes;
    return next;
  }

  change(
    uri: string,
    version: number,
    changes: readonly TextDocumentContentChangeEvent[],
  ): { applied: boolean; document: VirtualDocument } {
    const previous = this.require(uri);
    if (version <= previous.version) {
      return { applied: false, document: previous };
    }
    let text = previous.text;
    for (const change of changes) {
      if (!change.range) {
        text = change.text;
        continue;
      }
      const start = offsetAt(text, change.range.start);
      const end = offsetAt(text, change.range.end);
      if (end < start) throw new Error('Invalid content change range');
      text = text.slice(0, start) + change.text + text.slice(end);
    }
    const next = this.makeDocument(
      {
        uri,
        version,
        languageId: previous.languageId,
        text,
      },
      previous.path,
    );
    this.ensureFits(next.bytes, previous.bytes);
    this.files.set(uri, next);
    this.totalBytes += next.bytes - previous.bytes;
    return { applied: true, document: next };
  }

  close(uri: string): boolean {
    const previous = this.files.get(uri);
    if (!previous) return false;
    this.files.delete(uri);
    this.totalBytes -= previous.bytes;
    return true;
  }

  get(uri: string): VirtualDocument | undefined {
    return this.files.get(uri);
  }

  require(uri: string): VirtualDocument {
    const document = this.files.get(uri);
    if (!document) throw new Error(`Document is not open: ${uri}`);
    return document;
  }

  documents(): VirtualDocument[] {
    return [...this.files.values()];
  }

  clear(): void {
    this.files.clear();
    this.totalBytes = 0;
  }

  pathForUri(uri: string): string {
    let parsed: URL;
    try {
      parsed = new URL(uri);
    } catch {
      throw new Error(`Invalid document URI: ${uri}`);
    }
    if (
      parsed.protocol !== 'file:' ||
      parsed.search ||
      parsed.hash ||
      !uri.startsWith(`${this.workspaceUri}/`)
    ) {
      throw new Error(`Document is outside ${this.workspaceUri}`);
    }
    const relative = decodeURIComponent(
      parsed.pathname.slice(new URL(this.workspaceUri).pathname.length + 1),
    );
    if (
      relative.length === 0 ||
      relative.startsWith('/') ||
      relative.split('/').some((part) => part === '' || part === '..' || part === '.')
    ) {
      throw new Error(`Unsafe document path: ${relative}`);
    }
    return relative;
  }

  private makeDocument(
    item: TextDocumentItem,
    path: string,
  ): VirtualDocument {
    if (!Number.isSafeInteger(item.version) || item.version < 0) {
      throw new Error('Document version must be a non-negative safe integer');
    }
    const bytes = this.encoder.encode(item.text).byteLength;
    if (bytes > this.limits.maxFileBytes) {
      throw new VfsLimitError(
        `${path} is ${bytes} bytes; file limit is ${this.limits.maxFileBytes}`,
      );
    }
    return Object.freeze({ ...item, path, bytes });
  }

  private ensureFits(nextBytes: number, replacedBytes: number): void {
    const total = this.totalBytes - replacedBytes + nextBytes;
    if (total > this.limits.maxWorkspaceBytes) {
      throw new VfsLimitError(
        `Workspace is ${total} bytes; limit is ${this.limits.maxWorkspaceBytes}`,
      );
    }
  }

  private assertLimits(): void {
    for (const [name, value] of Object.entries(this.limits)) {
      if (!Number.isSafeInteger(value) || value <= 0) {
        throw new Error(`${name} must be a positive safe integer`);
      }
    }
    if (this.limits.maxFileBytes > this.limits.maxWorkspaceBytes) {
      throw new Error('maxFileBytes cannot exceed maxWorkspaceBytes');
    }
  }
}

export function offsetAt(text: string, position: Position): number {
  if (
    !Number.isSafeInteger(position.line) ||
    !Number.isSafeInteger(position.character) ||
    position.line < 0 ||
    position.character < 0
  ) {
    throw new Error('Invalid document position');
  }
  let offset = 0;
  for (let line = 0; line < position.line; line++) {
    const newline = text.indexOf('\n', offset);
    if (newline < 0) throw new Error('Document position is outside the text');
    offset = newline + 1;
  }
  const newline = text.indexOf('\n', offset);
  const lineEnd = newline < 0 ? text.length : newline;
  const target = offset + position.character;
  if (target > lineEnd) throw new Error('Document position is outside the text');
  return target;
}
