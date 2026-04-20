// Copies ../web-api/schema.gql -> ./schema.gql when running inside the
// monorepo. In CI (where the sibling web-api repo isn't checked out) this
// script silently no-ops and codegen runs against the committed schema.
import { existsSync, copyFileSync } from 'node:fs';

const SRC = '../web-api/schema.gql';
const DEST = './schema.gql';

if (existsSync(SRC)) {
  copyFileSync(SRC, DEST);
  console.log(`sync-schema: ${SRC} -> ${DEST}`);
} else {
  console.log(`sync-schema: ${SRC} not found, using committed ${DEST}`);
}
