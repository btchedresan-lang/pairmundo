import { useCallback, useState } from 'react';
import { Alert as RNAlert, Dimensions, Platform, View } from 'react-native';
import { HEADING, Text } from '../../components/Text';
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { api } from '../../api';
import { useAuth } from '../../auth';
import { AGE_GROUPS, cname, country, CRIT_LABEL, flag, fmtDate, langName, SKILLS } from '../../data';
import { tr, trn } from '../../i18n';
import { Alert, Button, Card, Chip, Chips, Loading, RoundButton, Screen, Stars, T } from '../../components/ui';
import { Gallery, Shade } from '../../components/SwipeDeck';
import { MatchModal } from '../../components/pickers';
import { confirmAsync } from '../../components/dialogs';
import { C } from '../../theme';

const W = Math.min(Dimensions.get('window').width, 520);

function ask(title, onText) {
  // Alert.prompt is iOS-only; elsewhere fall back to a fixed reason.
  if (Platform.OS === 'ios') RNAlert.prompt(title, undefined, (txt) => txt && onText(txt));
  else if (Platform.OS === 'web') { const v = globalThis.prompt?.(title); if (v) onText(v); }
  else RNAlert.alert(title, tr('Send this report to our moderators?'), [{ text: tr('Cancel') }, { text: tr('Report'), onPress: () => onText('Reported from the Android app') }]);
}

export default function UserProfile() {
  const { id } = useLocalSearchParams();
  const { me, refresh } = useAuth();
  const [d, setD] = useState(null);
  const [error, setError] = useState(null);
  const [match, setMatch] = useState(null);
  const [note, setNote] = useState(null);
  const load = useCallback(() => api(`/users/${id}`).then(setD).catch((e) => setError(e.message)), [id]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (error) return <Screen><Alert level="error" text={error} /></Screen>;
  if (!d) return <Loading />;
  const u = d.user; const p = d.profile || {};
  const isMe = me.user.id === u.id;
  const canAct = !isMe && me.user.role !== u.role;
  const req = d.request;
  const matched = req?.status === 'accepted';
  const likesMe = req?.status === 'pending' && req.from_user === u.id;
  const iLiked = req?.status === 'pending' && req.from_user === me.user.id;

  const swipe = async (direction) => {
    try {
      const res = await api('/swipe', { method: 'POST', body: { target_id: u.id, direction } });
      refresh().catch(() => {});
      if (res.matched) { setMatch({ other: u, conversation_id: res.conversation_id }); load(); }
      else if (direction === 'pass') router.back();
      else { setNote(direction === 'super' ? `★ ${tr('Super like sent')}` : `♥ ${tr('Liked')}`); load(); }
    } catch (e) { if (e.data?.code === 'email_unverified') router.push('/verify-email'); else setError(e.message); }
  };
  const block = async () => {
    if (!(await confirmAsync(tr('Block {name}?', { name: u.name }), tr("You won't see each other anywhere in the app, and your chat closes. They aren't told."), tr('Block'), true))) return;
    try { await api(`/users/${u.id}/block`, { method: 'POST' }); refresh().catch(() => {}); router.back(); }
    catch (e) { setError(e.message); }
  };
  const unblock = async () => { await api(`/users/${u.id}/block`, { method: 'DELETE' }); load(); };
  const message = async () => {
    const c = await api('/conversations', { method: 'POST', body: { user_id: u.id } });
    router.push(`/chat/${c.id}`);
  };

  const yes = (v) => (v ? tr('Yes') : tr('No'));
  const months = p.duration_months && trn(p.duration_months, '{n} month', '{n} months');
  const facts = u.role === 'aupair' ? [
    ['🎂', tr('Age'), p.age], ['🛂', tr('Nationality'), cname(p.nationality)], ['🧸', tr('Childcare'), p.childcare_years != null && trn(p.childcare_years, '{n} year', '{n} years')],
    ['📅', tr('Available'), fmtDate(p.available_from)], ['⏳', tr('Stay'), months],
    ['🚗', tr('Driver'), yes(p.drivers_license)], ['🚭', tr('Non-smoker'), yes(p.non_smoker)], ['🐾', tr('OK with pets'), yes(p.ok_with_pets)],
  ] : [
    ['👶', tr('Children'), p.children?.length ? p.children.map((c) => tr('{n} yrs', { n: c.age })).join(', ') : '—'], ['📅', tr('Start'), fmtDate(p.start_date)],
    ['⏳', tr('Stay'), months], ['⏰', tr('Hours / week'), p.weekly_hours], ['💶', tr('Pocket money'), p.pocket_money && tr('{amount} / month', { amount: p.pocket_money })],
    ['🚗', tr('Needs driver'), yes(p.needs_driver)], ['🐾', tr('Pets'), yes(p.has_pets)], ['🛏️', tr('Private room'), yes(p.private_room)],
  ];

  return (
    <Screen padded={false}>
      <Stack.Screen options={{ title: u.name }} />
      <View style={{ alignSelf: 'center', width: W }}>
        <Gallery user={u} style={{ width: W, height: W * 4 / 3 }}>
          <Shade />
          {d.match ? <Text style={{ position: 'absolute', top: 22, right: 14, backgroundColor: d.match.score >= 75 ? C.like : 'rgba(0,0,0,0.55)', color: '#fff', fontWeight: '700', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, overflow: 'hidden' }}>{tr('{score}% match', { score: d.match.score })}</Text> : null}
          <View style={{ position: 'absolute', left: 16, right: 16, bottom: 16 }} pointerEvents="none">
            <Text style={{ color: '#fff', fontSize: 33, fontFamily: HEADING }}>{u.name}{u.role === 'aupair' && p.age ? <Text style={{ opacity: 0.85 }}>  {p.age}</Text> : null}{u.verification.id ? '  ✔' : ''}</Text>
            <Text style={{ color: '#fff', fontSize: 15 }}>{u.role === 'aupair' ? tr('Au pair') : tr('Host family')} · {flag(u.country)} {[u.city, country(u.country)].filter(Boolean).join(', ')}</Text>
            <Text style={{ color: '#fff', fontSize: 14, opacity: 0.9 }}>{d.rating.count ? `★ ${d.rating.avg} (${trn(d.rating.count, '{n} review', '{n} reviews')}) · ` : ''}{trn(d.placements_completed, '{n} completed placement', '{n} completed placements')}</Text>
          </View>
        </Gallery>
      </View>

      <View style={{ padding: 16, gap: 12 }}>
        {isMe ? (
          <Card>
            <T bold>👁 {u.role === 'aupair' ? tr('This is how host families see your profile.') : tr('This is how au pairs see your profile.')}</T>
            {p.visible === 0 ? <Alert level="warning" text={tr('Your profile is hidden right now, so nobody can find you. You can show it again in your profile settings.')} /> : null}
            <Button small kind="secondary" title={tr('Edit profile')} onPress={() => (router.canGoBack() ? router.back() : router.replace('/profile'))} />
          </Card>
        ) : null}
        {d.blocked ? (
          <View style={{ gap: 10 }}>
            <Alert level="warning" text={tr("You blocked this person. They can't see you or message you.")} />
            <Button title={tr('Unblock')} kind="secondary" onPress={unblock} />
          </View>
        ) : canAct && matched ? (
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Button title={`💬 ${tr('Message')}`} style={{ flex: 1 }} onPress={message} />
            <Button title={`🧳 ${tr('Propose placement')}`} kind="secondary" style={{ flex: 1 }} onPress={() => router.push(`/new-placement/${u.id}`)} />
          </View>
        ) : canAct && iLiked ? (
          <Alert level="info" text={`♥ ${tr("You liked them. You'll match if they like you back.")}`} />
        ) : canAct ? (
          <View style={{ gap: 10 }}>
            {likesMe ? <Alert level="ok" text={`💛 ${tr('They like you! Like them back to match.')}`} /> : null}
            <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 20 }}>
              <RoundButton icon="✕" color={C.nope} onPress={() => swipe('pass')} label={tr('Pass')} />
              <RoundButton size="sm" icon="★" color={C.super} onPress={() => swipe('super')} label={tr('Super like')} />
              <RoundButton icon="♥" color={C.like} onPress={() => swipe('like')} label={tr('Like')} />
            </View>
          </View>
        ) : null}
        {note ? <Alert level="ok" text={note} /> : null}

        {d.match ? (
          <Card>
            <T bold>{tr('Why you match')}</T>
            {d.match.reasons.map((r) => <T key={r} small style={{ color: C.ok }}>✓ {tr(r)}</T>)}
            {d.match.warnings.map((r) => <T key={r} small style={{ color: C.warn }}>⚠ {tr(r)}</T>)}
          </Card>
        ) : null}

        <Card>
          <T bold>{u.role === 'aupair' ? tr('About me') : tr('About us')}</T>
          <T>{p.bio || tr('No description yet.')}</T>
          <Chips>
            {u.verification.id ? <Chip tone="ok" label={`✔ ${tr('ID verified')}`} /> : null}
            {u.verification.references ? <Chip tone="ok" label={`✔ ${tr('References')}`} /> : null}
            {u.verification.background ? <Chip tone="ok" label={`✔ ${tr('Background check')}`} /> : null}
          </Chips>
        </Card>

        <Card>
          <T bold>{tr('Basics')}</T>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: 12 }}>
            {facts.filter(([, , v]) => v != null && v !== '').map(([i, k, v]) => (
              <View key={k} style={{ width: '50%', flexDirection: 'row', gap: 8 }}>
                <Text style={{ fontSize: 20 }}>{i}</Text>
                <View style={{ flex: 1 }}><T small muted>{k}</T><T>{String(v)}</T></View>
              </View>
            ))}
          </View>
        </Card>

        <Card>
          {u.role === 'aupair' ? <>
            <T bold>{tr('Languages')}</T>
            <Chips>{(p.languages || []).map((l) => <Chip key={l.code} label={`${langName(l.code)} · ${l.level === 'native' ? tr('native') : l.level}`} />)}</Chips>
            <T bold>{tr('Experience with')}</T>
            <Chips>{(p.age_groups || []).map((g) => <Chip key={g} label={AGE_GROUPS[g] ? tr(AGE_GROUPS[g]) : g} />)}</Chips>
            <T bold>{tr('Skills')}</T>
            <Chips>{(p.skills || []).map((s) => <Chip key={s} label={SKILLS[s] ? tr(SKILLS[s]) : s} />)}</Chips>
            <T bold>{tr('Wants to go to')}</T>
            <Chips>{(p.preferred_countries || []).length ? p.preferred_countries.map((c) => <Chip key={c} label={cname(c)} />) : <T muted>{tr('Open to anywhere')}</T>}</Chips>
          </> : <>
            <T bold>{tr('Languages at home')}</T>
            <Chips>{(p.languages || []).map((l) => <Chip key={l} label={langName(l)} />)}</Chips>
            <T bold>{tr('Au pair must speak')}</T>
            <Chips>{(p.required_languages || []).length ? p.required_languages.map((l) => <Chip key={l} label={langName(l)} />) : <T muted>{tr('No requirement')}</T>}</Chips>
          </>}
        </Card>

        <Card>
          <T bold>{tr('Reviews')}</T>
          {d.rating.count ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: 6 }}>
              {Object.entries(d.rating.criteria).map(([k, v]) => <T key={k} small style={{ width: '50%' }}>{CRIT_LABEL[k] ? tr(CRIT_LABEL[k]) : k}: <T small bold>{v}</T></T>)}
            </View>
          ) : null}
          {d.reviews.length ? d.reviews.map((r) => (
            <View key={r.id} style={{ borderTopWidth: 1, borderColor: '#e4e7ec', paddingTop: 10, gap: 4 }}>
              <Stars value={r.overall} />
              <T small muted>{tr('by {name}', { name: r.reviewer_name })} · {fmtDate(r.start_date)} – {fmtDate(r.end_date)}</T>
              <T>{r.comment}</T>
              {r.response ? <Alert level="info" text={`${tr('Response')}: ${r.response}`} /> : null}
            </View>
          )) : <T muted>{tr('No reviews yet. Reviews only come from real placements.')}</T>}
        </Card>

        {!isMe ? <Button small kind="ghost" title={`⚑ ${tr('Report this profile')}`} onPress={() => ask(tr('What is wrong with this profile?'), async (reason) => {
          await api('/reports', { method: 'POST', body: { target_user_id: u.id, reason } }); setNote(tr('Thanks, our team will look into it.'));
        })} /> : null}
        {!isMe && !d.blocked ? <Button small kind="ghost" title={`🚫 ${tr('Block')}`} onPress={block} /> : null}
      </View>

      <MatchModal match={match} me={me.user} onClose={() => setMatch(null)}
        onMessage={() => { const cid = match.conversation_id; setMatch(null); router.push(`/chat/${cid}`); }} />
    </Screen>
  );
}
