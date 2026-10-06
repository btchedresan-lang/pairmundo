import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, View } from 'react-native';
import { Text } from '../components/Text';
import { Link } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../auth';
import { getBase, isLocalServer, setBase } from '../api';
import { Alert, Button, Field, Screen, T } from '../components/ui';
import { brand, C } from '../theme';

const DEMO = [['Host family', 'millers@aupair.test'], ['Au pair', 'maria@aupair.test']];

export default function Login() {
  const { signIn, signOut } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [server, setServer] = useState(getBase());
  const [showServer, setShowServer] = useState(false);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);

  const go = async (e = email, p = password) => {
    setErr(null); setBusy(true);
    try {
      await setBase(server);
      const me = await signIn('/auth/login', { email: e.trim(), password: p });
      if (me.user.role === 'admin') { await signOut(); setErr('Admin tools are in the web app. Sign in there instead.'); }
    } catch (x) { setErr(x.message); } finally { setBusy(false); }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen padded={false}>
        <LinearGradient colors={[C.primary, C.primary2]} style={{ paddingTop: 90, paddingBottom: 40, paddingHorizontal: 24, alignItems: 'center', gap: 8 }}>
          <Text style={{ fontSize: 52 }}>🌍</Text>
          <Text style={{ color: '#fff', fontSize: 32, fontWeight: '900' }}>{brand.name}</Text>
          <Text style={{ color: '#fff', fontSize: 16, opacity: 0.95, textAlign: 'center' }}>{brand.tagline}</Text>
        </LinearGradient>
        <View style={{ padding: 20, gap: 14 }}>
          <Field label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" placeholder="you@example.com" />
          <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry placeholder="At least 8 characters" />
          {err ? <Alert level="error" text={err} /> : null}
          <Button title="Sign in" onPress={() => go()} loading={busy} />
          <Link href={{ pathname: '/forgot', params: { email: email.trim() } }} asChild><Pressable><T small style={{ color: C.primary, textAlign: 'center' }}>Forgot password?</T></Pressable></Link>
          <Link href="/register" asChild><Button title="Create an account" kind="secondary" /></Link>
          {isLocalServer(server) ? <>
            <T small muted style={{ textAlign: 'center', marginTop: 6 }}>Try a demo account (password password123):</T>
            <View style={{ flexDirection: 'row', gap: 10, justifyContent: 'center' }}>
              {DEMO.map(([label, e]) => <Button key={e} small kind="ghost" title={label} onPress={() => { setEmail(e); setPassword('password123'); go(e, 'password123'); }} />)}
            </View>
          </> : null}
          <Pressable onPress={() => setShowServer(!showServer)}><T small muted style={{ textAlign: 'center' }}>⚙ Server: {server}</T></Pressable>
          {showServer ? <Field label="Server address" value={server} onChangeText={setServer} autoCapitalize="none" keyboardType="url" placeholder="http://192.168.1.20:3000" /> : null}
        </View>
      </Screen>
    </KeyboardAvoidingView>
  );
}
