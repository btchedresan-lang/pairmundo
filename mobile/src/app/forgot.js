import { useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { useAuth } from '../auth';
import { api } from '../api';
import { Alert, Button, Field, Screen, T } from '../components/ui';
import { tr } from '../i18n';

export default function Forgot() {
  const { signIn } = useAuth();
  const params = useLocalSearchParams();
  const [email, setEmail] = useState(params.email || '');
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);

  const send = async () => {
    setErr(null); setBusy(true);
    try { await api('/auth/forgot', { method: 'POST', body: { email: email.trim() } }); setSent(true); }
    catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  // Signing in swaps the screen stack, so a successful reset lands straight in the app.
  const reset = async () => {
    setErr(null); setBusy(true);
    try { await signIn('/auth/reset', { email: email.trim(), code: code.trim(), password }); }
    catch (e) { setErr(e.message); setBusy(false); }
  };

  return (
    <Screen>
      {!sent ? <>
        <T>{tr("Enter the email you signed up with. We'll send you a 6-digit code to set a new password.")}</T>
        <Field label={tr('Email')} value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" placeholder="you@example.com" />
        {err ? <Alert level="error" text={err} /> : null}
        <Button title={tr('Send code')} onPress={send} loading={busy} disabled={!email.trim()} />
      </> : <>
        <Alert level="ok" text={tr('If {email} has an account, a code is on its way. Check your inbox and spam folder.', { email: email.trim() })} />
        <Field label={tr('6-digit code')} value={code} onChangeText={setCode} keyboardType="number-pad" placeholder="123456" />
        <Field label={tr('New password')} value={password} onChangeText={setPassword} secureTextEntry placeholder={tr('At least 8 characters')} />
        {err ? <Alert level="error" text={err} /> : null}
        <Button title={tr('Set new password')} onPress={reset} loading={busy} disabled={!code.trim() || !password} />
        <Button title={tr('Send a new code')} kind="ghost" small onPress={send} />
      </>}
    </Screen>
  );
}
