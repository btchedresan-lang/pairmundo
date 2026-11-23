// The check-in QR code for one of the manager's meetups, big enough to show at the door.
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Image } from 'expo-image';
import { api, authHeaders, imageUrl } from '../../../api';
import { fmtTime } from '../../../data';
import { tr } from '../../../i18n';
import { Alert, Loading, Screen, T } from '../../../components/ui';

export default function CheckinQr() {
  const { id } = useLocalSearchParams();
  const [m, setM] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => { api(`/meetups/${id}`).then((x) => setM(x.meetup)).catch((e) => { setError(e.message); setM(false); }); }, [id]);
  if (m === null) return <Loading />;
  if (!m) return <Screen><Alert level="error" text={error} /></Screen>;
  return (
    <Screen>
      <T h2 style={{ textAlign: 'center' }}>{m.title}</T>
      <T muted style={{ textAlign: 'center' }}>{fmtTime(m.starts_at)} · {m.place}</T>
      <View style={{ alignItems: 'center', marginVertical: 12 }}>
        <Image source={{ uri: imageUrl(`/api/meetups/${id}/qr.png`), headers: authHeaders() }} style={{ width: 300, height: 300 }} contentFit="contain" />
      </View>
      {m.checkin?.code ? <T h1 style={{ textAlign: 'center', letterSpacing: 6 }}>{m.checkin.code}</T> : null}
      <T muted style={{ textAlign: 'center' }}>{tr('People scan this with their phone camera, or type the code on the meetup page in the app.')}</T>
      {m.checkin ? <T small muted style={{ textAlign: 'center' }}>{tr('{c} checked in, {n} new to the community.', { c: m.checkin.count, n: m.checkin.newcomers })}</T> : null}
    </Screen>
  );
}
