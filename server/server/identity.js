// ID check through Stripe Identity: the person photographs their passport or ID card and takes a selfie on a
// page hosted by Stripe; Stripe tells us the result and the profile gets its "ID verified" badge.
// Needs STRIPE_SECRET_KEY (and STRIPE_WEBHOOK_SECRET for instant results). Without a key the feature is off.
// We only keep the session id and its status; Stripe keeps the documents.
import { createHmac, timingSafeEqual } from 'node:crypto';

const API = 'https://api.stripe.com/v1';

/** Stripe's form encoding, including nested keys like options[document][require_matching_selfie]. */
function form(obj, prefix = '', out = new URLSearchParams()) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}[${k}]` : k;
    if (v && typeof v === 'object') form(v, key, out); else if (v != null) out.append(key, String(v));
  }
  return out;
}

/** A minimal Stripe API caller: call('POST', '/checkout/sessions', { ... }). */
export function stripeApi(secretKey, fetchImpl = fetch) {
  return async (method, path, body) => {
    const res = await fetchImpl(`${API}${path}`, {
      method, headers: { Authorization: `Bearer ${secretKey}`, ...(body ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}) },
      body: body ? form(body).toString() : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`Stripe ${res.status}: ${data.error?.message || 'request failed'}`);
    return data;
  };
}

export function createIdentity({ secretKey = process.env.STRIPE_SECRET_KEY, fetchImpl = fetch } = {}) {
  if (!secretKey) return null;
  const call = stripeApi(secretKey, fetchImpl);
  return {
    /** Starts a check and returns { id, url, status }; url is Stripe's page to open on the phone. */
    async start(user, returnUrl) {
      const s = await call('POST', '/identity/verification_sessions', {
        type: 'document',
        options: { document: { require_matching_selfie: true, require_live_capture: true } },
        provided_details: { email: user.email },
        client_reference_id: String(user.id),
        metadata: { user_id: String(user.id) },
        return_url: returnUrl,
      });
      return { id: s.id, url: s.url, status: s.status };
    },
    /** Latest status: requires_input, processing, verified or canceled. */
    async status(id) {
      const s = await call('GET', `/identity/verification_sessions/${encodeURIComponent(id)}`);
      return { status: s.status, error: s.last_error?.code || null };
    },
  };
}

/** Checks a Stripe-Signature header against the raw request body. Returns the parsed event, or null. */
export function verifyWebhook(rawBody, header, secret, toleranceSec = 300) {
  if (!secret || !header) return null;
  const parts = Object.fromEntries(String(header).split(',').map((p) => p.split('=')).filter((p) => p.length === 2).map(([k, v]) => [k, v]));
  const sigs = String(header).split(',').filter((p) => p.startsWith('v1=')).map((p) => p.slice(3));
  const t = Number(parts.t);
  if (!t || !sigs.length || Math.abs(Date.now() / 1000 - t) > toleranceSec) return null;
  const expected = createHmac('sha256', secret).update(`${t}.${rawBody}`).digest('hex');
  const ok = sigs.some((s) => s.length === expected.length && timingSafeEqual(Buffer.from(s), Buffer.from(expected)));
  if (!ok) return null;
  try { return JSON.parse(rawBody); } catch { return null; }
}

/**
 * Family Pass card payments on the website through Stripe Checkout (a one-off payment, no subscription).
 * Off without STRIPE_SECRET_KEY.
 */
export function createCheckout({ secretKey = process.env.STRIPE_SECRET_KEY, fetchImpl = fetch } = {}) {
  if (!secretKey) return null;
  const call = stripeApi(secretKey, fetchImpl);
  return {
    /** Returns { id, url } for Stripe's payment page. */
    async start(user, { amount, currency, name, successUrl, cancelUrl }) {
      const s = await call('POST', '/checkout/sessions', {
        mode: 'payment',
        line_items: { 0: { quantity: 1, price_data: { currency, unit_amount: amount, product_data: { name } } } },
        customer_email: user.email,
        client_reference_id: String(user.id),
        metadata: { user_id: String(user.id), product: 'family_pass' },
        success_url: successUrl,
        cancel_url: cancelUrl,
      });
      return { id: s.id, url: s.url };
    },
    /** { paid, userId } for a finished payment page. */
    async result(id) {
      const s = await call('GET', `/checkout/sessions/${encodeURIComponent(id)}`);
      return { paid: s.payment_status === 'paid', userId: Number(s.metadata?.user_id || s.client_reference_id) || null };
    },
  };
}
