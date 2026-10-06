// The app's typefaces: Plus Jakarta Sans for text, and Fraunces Soft (Fraunces with its softness axis turned
// all the way up, see assets/fonts) for headings and names. Use Text and TextInput from here instead of react-native:
// they pick the font file that matches the style's fontWeight, since custom fonts can't be made bold on Android.
import { StyleSheet, Text as RNText, TextInput as RNTextInput } from 'react-native';

/** Loaded once in the root layout with useFonts. */
export const FONTS = {
  'PlusJakartaSans-Regular': require('@expo-google-fonts/plus-jakarta-sans/400Regular/PlusJakartaSans_400Regular.ttf'),
  'PlusJakartaSans-Italic': require('@expo-google-fonts/plus-jakarta-sans/400Regular_Italic/PlusJakartaSans_400Regular_Italic.ttf'),
  'PlusJakartaSans-SemiBold': require('@expo-google-fonts/plus-jakarta-sans/600SemiBold/PlusJakartaSans_600SemiBold.ttf'),
  'PlusJakartaSans-Bold': require('@expo-google-fonts/plus-jakarta-sans/700Bold/PlusJakartaSans_700Bold.ttf'),
  'PlusJakartaSans-ExtraBold': require('@expo-google-fonts/plus-jakarta-sans/800ExtraBold/PlusJakartaSans_800ExtraBold.ttf'),
  'FrauncesSoft-Medium': require('../../assets/fonts/FrauncesSoft-Medium.ttf'),
  'FrauncesSoft-SemiBold': require('../../assets/fonts/FrauncesSoft-SemiBold.ttf'),
};

/** Heading font families: HEADING for titles and names, HEADING_BOLD for the brand name and big banners. */
export const HEADING = 'FrauncesSoft-Medium';
export const HEADING_BOLD = 'FrauncesSoft-SemiBold';

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
