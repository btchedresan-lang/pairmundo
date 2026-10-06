import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { api } from '../../api';
import { cname } from '../../data';
import { Alert, Card, Chip, Loading, Screen, T } from '../../components/ui';
import { tr } from '../../i18n';

const statusChip = (p) => (p.status === 'closed' ? <Chip tone="err" label={p.eu_eea_only ? tr('Closed to non-EU') : tr('No au pair route')} />
  : p.status === 'paused' ? <Chip tone="warn" label={tr('Visas stalled')} /> : <Chip tone="ok" label={tr('Open')} />);

export default function Programs() {
  const [list, setList] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => { api('/programs').then((d) => setList(d.programs)).catch((e) => setError(e.message)); }, []);
  if (error) return <Screen><Alert level="error" text={error} /></Screen>;
  if (!list) return <Loading />;
  return (
    <Screen>
      <T muted>{tr('Indicative rules for the main au pair destinations. The app checks every placement against them. Always confirm with the official source.')}</T>
      {list.map((p) => (
        <Pressable key={p.code} onPress={() => router.push(`/programs/${p.code}`)}>
          <Card>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}><T bold>{cname(p.code)}</T>{statusChip(p)}</View>
            <T small muted>{tr('Ages {min}–{max}', { min: p.min_age, max: p.max_age })} · {tr('max {n} h/week', { n: p.max_weekly_hours })}{p.min_pocket_money ? ` · ${tr('from {amount}/month', { amount: `${p.min_pocket_money} ${p.currency}` })}` : ''}</T>
          </Card>
        </Pressable>
      ))}
    </Screen>
  );
}
