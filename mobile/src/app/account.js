import { useCallback, useState } from 'react';
import { Linking, Pressable, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useAuth } from '../auth';
import { api, getBase, setToken } from '../api';
import { Alert, Button, Card, Chip, Chips, Field, Photo, Screen, T } from '../components/ui';
import { LANGUAGES, tr, useLanguage } from '../i18n';
import { confirmAsync } from '../components/dialogs';
import { C } from '../theme';

export default function Account() {
  const { me, setMe } = useAuth();
  const { choice, setLanguage } = useLanguage();
  const [blocked, setBlocked] = useState(null);
  const [password, setPassword] = useState('');
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);

  useFocusEffect(useCallback(() => {
    api('/blocks').then((d) => setBlocked(d.blocked)).catch(() => setBlocked([]));
  }, []));

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
