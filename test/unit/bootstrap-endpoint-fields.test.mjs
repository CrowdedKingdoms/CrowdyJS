import assert from 'node:assert/strict';
import test from 'node:test';
import { print } from 'graphql';
import { GameClientBootstrapDocument } from '../../dist/generated/graphql.js';

/**
 * The server has returned the routing URLs and discoveryUrl on gameClientBootstrap since
 * ck-api v1.20.0, named applicationApiUrl / applicationApiWsUrl since v2.85.0 (the gameApi*
 * names are deprecated aliases, kept here as GraphQL aliases of the new fields). A query that does not select them
 * makes every client see null and stay on the shared multivalue name — which
 * is how two smoke clients land in different datacenters and actor fanout
 * receives nothing (cycle fifteen, defect 86).
 */
test('GameClientBootstrap query selects the routing fields the server returns', () => {
  const text = print(GameClientBootstrapDocument);
  for (const field of ['applicationApiUrl', 'applicationApiWsUrl', 'discoveryUrl']) {
    assert.match(text, new RegExp(`\\b${field}\\b`), `missing ${field}`);
  }
});

test('the deprecated gameApi* keys stay filled, as aliases of the Application API fields', () => {
  const text = print(GameClientBootstrapDocument);
  assert.match(text, /\bgameApiUrl: applicationApiUrl\b/);
  assert.match(text, /\bgameApiWsUrl: applicationApiWsUrl\b/);
});
