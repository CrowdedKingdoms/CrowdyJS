import assert from 'node:assert/strict';
import test from 'node:test';
import { print } from 'graphql';
import { GameClientBootstrapDocument } from '../../dist/generated/graphql.js';

/**
 * The server has returned gameApiUrl / gameApiWsUrl / discoveryUrl on
 * gameClientBootstrap since ck-api v1.20.0. A query that does not select them
 * makes every client see null and stay on the shared multivalue name — which
 * is how two smoke clients land in different datacenters and actor fanout
 * receives nothing (cycle fifteen, defect 86).
 */
test('GameClientBootstrap query selects the routing fields the server returns', () => {
  const text = print(GameClientBootstrapDocument);
  for (const field of ['gameApiUrl', 'gameApiWsUrl', 'discoveryUrl']) {
    assert.match(text, new RegExp(`\\b${field}\\b`), `missing ${field}`);
  }
});
