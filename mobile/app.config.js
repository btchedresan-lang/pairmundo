// The app's name, store IDs and colours all come from brand.json, so renaming the app is a one-file change.
const brand = require('./brand.json');

module.exports = {
  expo: {
    name: brand.name,
    slug: brand.slug,
    scheme: brand.scheme,
    version: '1.0.0',
    orientation: 'portrait',
    icon: './assets/icon.png',
    userInterfaceStyle: 'automatic',
    ios: { supportsTablet: false, bundleIdentifier: brand.bundleId },
    android: {
      package: brand.bundleId,
      adaptiveIcon: {
        backgroundColor: brand.primary,
        foregroundImage: './assets/android-icon-foreground.png',
        backgroundImage: './assets/android-icon-background.png',
        monochromeImage: './assets/android-icon-monochrome.png',
      },
    },
    web: { favicon: './assets/favicon.png', bundler: 'metro' },
    plugins: [
      'expo-router',
      'expo-image',
      'expo-secure-store',
      ['expo-notifications', { color: brand.primary }],
      ['expo-image-picker', { photosPermission: `${brand.name} needs your photos so you can add them to your profile.` }],
    ],
    extra: {
      // Leave empty to use the computer running `expo start` (port 3000). Set it to your hosted API for real users.
      // The live server by default; set EXPO_PUBLIC_API_URL (or use ⚙ Server on the sign-in screen) to point at another one.
      apiUrl: process.env.EXPO_PUBLIC_API_URL ?? brand.apiUrl ?? '',
      // The Expo project ID (from `npx eas-cli init`), needed for push notifications and store builds.
      ...((process.env.EAS_PROJECT_ID || brand.easProjectId) ? { eas: { projectId: process.env.EAS_PROJECT_ID || brand.easProjectId } } : {}),
    },
  },
};
