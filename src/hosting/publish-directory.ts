import { createHash } from 'node:crypto';
import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import type { CrowdyClient } from '../crowdy-client.js';
import type { CompleteGamePublishResult, HostedGame, PublishFileInput } from '../domains/hosting.js';
import { uploadPublishFiles } from '../domains/hosting.js';

export interface PublishDirectoryOptions {
  /** The built bundle (`dist/`). Must hold `index.html` at its root. */
  dir: string;
  /** The hosting slug; must already be claimed (`client.hosting.claim`). */
  slug: string;
  concurrency?: number;
  /** Progress: called after each file's upload. */
  onFile?: (path: string, ok: boolean, done: number, total: number) => void;
  /** Called with the manifest before anything is sent. */
  onManifest?: (files: PublishFileInput[], totalBytes: number) => void;
}

export interface PublishDirectoryResult {
  game: HostedGame;
  publishId: string;
  fileCount: number;
  totalBytes: number;
  invalidationId: string | null;
}

/** Walk `dir` and hash every regular file: the manifest `beginGamePublish` wants. */
export async function manifestForDirectory(dir: string): Promise<{ files: PublishFileInput[]; totalBytes: number }> {
  const files: PublishFileInput[] = [];
  let totalBytes = 0;
  const walk = async (d: string) => {
    const entries = await readdir(d, { withFileTypes: true });
    for (const e of entries) {
      const full = join(d, e.name);
      if (e.isDirectory()) {
        await walk(full);
      } else if (e.isFile()) {
        const buf = await readFile(full);
        const s = await stat(full);
        files.push({
          path: relative(dir, full).split(sep).join('/'),
          size: s.size,
          sha256: createHash('sha256').update(buf).digest('hex'),
        });
        totalBytes += s.size;
      }
    }
  };
  await walk(dir);
  files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return { files, totalBytes };
}

/**
 * Publish a built directory to Crowdy Games: manifest -> beginGamePublish -> upload
 * every file to its presigned URL -> completeGamePublish. Requires the client to hold
 * an IDENTITY SESSION with `manage_apps` on the app (sign in with `client.auth.login`
 * from Node; a browser page cannot do this, by design).
 */
export async function publishDirectory(
  client: Pick<CrowdyClient, 'hosting'>,
  options: PublishDirectoryOptions,
): Promise<PublishDirectoryResult> {
  const { files, totalBytes } = await manifestForDirectory(options.dir);
  options.onManifest?.(files, totalBytes);
  const begun = await client.hosting.beginPublish({ slug: options.slug, files });
  let done = 0;
  try {
    await uploadPublishFiles(
      begun.uploads,
      (path) => readFile(join(options.dir, ...path.split('/'))),
      {
        concurrency: options.concurrency,
        onFile: (path, ok) => {
          done += 1;
          options.onFile?.(path, ok, done, begun.uploads.length);
        },
      },
    );
  } catch (error) {
    // Leave nothing half-staged behind a failure the developer will retry.
    await client.hosting.abandonPublish(options.slug, begun.publishId).catch(() => undefined);
    throw error;
  }
  const result: CompleteGamePublishResult = await client.hosting.completePublish(options.slug, begun.publishId);
  return {
    game: result.game,
    publishId: result.publish.publishId,
    fileCount: files.length,
    totalBytes,
    invalidationId: result.invalidationId,
  };
}
