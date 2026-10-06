import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { Text } from '../components/Text';
import { router, useFocusEffect } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { api } from '../api';
import { useAuth } from '../auth';
import { fmtDate } from '../data';
import { tr } from '../i18n';
import { buyFamilyPass, paymentsAvailable, restorePurchases, storePrice } from '../payments';
import { Alert, Button, Card, Loading, Screen, T } from '../components/ui';
import { C } from '../theme';

const perks = () => [
  ['💬', tr('Message every au pair you match with')],
  ['💛', tr('See everyone who liked you, and match with one tap')],
  ['🧳', tr('Propose a placement with the country rules check built in')],
  ['🔁', tr('One payment for 3 months. No automatic renewal.')],
];

/** The Family Pass paywall: what families get, and the buy button. */
export default function FamilyPass() {
  const { me, refresh } = useAuth();
  const [pass, setPass] = useState(null);
  const [price, setPrice] = useState(null);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => api('/family-pass').then(setPass).catch((e) => setMsg({ level: 'error', text: e.message })), []);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  // Apple and Google show the price in the person's own currency.
  const productId = pass?.product_id; const userId = me?.user?.id;
  useEffect(() => { if (productId && userId) storePrice({ product_id: productId }, userId).then(setPrice); }, [productId, userId]);

  const buy = async () => {
    setMsg(null); setBusy(true);
    try {
      const done = await buyFamilyPass(pass, me.user.id);
      if (done) { await load(); await refresh().catch(() => {}); setMsg({ level: 'ok', text: tr('Your Family Pass is active. You can now message au pairs and see who liked you.') }); }
    } catch (e) { setMsg({ level: 'error', text: e.message }); } finally { setBusy(false); }
  };
  const restore = async () => {
    setMsg(null); setBusy(true);
    try {
      const r = await restorePurchases();
      setPass(r.pass); await refresh().catch(() => {});
      setMsg(r.added ? { level: 'ok', text: tr('Your Family Pass is active. You can now message au pairs and see who liked you.') } : { level: 'info', text: tr('No new purchases found on this account.') });
    } catch (e) { setMsg({ level: 'error', text: e.message }); } finally { setBusy(false); }
  };

  if (!pass) return msg ? <Screen><Alert level={msg.level} text={msg.text} /></Screen> : <Loading />;
  return (
    <Screen padded={false}>
      <LinearGradient colors={[C.primary, C.primary2]} style={{ padding: 28, paddingTop: 36, alignItems: 'center', gap: 6 }}>
        <Text style={{ fontSize: 46 }}>🏡</Text>
        <Text style={{ color: '#fff', fontSize: 28, fontWeight: '800' }}>Family Pass</Text>
        <Text style={{ color: '#fff', fontSize: 16, textAlign: 'center', opacity: 0.95 }}>{tr('Find your au pair faster')}</Text>
      </LinearGradient>
      <View style={{ padding: 16, gap: 12 }}>
        {pass.active ? <Alert level="ok" text={tr('Your Family Pass is active until {date}.', { date: fmtDate(pass.ends_at) })} /> : null}
        <Card>
          {perks().map(([icon, text]) => (
            <View key={text} style={{ flexDirection: 'row', gap: 12, alignItems: 'center', paddingVertical: 4 }}>
              <Text style={{ fontSize: 22 }}>{icon}</Text><T style={{ flex: 1 }}>{text}</T>
            </View>
          ))}
        </Card>
        <View style={{ alignItems: 'center', gap: 2 }}>
          <T h1>{price || pass.price}</T>
          <T muted>{tr('for 3 months')}</T>
        </View>
        {msg ? <Alert level={msg.level} text={msg.text} /> : null}
        {paymentsAvailable() ? (
          <>
            <Button title={pass.active ? tr('Add 3 more months') : tr('Get Family Pass')} onPress={buy} loading={busy} />
            <Button title={tr('Restore purchases')} kind="ghost" small onPress={restore} disabled={busy} />
          </>
        ) : <Alert level="info" text={pass.required ? tr('Payments are coming soon.') : tr('Payments are coming soon. Until then, families can use every feature for free.')} />}
        <T small muted style={{ textAlign: 'center' }}>{tr('Au pairs never pay. Swiping and matching are free for everyone.')}</T>
        <Button title={tr('Not now')} kind="ghost" small onPress={() => (router.canGoBack() ? router.back() : router.replace('/discover'))} />
      </View>
    </Screen>
  );
}
