// Sign in with Apple (iPhone) and Google (once its client IDs are in brand.json). Both hand the server an ID token;
// the server checks it and either signs the person in or asks once whether they're a family or an au pair.
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as AppleAuthentication from 'expo-apple-authentication';

const extra = Constants.expoConfig?.extra || {};

/** Thrown when the person closes the Apple or Google sheet: not an error to show. */
export class Cancelled extends Error {}

export async function appleAvailable() {
  if (Platform.OS !== 'ios') return false;
  try { return await AppleAuthentication.isAvailableAsync(); } catch { return false; }
}

/** { id_token, name } from Apple. Apple sends the name only the first time someone signs in to the app. */
export async function appleSignIn() {
  try {
    const r = await AppleAuthentication.signInAsync({
      requestedScopes: [AppleAuthentication.AppleAuthenticationScope.FULL_NAME, AppleAuthentication.AppleAuthenticationScope.EMAIL],
    });
    const name = [r.fullName?.givenName, r.fullName?.familyName].filter(Boolean).join(' ');
    return { id_token: r.identityToken, name };
  } catch (e) {
    if (e?.code === 'ERR_REQUEST_CANCELED') throw new Cancelled();
    throw e;
  }
}

// The Google module is only in builds made with the Google client IDs set, so it is loaded only then.
let google = null;
function loadGoogle() {
  if (google || !extra.googleWebClientId || Platform.OS === 'web') return google;
  try {
    const m = require('@react-native-google-signin/google-signin');
    m.GoogleSignin.configure({ webClientId: extra.googleWebClientId, iosClientId: extra.googleIosClientId || undefined });
    google = m;
  } catch { google = null; }
  return google;
}
export const googleAvailable = () => !!loadGoogle();

/** { id_token, name } from Google. */
export async function googleSignIn() {
  const m = loadGoogle();
  if (!m) throw new Error('Google sign-in is not available.');
  if (Platform.OS === 'android') await m.GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
  const r = await m.GoogleSignin.signIn();
  if (r?.type !== 'success' || !r.data?.idToken) throw new Cancelled();
  return { id_token: r.data.idToken, name: r.data.user?.name || '' };
}
