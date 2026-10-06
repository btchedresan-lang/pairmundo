import { Text } from 'react-native';
import { Tabs } from 'expo-router/js-tabs';
import { useAuth } from '../../auth';
import { C, useTheme } from '../../theme';
import { tr } from '../../i18n';

const icon = (glyph) => {
  const TabIcon = ({ focused }) => <Text style={{ fontSize: 22, opacity: focused ? 1 : 0.55 }}>{glyph}</Text>;
  return TabIcon;
};

export default function TabsLayout() {
  const { me } = useAuth();
  const t = useTheme();
  const c = me?.counts || {};
  return (
    <Tabs screenOptions={{ tabBarActiveTintColor: C.primary, headerTintColor: t.ink, headerStyle: { backgroundColor: t.card },
      tabBarStyle: { backgroundColor: t.card, borderTopColor: t.line }, sceneStyle: { backgroundColor: t.bg } }}>
      <Tabs.Screen name="discover" options={{ title: tr('Discover'), headerShown: false, tabBarIcon: icon('🔥') }} />
      <Tabs.Screen name="likes" options={{ title: tr('Likes'), tabBarIcon: icon('💛'), tabBarBadge: c.requests || undefined }} />
      <Tabs.Screen name="matches" options={{ title: tr('Matches'), tabBarIcon: icon('💬'), tabBarBadge: c.messages || undefined }} />
      <Tabs.Screen name="placements" options={{ title: tr('Placements'), tabBarIcon: icon('🧳') }} />
      <Tabs.Screen name="profile" options={{ title: tr('Profile'), tabBarIcon: icon('👤'), tabBarBadge: me && !me.user.photos?.length ? '!' : undefined }} />
    </Tabs>
  );
}
