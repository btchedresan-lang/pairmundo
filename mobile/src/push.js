// Push notifications for new matches, likes, messages and placement updates.
// Needs an Expo project ID (run `npx eas-cli init` once, or set EAS_PROJECT_ID). Without one, push is skipped quietly.
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { api } from './api';

const supported = Platform.OS !== 'web';
let currentToken = null;

if (supported) {
  // Show notifications even while the app is open.
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
  });
}

/** Asks permission (once), then tells the server where to send this account's notifications. */
export async function registerForPush() {
  if (!supported || !Device.isDevice) return null;
  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (!projectId) return null;
  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', { name: 'Matches and messages', importance: Notifications.AndroidImportance.HIGH });
    }
    let { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') ({ status } = await Notifications.requestPermissionsAsync());
    if (status !== 'granted') return null;
    const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
    await api('/me/push-token', { method: 'POST', body: { token: data } });
    currentToken = data;
    return data;
  } catch (e) {
    console.warn('Push notifications unavailable:', e.message);
    return null;
  }
}

/** The token to forget on sign-out, so this phone stops getting the account's notifications. */
export const pushToken = () => currentToken;

/** Server links look like the website's ("#/messages/12"); turn them into app screens. */
export function screenForLink(link) {
  const m = /^#\/([a-z]+)(?:\/(\d+))?/.exec(String(link || ''));
  if (!m) return null;
  const [, page, id] = m;
  if (page === 'messages' && id) return `/chat/${id}`;
  if (page === 'placements' && id) return `/placement/${id}`;
  return { likes: '/likes', requests: '/likes', matches: '/matches', messages: '/matches', placements: '/placements', profile: '/profile' }[page] ?? null;
}
