import type { GraphQLClient } from '../client.js';
import {
  AbandonGamePublishDocument,
  AllHostedGamesDocument,
  BeginGamePublishDocument,
  ClaimGameHostingDocument,
  CompleteGamePublishDocument,
  HostedGameDocument,
  HostedGamePublishesDocument,
  HostedGamesDocument,
  MyHostedGamesDocument,
  SetHostedGameEnabledDocument,
  SetHostedGameListingDocument,
  TakeDownHostedGameDocument,
  type BeginGamePublishMutation,
  type CompleteGamePublishMutation,
  type HostedGameFieldsFragment,
  type HostedGamePublishFieldsFragment,
  type PublishFileInput,
} from '../generated/graphql.js';

export type HostedGame = HostedGameFieldsFragment;
export type HostedGamePublish = HostedGamePublishFieldsFragment;
export type BeginGamePublishResult = BeginGamePublishMutation['beginGamePublish'];
export type HostedGameUpload = BeginGamePublishResult['uploads'][number];
export type CompleteGamePublishResult = CompleteGamePublishMutation['completeGamePublish'];
export type { PublishFileInput };

/**
 * Third-party game hosting on Crowdy Games (ck-api v2.1, 2026-09-13).
 *
 * A developer publishes a built static bundle to the platform; players reach it at
 * `https://<games host>/<slug>/` (a first-party shell page) while it executes on
 * `https://<slug>.<content host>`, an origin of its own. The API returns both URLs
 * (`launchUrl`, `contentOrigin`); nothing here spells a hostname.
 *
 * WHICH TOKEN. Every mutation here needs an IDENTITY SESSION (`client.auth.login`
 * from Node, or a Studio session) with `manage_apps` on the app -- never an app
 * token. A game's own bundle can therefore never publish a replacement for itself.
 * The two reads a page needs (`game`, `listed`) are public.
 *
 * THE FLOW: `claim` once per app -> build -> `beginPublish` with the manifest ->
 * PUT every file to its presigned URL with exactly the returned headers ->
 * `completePublish`. `@crowdedkingdoms/crowdyjs/hosting`'s `publishDirectory` does
 * the last three steps for a `dist/` directory in Node.
 */
export class HostingAPI {
  constructor(private readonly api: GraphQLClient) {}

  /** Public: a hosted game by slug, or null. The shell's question. */
  async game(slug: string): Promise<HostedGame | null> {
    const data = await this.api.request(HostedGameDocument, { slug });
    return data.hostedGame;
  }

  /** Public: the LIVE, LISTED hosted games -- the lobby's list. */
  async listed(): Promise<HostedGame[]> {
    const data = await this.api.request(HostedGamesDocument, {});
    return data.hostedGames;
  }

  /** Operator: every hosted game on the tier. */
  async all(): Promise<HostedGame[]> {
    const data = await this.api.request(AllHostedGamesDocument, {});
    return data.allHostedGames;
  }

  /** The hosted games the caller can manage. Session token. */
  async mine(): Promise<HostedGame[]> {
    const data = await this.api.request(MyHostedGamesDocument, {});
    return data.myHostedGames;
  }

  /** Publish history for a game, newest first. Session token + manage_apps. */
  async publishes(slug: string, limit?: number): Promise<HostedGamePublish[]> {
    const data = await this.api.request(HostedGamePublishesDocument, { slug, limit: limit ?? null });
    return data.hostedGamePublishes;
  }

  /**
   * Claim (or re-assert) the hosting slug for an app. Idempotent; a different slug
   * MOVES the game. Registers the shell page and the game origin as redirect URIs
   * and sets `launch_url`. Refuses reserved, taken or malformed slugs
   * (`HOSTED_SLUG_UNAVAILABLE`) and a tier without hosting (`CONTENT_HOSTING_DISABLED`).
   */
  async claim(params: { appId: string; slug?: string }): Promise<HostedGame> {
    const data = await this.api.request(ClaimGameHostingDocument, {
      input: { appId: params.appId, slug: params.slug ?? null },
    });
    return data.claimGameHosting;
  }

  /** Declare a publish; returns one presigned PUT per file. */
  async beginPublish(params: { slug: string; files: PublishFileInput[] }): Promise<BeginGamePublishResult> {
    const data = await this.api.request(BeginGamePublishDocument, { input: params });
    return data.beginGamePublish;
  }

  /** Verify, promote, record LIVE, invalidate. */
  async completePublish(slug: string, publishId: string): Promise<CompleteGamePublishResult> {
    const data = await this.api.request(CompleteGamePublishDocument, { slug, publishId });
    return data.completeGamePublish;
  }

  async abandonPublish(slug: string, publishId: string): Promise<HostedGamePublish> {
    const data = await this.api.request(AbandonGamePublishDocument, { slug, publishId });
    return data.abandonGamePublish;
  }

  /** Developer switch: off (DISABLED) or on (LIVE). */
  async setEnabled(slug: string, enabled: boolean): Promise<HostedGame> {
    const data = await this.api.request(SetHostedGameEnabledDocument, { input: { slug, enabled } });
    return data.setHostedGameEnabled;
  }

  /** Operator: list or unlist in the lobby and the management UI. */
  async setListing(slug: string, listed: boolean): Promise<HostedGame> {
    const data = await this.api.request(SetHostedGameListingDocument, { input: { slug, listed } });
    return data.setHostedGameListing;
  }

  /** Operator: take down (or restore with `false`). */
  async takeDown(slug: string, takenDown = true): Promise<HostedGame> {
    const data = await this.api.request(TakeDownHostedGameDocument, { slug, takenDown });
    return data.takeDownHostedGame;
  }
}

/**
 * Upload every file of a publish to its presigned URL, with bounded concurrency and
 * a retry per file. Works in Node 20+ and in a browser (`fetch`, `Blob`/`Uint8Array`
 * bodies). `read(path)` returns the bytes for a manifest path.
 */
export async function uploadPublishFiles(
  uploads: HostedGameUpload[],
  read: (path: string) => Promise<Uint8Array | Blob>,
  options: { concurrency?: number; retries?: number; onFile?: (path: string, ok: boolean) => void } = {},
): Promise<void> {
  const concurrency = Math.max(1, options.concurrency ?? 8);
  const retries = Math.max(0, options.retries ?? 2);
  const queue = [...uploads];
  const failures: string[] = [];
  const worker = async () => {
    for (;;) {
      const u = queue.shift();
      if (!u) return;
      let ok = false;
      for (let attempt = 0; attempt <= retries && !ok; attempt++) {
        try {
          const body = await read(u.path);
          const res = await fetch(u.url, {
            method: u.method as 'PUT',
            headers: Object.fromEntries(u.headers.map((h) => [h.name, h.value])),
            body: body as BodyInit,
          });
          ok = res.ok;
          if (!ok && res.status >= 400 && res.status < 500 && res.status !== 429) {
            // A 4xx that is not throttling will not get better: BadDigest, expired URL.
            failures.push(`${u.path}: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
            break;
          }
        } catch (error) {
          if (attempt === retries) failures.push(`${u.path}: ${(error as Error).message}`);
        }
      }
      options.onFile?.(u.path, ok);
      if (!ok && !failures.some((f) => f.startsWith(`${u.path}:`))) failures.push(`${u.path}: upload failed`);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, uploads.length) }, worker));
  if (failures.length) {
    throw new Error(`${failures.length} upload(s) failed:\n${failures.join('\n')}`);
  }
}
