/**
 * Empty-wallet copy must stay specific. Dest used to hide this as PLATFORM_ERROR.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

const {
  explainInvokeFundsNeeded,
  formatWalletNeedsFundsLabel,
  playerComputeNeedsFunds,
} = await import('../../dist/crowdy-studio/funds-needed.js');

test('playerComputeNeedsFunds is true for a non-positive wallet or gated reason', () => {
  assert.equal(playerComputeNeedsFunds({ wallet: { balanceCents: '-8' } }), true);
  assert.equal(playerComputeNeedsFunds({ wallet: { balanceCents: '0' } }), true);
  assert.equal(
    playerComputeNeedsFunds({ usage: { gateReason: 'PLAYER_WALLET_EMPTY' } }),
    true,
  );
  assert.equal(playerComputeNeedsFunds({ wallet: { balanceCents: '250' } }), false);
});

test('footer label names the top-up instead of a mute balance', () => {
  assert.match(
    formatWalletNeedsFundsLabel({ balanceCents: '-8', currency: 'USD' }),
    /top up to run/i,
  );
});

test('PLATFORM_ERROR plus an empty wallet becomes a funds message', () => {
  const text = explainInvokeFundsNeeded(
    'PLATFORM_ERROR: Something went wrong on our side. Please try again.\nOurs. If it repeats, it is worth reporting with the flow id from gameModelEvents.',
    { wallet: { balanceCents: '-8', currency: 'usd' } },
  );
  assert.ok(text);
  assert.match(text, /wallet needs funds/i);
  assert.doesNotMatch(text, /something went wrong on our side/i);
});

test('a real platform error is left alone when the wallet is funded', () => {
  assert.equal(
    explainInvokeFundsNeeded(
      'PLATFORM_ERROR: Something went wrong on our side. Please try again.',
      { wallet: { balanceCents: '500', currency: 'usd' } },
    ),
    null,
  );
});
