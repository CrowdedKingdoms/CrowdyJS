// Explicitly syncs the GraphQL SDL CrowdyJS codegens against into ./schema.gql.
//
// CrowdyJS is a standalone public package, so `npm run build` must never depend
// on sibling API checkouts. Normal builds use the committed ./schema.gql and
// src/generated/graphql.ts. Run this script only when intentionally refreshing
// the SDK schema:
//
//   npm run schema:sync:prod    # fetch the published SDL from docs.crowdedkingdoms.com
//   npm run schema:sync:local   # read ../cks-game-api/schema.gql
//   npm run schema:sync:paths -- --schema <file-or-url>
//
// There is ONE schema. Until 2026-08-06 this merged a management SDL from
// cks-management-api with a game SDL from cks-game-api; that repo was retired and
// its surface absorbed, so the unified cks-game-api schema is the whole thing and
// there is nothing left to merge.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const PROD_SCHEMA_URL = 'https://docs.crowdedkingdoms.com/schema/game-api.graphql';
const LOCAL_SCHEMA = '../cks-game-api/schema.gql';
const DEST = './schema.gql';

const args = parseArgs(process.argv.slice(2));
const source = resolveSource(args);

if (!source) {
  usage('A schema source is required: pass --prod, --local, or --schema <file-or-url>.');
}

const sdl = await readSource(source);
if (!sdl.trim()) {
  console.error(`sync-schema: ${source} is empty; refusing to overwrite ${DEST}.`);
  process.exit(1);
}
writeFileSync(DEST, sdl.endsWith('\n') ? sdl : sdl + '\n');
console.log(`sync-schema: ${source} -> ${DEST}`);

function parseArgs(rawArgs) {
  const parsed = {};
  for (let i = 0; i < rawArgs.length; i++) {
    const arg = rawArgs[i];
    if (arg === '--prod') {
      parsed.mode = 'prod';
    } else if (arg === '--local') {
      parsed.mode = 'local';
    } else if (arg === '--schema') {
      const value = rawArgs[++i];
      if (!value) usage(`Missing value for ${arg}`);
      parsed.schema = value;
    } else if (arg.startsWith('--schema=')) {
      parsed.schema = arg.slice('--schema='.length);
    } else if (arg === '--management' || arg.startsWith('--management=')) {
      usage(
        '--management was removed: cks-management-api is retired and the game SDL ' +
          'is the unified schema. Use --schema (or --prod / --local).',
      );
    } else if (arg === '--game' || arg.startsWith('--game=')) {
      usage('--game is now --schema, since there is only one source.');
    } else {
      usage(`Unknown argument: ${arg}`);
    }
  }
  return parsed;
}

function resolveSource(parsed) {
  if (parsed.mode === 'prod') return process.env.CROWDY_SCHEMA_URL || PROD_SCHEMA_URL;
  if (parsed.mode === 'local') return process.env.CROWDY_SCHEMA_PATH || LOCAL_SCHEMA;
  return parsed.schema;
}

async function readSource(source) {
  if (/^https?:\/\//i.test(source)) {
    const response = await fetch(source);
    if (!response.ok) {
      throw new Error(`Failed to fetch ${source}: ${response.status} ${response.statusText}`);
    }
    return response.text();
  }
  if (!existsSync(source)) {
    throw new Error(`Schema file not found: ${source}`);
  }
  return readFileSync(source, 'utf8');
}

function usage(message) {
  if (message) console.error(`sync-schema: ${message}`);
  console.error(
    [
      'Usage:',
      '  node scripts/sync-schema.mjs --prod',
      '  node scripts/sync-schema.mjs --local',
      '  node scripts/sync-schema.mjs --schema <file-or-url>',
    ].join('\n'),
  );
  process.exit(2);
}
