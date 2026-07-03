// Explicitly syncs the GraphQL SDL CrowdyJS codegens against into ./schema.gql.
//
// CrowdyJS is a standalone public package, so `npm run build` must never depend
// on sibling API checkouts. Normal builds use the committed ./schema.gql and
// src/generated/graphql.ts. Run this script only when intentionally refreshing
// the SDK schema:
//
//   npm run schema:sync:prod   # fetch published SDLs from docs.crowdedkingdoms.com
//   npm run schema:sync:local  # merge ../cks-management-api + ../cks-game-api
//   npm run schema:sync:paths -- --management <file-or-url> --game <file-or-url>
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { mergeTypeDefs } from '@graphql-tools/merge';
import { print } from 'graphql';

const PROD_MANAGEMENT_SCHEMA_URL =
  'https://docs.crowdedkingdoms.com/schema/management-api.graphql';
const PROD_GAME_SCHEMA_URL =
  'https://docs.crowdedkingdoms.com/schema/game-api.graphql';
const LOCAL_MANAGEMENT_SCHEMA = '../cks-management-api/schema.gql';
const LOCAL_GAME_SCHEMA = '../cks-game-api/schema.gql';
const DEST = './schema.gql';

const args = parseArgs(process.argv.slice(2));
const sources = resolveSources(args);

if (!sources.management || !sources.game) {
  usage('Both --management and --game sources are required unless using --prod or --local.');
}

const managementSdl = await readSource(sources.management);
const gameSdl = await readSource(sources.game);
const merged = mergeTypeDefs([managementSdl, gameSdl]);
writeFileSync(DEST, print(merged) + '\n');
console.log(
  `sync-schema: merged ${sources.management} + ${sources.game} -> ${DEST}`,
);

function parseArgs(rawArgs) {
  const parsed = {};
  for (let i = 0; i < rawArgs.length; i++) {
    const arg = rawArgs[i];
    if (arg === '--prod') {
      parsed.mode = 'prod';
    } else if (arg === '--local') {
      parsed.mode = 'local';
    } else if (arg === '--management' || arg === '--game') {
      const value = rawArgs[++i];
      if (!value) usage(`Missing value for ${arg}`);
      parsed[arg.slice(2)] = value;
    } else if (arg.startsWith('--management=')) {
      parsed.management = arg.slice('--management='.length);
    } else if (arg.startsWith('--game=')) {
      parsed.game = arg.slice('--game='.length);
    } else {
      usage(`Unknown argument: ${arg}`);
    }
  }
  return parsed;
}

function resolveSources(parsed) {
  if (parsed.mode === 'prod') {
    return {
      management: process.env.CROWDY_MANAGEMENT_SCHEMA_URL || PROD_MANAGEMENT_SCHEMA_URL,
      game: process.env.CROWDY_GAME_SCHEMA_URL || PROD_GAME_SCHEMA_URL,
    };
  }
  if (parsed.mode === 'local') {
    return {
      management: process.env.CROWDY_MANAGEMENT_SCHEMA_PATH || LOCAL_MANAGEMENT_SCHEMA,
      game: process.env.CROWDY_GAME_SCHEMA_PATH || LOCAL_GAME_SCHEMA,
    };
  }
  return {
    management: parsed.management,
    game: parsed.game,
  };
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
      '  node scripts/sync-schema.mjs --management <file-or-url> --game <file-or-url>',
    ].join('\n'),
  );
  process.exit(2);
}
