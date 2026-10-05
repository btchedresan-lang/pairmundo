import { useEffect, useState } from 'react';
import { Linking, Pressable, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { api } from '../../api';
import { cname } from '../../data';
import { Alert, Card, Loading, Screen, T } from '../../components/ui';
import { C } from '../../theme';

export default function ProgramDetail() {
  const { code } = useLocalSearchParams();
  const [p, setP] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => { api(`/programs/${code}`).then(setP).catch((e) => setError(e.message)); }, [code]);
  if (error) return <Screen><Alert level="error" text={error} /></Screen>;
  if (!p) return <Loading />;
  const rows = [['Visa / route', p.visa], ['Age', `${p.min_age}–${p.max_age}`], ['Max hours', `${p.max_weekly_hours} per week${p.max_daily_hours ? `, ${p.max_daily_hours} per day` : ''}`],
    ['Pocket money', `${p.min_pocket_money ? `From ${p.min_pocket_money} ${p.currency}/month. ` : ''}${p.pocket_money_note || ''}`], ['Stay', `${p.min_months}–${p.max_months} months`],
    ['Agency required', p.agency_required ? 'Yes' : 'No'], ...(p.notes ? [['Notes', p.notes]] : [])];
  return (
    <Screen>
      <Stack.Screen options={{ title: cname(p.code) }} />
      {p.status_note ? <Alert level={p.status === 'closed' ? 'error' : 'warning'} text={p.status_note} /> : null}
      <Card>{rows.map(([k, v]) => <View key={k} style={{ gap: 2 }}><T small muted>{k}</T><T>{v}</T></View>)}</Card>
      <Card><T bold>Host family obligations</T>{p.family_obligations.map((o) => <T key={o}>• {o}</T>)}</Card>
      <Pressable onPress={() => Linking.openURL(p.official_source)}><T small style={{ color: C.primary }}>Official source ↗</T></Pressable>
      <T small muted>Last reviewed {p.last_reviewed}. Rules change, so always confirm with the official source.</T>
    </Screen>
  );
}
