import { Tabs } from 'expo-router';

import { theme } from '../../src/core/theme';

/**
 * Bottom tab bar — spec §18.1.
 *
 * Five items: Keşfet · Ahırım · [+] · Mesajlar · Profil. The centre [+] opens
 * an action sheet (At ekle · İlan ver · Hizmet ekle · İş ilanı ver) rather
 * than navigating, so it is registered as a screen that intercepts its own
 * press.
 */
export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: theme.colors.brass,
        tabBarInactiveTintColor: theme.colors.textMuted,
        tabBarStyle: {
          backgroundColor: theme.colors.paper,
          borderTopColor: theme.colors.border,
        },
        tabBarLabelStyle: { fontSize: 11 },
        headerStyle: { backgroundColor: theme.colors.cream },
        headerTitleStyle: theme.type.h3,
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Keşfet' }} />
      <Tabs.Screen name="stable" options={{ title: 'Ahırım' }} />
      <Tabs.Screen name="create" options={{ title: 'Ekle' }} />
      <Tabs.Screen name="messages" options={{ title: 'Mesajlar' }} />
      <Tabs.Screen name="profile" options={{ title: 'Profil' }} />
    </Tabs>
  );
}
