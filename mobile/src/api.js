// API client for the PairMundo server (the Express app in ../server).
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { getLang, tr } from './i18n';
import { store } from './storage';

/** Default server: the configured URL, else the computer running the Expo dev server, on port 3000. */
function defaultBase() {
  const configured = Constants.expoConfig?.extra?.apiUrl;
  if (configured) return configured.replace(/\/$/, '');
  const host = (Constants.expoConfig?.hostUri || '').split(':')[0];
  if (host) return `http://${host}:3000`;
  if (Platform.OS === 'web' && globalThis.location) return `${globalThis.location.protocol}//${globalThis.location.hostname}:3000`;
  return 'http://localhost:3000';
}

let base = defaultBase();
let token = null;

export async function loadSession() {
  base = (await store.get('apiBase')) || base;
  token = await store.get('token');
  return { base, token };
}
export const getBase = () => base;
export async function setBase(url) {
  base = String(url || '').trim().replace(/\/$/, '') || defaultBase();
  // Only remember a server someone typed in, so a new default reaches everyone else.
  if (base === defaultBase()) await store.del('apiBase'); else await store.set('apiBase', base);
}
/** True for a server on this computer or local network, where the demo accounts live. */
export const isLocalServer = (url = base) => /^https?:\/\/(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(url);
export async function setToken(t) {
  token = t;
  if (t) await store.set('token', t); else await store.del('token');
}

/** Turn a server path like /uploads/x.jpg into a full URL. */
export const imageUrl = (p) => (!p ? null : /^(https?:|data:)/.test(p) ? p : `${base}${p}`);

export class ApiError extends Error {
  constructor(message, status, data) { super(message); this.status = status; this.data = data; }
}

export async function api(path, { method = 'GET', body } = {}) {
  let res;
  try {
    res = await fetch(`${base}/api${path}`, {
      method,
      headers: { 'Accept-Language': getLang(), ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(tr("Can't reach the server at {base}. Check it's running and that your phone is on the same Wi-Fi.", { base }), 0);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.error ? tr(data.error) : tr('Request failed ({status})', { status: res.status }), res.status, data);
  return data;
}
