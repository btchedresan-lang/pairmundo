import { useCallback, useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { HEADING_BOLD, Text } from '../components/Text';
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
  ['🔁', tr('One payment. No automatic renewal.')],
];

/** The Family Pass paywall: what families get, and the buy button. */
export default function FamilyPass() {
  const { me, refresh } = useAuth();
  const [pass, setPass] = useState(null);
  const [prices, setPrices] = useState({});
  const [planId, setPlanId] = useState('quarter');
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => api('/family-pass').then(setPass).catch((e) => setMsg({ level: 'error', text: e.message })), []);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  // Older servers send one pass; newer ones a 1-month and a 3-month plan.
  const plans = pass ? (pass.plans?.length ? pass.plans : [{ id: 'quarter', days: pass.days, price: pass.price, product_id: pass.product_id }]) : [];
  const plan = plans.find((p) => p.id === planId) || plans[plans.length - 1];
  // Apple and Google show the price in the person's own currency.
  const productIds = plans.map((p) => p.product_id).join(','); const userId = me?.user?.id;
  useEffect(() => {
    if (!productIds || !userId) return;
    productIds.split(',').forEach((id) => storePrice({ product_id: id }, userId).then((s) => s && setPrices((x) => ({ ...x, [id]: s }))));
  }, [productIds, userId]);
  const planName = (p) => (p.days === 30 ? tr('1 month') : p.days === 90 ? tr('3 months') : tr('{n} days', { n: p.days }));

  const buy = async () => {
    setMsg(null); setBusy(true);
    try {
      const done = await buyFamilyPass(plan, me.user.id);
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
        <Text style={{ color: '#fff', fontSize: 32, fontFamily: HEADING_BOLD }}>Family Pass</Text>
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
        <View style={{ flexDirection: 'row', gap: 12, marginTop: 6 }}>
          {plans.map((p) => {
            const on = p.id === plan.id;
            return (
              <Pressable key={p.id} onPress={() => setPlanId(p.id)} accessibilityRole="radio" accessibilityState={{ selected: on }}
                style={{ flex: 1, alignItems: 'center', gap: 2, paddingVertical: 16, borderRadius: 16, borderWidth: 2, borderColor: on ? C.primary : '#d0d5dd' }}>
                {p.days === 90 && plans.length > 1 ? <Text style={{ position: 'absolute', top: -11, backgroundColor: C.primary, color: '#fff', fontSize: 12, fontWeight: '700', paddingHorizontal: 10, paddingVertical: 2, borderRadius: 999, overflow: 'hidden' }}>{tr('Best value')}</Text> : null}
                <T bold>{planName(p)}</T>
                <T h1>{prices[p.product_id] || p.price}</T>
              </Pressable>
            );
          })}
        </View>
        {msg ? <Alert level={msg.level} text={msg.text} /> : null}
        {paymentsAvailable() ? (
          <>
            <Button title={pass.active ? tr('Add {plan}', { plan: planName(plan) }) : tr('Get {plan}', { plan: planName(plan) })} onPress={buy} loading={busy} />
            <Button title={tr('Restore purchases')} kind="ghost" small onPress={restore} disabled={busy} />
          </>
        ) : <Alert level="info" text={pass.required ? tr('Payments are coming soon.') : tr('Payments are coming soon. Until then, families can use every feature for free.')} />}
        <T small muted style={{ textAlign: 'center' }}>{tr('Au pairs never pay. Swiping and matching are free for everyone.')}</T>
        <Button title={tr('Not now')} kind="ghost" small onPress={() => (router.canGoBack() ? router.back() : router.replace('/discover'))} />
      </View>
    </Screen>
  );
}
