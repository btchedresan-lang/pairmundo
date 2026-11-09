import { useState } from 'react';
import { Linking, Pressable } from 'react-native';
import { getBase } from '../api';
import { useAuth } from '../auth';
import { Alert, Button, ChoiceChips, Field, Screen, T } from '../components/ui';
import { SocialButtons } from '../components/SocialButtons';
import { C } from '../theme';
import { tr } from '../i18n';

// Only what an account needs. Country, city and the rest come in the short setup right after, one step at a time.
export default function Register() {
  const { signIn } = useAuth();
  const [f, setF] = useState({ role: 'family', name: '', email: '', password: '', ref_code: '' });
  const [showCode, setShowCode] = useState(false);
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
      <Field label={tr('Name')} hint={tr('Other members see only your first name and last initial, like Maria L. Your full name is shared once you both confirm a placement.')} value={f.name} onChangeText={set('name')}
        placeholder={f.role === 'family' ? tr('The Smith Family') : 'Maria Lopez'} textContentType="name" autoComplete="name" />
      <Field label={tr('Email')} value={f.email} onChangeText={set('email')} keyboardType="email-address" autoCapitalize="none" textContentType="emailAddress" autoComplete="email" />
      <Field label={tr('Password')} value={f.password} onChangeText={set('password')} secureTextEntry placeholder={tr('At least 8 characters')}
        textContentType="newPassword" autoComplete="new-password" returnKeyType="go" onSubmitEditing={submit} />
      {/* An ambassador's code. Installs from the app stores can't carry their link, so people type it. */}
      {showCode || f.ref_code ? (
        <Field label={tr('Referral code (optional)')} value={f.ref_code} onChangeText={set('ref_code')} autoCapitalize="characters" placeholder={tr('From the person or agency who invited you')} autoFocus={showCode} />
      ) : (
        <Pressable onPress={() => setShowCode(true)} hitSlop={6}><T small style={{ color: C.primary }}>{tr('Have a referral code?')}</T></Pressable>
      )}
      {err ? <Alert level="error" text={err} /> : null}
      <Button title={tr('Create account')} onPress={submit} loading={busy} />
      <SocialButtons role={f.role} />
      <T small muted style={{ textAlign: 'center' }}>
        {tr('By creating an account you agree to the {terms} and the {privacy}.').split(/(\{terms\}|\{privacy\})/).map((part, i) => (
          part === '{terms}' ? <T key={i} small style={{ color: C.primary }} onPress={() => Linking.openURL(`${getBase()}/terms`)}>{tr('Terms of Use')}</T>
            : part === '{privacy}' ? <T key={i} small style={{ color: C.primary }} onPress={() => Linking.openURL(`${getBase()}/privacy`)}>{tr('Privacy Policy')}</T>
              : part))}
      </T>
    </Screen>
  );
}
