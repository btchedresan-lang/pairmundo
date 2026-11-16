// Buying the Family Pass with Apple or Google in-app purchase, through RevenueCat.
// It needs a store build of the app (EAS); in Expo Go and on the web the paywall says payments are coming soon.
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { api } from './api';
import { brand } from './theme';
import { tr } from './i18n';

const sdkKey = () => (Platform.OS === 'ios' ? brand.revenuecatIos : Platform.OS === 'android' ? brand.revenuecatAndroid : '') || '';
const inExpoGo = () => Constants.executionEnvironment === 'storeClient';

let sdk = null;
let configured = false;
const purchases = (userId) => {
  if (!sdk) sdk = require('react-native-purchases').default;
  if (!configured) { sdk.configure({ apiKey: sdkKey(), appUserID: String(userId) }); configured = true; }
  return sdk;
};
const wait = (ms) => new Promise((r) => { setTimeout(r, ms); });

/** True when this copy of the app can take payments for the Family Pass. */
export const paymentsAvailable = () => !!sdkKey() && !inExpoGo() && Platform.OS !== 'web';

/** Tells the server what went wrong with a purchase, so it shows in the server logs. Never fails. */
const report = (stage, productId, e) => api('/family-pass/purchase-error', { method: 'POST', body: {
  stage, product_id: productId, code: e?.code != null ? String(e.code) : null, message: String(e?.message || e || ''),
  underlying: e?.underlyingErrorMessage || null, platform: Platform.OS, os_version: String(Platform.Version || ''),
  app_version: Constants.expoConfig?.version || null,
} }).catch(() => {});

/** The store's price in the person's currency, or null if the store can't say. */
export async function storePrice(pass, userId) {
  if (!paymentsAvailable()) return null;
  try {
    const P = purchases(userId);
    const [product] = await P.getProducts([pass.product_id], P.PRODUCT_CATEGORY.NON_SUBSCRIPTION);
    return product?.priceString ?? null;
  } catch { return null; }
}

/** Asks the server to look for the purchase, a few times, since the store can take a moment to confirm it. */
async function syncAfterPurchase() {
  let last = null;
  for (const delay of [0, 2000, 5000]) {
    if (delay) await wait(delay);
    try { last = await api('/family-pass/sync', { method: 'POST' }); if (last.added || last.pass?.active) return last; }
    catch (e) { last = e; }
  }
  if (last instanceof Error) report('sync', null, last);
  return null;
}

/** Runs the purchase. Resolves 'done' when the pass was bought, 'processing' when the payment went through but the
 *  pass hasn't shown up yet, 'pending' when the store is waiting for approval (Ask to Buy), or false if the person cancelled. */
export async function buyFamilyPass(pass, userId) {
  let P;
  let product;
  try {
    P = purchases(userId);
    await P.logIn(String(userId)); // in case someone else signed in on this phone before
    // The store can fail to answer the first time (for example right after launch); ask once more.
    [product] = await P.getProducts([pass.product_id], P.PRODUCT_CATEGORY.NON_SUBSCRIPTION);
    if (!product) { await wait(1500); [product] = await P.getProducts([pass.product_id], P.PRODUCT_CATEGORY.NON_SUBSCRIPTION); }
  } catch (e) {
    report('products', pass.product_id, e);
    throw new Error(tr("We couldn't reach the App Store. Check your connection and try again."));
  }
  if (!product) {
    report('products', pass.product_id, new Error('Product not returned by the store'));
    throw new Error(tr('The Family Pass is not available in this store yet.'));
  }
  try { await P.purchaseStoreProduct(product); } catch (e) {
    if (e?.userCancelled) return false;
    if (P.PURCHASES_ERROR_CODE && e?.code === P.PURCHASES_ERROR_CODE.PAYMENT_PENDING_ERROR) return 'pending';
    report('purchase', pass.product_id, e);
    throw new Error(e?.message || tr('The purchase did not go through. You have not been charged.'));
  }
  // The payment went through. The server checks it with RevenueCat before the pass starts; RevenueCat's webhook
  // also starts it in the background, so a slow check is not an error.
  return (await syncAfterPurchase()) ? 'done' : 'processing';
}

/** Asks the server to look for purchases made on this account (for example on another phone). */
export const restorePurchases = () => api('/family-pass/sync', { method: 'POST' });
