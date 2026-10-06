import { useEffect, useState } from 'react';
import { Linking, Pressable, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { api } from '../../api';
import { cname } from '../../data';
import { Alert, Card, Loading, Screen, T } from '../../components/ui';
import { C } from '../../theme';
import { tr } from '../../i18n';

export default function ProgramDetail() {
  const { code } = useLocalSearchParams();
  const [p, setP] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => { api(`/programs/${code}`).then(setP).catch((e) => setError(e.message)); }, [code]);
  if (error) return <Screen><Alert level="error" text={error} /></Screen>;
  if (!p) return <Loading />;
  const rows = [[tr('Visa / route'), p.visa], [tr('Age'), `${p.min_age}–${p.max_age}`],
    [tr('Max hours'), `${tr('{n} per week', { n: p.max_weekly_hours })}${p.max_daily_hours ? `, ${tr('{n} per day', { n: p.max_daily_hours })}` : ''}`],
    [tr('Pocket money'), `${p.min_pocket_money ? `${tr('From {amount}/month.', { amount: `${p.min_pocket_money} ${p.currency}` })} ` : ''}${p.pocket_money_note || ''}`],
    [tr('Stay'), tr('{min}–{max} months', { min: p.min_months, max: p.max_months })],
    [tr('Agency required'), p.agency_required ? tr('Yes') : tr('No')], ...(p.notes ? [[tr('Notes'), p.notes]] : [])];
  return (
    <Screen>
      <Stack.Screen options={{ title: cname(p.code) }} />
      {p.status_note ? <Alert level={p.status === 'closed' ? 'error' : 'warning'} text={p.status_note} /> : null}
      <Card>{rows.map(([k, v]) => <View key={k} style={{ gap: 2 }}><T small muted>{k}</T><T>{v}</T></View>)}</Card>
      <Card><T bold>{tr('Host family obligations')}</T>{p.family_obligations.map((o) => <T key={o}>• {o}</T>)}</Card>
      <Pressable onPress={() => Linking.openURL(p.official_source)}><T small style={{ color: C.primary }}>{tr('Official source')} ↗</T></Pressable>
      <T small muted>{tr('Last reviewed {date}. Rules change, so always confirm with the official source.', { date: p.last_reviewed })}</T>
    </Screen>
  );
}
