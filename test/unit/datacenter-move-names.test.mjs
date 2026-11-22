import assert from 'node:assert/strict';
import test from 'node:test';
import { moveFromError } from '../../dist/datacenter-redirect.js';

test('a WRONG_DATACENTER move reads the Application API keys', () => {
  const move = moveFromError({
    extensions: {
      code: 'WRONG_DATACENTER',
      applicationApiUrl: 'https://ck-va.dev.crowdedkingdoms.com',
      applicationApiWsUrl: 'wss://ck-va.dev.crowdedkingdoms.com',
      appId: '7',
    },
  });
  assert.equal(move.applicationApiUrl, 'https://ck-va.dev.crowdedkingdoms.com');
  assert.equal(move.applicationApiWsUrl, 'wss://ck-va.dev.crowdedkingdoms.com');
  assert.equal(move.gameApiUrl, move.applicationApiUrl);
});

test('and the gameApi* keys from an Application API older than v2.85.0', () => {
  const move = moveFromError({
    extensions: { code: 'WRONG_DATACENTER', gameApiUrl: 'https://ck-or.dev.crowdedkingdoms.com' },
  });
  assert.equal(move.applicationApiUrl, 'https://ck-or.dev.crowdedkingdoms.com');
  assert.equal(move.applicationApiWsUrl, undefined);
});
