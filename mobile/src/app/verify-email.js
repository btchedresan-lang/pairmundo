import { useState } from 'react';
import { router } from 'expo-router';
import { useAuth } from '../auth';
import { api } from '../api';
import { Alert, Button, Field, Screen, T } from '../components/ui';
import { tr } from '../i18n';

export default function VerifyEmail() {
  const { me, refresh } = useAuth();
  const [code, setCode] = useState('');
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  const verify = async () => {
    setMsg(null); setBusy(true);
    try {
      await api('/auth/verify-email', { method: 'POST', body: { code: code.trim() } });
      await refresh();
      if (router.canGoBack()) router.back(); else router.replace('/discover');
    } catch (e) { setMsg({ level: 'error', text: e.message }); setBusy(false); }
  };
  const resend = async () => {
    try { await api('/auth/resend-verification', { method: 'POST' }); setMsg({ level: 'ok', text: tr('A new code is on its way.') }); }
    catch (e) { setMsg({ level: 'error', text: e.message }); }
  };

  if (me?.user.email_verified) {
    return <Screen><Alert level="ok" text={tr('Your email is confirmed.')} /><Button title={tr('Done')} onPress={() => router.back()} /></Screen>;
  }
  return (
    <Screen>
      <T h2>{tr('Confirm your email')}</T>
      <T>{tr('We sent a 6-digit code to {email}. Enter it below so you can like people and send messages.', { email: me?.user.email })}</T>
      <Field label={tr('6-digit code')} value={code} onChangeText={setCode} keyboardType="number-pad" placeholder="123456" />
      {msg ? <Alert level={msg.level} text={msg.text} /> : null}
      <Button title={tr('Confirm')} onPress={verify} loading={busy} disabled={code.trim().length < 6} />
      <Button title={tr('Send a new code')} kind="ghost" small onPress={resend} />
      <T small muted style={{ textAlign: 'center' }}>{tr("Can't find it? Check your spam folder.")}</T>
    </Screen>
  );
}
