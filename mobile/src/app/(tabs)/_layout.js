import { Ionicons } from '@expo/vector-icons';
import { font, HEADING } from '../../components/Text';
import { Tabs } from 'expo-router/js-tabs';
import { useAuth } from '../../auth';
import { C, useTheme } from '../../theme';
import { tr } from '../../i18n';

// Outline icons, filled when the tab is open.
const icon = (name) => {
  const TabIcon = ({ focused, color }) => <Ionicons name={focused ? name : `${name}-outline`} size={22} color={color} />;
  return TabIcon;
};

export default function TabsLayout() {
  const { me } = useAuth();
  const t = useTheme();
  const c = me?.counts || {};
  return (
    <Tabs screenOptions={{ tabBarActiveTintColor: C.primary, tabBarInactiveTintColor: '#9a96a3', headerTintColor: t.ink,
      headerStyle: { backgroundColor: t.bg, shadowOpacity: 0, elevation: 0, borderBottomWidth: 0 }, headerShadowVisible: false,
      headerTitleStyle: { fontFamily: HEADING, fontSize: 24 }, headerTitleAlign: 'left',
      tabBarLabelStyle: { fontFamily: font('600') },
      tabBarBadgeStyle: { backgroundColor: C.nope, fontFamily: font('700'), fontSize: 11 },
      tabBarStyle: { backgroundColor: t.card, borderTopColor: t.line }, sceneStyle: { backgroundColor: t.bg } }}>
      <Tabs.Screen name="discover" options={{ title: tr('Discover'), headerShown: false, tabBarIcon: icon('flame') }} />
      <Tabs.Screen name="likes" options={{ title: tr('Likes'), tabBarIcon: icon('heart'), tabBarBadge: c.requests || undefined }} />
      <Tabs.Screen name="matches" options={{ title: tr('Matches'), tabBarIcon: icon('chatbubbles'), tabBarBadge: c.messages || undefined }} />
      <Tabs.Screen name="placements" options={{ title: tr('Placements'), tabBarIcon: icon('briefcase') }} />
      <Tabs.Screen name="profile" options={{ title: tr('Profile'), tabBarIcon: icon('person-circle'), tabBarBadge: me && !me.user.photos?.length ? '!' : undefined }} />
    </Tabs>
  );
}
