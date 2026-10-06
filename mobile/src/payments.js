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

/** True when this copy of the app can take payments for the Family Pass. */
export const paymentsAvailable = () => !!sdkKey() && !inExpoGo() && Platform.OS !== 'web';

/** The store's price in the person's currency, or null if the store can't say. */
export async function storePrice(pass, userId) {
  if (!paymentsAvailable()) return null;
  try {
    const P = purchases(userId);
    const [product] = await P.getProducts([pass.product_id], P.PRODUCT_CATEGORY.NON_SUBSCRIPTION);
    return product?.priceString ?? null;
  } catch { return null; }
}

/** Runs the purchase. Resolves true when the pass was bought, false if the person cancelled. */
export async function buyFamilyPass(pass, userId) {
  const P = purchases(userId);
  await P.logIn(String(userId)); // in case someone else signed in on this phone before
  const [product] = await P.getProducts([pass.product_id], P.PRODUCT_CATEGORY.NON_SUBSCRIPTION);
  if (!product) throw new Error(tr('The Family Pass is not available in this store yet.'));
  try { await P.purchaseStoreProduct(product); } catch (e) { if (e?.userCancelled) return false; throw e; }
  // The server checks the purchase with RevenueCat before the pass starts.
  await api('/family-pass/sync', { method: 'POST' });
  return true;
}

/** Asks the server to look for purchases made on this account (for example on another phone). */
export const restorePurchases = () => api('/family-pass/sync', { method: 'POST' });
