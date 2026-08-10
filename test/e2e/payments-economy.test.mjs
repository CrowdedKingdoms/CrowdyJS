/**
 * Payments / economy user-story e2e.
 *
 * By default this exercises the SAFE read path (a user's own checkouts) and the
 * permission negatives. Creating a real checkout starts a payment-provider
 * (Stripe/PayPal) session, so it only runs when CROWDY_TEST_PAYMENTS=1 is set
 * (use sandbox provider keys — never real charges). Management-only; auto-skips
 * without the management e2e env.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadSdk, entryClientConfig, skipReasonFor, MANAGEMENT_E2E_ENV } from '../helpers.mjs';
import { provisionOwner } from '../provision.mjs';

const skip = skipReasonFor(MANAGEMENT_E2E_ENV);
const paymentsEnabled = process.env.CROWDY_TEST_PAYMENTS === '1';
const rid = () => Math.random().toString(36).slice(2, 10);

test('payments: a signed-in user can list their own checkouts', { skip, timeout: 60_000 }, async () => {
  const { createCrowdyClient } = await loadSdk();
  const client = createCrowdyClient(entryClientConfig());
  const owner = await provisionOwner();
  client.setToken(owner.token);
  try {
    const mine = await client.payments.mine({ limit: 10 });
    assert.ok(Array.isArray(mine?.items), 'myCheckouts returns a page with an items array');
  } finally {
    client.close();
  }
});

test('payments: anonymous cannot list checkouts', { skip, timeout: 60_000 }, async () => {
  const { createCrowdyClient } = await loadSdk();
  const anon = createCrowdyClient(entryClientConfig());
  try {
    await assert.rejects(
      () => anon.payments.mine(),
      (err) => /UNAUTHENTICATED|FORBIDDEN/.test(err?.extensions?.code ?? err?.message ?? ''),
      'anonymous myCheckouts is rejected',
    );
  } finally {
    anon.close();
  }
});

test(
  'payments: ORG_WALLET_TOPUP checkout (sandbox only)',
  { skip: skip ?? (paymentsEnabled ? undefined : 'set CROWDY_TEST_PAYMENTS=1 (sandbox) to run'), timeout: 60_000 },
  async () => {
    const { createCrowdyClient } = await loadSdk();
    const client = createCrowdyClient(entryClientConfig());
    const owner = await provisionOwner();
    client.setToken(owner.token);
    try {
      const slug = `e2e-pay-${rid()}`;
      const org = await client.organizations.create({ name: slug, slug });
      const checkout = await client.payments.create({
        provider: 'STRIPE',
        purpose: 'ORG_WALLET_TOPUP',
        orgId: org.orgId,
        amountCents: '1000',
        currency: 'USD',
      });
      assert.ok(checkout?.checkoutId, 'createCheckout returns a checkout id');
      assert.ok(checkout.externalUrl, 'checkout carries a provider redirect URL');
    } finally {
      client.close();
    }
  },
);
