import { useCallback, useState } from 'react';
import { Linking, Pressable, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useAuth } from '../auth';
import { api, getBase, setToken } from '../api';
import { Alert, Button, Card, Field, Photo, Screen, T } from '../components/ui';
import { confirmAsync } from '../components/dialogs';
import { C } from '../theme';

export default function Account() {
  const { me, setMe } = useAuth();
  const [blocked, setBlocked] = useState(null);
  const [password, setPassword] = useState('');
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);

  useFocusEffect(useCallback(() => {
    api('/blocks').then((d) => setBlocked(d.blocked)).catch(() => setBlocked([]));
  }, []));

  const unblock = async (u) => {
    if (!(await confirmAsync(`Unblock ${u.name}?`, 'You will be able to see each other again.', 'Unblock'))) return;
    await api(`/users/${u.id}/block`, { method: 'DELETE' });
    setBlocked((b) => b.filter((x) => x.id !== u.id));
  };

  const del = async () => {
    setErr(null);
    if (!(await confirmAsync('Delete your account?', 'Your profile, photos, matches, messages, placements and reviews will be permanently deleted. This cannot be undone.', 'Delete', true))) return;
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
        <T h2>Email</T>
        <T>{me.user.email}</T>
        {me.user.email_verified ? <T small style={{ color: C.ok }}>✓ Confirmed</T> : (
          <Pressable onPress={() => router.push('/verify-email')}><Alert level="warning" text="Not confirmed yet. Tap to enter your code." /></Pressable>
        )}
      </Card>

      <Card>
        <T h2>Blocked people</T>
        {blocked == null ? <T muted>Loading…</T> : blocked.length ? blocked.map((u) => (
          <View key={u.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Photo user={u} rounded style={{ width: 40, height: 40 }} />
            <T style={{ flex: 1 }}>{u.name}</T>
            <Button small kind="ghost" title="Unblock" onPress={() => unblock(u)} />
          </View>
        )) : <T muted>You haven&apos;t blocked anyone.</T>}
      </Card>

      <Card>
        <T h2>Legal</T>
        <Pressable onPress={() => Linking.openURL(`${getBase()}/privacy`)}><T style={{ color: C.primary }}>Privacy Policy ↗</T></Pressable>
        <Pressable onPress={() => Linking.openURL(`${getBase()}/terms`)}><T style={{ color: C.primary }}>Terms of Use ↗</T></Pressable>
      </Card>

      <Card>
        <T h2>Delete account</T>
        <T small muted>This permanently deletes your profile, photos, matches, messages, placements and reviews.</T>
        <Field label="Your password" value={password} onChangeText={setPassword} secureTextEntry />
        {err ? <Alert level="error" text={err} /> : null}
        <Button title="Delete my account" kind="danger" onPress={del} loading={busy} disabled={!password} />
      </Card>
    </Screen>
  );
}
