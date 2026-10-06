import { useCallback, useState } from 'react';
import { FlatList, Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { Text } from '../../components/Text';
import { router, useFocusEffect } from 'expo-router';
import { api } from '../../api';
import { useAuth } from '../../auth';
import { firstName, fmtTime } from '../../data';
import { Alert, Empty, Loading, Photo, T } from '../../components/ui';
import { C, useTheme } from '../../theme';
import { tr } from '../../i18n';

export default function Matches() {
  const t = useTheme();
  const { refresh } = useAuth();
  const [convs, setConvs] = useState(null);
  const [error, setError] = useState(null);
  const load = useCallback(() => api('/conversations').then((d) => { setConvs(d.conversations); setError(null); refresh().catch(() => {}); })
    .catch((e) => { setError(e.message); setConvs([]); }), [refresh]);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  if (!convs) return <Loading />;
  const withMessages = convs.filter((c) => c.last_body);
  return (
    <FlatList style={{ backgroundColor: t.bg }} data={withMessages} keyExtractor={(c) => String(c.id)}
      refreshControl={<RefreshControl refreshing={false} onRefresh={load} />}
      ListHeaderComponent={<View style={{ padding: 16, gap: 10 }}>
        {error ? <Alert level="error" text={error} /> : null}
        <T h2>{tr('New matches')}</T>
        {convs.length ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 14 }}>
            {convs.map((c) => (
              <Pressable key={c.id} onPress={() => router.push(`/chat/${c.id}`)} style={{ alignItems: 'center', width: 78, gap: 4 }}>
                <View style={{ padding: 3, borderRadius: 999, backgroundColor: C.primary }}>
                  <Photo user={c.other} rounded style={{ width: 70, height: 70, borderWidth: 2, borderColor: t.bg }} />
                </View>
                {c.unread ? <View style={{ position: 'absolute', top: 2, right: 6, width: 14, height: 14, borderRadius: 7, backgroundColor: C.nope, borderWidth: 2, borderColor: t.bg }} /> : null}
                <Text style={{ color: t.ink, fontWeight: '600', fontSize: 13 }} numberOfLines={1}>{firstName(c.other.name)}</Text>
              </Pressable>
            ))}
          </ScrollView>
        ) : <T muted>{tr('No matches yet. Swipe right on people you like!')}</T>}
        <T h2 style={{ marginTop: 10 }}>{tr('Messages')}</T>
      </View>}
      ListEmptyComponent={convs.length ? <Empty icon="👋" title={tr('Say hi to your new matches')} text={tr('Tap a photo above to start chatting.')} /> : null}
      renderItem={({ item: c }) => (
        <Pressable onPress={() => router.push(`/chat/${c.id}`)} style={({ pressed }) => ({ flexDirection: 'row', gap: 12, alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: pressed ? t.soft : 'transparent' })}>
          <Photo user={c.other} rounded style={{ width: 56, height: 56 }} />
          <View style={{ flex: 1, gap: 2 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <T bold>{c.other.name}</T><T small muted>{fmtTime(c.last_at)}</T>
            </View>
            <T small muted={!c.unread} bold={!!c.unread} numberOfLines={1}>{c.last_body}</T>
          </View>
          {c.unread ? <View style={{ backgroundColor: C.nope, borderRadius: 10, minWidth: 20, paddingHorizontal: 6, alignItems: 'center' }}><Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>{c.unread}</Text></View> : null}
        </Pressable>
      )} />
  );
}
