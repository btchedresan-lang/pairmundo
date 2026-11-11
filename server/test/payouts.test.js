import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPayouts } from '../server/payouts.js';

/** A fetch that answers like Stripe and Frankfurter, and remembers each request. */
const fakeFetch = (account, rates = { USD: 0.095 }) => {
  const calls = [];
  const fn = async (url, opts = {}) => {
    calls.push({ url, method: opts.method || 'GET', body: opts.body ? Object.fromEntries(new URLSearchParams(opts.body)) : null, headers: opts.headers || {} });
    const json = url.endsWith('/v1/account') ? account
      : url.includes('frankfurter') ? { rates }
        : url.endsWith('/v1/accounts') ? { id: 'acct_new' } : url.endsWith('/v1/transfers') ? { id: 'tr_1' } : {};
    return { ok: true, json: async () => json };
  };
  fn.calls = calls;
  return fn;
};

test('payouts: off unless FLYER_PAYOUTS=stripe and a key are set', () => {
  assert.equal(createPayouts({ secretKey: 'sk_test', mode: undefined }), null);
  assert.equal(createPayouts({ secretKey: undefined, mode: 'stripe' }), null);
});

test('payouts: a US platform pays a Swedish distributor in dollars under the recipient agreement', async () => {
  const f = fakeFetch({ country: 'US', default_currency: 'usd' });
  const p = createPayouts({ secretKey: 'sk_test', mode: 'stripe', fetchImpl: f });
  assert.equal(await p.createAccount({ email: 'nils@test.io', country: 'SE', name: 'Nils', ambassadorId: 7 }), 'acct_new');
  const acct = f.calls.find((c) => c.url.endsWith('/v1/accounts')).body;
  assert.deepEqual([acct.type, acct.country, acct['capabilities[transfers][requested]'], acct['tos_acceptance[service_agreement]']], ['express', 'SE', 'true', 'recipient']);
  // 500 kr at 0.095 USD a krona is US$47.50.
  assert.deepEqual(await p.quote(50000), { currency: 'usd', amount: 4750, rate: 0.095 });
  assert.match(f.calls.find((c) => c.url.includes('frankfurter')).url, /from=SEK&to=USD/);
  await p.transfer({ accountId: 'acct_new', amount: 4750, currency: 'usd', key: 'flyer-payout-1' });
  const t = f.calls.find((c) => c.url.endsWith('/v1/transfers'));
  assert.deepEqual([t.body.amount, t.body.currency, t.body.destination, t.headers['Idempotency-Key']], ['4750', 'usd', 'acct_new', 'flyer-payout-1']);
  // No rate, no transfer.
  const broken = createPayouts({ secretKey: 'sk_test', mode: 'stripe', fetchImpl: fakeFetch({ country: 'US', default_currency: 'usd' }, {}) });
  await assert.rejects(broken.quote(100), /exchange rate/);
});

test('payouts: a Swedish platform pays in kronor as they are, with the full agreement', async () => {
  const f = fakeFetch({ country: 'SE', default_currency: 'sek' });
  const p = createPayouts({ secretKey: 'sk_test', mode: 'stripe', fetchImpl: f });
  await p.createAccount({ country: 'SE', ambassadorId: 1 });
  assert.equal(f.calls.find((c) => c.url.endsWith('/v1/accounts')).body['tos_acceptance[service_agreement]'], undefined);
  assert.deepEqual(await p.quote(12345), { currency: 'sek', amount: 12345, rate: 1 });
  assert.ok(!f.calls.some((c) => c.url.includes('frankfurter')));
});
