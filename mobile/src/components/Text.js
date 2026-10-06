// The app's typeface, Plus Jakarta Sans. Use Text and TextInput from here instead of react-native:
// they pick the font file that matches the style's fontWeight, since custom fonts can't be made bold on Android.
import { StyleSheet, Text as RNText, TextInput as RNTextInput } from 'react-native';

/** Loaded once in the root layout with useFonts. */
export const FONTS = {
  'PlusJakartaSans-Regular': require('@expo-google-fonts/plus-jakarta-sans/400Regular/PlusJakartaSans_400Regular.ttf'),
  'PlusJakartaSans-Italic': require('@expo-google-fonts/plus-jakarta-sans/400Regular_Italic/PlusJakartaSans_400Regular_Italic.ttf'),
  'PlusJakartaSans-SemiBold': require('@expo-google-fonts/plus-jakarta-sans/600SemiBold/PlusJakartaSans_600SemiBold.ttf'),
  'PlusJakartaSans-Bold': require('@expo-google-fonts/plus-jakarta-sans/700Bold/PlusJakartaSans_700Bold.ttf'),
  'PlusJakartaSans-ExtraBold': require('@expo-google-fonts/plus-jakarta-sans/800ExtraBold/PlusJakartaSans_800ExtraBold.ttf'),
};

/** The font family for a weight, e.g. font('700') for headings in navigation options. */
export function font(weight = '400', italic = false) {
  const w = weight === 'bold' ? 700 : Number(weight) || 400;
  if (italic && w < 600) return 'PlusJakartaSans-Italic';
  return w >= 800 ? 'PlusJakartaSans-ExtraBold' : w >= 700 ? 'PlusJakartaSans-Bold' : w >= 600 ? 'PlusJakartaSans-SemiBold' : 'PlusJakartaSans-Regular';
}

function withFont(style) {
  const s = StyleSheet.flatten(style) || {};
  if (s.fontFamily) return style;
  const { fontWeight, fontStyle, ...rest } = s;
  return [rest, { fontFamily: font(fontWeight, fontStyle === 'italic') }];
}

export const Text = ({ style, ...props }) => <RNText {...props} style={withFont(style)} />;
export const TextInput = ({ style, ...props }) => <RNTextInput {...props} style={withFont(style)} />;
