// Shared pieces of Nearby: meetup kinds, the meetup card, and the approximate location lookup.
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import * as Location from 'expo-location';
import { fmtTime } from '../data';
import { tr, trn } from '../i18n';
import { T } from './ui';
import { C, lift, useTheme } from '../theme';

export const MEETUP_KINDS = { coffee: ['☕', 'Coffee'], walk: ['🚶', 'Walk'], picnic: ['🧺', 'Picnic'], playdate: ['🛝', 'Playdate'], sport: ['⚽', 'Sport'],
  language: ['🗣️', 'Language exchange'], culture: ['🎨', 'Museum or culture'], other: ['✨', 'Something else'] };
/** Asks the phone for an approximate position once, and turns it into a city on the phone. */
export async function approximateCity() {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') throw new Error(tr('Location is off for PairMundo. Type your city instead.'));
  const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low });
  const { latitude: lat, longitude: lng } = pos.coords;
  const [place] = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng }).catch(() => []);
  return { lat, lng, city: place?.city || place?.subregion || place?.region || '', country: place?.isoCountryCode || '' };
}

export function MeetupCard({ m }) {
  const t = useTheme();
  const [emoji] = MEETUP_KINDS[m.kind] || MEETUP_KINDS.other;
  return (
    <Pressable onPress={() => router.push(`/meetup/${m.id}`)} style={({ pressed }) => [{ backgroundColor: pressed ? t.soft : t.card, borderRadius: 18, padding: 14, flexDirection: 'row', gap: 12 }, lift.sm]}>
      <View style={{ width: 50, height: 50, borderRadius: 14, backgroundColor: t.tint, alignItems: 'center', justifyContent: 'center' }}><T style={{ fontSize: 26, lineHeight: 32 }}>{emoji}</T></View>
      <View style={{ flex: 1, gap: 2 }}>
        <T bold numberOfLines={2}>{m.title}</T>
        <T small muted>{fmtTime(m.starts_at)} · {m.area || m.city}</T>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 2 }}>
          {m.official ? <Badge text={`✔ ${tr('Official')} · ${m.agency}`} color={C.ok} /> : null}
          {m.external ? <Badge text={`↗ ${m.organizer || tr('External')}`} color="#3b5bdb" /> : null}
          {m.status === 'cancelled' ? <Badge text={tr('Cancelled')} color={C.nope} /> : null}
          {m.i_host ? <Badge text={tr('You host')} color={C.primary} /> : m.i_am_going ? <Badge text={tr("You're going")} color={C.primary} /> : null}
          {!m.external ? <Badge text={m.max_people ? tr('{n} of {max} going', { n: m.going, max: m.max_people }) : trn(m.going, '1 going', '{n} going')} color={t.muted} /> : null}
        </View>
      </View>
    </Pressable>
  );
}

export const Badge = ({ text, color }) => (
  <View style={{ borderWidth: 1, borderColor: color, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 }}>
    <T small style={{ color, fontSize: 12 }}>{text}</T>
  </View>
);
