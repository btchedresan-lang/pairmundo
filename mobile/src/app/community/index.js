// A Community Manager's home in the app: this month's pay so far, the resource kit, and their meetups,
// with the check-in QR code, a caption to share, edit and cancel. Payouts and event costs stay on the web page.
import { useCallback, useState } from 'react';
import { Linking, Pressable, Share, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { api, getBase } from '../../api';
import { useAuth } from '../../auth';
import { fmtTime } from '../../data';
import { tr } from '../../i18n';
import { Alert, Button, Card, Empty, Loading, Screen, T } from '../../components/ui';
import { confirmAsync } from '../../components/dialogs';
import { MEETUP_KINDS } from '../../components/Meetups';
import { C } from '../../theme';

const money = (minor, cur) => `${(minor / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })} ${cur}`;
const STATUS = { upcoming: 'Upcoming', scoring: 'Ratings open', success: 'Successful', not_met: 'Not met', cancelled: 'Cancelled', hidden: 'Hidden' };
const AUDIENCE = { aupair: 'Au pairs', family: 'Host families', both: 'Au pairs and families' };

// The same English caption as the web page. Only the area: the exact place shows to people who join.
const WHO = { aupair: 'au pairs and future au pairs', family: 'host families', both: 'au pairs and host families' };
const caption = (e, city) => {
  const when = new Date(e.starts_at).toLocaleString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
  return `${(MEETUP_KINDS[e.kind] || MEETUP_KINDS.other)[0]} ${e.title}\n📅 ${when}\n📍 ${e.area ? `${e.area}, ${city}` : city}\n\n`
    + `A free PairMundo meetup for ${WHO[e.audience] || WHO.both} in ${city}. Come as you are, bring a friend, and meet your people! 🌍\n\n`
    + 'Join in the Nearby tab of the PairMundo app (free): the exact place shows once you join. Scan the QR code at the door to check in.\n\n'
    + `#PairMundo #aupair #aupairlife #${city.replace(/[^\p{L}]/gu, '')}`;
};

export default function Community() {
  const { signOut } = useAuth();
  const [d, setD] = useState(null);
  const [error, setError] = useState(null);
  const load = useCallback(() => api('/community/me').then((x) => { setD(x); setError(null); }).catch((e) => { setError(e.message); setD((x) => x || false); }), []);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  if (d === null) return <Loading />;
  if (!d) return <Screen><Alert level="error" text={error} /><Button kind="secondary" title={tr('Sign out')} onPress={signOut} /></Screen>;

  const m = d.this_month, cm = d.manager;
  const upcoming = d.events.filter((e) => e.status === 'upcoming');
  const past = d.events.filter((e) => e.status !== 'upcoming');
  const cancel = async (e) => {
    if (!(await confirmAsync(tr('Cancel this meetup?'), tr('Everyone going gets a notification.'), tr('Cancel meetup'), true))) return;
    try { await api(`/meetups/${e.id}/cancel`, { method: 'POST' }); load(); } catch (x) { setError(x.message); }
  };
  const open = (p) => Linking.openURL(`${getBase()}${p}`).catch(() => {});

  return (
    <Screen>
      <T h1>{tr('Hi {name}', { name: cm.name })}</T>
      <T muted>{tr('You run the PairMundo community in {city}.', { city: cm.city })}</T>
      {error ? <Alert level="error" text={error} /> : null}

      <Card>
        <T small muted>{tr('This month so far')}</T>
        <T h2>{money(m.total, m.currency)}</T>
        <T>{tr('{held} of {required} events held for the retainer, {ok} successful.', { held: m.lines.retainer.held, required: m.lines.retainer.required, ok: m.lines.events.successful })}</T>
        <T small muted>{tr('A successful event: at least {c} check-ins, {n} newcomers and {s} stars from {r} ratings.',
          { c: d.rules.min_checkins, n: d.rules.min_newcomers, s: d.rules.min_rating, r: d.rules.min_ratings })}</T>
      </Card>

      <Button icon="add" title={tr('Host a meetup')} onPress={() => router.push('/new-meetup')} />
      <Card>
        <T bold>{tr('Your resource kit')}</T>
        <T small muted>{tr('Event ideas, the venue checklist, check-in, safety, and visuals to promote your events.')}</T>
        <Button small kind="secondary" icon="book-outline" title={tr('Open the guide')} onPress={() => open(d.kit.guide)} />
        {d.kit.templates.map((k) => (
          <Pressable key={k.file} onPress={() => open(k.file)}><T small style={{ color: C.primary }}>{tr(k.label)} ↗</T></Pressable>
        ))}
      </Card>

      <T h2>{tr('Upcoming')}</T>
      {upcoming.length ? upcoming.map((e) => (
        <Card key={e.id}>
          <Pressable onPress={() => router.push(`/meetup/${e.id}`)}>
            <T bold>{(MEETUP_KINDS[e.kind] || MEETUP_KINDS.other)[0]} {e.title}</T>
            <T small muted>{fmtTime(e.starts_at)} · {e.place}</T>
            <T small muted>{tr('{n} going', { n: e.going })}{e.max_people ? ` / ${e.max_people}` : ''} · {tr(AUDIENCE[e.audience] || AUDIENCE.both)}</T>
          </Pressable>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
            <Button small icon="qr-code-outline" title={tr('Check-in QR code')} onPress={() => router.push(`/community/qr/${e.id}`)} />
            <Button small kind="secondary" icon="share-outline" title={tr('Share')} onPress={() => Share.share({ message: caption(e, cm.city) }).catch(() => {})} />
            <Button small kind="secondary" icon="create-outline" title={tr('Edit')} onPress={() => router.push(`/new-meetup?edit=${e.id}`)} />
            <Button small kind="secondary" title={tr('Cancel')} onPress={() => cancel(e)} />
          </View>
        </Card>
      )) : <Empty icon="calendar" title={tr('No meetups planned')} text={tr('Host at least {n} this month to earn your retainer.', { n: m.lines.retainer.required })} />}

      {past.length ? <T h2>{tr('Recent')}</T> : null}
      {past.map((e) => (
        <Card key={e.id}>
          <T bold>{e.title}</T>
          <T small muted>{fmtTime(e.starts_at)} · {tr(STATUS[e.status] || e.status)}</T>
          <T small>{tr('{c} check-ins, {n} newcomers', { c: e.checkins, n: e.newcomers })}{e.rating != null ? ` · ★ ${e.rating} (${e.ratings})` : ''}</T>
          {e.status === 'scoring' ? <Button small kind="secondary" icon="qr-code-outline" title={tr('Check-in QR code')} onPress={() => router.push(`/community/qr/${e.id}`)} /> : null}
        </Card>
      ))}

      <T small muted>{tr('Payouts and event costs are on your community page on the web.')}</T>
      <Button small kind="secondary" icon="open-outline" title={tr('Open on the web')} onPress={() => open('/#/community')} />
      <Button small kind="secondary" title={tr('Sign out')} onPress={signOut} />
    </Screen>
  );
}
