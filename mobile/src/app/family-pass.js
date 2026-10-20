import { useCallback, useEffect, useState } from 'react';
import { Platform, Pressable, View } from 'react-native';
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
  // Older servers send one pass; newer ones a 1-month, a 3-month and a 6-month plan.
  // A plan can have its own product ID on the App Store (ios_product_id).
  const plans = pass ? (pass.plans?.length ? pass.plans : [{ id: 'quarter', days: pass.days, price: pass.price, product_id: pass.product_id }])
    .map((p) => (Platform.OS === 'ios' && p.ios_product_id ? { ...p, product_id: p.ios_product_id } : p)) : [];
  const plan = plans.find((p) => p.id === planId) || plans[plans.length - 1];
  // Apple and Google show the price in the person's own currency.
  const productIds = plans.map((p) => p.product_id).join(','); const userId = me?.user?.id;
  useEffect(() => {
    if (!productIds || !userId) return;
    productIds.split(',').forEach((id) => storePrice({ product_id: id }, userId).then((s) => s && setPrices((x) => ({ ...x, [id]: s }))));
  }, [productIds, userId]);
  const planName = (p) => (p.days === 30 ? tr('1 month') : p.days === 90 ? tr('3 months') : p.days === 180 ? tr('6 months') : tr('{n} days', { n: p.days }));
  // The longest plan costs the least per month.
  const best = Math.max(...plans.map((p) => p.days));
  const rm = pass?.rematch;
  const rematchPrice = rm ? prices[rm.product_id] || rm.price : null;
  useEffect(() => {
    if (rm?.product_id && userId) storePrice({ product_id: rm.product_id }, userId).then((s) => s && setPrices((x) => ({ ...x, [rm.product_id]: s })));
  }, [rm?.product_id, userId]);

  const buy = async (product = plan) => {
    setMsg(null); setBusy(true);
    try {
      const done = await buyFamilyPass(product, me.user.id);
      if (done) {
        await load(); await refresh().catch(() => {});
        setMsg({ level: 'ok', text: product === rm ? tr('Thank you! Your Rematch Guarantee is active.') : tr('Your Family Pass is active. You can now message au pairs and see who liked you.') });
      }
    } catch (e) { setMsg({ level: 'error', text: e.message }); } finally { setBusy(false); }
  };
  // Families who signed up before launch have free days saved, and pick when to use them.
  // And families who signed up with a code that comes with gift days, say from their real estate office.
  const useSaved = (path) => async () => {
    setMsg(null); setBusy(true);
    try {
      setPass(await api(path, { method: 'POST' })); await refresh().catch(() => {});
      setMsg({ level: 'ok', text: tr('Your free days have started. You can now message au pairs and see who liked you.') });
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

  const early = pass?.early_bonus && !pass.early_bonus.redeemed && !pass.early_bonus.expired ? pass.early_bonus : null;
  const gift = pass?.gift && !pass.gift.redeemed && !pass.gift.expired ? pass.gift : null;
  if (!pass) return msg ? <Screen><Alert level={msg.level} text={msg.text} /></Screen> : <Loading />;
  return (
    <Screen padded={false}>
      <LinearGradient colors={[C.primary, C.primary2]} style={{ padding: 28, paddingTop: 36, alignItems: 'center', gap: 6 }}>
        <Text style={{ fontSize: 46 }}>🏡</Text>
        <Text style={{ color: '#fff', fontSize: 32, fontFamily: HEADING_BOLD }}>Family Pass</Text>
        <Text style={{ color: '#fff', fontSize: 16, textAlign: 'center', opacity: 0.95 }}>{tr('Find your au pair faster')}</Text>
      </LinearGradient>
      <View style={{ padding: 16, gap: 12 }}>
        {pass.active ? <Alert level="ok" text={pass.trial ? tr('Your free trial runs until {date}.', { date: fmtDate(pass.ends_at) }) : pass.early ? tr('Your early family bonus runs until {date}.', { date: fmtDate(pass.ends_at) }) : pass.gift_active ? tr('Your gift from {from} runs until {date}.', { from: pass.gift?.from, date: fmtDate(pass.ends_at) }) : tr('Your Family Pass is active until {date}.', { date: fmtDate(pass.ends_at) })} /> : null}
        {early ? (
          <Card style={{ gap: 8 }}>
            <T bold>🎁 {tr('Early family bonus: {days} free days', { days: early.days })}</T>
            <T>{tr('You signed up early, so you have {days} free days of the Family Pass saved. Use them whenever it suits you.', { days: early.days })}{early.use_by ? ` ${tr('Use them by {date}.', { date: fmtDate(early.use_by) })}` : ''}</T>
            {early.can_redeem ? (
              <>
                <Button title={tr('Use my {days} free days now', { days: early.days })} onPress={useSaved('/family-pass/early-bonus')} loading={busy} />
                {pass.active ? <T small muted>{tr('They start when your current pass ends.')}</T> : null}
              </>
            ) : <T small muted>{tr('Everything is free right now, so your free days stay saved for later.')}</T>}
          </Card>
        ) : null}
        {gift ? (
          <Card style={{ gap: 8 }}>
            <T bold>🎁 {tr('A gift from {from}: {days} free days', { from: gift.from, days: gift.days })}</T>
            <T>{tr("Saved for you. Start them whenever you're ready.")} {tr('Use them by {date}.', { date: fmtDate(gift.use_by) })}</T>
            {gift.can_redeem ? (
              <>
                <Button title={tr('Use my {days} free days now', { days: gift.days })} onPress={useSaved('/family-pass/gift')} loading={busy} />
                {pass.active ? <T small muted>{tr('They start when your current pass ends.')}</T> : null}
              </>
            ) : <T small muted>{tr('Everything is free right now, so your free days stay saved for later.')}</T>}
          </Card>
        ) : null}
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
                {p.days === best && plans.length > 1 ? <Text style={{ position: 'absolute', top: -11, backgroundColor: C.primary, color: '#fff', fontSize: 12, fontWeight: '700', paddingHorizontal: 10, paddingVertical: 2, borderRadius: 999, overflow: 'hidden' }}>{tr('Best value')}</Text> : null}
                <T bold>{planName(p)}</T>
                <T h1>{prices[p.product_id] || p.price}</T>
              </Pressable>
            );
          })}
        </View>
        {msg ? <Alert level={msg.level} text={msg.text} /> : null}
        {paymentsAvailable() ? (
          <>
            <Button title={pass.active ? tr('Add {plan}', { plan: planName(plan) }) : tr('Get {plan}', { plan: planName(plan) })} onPress={() => buy()} loading={busy} />
            <Button title={tr('Restore purchases')} kind="ghost" small onPress={restore} disabled={busy} />
          </>
        ) : <Alert level="info" text={pass.required ? tr('Payments are coming soon.') : tr('Payments are coming soon. Until then, families can use every feature for free.')} />}
        {rm ? (
          <Card style={{ gap: 8 }}>
            <T bold>🔁 {tr('Rematch Guarantee')}</T>
            <T>{tr('If your au pair leaves in the first {months} months, or the stay is cancelled before it starts, you get {days} days of the Family Pass free to find your next au pair.', { months: rm.cover_months, days: rm.pass_days })}</T>
            {rm.active ? <T bold>{rm.placement_id ? tr('Your Rematch Guarantee covers your current placement.') : tr('Your Rematch Guarantee will cover your next confirmed placement.')}</T>
              : paymentsAvailable() ? <Button kind="secondary" title={tr('Add it for {price}', { price: rematchPrice })} onPress={() => buy(rm)} loading={busy} /> : null}
          </Card>
        ) : null}
        <T small muted style={{ textAlign: 'center' }}>{tr('Au pairs never pay. Swiping and matching are free for everyone.')}</T>
        <Button title={tr('Not now')} kind="ghost" small onPress={() => (router.canGoBack() ? router.back() : router.replace('/discover'))} />
      </View>
    </Screen>
  );
}
