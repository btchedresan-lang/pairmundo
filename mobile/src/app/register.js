import { useState } from 'react';
import { Linking } from 'react-native';
import { getBase } from '../api';
import { useAuth } from '../auth';
import { Alert, Button, ChoiceChips, Field, Screen, T } from '../components/ui';
import { CountryPicker } from '../components/pickers';
import { C } from '../theme';
import { tr } from '../i18n';

export default function Register() {
  const { signIn } = useAuth();
  const [f, setF] = useState({ role: 'family', name: '', country: null, city: '', email: '', password: '', ref_code: '' });
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v }));
  const submit = async () => {
    setErr(null); setBusy(true);
    try { await signIn('/auth/register', { ...f, email: f.email.trim(), ref_code: f.ref_code.trim() }); }
    catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <Screen>
      <ChoiceChips label={tr('I am')} options={{ family: `🏡 ${tr('A host family')}`, aupair: `🎒 ${tr('An au pair')}` }} value={f.role} onChange={(v) => v && set('role')(v)} />
      <Field label={tr('Name')} value={f.name} onChangeText={set('name')} placeholder={f.role === 'family' ? tr('The Smith Family') : 'Maria Lopez'} />
      <CountryPicker label={tr('Country you live in')} value={f.country} onChange={set('country')} />
      <Field label={tr('City')} value={f.city} onChangeText={set('city')} />
      <Field label={tr('Email')} value={f.email} onChangeText={set('email')} keyboardType="email-address" autoCapitalize="none" />
      <Field label={tr('Password')} value={f.password} onChangeText={set('password')} secureTextEntry placeholder={tr('At least 8 characters')} />
      {/* An ambassador's code. Installs from the app stores can't carry their link, so people type it. */}
      <Field label={tr('Referral code (optional)')} value={f.ref_code} onChangeText={set('ref_code')} autoCapitalize="characters" placeholder={tr('From the person who invited you')} />
      {err ? <Alert level="error" text={err} /> : null}
      <Button title={tr('Create account')} onPress={submit} loading={busy} />
      <T small muted style={{ textAlign: 'center' }}>
        {tr('By creating an account you agree to the {terms} and the {privacy}.').split(/(\{terms\}|\{privacy\})/).map((part, i) => (
          part === '{terms}' ? <T key={i} small style={{ color: C.primary }} onPress={() => Linking.openURL(`${getBase()}/terms`)}>{tr('Terms of Use')}</T>
            : part === '{privacy}' ? <T key={i} small style={{ color: C.primary }} onPress={() => Linking.openURL(`${getBase()}/privacy`)}>{tr('Privacy Policy')}</T>
              : part))}
      </T>
      <T small muted style={{ textAlign: 'center' }}>{tr("We'll email you a code to confirm your address. Then add photos: profiles with photos get far more matches.")}</T>
    </Screen>
  );
}
