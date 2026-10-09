import { useEffect } from 'react';
import { Platform } from 'react-native';
import { Stack, router } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from '../auth';
import { Loading } from '../components/ui';
import { C, useTheme } from '../theme';
import { screenForLink } from '../push';
import { FONTS, HEADING } from '../components/Text';
import { LanguageProvider, tr, useLanguage } from '../i18n';

/** Tapping a notification opens the chat, placement or tab it is about. */
function NotificationOpener() {
  const response = Notifications.useLastNotificationResponse();
  useEffect(() => {
    if (!response || response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
    const screen = screenForLink(response.notification.request.content.data?.link);
    Notifications.clearLastNotificationResponse();
    if (screen) router.push(screen);
  }, [response]);
  return null;
}

function RootStack() {
  const { me, ready } = useAuth();
  const { lang } = useLanguage();
  const t = useTheme();
  if (!ready) return <Loading />;
  const signedIn = !!me;
  return (
    <>
    {signedIn && Platform.OS !== 'web' ? <NotificationOpener /> : null}
    {/* Keyed by language so every screen redraws in the new one. */}
    <Stack key={lang} screenOptions={{ headerTintColor: C.primary, headerStyle: { backgroundColor: t.card }, headerTitleStyle: { color: t.ink, fontFamily: HEADING, fontSize: 19 }, contentStyle: { backgroundColor: t.bg }, headerBackButtonDisplayMode: 'minimal' }}>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="login" options={{ headerShown: false }} />
        <Stack.Screen name="register" options={{ title: tr('Create account') }} />
        <Stack.Screen name="forgot" options={{ title: tr('Forgot password') }} />
      </Stack.Protected>
      <Stack.Protected guard={signedIn}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="setup" options={{ headerShown: false, gestureEnabled: false }} />
        <Stack.Screen name="user/[id]" options={{ title: '' }} />
        <Stack.Screen name="chat/[id]" options={{ title: tr('Chat') }} />
        <Stack.Screen name="placement/[id]" options={{ title: tr('Placement') }} />
        <Stack.Screen name="agreement/[id]" options={{ title: tr('Au pair agreement') }} />
        <Stack.Screen name="new-placement/[id]" options={{ title: tr('Propose placement'), presentation: 'modal' }} />
        <Stack.Screen name="verify-email" options={{ title: tr('Confirm email') }} />
        <Stack.Screen name="family-pass" options={{ title: 'Family Pass', presentation: 'modal' }} />
        <Stack.Screen name="account" options={{ title: tr('Account and safety') }} />
      </Stack.Protected>
      <Stack.Screen name="programs/index" options={{ title: tr('Country programs') }} />
      <Stack.Screen name="programs/[code]" options={{ title: tr('Program') }} />
    </Stack>
    </>
  );
}

export default function RootLayout() {
  // Wait for the app's font so text doesn't jump; if it can't load, carry on with the system font.
  const [fontsLoaded, fontError] = useFonts(FONTS);
  if (!fontsLoaded && !fontError) return null;
  return (
    <SafeAreaProvider>
      <LanguageProvider>
        <AuthProvider>
          <StatusBar style="dark" />
          <RootStack />
        </AuthProvider>
      </LanguageProvider>
    </SafeAreaProvider>
  );
}
