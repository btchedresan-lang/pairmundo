import { useState } from 'react';
import { Linking } from 'react-native';
import { getBase } from '../api';
import { useAuth } from '../auth';
import { Alert, Button, ChoiceChips, Field, Screen, T } from '../components/ui';
import { CountryPicker } from '../components/pickers';
import { C } from '../theme';

export default function Register() {
  const { signIn } = useAuth();
  const [f, setF] = useState({ role: 'family', name: '', country: null, city: '', email: '', password: '' });
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v }));
  const submit = async () => {
    setErr(null); setBusy(true);
    try { await signIn('/auth/register', { ...f, email: f.email.trim() }); }
    catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <Screen>
      <ChoiceChips label="I am" options={{ family: '🏡 A host family', aupair: '🎒 An au pair' }} value={f.role} onChange={(v) => v && set('role')(v)} />
      <Field label="Name" value={f.name} onChangeText={set('name')} placeholder={f.role === 'family' ? 'The Smith Family' : 'Maria Lopez'} />
      <CountryPicker label="Country you live in" value={f.country} onChange={set('country')} />
      <Field label="City" value={f.city} onChangeText={set('city')} />
      <Field label="Email" value={f.email} onChangeText={set('email')} keyboardType="email-address" autoCapitalize="none" />
      <Field label="Password" value={f.password} onChangeText={set('password')} secureTextEntry placeholder="At least 8 characters" />
      {err ? <Alert level="error" text={err} /> : null}
      <Button title="Create account" onPress={submit} loading={busy} />
      <T small muted style={{ textAlign: 'center' }}>
        {'By creating an account you agree to the '}
        <T small style={{ color: C.primary }} onPress={() => Linking.openURL(`${getBase()}/terms`)}>Terms of Use</T>
        {' and '}
        <T small style={{ color: C.primary }} onPress={() => Linking.openURL(`${getBase()}/privacy`)}>Privacy Policy</T>.
      </T>
      <T small muted style={{ textAlign: 'center' }}>{"We'll email you a code to confirm your address. Then add photos: profiles with photos get far more matches."}</T>
    </Screen>
  );
}
