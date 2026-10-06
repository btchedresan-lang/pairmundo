// Buying the Family Pass. The payment provider is plugged in here; until then the paywall says payments are coming soon.

/** True once the app can take payments for the Family Pass. */
export const paymentsAvailable = () => false;

/** Runs the purchase. Resolves true when the pass was bought, false if the person cancelled. */
export async function buyFamilyPass() {
  return false;
}
