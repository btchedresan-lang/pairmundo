import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { api } from '../../api';
import { cname } from '../../data';
import { Alert, Card, Chip, Loading, Screen, T } from '../../components/ui';

const statusChip = (p) => (p.status === 'closed' ? <Chip tone="err" label={p.eu_eea_only ? 'Closed to non-EU' : 'No au pair route'} />
  : p.status === 'paused' ? <Chip tone="warn" label="Visas stalled" /> : <Chip tone="ok" label="Open" />);

export default function Programs() {
  const [list, setList] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => { api('/programs').then((d) => setList(d.programs)).catch((e) => setError(e.message)); }, []);
  if (error) return <Screen><Alert level="error" text={error} /></Screen>;
  if (!list) return <Loading />;
  return (
    <Screen>
      <T muted>Indicative rules for the main au pair destinations. The app checks every placement against them. Always confirm with the official source.</T>
      {list.map((p) => (
        <Pressable key={p.code} onPress={() => router.push(`/programs/${p.code}`)}>
          <Card>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}><T bold>{cname(p.code)}</T>{statusChip(p)}</View>
            <T small muted>Ages {p.min_age}–{p.max_age} · max {p.max_weekly_hours} h/week{p.min_pocket_money ? ` · from ${p.min_pocket_money} ${p.currency}/month` : ''}</T>
          </Card>
        </Pressable>
      ))}
    </Screen>
  );
}
