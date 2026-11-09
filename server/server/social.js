// Sign in with Apple and Google: checks the ID token the phone gets from Apple or Google, so the server knows the
// person's verified email without a password or an email code.
//   APPLE_AUDIENCES    the iOS bundle ID(s) the token is issued for. Default com.pairmundo.app (plus Expo Go's host.exp.Exponent).
//   GOOGLE_CLIENT_IDS  the Google OAuth client IDs (iOS, Android and web), comma separated. Google sign-in is off until set.
import { createPublicKey, createVerify } from 'node:crypto';

const PROVIDERS = {
  apple: { jwks: 'https://appleid.apple.com/auth/keys', issuers: ['https://appleid.apple.com'],
    audiences: () => list(process.env.APPLE_AUDIENCES || 'com.pairmundo.app,host.exp.Exponent') },
  google: { jwks: 'https://www.googleapis.com/oauth2/v3/certs', issuers: ['https://accounts.google.com', 'accounts.google.com'],
    audiences: () => list(process.env.GOOGLE_CLIENT_IDS) },
};
const list = (s) => String(s || '').split(',').map((x) => x.trim()).filter(Boolean);
const b64json = (part) => JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));

export class SocialError extends Error {}

/** Returns verify(provider, idToken) → { sub, email, email_verified }; throws SocialError when the token isn't valid. */
export function createSocial({ fetchImpl = (...a) => fetch(...a), now = () => Date.now() } = {}) {
  const cache = new Map(); // provider → { keys, at }
  const keysFor = async (provider, kid, fresh = false) => {
    const c = cache.get(provider);
    if (!fresh && c && now() - c.at < 6 * 3600 * 1000 && c.keys.some((k) => k.kid === kid)) return c.keys;
    const res = await fetchImpl(PROVIDERS[provider].jwks);
    if (!res.ok) throw new SocialError(`Couldn't reach ${provider} to check the sign-in.`);
    const { keys = [] } = await res.json();
    cache.set(provider, { keys, at: now() });
    return keys;
  };

  const verify = async (provider, idToken) => {
    const p = PROVIDERS[provider];
    if (!p) throw new SocialError('Unknown sign-in provider.');
    const audiences = p.audiences();
    if (!audiences.length) throw new SocialError('This sign-in option is not set up yet.');
    const parts = String(idToken || '').split('.');
    if (parts.length !== 3) throw new SocialError('That sign-in did not work. Try again.');
    let header; let claims;
    try { header = b64json(parts[0]); claims = b64json(parts[1]); } catch { throw new SocialError('That sign-in did not work. Try again.'); }
    if (header.alg !== 'RS256') throw new SocialError('That sign-in did not work. Try again.');
    let jwk = (await keysFor(provider, header.kid)).find((k) => k.kid === header.kid);
    // The provider rotates its keys; fetch again once if this one is new.
    if (!jwk) jwk = (await keysFor(provider, header.kid, true)).find((k) => k.kid === header.kid);
    if (!jwk) throw new SocialError('That sign-in did not work. Try again.');
    const ok = createVerify('RSA-SHA256').update(`${parts[0]}.${parts[1]}`).verify(createPublicKey({ key: jwk, format: 'jwk' }), Buffer.from(parts[2], 'base64url'));
    if (!ok) throw new SocialError('That sign-in did not work. Try again.');
    const t = Math.floor(now() / 1000);
    if (!p.issuers.includes(claims.iss)) throw new SocialError('That sign-in did not work. Try again.');
    const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    if (!aud.some((a) => audiences.includes(a))) throw new SocialError('That sign-in did not work. Try again.');
    if (!claims.exp || claims.exp < t - 60) throw new SocialError('That sign-in expired. Try again.');
    if (!claims.sub) throw new SocialError('That sign-in did not work. Try again.');
    // Apple sends email_verified as a string.
    const emailVerified = claims.email_verified === true || claims.email_verified === 'true';
    return { sub: String(claims.sub), email: claims.email ? String(claims.email) : null, email_verified: emailVerified };
  };
  return verify;
}

/** Which providers the server can check: shown to the app so it only offers buttons that work. */
export const socialProviders = () => Object.keys(PROVIDERS).filter((k) => PROVIDERS[k].audiences().length);
