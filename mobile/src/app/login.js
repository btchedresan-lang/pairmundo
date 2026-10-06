import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, Text, View } from 'react-native';
import { Link } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../auth';
import { getBase, isLocalServer, setBase } from '../api';
import { Alert, Button, Field, Screen, T } from '../components/ui';
import { brand, C } from '../theme';
import { tr } from '../i18n';

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
      if (me.user.role === 'admin') { await signOut(); setErr(tr('Admin tools are in the web app. Sign in there instead.')); }
    } catch (x) { setErr(x.message); } finally { setBusy(false); }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen padded={false}>
        <LinearGradient colors={[C.primary, C.primary2]} style={{ paddingTop: 90, paddingBottom: 40, paddingHorizontal: 24, alignItems: 'center', gap: 8 }}>
          <Text style={{ fontSize: 52 }}>🌍</Text>
          <Text style={{ color: '#fff', fontSize: 32, fontWeight: '900' }}>{brand.name}</Text>
          <Text style={{ color: '#fff', fontSize: 16, opacity: 0.95, textAlign: 'center' }}>{tr(brand.tagline)}</Text>
        </LinearGradient>
        <View style={{ padding: 20, gap: 14 }}>
          <Field label={tr('Email')} value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" placeholder="you@example.com" />
          <Field label={tr('Password')} value={password} onChangeText={setPassword} secureTextEntry placeholder={tr('At least 8 characters')} />
          {err ? <Alert level="error" text={err} /> : null}
          <Button title={tr('Sign in')} onPress={() => go()} loading={busy} />
          <Link href={{ pathname: '/forgot', params: { email: email.trim() } }} asChild><Pressable><T small style={{ color: C.primary, textAlign: 'center' }}>{tr('Forgot password?')}</T></Pressable></Link>
          <Link href="/register" asChild><Button title={tr('Create an account')} kind="secondary" /></Link>
          {isLocalServer(server) ? <>
            <T small muted style={{ textAlign: 'center', marginTop: 6 }}>{tr('Try a demo account (password {password}):', { password: 'password123' })}</T>
            <View style={{ flexDirection: 'row', gap: 10, justifyContent: 'center' }}>
              {DEMO.map(([label, e]) => <Button key={e} small kind="ghost" title={tr(label)} onPress={() => { setEmail(e); setPassword('password123'); go(e, 'password123'); }} />)}
            </View>
          </> : null}
          <Pressable onPress={() => setShowServer(!showServer)}><T small muted style={{ textAlign: 'center' }}>⚙ {tr('Server')}: {server}</T></Pressable>
          {showServer ? <Field label={tr('Server address')} value={server} onChangeText={setServer} autoCapitalize="none" keyboardType="url" placeholder="http://192.168.1.20:3000" /> : null}
        </View>
      </Screen>
    </KeyboardAvoidingView>
  );
}
