// Host a meetup in your Nearby city: what, when, and which public place.
import { useState } from 'react';
import { Platform, Switch, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as Location from 'expo-location';
import { api } from '../api';
import { useAuth } from '../auth';
import { tr } from '../i18n';
import { Alert, Button, ChoiceChips, Field, Screen, T } from '../components/ui';
import { DateField } from '../components/pickers';
import { MEETUP_KINDS } from '../components/Meetups';
import { C } from '../theme';

const TIMES = ['09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00', '20:00'];
const SIZES = { 4: '4', 6: '6', 8: '8', 12: '12', 20: '20', 30: '30' };

export default function NewMeetup() {
  const { me } = useAuth();
  const { city } = useLocalSearchParams();
  const isFamily = me.user.role === 'family';
  const [f, setF] = useState({ kind: isFamily ? 'playdate' : 'coffee', title: '', place: '', area: '', about: '', date: null, time: '15:00', max_people: '8' });
  const [publicPlace, setPublicPlace] = useState(false);
  // The date picker's range, fixed when the screen opens.
  const [range] = useState(() => { const now = Date.now(); return { min: new Date(now), max: new Date(now + 90 * 86400e3), tomorrow: new Date(now + 86400e3) }; });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v }));
  const kinds = Object.fromEntries(Object.entries(MEETUP_KINDS).filter(([k]) => isFamily || k !== 'playdate').map(([k, [e, l]]) => [k, `${e} ${tr(l)}`]));
  const save = async () => {
    setBusy(true); setError(null);
    try {
      const starts = new Date(`${f.date}T${f.time}:00`);
      // Find the public place for the map pin with the phone's own geocoder. No pin if it can't be found.
      let pin = {};
      if (Platform.OS !== 'web') {
        try {
          const [hit] = await Location.geocodeAsync([f.place, f.area, city].filter(Boolean).join(', '));
          if (hit) pin = { lat: hit.latitude, lng: hit.longitude };
        } catch { /* no pin */ }
      }
      const { meetup } = await api('/meetups', { method: 'POST', body: { kind: f.kind, title: f.title, place: f.place, area: f.area, about: f.about,
        starts_at: starts.toISOString(), max_people: Number(f.max_people), public_place: publicPlace, ...pin } });
      router.replace(`/meetup/${meetup.id}`);
    } catch (e) {
      if (e.data?.code === 'email_unverified') router.push('/verify-email'); else setError(e.message);
    } finally { setBusy(false); }
  };
  return (
    <Screen>
      <T muted>{isFamily ? tr('Families near you will see it in Nearby. Pick a public place, like a playground, a park or a café.')
        : tr('Au pairs near you will see it in Nearby. Pick a public place, like a café, a park or a library.')}</T>
      {error ? <Alert level="error" text={error} /> : null}
      <ChoiceChips label={tr('What kind of meetup?')} options={kinds} value={f.kind} onChange={(v) => v && set('kind')(v)} />
      <Field label={tr('Title')} value={f.title} onChangeText={set('title')} maxLength={80}
        placeholder={isFamily ? tr('For example: Sunday playdate at the park') : tr('For example: Fika and Swedish practice')} />
      <DateField label={tr('Date')} value={f.date} onChange={set('date')} minimumDate={range.min} maximumDate={range.max} initial={range.tomorrow} />
      <ChoiceChips label={tr('Time')} options={Object.fromEntries(TIMES.map((x) => [x, x]))} value={f.time} onChange={(v) => v && set('time')(v)} />
      <Field label={tr('Public place')} hint={tr('Only people who join see this. Everyone else sees the neighbourhood.')} value={f.place} onChangeText={set('place')} maxLength={120}
        placeholder={tr('For example: Café Saturnus, Eriksbergsgatan 6')} />
      <Field label={tr('Neighbourhood')} value={f.area} onChangeText={set('area')} maxLength={80} placeholder={tr('For example: Östermalm')} />
      <Field label={tr('More about it (optional)')} value={f.about} onChangeText={set('about')} multiline maxLength={1000} />
      <ChoiceChips label={tr('How many people can come?')} options={SIZES} value={f.max_people} onChange={(v) => v && set('max_people')(v)} />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Switch value={publicPlace} onValueChange={setPublicPlace} trackColor={{ true: C.primary }} accessibilityLabel={tr('It is in a public place')} />
        <T style={{ flex: 1 }}>{tr('It is in a public place, not at anyone\'s home.')}</T>
      </View>
      <Button icon="megaphone-outline" title={tr('Host meetup')} loading={busy} disabled={!f.title.trim() || !f.place.trim() || !f.date || !publicPlace} onPress={save} />
    </Screen>
  );
}
