// One meetup: when and where, who is going, join or leave, the group chat for people going, and report or cancel.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, Pressable, View } from 'react-native';
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../api';
import { fmtTime } from '../../data';
import { tr, trn } from '../../i18n';
import { Alert, Button, Card, Field, Loading, Photo, Screen, T } from '../../components/ui';
import { confirmAsync } from '../../components/dialogs';
import { Badge, MEETUP_KINDS } from '../../components/Meetups';
import { askToFinishProfile } from '../setup';
import { C, useTheme } from '../../theme';

export default function Meetup() {
  const { id } = useLocalSearchParams();
  const t = useTheme();
  const [m, setM] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [reason, setReason] = useState('');
  const [note, setNote] = useState(null);
  const load = useCallback(() => api(`/meetups/${id}`).then((d) => { setM(d.meetup); setError(null); })
    .catch((e) => { setError(e.message); setM((x) => x || false); }), [id]);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  if (m === null) return <Loading />;
  if (!m) return <Screen><Alert level="error" text={error || tr('This meetup is no longer available.')} /></Screen>;

  const [emoji, kindLabel] = MEETUP_KINDS[m.kind] || MEETUP_KINDS.other;
  const past = m.started;
  const full = m.max_people && m.going >= m.max_people && !m.i_am_going;
  const act = async (fn) => {
    setBusy(true); setError(null);
    try { await fn(); await load(); } catch (e) {
      if (e.data?.code === 'email_unverified') router.push('/verify-email');
      else if (e.data?.code === 'profile_incomplete') askToFinishProfile();
      else setError(e.message);
    } finally { setBusy(false); }
  };
  const join = () => act(() => api(`/meetups/${m.id}/join`, { method: 'POST' }));
  const leave = () => act(() => api(`/meetups/${m.id}/join`, { method: 'DELETE' }));
  const cancel = async () => {
    if (!(await confirmAsync(tr('Cancel this meetup?'), tr("Everyone going gets a notification that it's cancelled."), tr('Cancel meetup'), true))) return;
    act(() => api(`/meetups/${m.id}/cancel`, { method: 'POST' }));
  };
  const report = () => act(async () => {
    await api(`/meetups/${m.id}/report`, { method: 'POST', body: { reason } });
    setReporting(false); setReason(''); setNote(tr('Thanks for telling us. Our team will look at it.'));
  });

  return (
    <Screen>
      <Stack.Screen options={{ title: kindLabel ? tr(kindLabel) : tr('Meetup') }} />
      {error ? <Alert level="error" text={error} /> : null}
      {note ? <Alert level="ok" text={note} /> : null}
      <Card>
        <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
          <View style={{ width: 56, height: 56, borderRadius: 16, backgroundColor: t.tint, alignItems: 'center', justifyContent: 'center' }}><T style={{ fontSize: 30, lineHeight: 38 }}>{emoji}</T></View>
          <T h2 style={{ flex: 1 }}>{m.title}</T>
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {m.official ? <Badge text={`✔ ${tr('Official')} · ${m.agency}`} color={C.ok} /> : null}
          {m.external ? <Badge text={`↗ ${tr('Organised by {name}', { name: m.organizer })}`} color="#3b5bdb" /> : null}
          {m.status === 'cancelled' ? <Badge text={tr('Cancelled')} color={C.nope} /> : null}
          {m.status === 'hidden' ? <Badge text={tr('Under review')} color={C.warn} /> : null}
        </View>
        <Row icon="time-outline" text={`${fmtTime(m.starts_at)}${m.ends_at ? ` – ${fmtTime(m.ends_at)}` : ''}`} />
        <Row icon="location-outline" text={m.place ? `${m.place}${m.area ? ` · ${m.area}` : ''}, ${m.city}` : `${m.area ? `${m.area}, ` : ''}${m.city}`} />
        {!m.place ? <T small muted>{tr('The exact place shows once you join.')}</T> : null}
        {!m.external ? <Row icon="people-outline" text={m.max_people ? tr('{n} of {max} going', { n: m.going, max: m.max_people }) : trn(m.going, '1 going', '{n} going')} /> : null}
        {m.about ? <T>{m.about}</T> : null}
        {m.host ? (
          <Pressable onPress={() => router.push(`/user/${m.host.id}`)} style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
            <Photo user={m.host} rounded style={{ width: 36, height: 36 }} />
            <T small>{tr('Hosted by {name}', { name: m.official ? m.agency : m.host.name })}{m.host.verification?.id ? ' · ✔ ID' : ''}</T>
          </Pressable>
        ) : null}
      </Card>

      {m.external ? <Button icon="open-outline" title={tr('Sign up on their site')} onPress={() => Linking.openURL(m.external_url).catch(() => {})} />
        : m.i_host ? (m.status === 'open' && !past ? <Button kind="danger" icon="close-circle-outline" title={tr('Cancel meetup')} loading={busy} onPress={cancel} /> : null)
          : m.i_am_going ? <Button kind="secondary" icon="exit-outline" title={tr("I can't come")} loading={busy} onPress={leave} />
            : m.status === 'open' && !past ? <Button icon="checkmark-circle-outline" title={full ? tr('Full') : tr("I'm going")} disabled={full} loading={busy} onPress={join} /> : null}

      {m.attendees ? (
        <Card>
          <T bold>{tr("Who's going")}</T>
          {m.attendees.length ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
              {m.attendees.map((a) => (
                <Pressable key={a.id} onPress={() => router.push(`/user/${a.id}`)} style={{ alignItems: 'center', width: 64 }}>
                  <Photo user={a} rounded style={{ width: 48, height: 48 }} />
                  <T small numberOfLines={1}>{a.name.split(' ')[0]}</T>
                </Pressable>
              ))}
            </View>
          ) : <T small muted>{tr('Nobody yet. Share it with friends nearby.')}</T>}
        </Card>
      ) : null}

      {(m.i_am_going || m.i_host) && !m.external ? <GroupChat id={m.id} /> : null}

      <Alert level="info" text={tr('Meet in the public place named here, tell someone where you are going, and leave if anything feels wrong.')} />
      {!m.i_host ? (reporting ? (
        <Card>
          <Field label={tr('What happened?')} value={reason} onChangeText={setReason} multiline />
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Button small kind="ghost" title={tr('Cancel')} style={{ flex: 1 }} onPress={() => setReporting(false)} />
            <Button small kind="danger" title={tr('Report')} style={{ flex: 2 }} disabled={!reason.trim()} loading={busy} onPress={report} />
          </View>
        </Card>
      ) : <Button small kind="ghost" icon="flag-outline" title={tr('Report this meetup')} onPress={() => setReporting(true)} />) : null}
    </Screen>
  );
}

function Row({ icon, text }) {
  const t = useTheme();
  return <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}><Ionicons name={icon} size={18} color={t.muted} style={{ marginTop: 2 }} /><T style={{ flex: 1 }}>{text}</T></View>;
}

/** A simple group chat for the host and the people going, refreshed every few seconds while open. */
function GroupChat({ id }) {
  const t = useTheme();
  const [msgs, setMsgs] = useState([]);
  const [text, setText] = useState('');
  const [error, setError] = useState(null);
  const last = useRef(0);
  const add = (items) => {
    if (!items.length) return;
    last.current = Math.max(last.current, ...items.map((x) => x.id));
    setMsgs((cur) => [...cur, ...items.filter((x) => !cur.some((y) => y.id === x.id))]);
  };
  useEffect(() => {
    let alive = true;
    const poll = () => api(`/meetups/${id}/messages?after=${last.current}`).then((d) => alive && add(d.messages)).catch(() => {});
    poll();
    const timer = setInterval(poll, 5000);
    return () => { alive = false; clearInterval(timer); };
  }, [id]);
  const send = async () => {
    const body = text.trim(); if (!body) return;
    setText('');
    try { const r = await api(`/meetups/${id}/messages`, { method: 'POST', body: { body } }); add([{ ...r, sender: null }]); }
    catch (e) { setText(body); setError(e.message); }
  };
  return (
    <Card>
      <T bold>{tr('Group chat')}</T>
      {error ? <Alert level="error" text={error} /> : null}
      {msgs.length ? msgs.map((x) => (
        <View key={x.id} style={{ alignSelf: x.mine ? 'flex-end' : 'flex-start', maxWidth: '85%', backgroundColor: x.mine ? C.primary : t.soft, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 8 }}>
          {!x.mine && x.sender ? <T small bold>{x.sender.name.split(' ')[0]}</T> : null}
          <T style={{ color: x.mine ? '#fff' : t.ink }}>{x.body}</T>
        </View>
      )) : <T small muted>{tr('Say hello, or tell people how to find you there.')}</T>}
      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-end' }}>
        <Field style={{ flex: 1 }} value={text} onChangeText={setText} placeholder={tr('Message')} maxLength={1000} />
        <Button small icon="send" title={tr('Send')} disabled={!text.trim()} onPress={send} />
      </View>
    </Card>
  );
}
