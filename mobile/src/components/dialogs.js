import { Alert as RNAlert, Platform } from 'react-native';
import { tr } from '../i18n';

/** Yes/no question. Resolves true when the person confirms. */
export function confirmAsync(title, message, okText = tr('OK'), destructive = false) {
  if (Platform.OS === 'web') return Promise.resolve(!!globalThis.confirm?.(message ? `${title}\n\n${message}` : title));
  return new Promise((resolve) => RNAlert.alert(title, message, [
    { text: tr('Cancel'), style: 'cancel', onPress: () => resolve(false) },
    { text: okText, style: destructive ? 'destructive' : 'default', onPress: () => resolve(true) },
  ], { cancelable: true, onDismiss: () => resolve(false) }));
}

/** Pick one of a few actions, e.g. from a "⋯" menu. Resolves the chosen key, or null. */
export function chooseAsync(title, options) {
  if (Platform.OS === 'web') {
    // Browsers have no action sheet; ask about each option in turn.
    for (const o of options) if (globalThis.confirm?.(`${o.label}?`)) return Promise.resolve(o.key);
    return Promise.resolve(null);
  }
  return new Promise((resolve) => RNAlert.alert(title, undefined, [
    ...options.map((o) => ({ text: o.label, style: o.destructive ? 'destructive' : 'default', onPress: () => resolve(o.key) })),
    { text: tr('Cancel'), style: 'cancel', onPress: () => resolve(null) },
  ], { cancelable: true, onDismiss: () => resolve(null) }));
}
