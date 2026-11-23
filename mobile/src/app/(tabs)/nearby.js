// Nearby: au pairs meet other au pairs, and families other families, in their city, plus group meetups in public
// places. Off until the person turns it on; only their city (and a rounded point, if they share it) is kept.
import { useCallback, useMemo, useState } from 'react';
import { Modal, Pressable, RefreshControl, ScrollView, Share, Switch, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../api';
import { useAuth } from '../../auth';
import { country, firstName, flag, langName } from '../../data';
import { tr, trn } from '../../i18n';
import { Alert, Button, Card, Field, Loading, Photo, T, useInsets } from '../../components/ui';
import { CountryPicker } from '../../components/pickers';
import { confirmAsync } from '../../components/dialogs';
import { approximateCity, MeetupCard } from '../../components/Meetups';
import { NearbyMap } from '../../components/NearbyMap';
import { brand, C, lift, useTheme } from '../../theme';

const distanceText = (d, city) => (d ? tr('Under {km} km away', { km: d }) : tr('In {city}', { city }));

export default function Nearby() {
  const { me } = useAuth();
  const t = useTheme();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(false);
  const [view, setView] = useState('list');
  const isFamily = me.user.role === 'family';
  const load = useCallback(() => api('/nearby').then((d) => { setData(d); setError(null); }).catch((e) => { setError(e.message); setData((x) => x || {}); }), []);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  if (!data) return <Loading />;

  if (!data.settings) {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: t.bg }} contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 40 }}>
        {error ? <Alert level="error" text={error} /> : null}
        <Card style={{ alignItems: 'center', gap: 8 }}>
          <T style={{ fontSize: 44, lineHeight: 54 }}>{isFamily ? '🏡' : '🌍'}</T>
          <T h2 style={{ textAlign: 'center' }}>{isFamily ? tr('Meet host families near you') : tr('Meet au pairs near you')}</T>
          <T muted style={{ textAlign: 'center' }}>{isFamily
            ? tr('Find other host families in your city, join playdates and coffee meetups, and share tips about hosting.')
            : tr('New in town? Find other au pairs in your city, say hi, and join coffee, walks and language meetups.')}</T>
        </Card>
        <Card>
          <T bold>{tr('Your privacy comes first')}</T>
          {[[ 'eye-off-outline', tr('Off until you turn it on. Turn it off any time and we forget your city.')],
            ['location-outline', tr('Others see your city and a rough distance like "under 5 km", never where you live.')],
            ['people-outline', isFamily ? tr('Families see families. Au pairs see au pairs.') : tr('Au pairs see au pairs. Families only find you if you say so.')],
            ['shield-checkmark-outline', tr('Meetups are in public places. Block or report anyone, any time.')]].map(([icon, text]) => (
            <View key={icon} style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
              <Ionicons name={icon} size={20} color={C.primary} style={{ marginTop: 1 }} />
              <T style={{ flex: 1 }}>{text}</T>
            </View>
          ))}
        </Card>
        <SettingsForm me={me} onSaved={load} />
        {data.my_meetups?.length ? <MeetupList title={tr('Your meetups')} items={data.my_meetups} /> : null}
      </ScrollView>
    );
  }

  const s = data.settings, city = data.city;
  const invite = () => Share.share({ message: isFamily
    ? tr('Join me on {app}: host families in {city} meet up for playdates and coffee. {link}', { app: brand.name, city: s.city, link: 'https://pairmundo.com' })
    : tr('Join me on {app}: au pairs in {city} meet up for coffee, walks and language exchange. {link}', { app: brand.name, city: s.city, link: 'https://pairmundo.com' }) }).catch(() => {});
  const hostMeetup = () => {
    if (data.host_rule === 'id') {
      confirmAsync(tr('Verify your ID to host'), tr('To keep meetups safe, hosts verify their ID first. Anyone can join a meetup.'), tr('Verify my ID'))
        .then((ok) => ok && router.push('/account')).catch(() => {});
    } else router.push(`/new-meetup?city=${encodeURIComponent(s.city)}&country=${s.country}`);
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: t.bg }} contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 40 }}
      refreshControl={<RefreshControl refreshing={false} onRefresh={load} />}>
      {error ? <Alert level="error" text={error} /> : null}
      <Pressable onPress={() => setEditing(true)} style={[{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: t.card, borderRadius: 18, padding: 14 }, lift.sm]}>
        <Ionicons name="location" size={22} color={C.primary} />
        <View style={{ flex: 1 }}>
          <T bold>{`${flag(s.country)} ${s.city}`}</T>
          <T small muted>{s.visible ? (isFamily ? tr('Families nearby can see you') : tr('Au pairs nearby can see you')) : tr('Hidden: you browse meetups only')}
            {!isFamily && s.families_can_find ? ` · ${tr('Families can find you')}` : ''}</T>
        </View>
        <T small style={{ color: C.primary, fontWeight: '700' }}>{tr('Settings')}</T>
      </Pressable>

      <View style={{ flexDirection: 'row', backgroundColor: t.card, borderRadius: 999, padding: 4 }}>
        {[['list', 'list-outline', tr('List')], ['map', 'map-outline', tr('Map')]].map(([k, icon, label]) => (
          <Pressable key={k} onPress={() => setView(k)} accessibilityRole="button" accessibilityState={{ selected: view === k }}
            style={{ flex: 1, flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center', paddingVertical: 9, borderRadius: 999, backgroundColor: view === k ? C.primary : 'transparent' }}>
            <Ionicons name={icon} size={17} color={view === k ? '#fff' : t.ink} />
            <T bold style={{ color: view === k ? '#fff' : t.ink }}>{label}</T>
          </Pressable>
        ))}
      </View>

      {view === 'map' ? <MapPane isFamily={isFamily} onHost={hostMeetup} /> : <>

      {data.hellos?.length ? (
        <View style={{ gap: 10 }}>
          <T h2>{tr('Said hi to you')}</T>
          {data.hellos.map((h) => <HelloCard key={h.id} hello={h} onDone={load} />)}
        </View>
      ) : null}

      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <T h2 style={{ flex: 1 }}>{tr('Meetups in {city}', { city: s.city })}</T>
        <Button small icon="add" title={tr('Host')} onPress={hostMeetup} />
      </View>
      {data.meetups?.length ? data.meetups.map((m) => <MeetupCard key={m.id} m={m} />) : (
        <Card style={{ alignItems: 'center' }}>
          <T style={{ fontSize: 36, lineHeight: 44 }}>☕</T>
          <T bold style={{ textAlign: 'center' }}>{tr('Be the first to host a meetup in {city}', { city: s.city })}</T>
          <T small muted style={{ textAlign: 'center' }}>{isFamily ? tr('A playdate in the park or a coffee is a great start. Pick a public place and a time.')
            : tr('A coffee, a walk or a language exchange is a great start. Pick a public place and a time.')}</T>
          <Button icon="add-circle-outline" title={tr('Host a meetup')} onPress={hostMeetup} style={{ alignSelf: 'stretch' }} />
        </Card>
      )}
      {data.my_meetups?.some((m) => !data.meetups?.some((x) => x.id === m.id)) ? (
        <MeetupList title={tr('Your other meetups')} items={data.my_meetups.filter((m) => !data.meetups?.some((x) => x.id === m.id))} />
      ) : null}

      <T h2>{isFamily ? tr('Families nearby') : tr('Au pairs nearby')}</T>
      {!s.visible ? <Alert level="info" text={tr('You are hidden, so you see meetups only. Show yourself in Settings to see others nearby.')} />
        : !city.unlocked ? (
          <Card style={{ alignItems: 'center' }}>
            <T style={{ fontSize: 36, lineHeight: 44 }}>🌱</T>
            <T bold style={{ textAlign: 'center' }}>{isFamily
              ? trn(city.needed, '1 more family in {city} and you can see each other', '{n} more families in {city} and you can see each other', { city: s.city })
              : trn(city.needed, '1 more au pair in {city} and you can see each other', '{n} more au pairs in {city} and you can see each other', { city: s.city })}</T>
            <T small muted style={{ textAlign: 'center' }}>{tr('For your safety, a city shows its people once at least {n} are on Nearby. Invite friends to get there sooner.', { n: data.min_people })}</T>
            <Button icon="paper-plane-outline" kind="secondary" title={isFamily ? tr('Invite a family you know') : tr('Invite an au pair friend')} onPress={invite} style={{ alignSelf: 'stretch' }} />
          </Card>
        ) : data.people.length ? data.people.map((p) => <PersonRow key={p.user.id} p={p} city={s.city} onDone={load} />)
          : <T muted>{tr('Nobody else to show right now. Check back soon.')}</T>}

      </>}

      <Alert level="info" text={tr('Stay safe: meet in public places, tell someone where you are going, and never share your home address before you trust someone. Report anything that feels wrong.')} />

      <Modal visible={editing} animationType="slide" transparent onRequestClose={() => setEditing(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }}>
          <SettingsSheet me={me} settings={s} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); load(); }} />
        </View>
      </Modal>
    </ScrollView>
  );
}

/** City, country and who can see you. Used to turn Nearby on and, in the sheet, to change it. */
function SettingsForm({ me, settings, onSaved }) {
  const isFamily = me.user.role === 'family';
  const [city, setCity] = useState(settings?.city ?? me.user.city ?? '');
  const [cc, setCc] = useState(settings?.country ?? me.user.country ?? null);
  const [point, setPoint] = useState(null);
  const [visible, setVisible] = useState(settings ? settings.visible : true);
  const [findable, setFindable] = useState(!!settings?.families_can_find);
  const [busy, setBusy] = useState(false);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState(null);
  const locate = async () => {
    setLocating(true); setError(null);
    try {
      const p = await approximateCity();
      setPoint({ lat: p.lat, lng: p.lng });
      if (p.city) setCity(p.city);
      if (p.country) setCc(p.country);
    } catch (e) { setError(e.message); } finally { setLocating(false); }
  };
  const save = async () => {
    setBusy(true); setError(null);
    try {
      await api('/me/nearby', { method: 'PUT', body: { city, country: cc, visible, families_can_find: findable,
        ...(point || {}) } });
      onSaved();
    } catch (e) {
      if (e.data?.code === 'email_unverified') router.push('/verify-email'); else setError(e.message);
    } finally { setBusy(false); }
  };
  return (
    <Card>
      {error ? <Alert level="error" text={error} /> : null}
      <Field label={tr('Your city')} value={city} onChangeText={(v) => { setCity(v); setPoint(null); }} placeholder={tr('For example: Stockholm')} />
      <CountryPicker label={tr('Country')} value={cc} onChange={setCc} />
      <Button small kind="secondary" icon="navigate-outline" title={point ? tr('Approximate location added') : tr('Use my approximate location')} loading={locating} onPress={locate} />
      <T small muted>{tr('Optional. It only helps show a rough distance. We round it to about 2 km and never store your exact location.')}</T>
      <Toggle label={isFamily ? tr('Show me to families nearby') : tr('Show me to au pairs nearby')} value={visible} onChange={setVisible} />
      {!isFamily ? <Toggle label={tr('Let families near me find me')} hint={tr('Families looking for an au pair in your city can see your profile with "Find an au pair near you". Off unless you turn it on.')} value={findable} onChange={setFindable} /> : null}
      <Button icon="location-outline" title={settings ? tr('Save') : tr('Turn on Nearby')} loading={busy} disabled={!city.trim() || !cc} onPress={save} />
    </Card>
  );
}

function SettingsSheet({ me, settings, onClose, onSaved }) {
  const t = useTheme();
  const insets = useInsets();
  const off = async () => {
    if (!(await confirmAsync(tr('Turn off Nearby?'), tr('We forget your city and you disappear from Nearby. Meetups you joined stay.'), tr('Turn off'), true))) return;
    await api('/me/nearby', { method: 'DELETE' }).catch(() => {});
    onSaved();
  };
  return (
    <View style={{ backgroundColor: t.bg, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 16, gap: 12, paddingBottom: insets.bottom + 16, maxHeight: '90%' }}>
      <ScrollView contentContainerStyle={{ gap: 12 }} keyboardShouldPersistTaps="handled">
        <T h2>{tr('Nearby settings')}</T>
        <SettingsForm me={me} settings={settings} onSaved={onSaved} />
        <Button kind="danger" icon="power" title={tr('Turn off Nearby')} onPress={off} />
        <Button kind="ghost" small title={tr('Cancel')} onPress={onClose} />
      </ScrollView>
    </View>
  );
}

function Toggle({ label, hint, value, onChange }) {
  return (
    <View style={{ gap: 2 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <T bold style={{ flex: 1 }}>{label}</T>
        <Switch value={value} onValueChange={onChange} trackColor={{ true: C.primary }} accessibilityLabel={label} />
      </View>
      {hint ? <T small muted>{hint}</T> : null}
    </View>
  );
}

function PersonRow({ p, city, onDone }) {
  const t = useTheme();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const hello = async () => {
    setBusy(true); setError(null);
    try {
      const r = await api(`/nearby/people/${p.user.id}/hello`, { method: 'POST', body: { message: tr('Hi {name}! I saw you on Nearby. Want to meet up for a coffee sometime?', { name: firstName(p.user.name) }) } });
      if (r.conversation_id) router.push(`/chat/${r.conversation_id}`); else onDone();
    } catch (e) {
      if (e.data?.code === 'email_unverified') router.push('/verify-email');
      else if (e.data?.code === 'profile_incomplete') router.push('/setup?back=1');
      else setError(e.message);
    } finally { setBusy(false); }
  };
  const about = p.user.role === 'aupair'
    ? [p.nationality ? `${flag(p.nationality)} ${country(p.nationality)}` : null, p.age ? tr('{n} years', { n: p.age }) : null, p.languages?.length ? p.languages.map(langName).join(', ') : null]
    : [p.children ? trn(p.children, '1 child', '{n} children') : null, p.languages?.length ? p.languages.map(langName).join(', ') : null];
  return (
    <View style={[{ backgroundColor: t.card, borderRadius: 18, padding: 12, gap: 8 }, lift.sm]}>
      <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
        <Pressable onPress={() => router.push(`/user/${p.user.id}`)}><Photo user={p.user} rounded style={{ width: 56, height: 56 }} /></Pressable>
        <View style={{ flex: 1, gap: 2 }}>
          <T bold>{p.user.name}{p.user.verification?.id ? ' ✔' : ''}</T>
          <T small muted numberOfLines={1}>{about.filter(Boolean).join(' · ')}</T>
          <T small style={{ color: C.primary }}>{distanceText(p.distance, city)}</T>
        </View>
        {p.hello === 'connected' ? <Button small kind="secondary" icon="chatbubble-outline" title={tr('Chat')} loading={busy} onPress={hello} />
          : p.hello === 'sent' ? <T small muted>{tr('Hi sent')}</T>
            : <Button small icon="hand-left-outline" title={p.hello === 'received' ? tr('Say hi back') : tr('Say hi')} loading={busy} onPress={hello} />}
      </View>
      {error ? <Alert level="error" text={error} /> : null}
    </View>
  );
}

function HelloCard({ hello, onDone }) {
  const [busy, setBusy] = useState(false);
  const answer = async (accept) => {
    setBusy(true);
    try {
      const r = await api(`/nearby/hellos/${hello.id}`, { method: 'POST', body: { accept } });
      if (r.conversation_id) router.push(`/chat/${r.conversation_id}`);
      onDone();
    } catch { onDone(); } finally { setBusy(false); }
  };
  return (
    <Card>
      <Pressable onPress={() => router.push(`/user/${hello.user.id}`)} style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
        <Photo user={hello.user} rounded style={{ width: 48, height: 48 }} />
        <View style={{ flex: 1 }}><T bold>{hello.user.name}</T>{hello.message ? <T small muted>“{hello.message}”</T> : null}</View>
      </Pressable>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Button small kind="ghost" title={tr('No thanks')} style={{ flex: 1 }} disabled={busy} onPress={() => answer(false)} />
        <Button small icon="hand-left-outline" title={tr('Say hi back')} style={{ flex: 2 }} loading={busy} onPress={() => answer(true)} />
      </View>
    </Card>
  );
}

function MeetupList({ title, items }) {
  return <View style={{ gap: 10 }}><T h2>{title}</T>{items.map((m) => <MeetupCard key={m.id} m={m} />)}</View>;
}

/** The map: meetups as pins, and how many people are in each part of town as bubbles. Never a pin per person. */
function MapPane({ isFamily, onHost }) {
  const t = useTheme();
  const [map, setMap] = useState(null);
  const [error, setError] = useState(null);
  const loadMap = useCallback(() => api('/nearby/map').then((d) => { setMap(d); setError(null); }).catch((e) => setError(e.message)), []);
  useFocusEffect(useCallback(() => { loadMap(); }, [loadMap]));
  const labels = useMemo(() => ({ people: isFamily ? tr('families') : tr('au pairs'), other: isFamily ? tr('au pairs') : tr('families') }), [isFamily]);
  if (error) return <Alert level="error" text={error} />;
  if (!map) return <View style={{ height: 420, alignItems: 'center', justifyContent: 'center' }}><T muted>{tr('Loading…')}</T></View>;
  const empty = !map.meetups.length && !map.areas.length && !map.other_areas?.length;
  return (
    <View style={{ gap: 10 }}>
      <NearbyMap meetups={map.meetups} areas={map.areas} otherAreas={map.other_areas || []} center={map.center} labels={labels} onMeetup={(id) => router.push(`/meetup/${id}`)}
        style={{ height: 440, backgroundColor: t.card }} />
      {empty ? (
        <Card style={{ alignItems: 'center' }}>
          <T bold style={{ textAlign: 'center' }}>{tr('Be the first to host a meetup in {city}', { city: map.city.name })}</T>
          <Button icon="add-circle-outline" title={tr('Host a meetup')} onPress={onHost} style={{ alignSelf: 'stretch' }} />
        </Card>
      ) : null}
      <T small muted>{isFamily
        ? tr('Pins are meetups. Bubbles show how many families are in each part of town, never where anyone is. A meetup pin is approximate until you join.')
        : tr('Pins are meetups. Bubbles show how many au pairs are in each part of town, never where anyone is. A meetup pin is approximate until you join.')}</T>
      {!map.city.unlocked ? <T small muted>{tr('Bubbles appear once enough people in {city} are on Nearby.', { city: map.city.name })}</T> : null}
    </View>
  );
}
