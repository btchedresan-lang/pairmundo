import { useCallback, useState } from 'react';
import { Alert as RNAlert, Dimensions, Platform, View } from 'react-native';
import { HEADING, Text } from '../../components/Text';
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { api } from '../../api';
import { useAuth } from '../../auth';
import { country, CRIT_LABEL, flag, fmtDate, langName } from '../../data';
import { tr, trn } from '../../i18n';
import { Alert, Button, Card, Chip, Chips, Loading, RoundButton, Screen, Stars, T } from '../../components/ui';
import { Gallery, Shade } from '../../components/SwipeDeck';
import { MatchModal } from '../../components/pickers';
import { PosterBody, PosterHeader } from '../../components/Poster';
import { confirmAsync } from '../../components/dialogs';
import { C } from '../../theme';
import { Ionicons } from '@expo/vector-icons';
import { askToFinishProfile } from '../setup';
import { VisaCard } from '../../components/Visa';

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
    } catch (e) {
      if (e.data?.code === 'email_unverified') router.push('/verify-email');
      else if (e.data?.code === 'profile_incomplete') askToFinishProfile();
      else setError(e.message);
    }
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
  const facts = [
    ['👶', tr('Children'), p.children?.length ? p.children.map((c) => tr('{n} yrs', { n: c.age })).join(', ') : '—'], ['📅', tr('Start'), fmtDate(p.start_date)],
    ['⏳', tr('Stay'), months], ['⏰', tr('Hours / week'), p.weekly_hours], ['💶', tr('Pocket money'), p.pocket_money && tr('{amount} / month', { amount: p.pocket_money })],
    ['🚗', tr('Needs driver'), yes(p.needs_driver)], ['🐾', tr('Pets'), yes(p.has_pets)], ['🛏️', tr('Private room'), yes(p.private_room)],
  ];

  return (
    <Screen padded={false}>
      <Stack.Screen options={{ title: u.name }} />
      {u.role === 'aupair' ? (
        <View style={{ alignSelf: 'center', width: W }}>
          <PosterHeader u={u} p={p} width={W} badge={d.match ? <Text style={{ marginTop: 12, backgroundColor: d.match.score >= 75 ? C.like : C.primary, color: '#fff', fontWeight: '700', paddingHorizontal: 12, paddingVertical: 5, borderRadius: 999, overflow: 'hidden' }}>{tr('{score}% match', { score: d.match.score })}</Text> : null} />
          <T small muted style={{ textAlign: 'center', marginTop: 10 }}>{d.rating.count ? `★ ${d.rating.avg} (${trn(d.rating.count, '{n} review', '{n} reviews')}) · ` : ''}{trn(d.placements_completed, '{n} completed placement', '{n} completed placements')}</T>
        </View>
      ) : <View style={{ alignSelf: 'center', width: W }}>
        <Gallery user={u} style={{ width: W, height: W * 4 / 3 }}>
          <Shade />
          {d.match ? <Text style={{ position: 'absolute', top: 22, right: 14, backgroundColor: d.match.score >= 75 ? C.like : 'rgba(0,0,0,0.55)', color: '#fff', fontWeight: '700', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, overflow: 'hidden' }}>{tr('{score}% match', { score: d.match.score })}</Text> : null}
          <View style={{ position: 'absolute', left: 16, right: 16, bottom: 16 }} pointerEvents="none">
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={{ color: '#fff', fontSize: 33, fontFamily: HEADING, flexShrink: 1 }}>{u.name}{u.role === 'aupair' && p.age ? <Text style={{ opacity: 0.85 }}>  {p.age}</Text> : null}</Text>
              {u.verification.id ? <Ionicons name="checkmark-circle" size={26} color="#6cc4ff" accessibilityLabel={tr('ID verified')} /> : null}
            </View>
            <Text style={{ color: '#fff', fontSize: 15 }}>{u.role === 'aupair' ? tr('Au pair') : tr('Host family')} · {flag(u.country)} {[u.city, country(u.country)].filter(Boolean).join(', ')}</Text>
            <Text style={{ color: '#fff', fontSize: 14, opacity: 0.9 }}>{d.rating.count ? `★ ${d.rating.avg} (${trn(d.rating.count, '{n} review', '{n} reviews')}) · ` : ''}{trn(d.placements_completed, '{n} completed placement', '{n} completed placements')}</Text>
          </View>
        </Gallery>
      </View>}

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
            <Button icon="chatbubble-ellipses" title={tr('Message')} style={{ flex: 1 }} onPress={message} />
            <Button icon="briefcase-outline" title={tr('Propose placement')} kind="secondary" style={{ flex: 1 }} onPress={() => router.push(`/new-placement/${u.id}`)} />
          </View>
        ) : canAct && iLiked ? (
          <Alert level="info" text={`♥ ${tr("You liked them. You'll match if they like you back.")}`} />
        ) : canAct ? (
          <View style={{ gap: 10 }}>
            {likesMe ? <Alert level="ok" text={`💛 ${tr('They like you! Like them back to match.')}`} /> : null}
            <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 20 }}>
              <RoundButton icon="close" color={C.nope} onPress={() => swipe('pass')} label={tr('Pass')} />
              <RoundButton size="sm" icon="star" color={C.super} onPress={() => swipe('super')} label={tr('Super like')} />
              <RoundButton icon="heart" color={C.like} filled onPress={() => swipe('like')} label={tr('Like')} />
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
        <VisaCard visa={d.visa} />

        {u.role === 'aupair' ? <>
          {u.verification.id || u.verification.references || u.verification.background || u.agency ? <Chips>
            {u.verification.id ? <Chip tone="ok" label={`✔ ${tr('ID verified')}`} /> : null}
            {u.verification.references ? <Chip tone="ok" label={`✔ ${tr('References')}`} /> : null}
            {u.verification.background ? <Chip tone="ok" label={`✔ ${tr('Background check')}`} /> : null}
            {u.agency ? <Chip tone="ok" label={`🎓 ${tr('Prepared by {agency}', { agency: u.agency })}`} /> : null}
          </Chips> : null}
          <View style={{ marginHorizontal: -16 }}><PosterBody u={u} p={p} refs={d.references} /></View>
        </> : <>
        <Card>
          <T bold>{tr('About us')}</T>
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
          <T bold>{tr('Languages at home')}</T>
          <Chips>{(p.languages || []).map((l) => <Chip key={l} label={langName(l)} />)}</Chips>
          <T bold>{tr('Au pair must speak')}</T>
          <Chips>{(p.required_languages || []).length ? p.required_languages.map((l) => <Chip key={l} label={langName(l)} />) : <T muted>{tr('No requirement')}</T>}</Chips>
        </Card>
        </>}

        <Card>
          <T bold>{tr('Reviews')}</T>
          {d.rating.count ? (
            <View style={{ gap: 8 }}>
              <T h2>★ {d.rating.avg} · {trn(d.rating.count, '{n} review', '{n} reviews')}</T>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: 10, justifyContent: 'space-between' }}>
                {Object.entries(d.rating.criteria).map(([k, v]) => (
                  <View key={k} style={{ width: '48%', gap: 3 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><T small style={{ flex: 1 }}>{CRIT_LABEL[k] ? tr(CRIT_LABEL[k]) : k}</T><T small bold>{v}</T></View>
                    <View style={{ height: 6, borderRadius: 3, backgroundColor: '#e4e7ec', overflow: 'hidden' }}><View style={{ width: `${v * 20}%`, height: '100%', backgroundColor: C.primary }} /></View>
                  </View>
                ))}
              </View>
            </View>
          ) : null}
          {d.reviews.length ? d.reviews.map((r) => (
            <View key={r.id} style={{ borderTopWidth: 1, borderColor: '#e4e7ec', paddingTop: 10, gap: 4 }}>
              <Stars value={r.score ?? r.overall} />
              <T small muted>{tr('by {name}', { name: r.reviewer_name })} · {fmtDate(r.start_date)} – {fmtDate(r.end_date)}</T>
              <T>{r.comment}</T>
              {r.response ? <Alert level="info" text={`${tr('Response')}: ${r.response}`} /> : null}
            </View>
          )) : <T muted>{tr('No reviews yet. Reviews only come from real placements.')}</T>}
        </Card>

        {!isMe ? <Button small kind="ghost" icon="flag-outline" title={tr('Report this profile')} onPress={() => ask(tr('What is wrong with this profile?'), async (reason) => {
          await api('/reports', { method: 'POST', body: { target_user_id: u.id, reason } }); setNote(tr('Thanks, our team will look into it.'));
        })} /> : null}
        {!isMe && !d.blocked ? <Button small kind="ghost" icon="ban-outline" title={tr('Block')} onPress={block} /> : null}
      </View>

      <MatchModal match={match} me={me.user} onClose={() => setMatch(null)}
        onMessage={() => { const cid = match.conversation_id; setMatch(null); router.push(`/chat/${cid}`); }} />
    </Screen>
  );
}
