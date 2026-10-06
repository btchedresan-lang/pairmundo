// Small key-value store: the phone's secure storage, or localStorage in the web preview.
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

export const store = Platform.OS === 'web'
  ? { get: async (k) => globalThis.localStorage?.getItem(k) ?? null, set: async (k, v) => globalThis.localStorage?.setItem(k, v), del: async (k) => globalThis.localStorage?.removeItem(k) }
  : { get: (k) => SecureStore.getItemAsync(k), set: (k, v) => SecureStore.setItemAsync(k, v), del: (k) => SecureStore.deleteItemAsync(k) };
