// Apple and Google in-app purchases arrive through RevenueCat (https://www.revenuecat.com).
// Off until REVENUECAT_SECRET_KEY is set; its webhook also needs REVENUECAT_WEBHOOK_AUTH.
import { timingSafeEqual } from 'node:crypto';

const STORES = { APP_STORE: 'app_store', app_store: 'app_store', PLAY_STORE: 'play_store', play_store: 'play_store' };

export function createRevenueCat({ secretKey = process.env.REVENUECAT_SECRET_KEY, fetchImpl = fetch } = {}) {
  if (!secretKey) return null;
  return {
    /** The one-off purchases of an account: [{ ref, store, product, purchasedAt }]. */
    async purchases(appUserId) {
      const res = await fetchImpl(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(appUserId)}`, {
        headers: { Authorization: `Bearer ${secretKey}`, Accept: 'application/json' },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || `RevenueCat error ${res.status}`);
      const out = [];
      for (const [product, list] of Object.entries(data.subscriber?.non_subscriptions || {})) {
        for (const p of list || []) {
          out.push({ ref: String(p.store_transaction_id || p.id), store: STORES[p.store] || 'app_store', product, purchasedAt: p.purchase_date || null });
        }
      }
      return out;
    },
  };
}

/** RevenueCat sends the Authorization header you type in its dashboard; compare it in constant time. */
export function webhookAuthorized(header, expected = process.env.REVENUECAT_WEBHOOK_AUTH) {
  if (!expected || !header) return false;
  const a = Buffer.from(String(header)); const b = Buffer.from(String(expected));
  const bearer = Buffer.from(`Bearer ${expected}`);
  return (a.length === b.length && timingSafeEqual(a, b)) || (a.length === bearer.length && timingSafeEqual(a, bearer));
}

export const storeName = (s) => STORES[s] || 'app_store';
