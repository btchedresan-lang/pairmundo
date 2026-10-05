import { useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { useAuth } from '../auth';
import { api } from '../api';
import { Alert, Button, Field, Screen, T } from '../components/ui';

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
        <T>Enter the email you signed up with. We&apos;ll send you a 6-digit code to set a new password.</T>
        <Field label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" placeholder="you@example.com" />
        {err ? <Alert level="error" text={err} /> : null}
        <Button title="Send code" onPress={send} loading={busy} disabled={!email.trim()} />
      </> : <>
        <Alert level="ok" text={`If ${email.trim()} has an account, a code is on its way. Check your inbox and spam folder.`} />
        <Field label="6-digit code" value={code} onChangeText={setCode} keyboardType="number-pad" placeholder="123456" />
        <Field label="New password" value={password} onChangeText={setPassword} secureTextEntry placeholder="At least 8 characters" />
        {err ? <Alert level="error" text={err} /> : null}
        <Button title="Set new password" onPress={reset} loading={busy} disabled={!code.trim() || !password} />
        <Button title="Send a new code" kind="ghost" small onPress={send} />
      </>}
    </Screen>
  );
}
