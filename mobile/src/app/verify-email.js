import { useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { useAuth } from '../auth';
import { api } from '../api';
import { Alert, Button, Field, Screen, T } from '../components/ui';
import { tr } from '../i18n';

export default function VerifyEmail() {
  const { me, refresh } = useAuth();
  const { next } = useLocalSearchParams(); // opened right after setup: carry on there when done, or later
  const [code, setCode] = useState('');
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  const leave = () => {
    if (next) router.replace(next);
    else if (router.canGoBack()) router.back(); else router.replace('/discover');
  };
  const verify = async (value = code) => {
    if (busy) return;
    setMsg(null); setBusy(true);
    try {
      await api('/auth/verify-email', { method: 'POST', body: { code: value.trim() } });
      await refresh();
      leave();
    } catch (e) { setMsg({ level: 'error', text: e.message }); setBusy(false); }
  };
  // Typing (or autofilling) the sixth digit confirms straight away.
  const onCode = (v) => {
    const digits = v.replace(/\D/g, '').slice(0, 6);
    setCode(digits);
    if (digits.length === 6 && digits !== code) verify(digits);
  };
  const resend = async () => {
    try { await api('/auth/resend-verification', { method: 'POST' }); setMsg({ level: 'ok', text: tr('A new code is on its way.') }); }
    catch (e) { setMsg({ level: 'error', text: e.message }); }
  };

  if (me?.user.email_verified) {
    return <Screen><Alert level="ok" text={tr('Your email is confirmed.')} /><Button title={tr('Done')} onPress={leave} /></Screen>;
  }
  return (
    <Screen>
      <T h2>{tr('Confirm your email')}</T>
      <T>{tr('We sent a 6-digit code to {email}. Enter it below so you can like people and send messages.', { email: me?.user.email })}</T>
      <Field label={tr('6-digit code')} value={code} onChangeText={onCode} keyboardType="number-pad" placeholder="123456"
        textContentType="oneTimeCode" autoComplete="one-time-code" maxLength={6} autoFocus />
      {msg ? <Alert level={msg.level} text={msg.text} /> : null}
      <Button title={tr('Confirm')} onPress={() => verify()} loading={busy} disabled={code.trim().length < 6} />
      <Button title={tr('Send a new code')} kind="ghost" small onPress={resend} />
      <T small muted style={{ textAlign: 'center' }}>{tr("Can't find it? Check your spam folder.")}</T>
      {next ? <Button title={tr("I'll do it later")} kind="ghost" small onPress={leave} /> : null}
    </Screen>
  );
}
