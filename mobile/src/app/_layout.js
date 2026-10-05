import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from '../auth';
import { Loading } from '../components/ui';
import { C, useTheme } from '../theme';

function RootStack() {
  const { me, ready } = useAuth();
  const t = useTheme();
  if (!ready) return <Loading />;
  const signedIn = !!me;
  return (
    <Stack screenOptions={{ headerTintColor: C.primary, headerStyle: { backgroundColor: t.card }, headerTitleStyle: { color: t.ink }, contentStyle: { backgroundColor: t.bg }, headerBackButtonDisplayMode: 'minimal' }}>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="login" options={{ headerShown: false }} />
        <Stack.Screen name="register" options={{ title: 'Create account' }} />
        <Stack.Screen name="forgot" options={{ title: 'Forgot password' }} />
      </Stack.Protected>
      <Stack.Protected guard={signedIn}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="user/[id]" options={{ title: '' }} />
        <Stack.Screen name="chat/[id]" options={{ title: 'Chat' }} />
        <Stack.Screen name="placement/[id]" options={{ title: 'Placement' }} />
        <Stack.Screen name="new-placement/[id]" options={{ title: 'Propose placement', presentation: 'modal' }} />
        <Stack.Screen name="verify-email" options={{ title: 'Confirm email' }} />
        <Stack.Screen name="account" options={{ title: 'Account and safety' }} />
      </Stack.Protected>
      <Stack.Screen name="programs/index" options={{ title: 'Country programs' }} />
      <Stack.Screen name="programs/[code]" options={{ title: 'Program' }} />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <StatusBar style="auto" />
        <RootStack />
      </AuthProvider>
    </SafeAreaProvider>
  );
}
