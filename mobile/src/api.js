// API client for the PairMundo server (the Express app in ../aupair-connect).
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';

const store = Platform.OS === 'web'
  ? { get: async (k) => globalThis.localStorage?.getItem(k) ?? null, set: async (k, v) => globalThis.localStorage?.setItem(k, v), del: async (k) => globalThis.localStorage?.removeItem(k) }
  : { get: (k) => SecureStore.getItemAsync(k), set: (k, v) => SecureStore.setItemAsync(k, v), del: (k) => SecureStore.deleteItemAsync(k) };

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
  await store.set('apiBase', base);
}
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
      headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(`Can't reach the server at ${base}. Check it's running and that your phone is on the same Wi-Fi.`, 0);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.error || `Request failed (${res.status})`, res.status, data);
  return data;
}
