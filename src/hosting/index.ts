/**
 * `@crowdedkingdoms/crowdyjs/hosting` -- Node-side helpers for publishing a built game
 * to Crowdy Games. Kept out of the root barrel because they read the filesystem; the
 * GraphQL wrappers themselves are `client.hosting` on every client.
 *
 * Deprecated, with both helpers: Crowded Kingdoms no longer hosts games (retired
 * 2026-10-29), and the hosting API answers `CONTENT_HOSTING_DISABLED` on every tier.
 * Host your build on your own origin.
 */
export { publishDirectory, manifestForDirectory } from './publish-directory.js';
export type { PublishDirectoryOptions, PublishDirectoryResult } from './publish-directory.js';
