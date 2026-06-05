// Syncs the GraphQL SDL CrowdyJS codegens against, into ./schema.gql.
//
// Post-split (2026-05), CrowdyJS targets two GraphQL APIs behind a single
// client: `cks-management-api` (auth / users / apps / orgs / billing / quotas)
// and `cks-game-api` (chunks / voxels / actors / udp / world state). The
// generated client therefore needs a *union* SDL containing both schemas.
//
// This script looks for both sibling schema.gql files. If both exist it
// merges them with `@graphql-tools/merge` (which handles deduping shared
// scalars, enums, and root-type extensions). If only one exists it copies
// it as-is. In CI (where neither sibling is checked out) the committed
// ./schema.gql wins.
import { existsSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { mergeTypeDefs } from '@graphql-tools/merge';
import { print } from 'graphql';

// Probed in priority order. Management first so any conflicting fields lose
// to the game-api side last; in practice the two schemas don't actually
// collide on real query/mutation field names, only on scalars + the empty
// root-type extends, which mergeTypeDefs handles.
const MANAGEMENT_CANDIDATES = ['../cks-management-api/schema.gql'];
const GAME_CANDIDATES = [
  '../cks-game-api/schema.gql',
  '../cks-graphql-api/schema.gql',
  '../web-api/schema.gql',
];
const DEST = './schema.gql';

const managementPath = MANAGEMENT_CANDIDATES.find((c) => existsSync(c));
const gamePath = GAME_CANDIDATES.find((c) => existsSync(c));

if (managementPath && gamePath) {
  const merged = mergeTypeDefs([
    readFileSync(managementPath, 'utf8'),
    readFileSync(gamePath, 'utf8'),
  ]);
  writeFileSync(DEST, print(merged) + '\n');
  console.log(
    `sync-schema: merged ${managementPath} + ${gamePath} -> ${DEST}`,
  );
} else if (managementPath) {
  copyFileSync(managementPath, DEST);
  console.log(
    `sync-schema: ${managementPath} -> ${DEST} (no game-api schema found)`,
  );
} else if (gamePath) {
  copyFileSync(gamePath, DEST);
  console.log(
    `sync-schema: ${gamePath} -> ${DEST} (no management-api schema found)`,
  );
} else {
  console.log(
    `sync-schema: neither ${MANAGEMENT_CANDIDATES.join(' or ')} nor ${GAME_CANDIDATES.join(' or ')} found, using committed ${DEST}`,
  );
}
