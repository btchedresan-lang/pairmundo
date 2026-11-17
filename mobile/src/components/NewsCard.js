// A message from PairMundo (sent by the admin) shows as a card at the top of Discover until it is closed.
import { useCallback, useState } from 'react';
import { Linking, Pressable, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../api';
import { tr } from '../i18n';
import { screenForLink } from '../push';
import { C, lift, useTheme } from '../theme';
import { Button, T } from './ui';

export function NewsCard({ style }) {
  const t = useTheme();
  const [news, setNews] = useState(null);
  useFocusEffect(useCallback(() => { api('/news').then((d) => setNews(d.news)).catch(() => {}); }, []));
  if (!news) return null;
  const close = () => { setNews(null); api(`/news/${news.id}/seen`, { method: 'POST' }).catch(() => {}); };
  const open = () => {
    close();
    if (/^https:\/\//.test(news.link)) Linking.openURL(news.link).catch(() => {});
    else { const screen = screenForLink(news.link); if (screen) router.push(screen); }
  };
  return (
    <View style={[{ backgroundColor: t.card, borderRadius: 16, padding: 14, gap: 6, borderLeftWidth: 4, borderLeftColor: C.primary }, lift.sm, style]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <T bold style={{ flex: 1 }}>📣 {news.title || tr('News from PairMundo')}</T>
        <Pressable onPress={close} hitSlop={10} accessibilityRole="button" accessibilityLabel={tr('Close')}>
          <Ionicons name="close" size={20} color={t.muted} />
        </Pressable>
      </View>
      <T small>{news.text}</T>
      {news.link ? <Button small title={tr('Open')} onPress={open} style={{ alignSelf: 'flex-start' }} /> : null}
    </View>
  );
}
