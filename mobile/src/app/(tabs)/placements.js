import { useCallback, useState } from 'react';
import { FlatList, Pressable, RefreshControl, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { api } from '../../api';
import { useAuth } from '../../auth';
import { cname, fmtDate, statusTone } from '../../data';
import { Alert, Card, Chip, Empty, Loading, Photo, T } from '../../components/ui';
import { useTheme } from '../../theme';


export default function Placements() {
  const t = useTheme();
  const { me } = useAuth();
  const [list, setList] = useState(null);
  const [error, setError] = useState(null);
  const load = useCallback(() => api('/placements').then((d) => { setList(d.placements); setError(null); }).catch((e) => { setError(e.message); setList([]); }), []);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  if (!list) return <Loading />;
  return (
    <FlatList style={{ backgroundColor: t.bg }} data={list} keyExtractor={(p) => String(p.id)} contentContainerStyle={{ padding: 16, gap: 12 }}
      refreshControl={<RefreshControl refreshing={false} onRefresh={load} />}
      ListHeaderComponent={error ? <Alert level="error" text={error} /> : null}
      ListEmptyComponent={<Empty icon="🧳" title="No placements yet" text="Once you match, open their profile and tap Propose placement. The app checks it against the country's au pair rules." />}
      renderItem={({ item: p }) => {
        const other = me.user.id === p.aupair_id ? p.family : p.aupair;
        return (
          <Pressable onPress={() => router.push(`/placement/${p.id}`)}>
            <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Photo user={other} rounded style={{ width: 52, height: 52 }} />
              <View style={{ flex: 1, gap: 3 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}><T bold>{other.name}</T><Chip label={p.status} tone={statusTone(p.status)} /></View>
                <T small muted>{cname(p.country)} · {fmtDate(p.start_date)} – {fmtDate(p.end_date)}</T>
                <T small muted>Checklist {p.tasks_done}/{p.tasks_total}</T>
              </View>
            </Card>
          </Pressable>
        );
      }} />
  );
}
