// Automatic payouts to flyer distributors through Stripe Connect. Each distributor sets up a connected Express account
// on a page hosted by Stripe (their bank details and ID stay with Stripe), and approved pay is sent to it as a
// transfer from PairMundo's Stripe balance. Stripe then pays it out to their bank on its usual schedule.
// Off unless STRIPE_SECRET_KEY is set and FLYER_PAYOUTS=stripe. Connect must be turned on in the Stripe dashboard.
// Pay is kept in Swedish öre. Transfers go out in the currency of PairMundo's Stripe balance (the platform account's
// default currency, read from Stripe): in kronor as they are on a Swedish account; on another account, such as a US one
// paying in dollars, converted at the day's European Central Bank rate (Frankfurter), and Stripe converts them back to
// kronor when it pays the distributor's Swedish bank. Distributors outside the platform's country sign Stripe's
// recipient agreement, which is what lets a US platform pay them.

const API = 'https://api.stripe.com/v1';

function form(obj, prefix = '', out = new URLSearchParams()) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}[${k}]` : k;
    if (v && typeof v === 'object') form(v, key, out); else if (v != null) out.append(key, String(v));
  }
  return out;
}

export function createPayouts({ secretKey = process.env.STRIPE_SECRET_KEY, mode = process.env.FLYER_PAYOUTS, fetchImpl = fetch,
  rateUrl = 'https://api.frankfurter.app/latest' } = {}) {
  if (!secretKey || mode !== 'stripe') return null;
  const call = async (method, path, body, idempotencyKey) => {
    const res = await fetchImpl(`${API}${path}`, {
      method,
      headers: { Authorization: `Bearer ${secretKey}`, ...(body ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}), ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}) },
      body: body ? form(body).toString() : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`Stripe ${res.status}: ${data.error?.message || 'request failed'}`);
    return data;
  };
  // PairMundo's own Stripe account: its country and the currency its balance is in.
  let platform = null;
  const platformInfo = async () => {
    if (!platform) {
      const a = await call('GET', '/account');
      platform = { country: String(a.country || 'US').toUpperCase(), currency: String(a.default_currency || 'usd').toLowerCase() };
    }
    return platform;
  };
  return {
    /** A new connected account for a distributor, able to receive transfers. Returns its id. */
    async createAccount({ email, country, name, ambassadorId }) {
      const { country: home } = await platformInfo();
      const c = String(country || home).toUpperCase();
      const a = await call('POST', '/accounts', {
        type: 'express', country: c, email: email || undefined, business_type: 'individual',
        capabilities: { transfers: { requested: true } },
        // Someone in another country than PairMundo's Stripe account can only receive transfers under the recipient agreement.
        ...(c !== home ? { tos_acceptance: { service_agreement: 'recipient' } } : {}),
        business_profile: { product_description: `Flyer delivery for PairMundo${name ? ` (${name})` : ''}` },
        metadata: { ambassador_id: String(ambassadorId) },
      });
      return a.id;
    },
    /** Stripe's page where the distributor enters their bank details and ID. */
    async onboardingLink(accountId, { refreshUrl, returnUrl }) {
      const l = await call('POST', '/account_links', { account: accountId, type: 'account_onboarding', refresh_url: refreshUrl, return_url: returnUrl });
      return l.url;
    },
    /** Whether the account can receive transfers yet. */
    async ready(accountId) {
      const a = await call('GET', `/accounts/${encodeURIComponent(accountId)}`);
      return a.capabilities?.transfers === 'active' && !!a.details_submitted;
    },
    /** What to send for an amount in öre: { currency, amount (in that currency's smallest unit), rate }. */
    async quote(amountOre) {
      const { currency } = await platformInfo();
      if (currency === 'sek') return { currency, amount: amountOre, rate: 1 };
      const res = await fetchImpl(`${rateUrl}?from=SEK&to=${currency.toUpperCase()}`);
      const rate = Number((await res.json().catch(() => ({}))).rates?.[currency.toUpperCase()]);
      if (!res.ok || !(rate > 0)) throw new Error(`Couldn't get today's SEK to ${currency.toUpperCase()} exchange rate`);
      return { currency, amount: Math.round(amountOre * rate), rate };
    },
    /** Sends amount (in the currency's smallest unit) to the account. The key makes a retry send it only once. */
    async transfer({ accountId, amount, currency, key, description, metadata }) {
      const t = await call('POST', '/transfers', { amount, currency, destination: accountId, description, metadata }, key);
      return t.id;
    },
  };
}
