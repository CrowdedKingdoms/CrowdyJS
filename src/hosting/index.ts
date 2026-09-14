/**
 * `@crowdedkingdoms/crowdyjs/hosting` -- Node-side helpers for publishing a built game
 * to Crowdy Games. Kept out of the root barrel because they read the filesystem; the
 * GraphQL wrappers themselves are `client.hosting` on every client.
 */
export { publishDirectory, manifestForDirectory } from './publish-directory.js';
export type { PublishDirectoryOptions, PublishDirectoryResult } from './publish-directory.js';
