// Automatic payouts to flyer distributors through Stripe Connect. Each distributor sets up a connected Express account
// on a page hosted by Stripe (their bank details and ID stay with Stripe), and approved pay is sent to it as a
// transfer from PairMundo's Stripe balance. Stripe then pays it out to their bank on its usual schedule.
// Off unless STRIPE_SECRET_KEY is set and FLYER_PAYOUTS=stripe. Connect must be turned on in the Stripe dashboard,
// and the balance needs money in FLYER_PAYOUT_CURRENCY (default sek) for transfers to go through.

const API = 'https://api.stripe.com/v1';

function form(obj, prefix = '', out = new URLSearchParams()) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}[${k}]` : k;
    if (v && typeof v === 'object') form(v, key, out); else if (v != null) out.append(key, String(v));
  }
  return out;
}

export function createPayouts({ secretKey = process.env.STRIPE_SECRET_KEY, mode = process.env.FLYER_PAYOUTS, currency = process.env.FLYER_PAYOUT_CURRENCY || 'sek',
  platformCountry = process.env.STRIPE_PLATFORM_COUNTRY || 'SE', fetchImpl = fetch } = {}) {
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
  return {
    currency,
    /** A new connected account for a distributor, able to receive transfers. Returns its id. */
    async createAccount({ email, country, name, ambassadorId }) {
      const c = String(country || platformCountry).toUpperCase();
      const a = await call('POST', '/accounts', {
        type: 'express', country: c, email: email || undefined, business_type: 'individual',
        capabilities: { transfers: { requested: true } },
        // Someone in another country than PairMundo's Stripe account can only receive transfers under the recipient agreement.
        ...(c !== platformCountry.toUpperCase() ? { tos_acceptance: { service_agreement: 'recipient' } } : {}),
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
    /** Sends amount (in öre/cents) to the account. The key makes a retry of the same payout send it only once. */
    async transfer({ accountId, amount, key, description, metadata }) {
      const t = await call('POST', '/transfers', { amount, currency, destination: accountId, description, metadata }, key);
      return t.id;
    },
  };
}
