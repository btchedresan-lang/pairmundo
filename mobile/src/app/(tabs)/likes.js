import { useCallback, useState } from 'react';
import { FlatList, Pressable, RefreshControl, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { api } from '../../api';
import { COUNTRIES, flag } from '../../data';
import { Alert, Button, Empty, Loading, Photo, T } from '../../components/ui';
import { Shade } from '../../components/SwipeDeck';
import { C, useTheme } from '../../theme';

export default function Likes() {
  const t = useTheme();
  const [likes, setLikes] = useState(null);
  const [error, setError] = useState(null);
  const load = useCallback(() => api('/likes').then((d) => { setLikes(d.likes); setError(null); }).catch((e) => { setError(e.message); setLikes([]); }), []);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  if (!likes) return <Loading />;
  return (
    <FlatList style={{ backgroundColor: t.bg }} data={likes} numColumns={2} keyExtractor={(l) => String(l.request_id)}
      columnWrapperStyle={{ gap: 12 }} contentContainerStyle={{ padding: 16, gap: 12 }}
      refreshControl={<RefreshControl refreshing={false} onRefresh={load} />}
      ListHeaderComponent={<View style={{ gap: 4, marginBottom: 4 }}>
        {error ? <Alert level="error" text={error} /> : null}
        <T h2>{likes.length} {likes.length === 1 ? 'person likes' : 'people like'} you</T>
        <T muted>Like them back to match and start chatting.</T></View>}
      ListEmptyComponent={<Empty icon="💛" title="No new likes yet" text="Keep your profile fresh and keep swiping.">
        <Button title="Discover" onPress={() => router.navigate('/discover')} /></Empty>}
      renderItem={({ item: l }) => {
        const age = l.user.role === 'aupair' ? l.profile?.age : null;
        return (
          <Pressable onPress={() => router.push(`/user/${l.user.id}`)} style={{ flex: 1, maxWidth: '50%', aspectRatio: 3 / 4, borderRadius: 16, overflow: 'hidden', backgroundColor: '#222' }}>
            <Photo user={l.user} style={{ position: 'absolute', width: '100%', height: '100%' }} />
            <Shade />
            {l.super ? <Text style={{ position: 'absolute', top: 8, left: 8, backgroundColor: C.super, color: '#fff', fontWeight: '700', fontSize: 11, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, overflow: 'hidden' }}>★ Super like</Text> : null}
            {l.match ? <Text style={{ position: 'absolute', top: 8, right: 8, backgroundColor: 'rgba(0,0,0,0.55)', color: '#fff', fontWeight: '700', fontSize: 11, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, overflow: 'hidden' }}>{l.match.score}%</Text> : null}
            <View style={{ position: 'absolute', left: 10, right: 10, bottom: 10 }}>
              <Text style={{ color: '#fff', fontWeight: '800', fontSize: 16 }} numberOfLines={2}>{l.user.name}{age ? `, ${age}` : ''}</Text>
              <Text style={{ color: '#fff', fontSize: 13 }}>{flag(l.user.country)} {COUNTRIES[l.user.country] || ''}</Text>
              {l.message ? <Text style={{ color: '#fff', fontSize: 12, fontStyle: 'italic', opacity: 0.9, marginTop: 2 }} numberOfLines={2}>“{l.message}”</Text> : null}
            </View>
          </Pressable>
        );
      }} />
  );
}
