import { useCallback, useEffect, useState } from 'react';
import { AppState, Linking, Pressable, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useAuth } from '../auth';
import { api, getBase, setToken } from '../api';
import { Alert, Button, Card, Chip, Chips, Field, Photo, Screen, T } from '../components/ui';
import { LANGUAGES, tr, useLanguage } from '../i18n';
import { confirmAsync } from '../components/dialogs';
import { C } from '../theme';

export default function Account() {
  const { me, setMe, refresh } = useAuth();
  const { choice, setLanguage } = useLanguage();
  const [blocked, setBlocked] = useState(null);
  const [password, setPassword] = useState('');
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);

  const [idCheck, setIdCheck] = useState(null);
  const [idBusy, setIdBusy] = useState(false);
  const [idErr, setIdErr] = useState(null);

  const loadIdCheck = useCallback(() => api('/me/id-check').then((d) => {
    setIdCheck(d);
    if (d.verified) refresh().catch(() => {});
  }).catch(() => setIdCheck({ available: false })), [refresh]);
  useFocusEffect(useCallback(() => {
    api('/blocks').then((d) => setBlocked(d.blocked)).catch(() => setBlocked([]));
    loadIdCheck();
  }, [loadIdCheck]));
  // Coming back from Stripe's page in the browser: ask for the result.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') loadIdCheck(); });
    return () => sub.remove();
  }, [loadIdCheck]);

  const startIdCheck = async () => {
    setIdErr(null); setIdBusy(true);
    try { const { url } = await api('/me/id-check', { method: 'POST' }); await Linking.openURL(url); }
    catch (e) { setIdErr(e.message); } finally { setIdBusy(false); }
  };

  const unblock = async (u) => {
    if (!(await confirmAsync(tr('Unblock {name}?', { name: u.name }), tr('You will be able to see each other again.'), tr('Unblock')))) return;
    await api(`/users/${u.id}/block`, { method: 'DELETE' });
    setBlocked((b) => b.filter((x) => x.id !== u.id));
  };

  const del = async () => {
    setErr(null);
    if (!(await confirmAsync(tr('Delete your account?'), tr('Your profile, photos, matches, messages, placements and reviews will be permanently deleted. This cannot be undone.'), tr('Delete'), true))) return;
    setBusy(true);
    try {
      await api('/me', { method: 'DELETE', body: { password } });
      await setToken(null);
      setMe(null);
    } catch (e) { setErr(e.message); setBusy(false); }
  };

  return (
    <Screen>
      <Card>
        <T h2>{tr('Language')}</T>
        <Chips>
          <Chip label={tr('Same as my phone')} on={!choice} onPress={() => setLanguage(null)} />
          {Object.entries(LANGUAGES).map(([code, name]) => <Chip key={code} label={name} on={choice === code} onPress={() => setLanguage(code)} />)}
        </Chips>
      </Card>

      <Card>
        <T h2>{tr('Email')}</T>
        <T>{me.user.email}</T>
        {me.user.email_verified ? <T small style={{ color: C.ok }}>✓ {tr('Confirmed')}</T> : (
          <Pressable onPress={() => router.push('/verify-email')}><Alert level="warning" text={tr('Not confirmed yet. Tap to enter your code.')} /></Pressable>
        )}
      </Card>

      <Card>
        <T h2>{tr('ID check')}</T>
        {idCheck == null ? <T muted>{tr('Loading…')}</T>
          : idCheck.verified ? <T style={{ color: C.ok }}>✔ {tr('ID verified')}</T>
            : !idCheck.available ? <T small muted>{tr('ID checks are coming soon.')}</T> : <>
              <T small muted>{tr('Scan your passport or ID card and take a selfie. Your profile then shows the ID verified badge, which helps families and au pairs trust you.')}</T>
              {idCheck.status === 'processing' ? <Alert level="info" text={tr("We're checking your ID. This usually takes a few minutes.")} /> : null}
              {idCheck.status === 'requires_input' && idCheck.error ? <Alert level="warning" text={tr("Your last check didn't go through. Try again with a clear, well-lit photo of your document.")} /> : null}
              {idErr ? <Alert level="error" text={idErr} /> : null}
              {idCheck.status !== 'processing' ? <Button title={`🪪 ${tr('Verify my ID')}`} onPress={startIdCheck} loading={idBusy} /> : null}
              <T small muted>{tr('Stripe runs the check and keeps your document. PairMundo only learns whether it passed.')}</T>
            </>}
      </Card>

      <Card>
        <T h2>{tr('Blocked people')}</T>
        {blocked == null ? <T muted>{tr('Loading…')}</T> : blocked.length ? blocked.map((u) => (
          <View key={u.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Photo user={u} rounded style={{ width: 40, height: 40 }} />
            <T style={{ flex: 1 }}>{u.name}</T>
            <Button small kind="ghost" title={tr('Unblock')} onPress={() => unblock(u)} />
          </View>
        )) : <T muted>{tr("You haven't blocked anyone.")}</T>}
      </Card>

      <Card>
        <T h2>{tr('Legal')}</T>
        <Pressable onPress={() => Linking.openURL(`${getBase()}/privacy`)}><T style={{ color: C.primary }}>{tr('Privacy Policy')} ↗</T></Pressable>
        <Pressable onPress={() => Linking.openURL(`${getBase()}/terms`)}><T style={{ color: C.primary }}>{tr('Terms of Use')} ↗</T></Pressable>
      </Card>

      <Card>
        <T h2>{tr('Delete account')}</T>
        <T small muted>{tr('This permanently deletes your profile, photos, matches, messages, placements and reviews.')}</T>
        <Field label={tr('Your password')} value={password} onChangeText={setPassword} secureTextEntry />
        {err ? <Alert level="error" text={err} /> : null}
        <Button title={tr('Delete my account')} kind="danger" onPress={del} loading={busy} disabled={!password} />
      </Card>
    </Screen>
  );
}
