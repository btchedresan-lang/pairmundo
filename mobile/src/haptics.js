// Small taps in the hand at the moments that matter: a swipe passing the point where it counts, a like or pass
// going through, and a match. Silent on the web and on phones without haptics.
import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';

const on = Platform.OS === 'ios' || Platform.OS === 'android';
const safe = (fn) => () => { if (on) fn().catch(() => {}); };

export const haptic = {
  /** A swipe just crossed the line where letting go counts. */
  tick: safe(() => Haptics.selectionAsync()),
  /** A like, pass or super like went through. */
  swipe: safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  /** A button press that does something important. */
  press: safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft)),
  /** It's a match. */
  match: safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
};
