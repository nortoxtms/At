import { Ionicons } from '@expo/vector-icons';
import { Tabs, useRouter } from 'expo-router';
import { Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { theme } from '@/theme/tokens';

/**
 * §20.3a's tab bar, and §18.0's resolved deviation: five items, with Profile
 * as the stable entry point rather than a sixth tab.
 *
 * Home · Search · [+] · Messages · Profile. The centre [+] is not a tab — it
 * is the create action, a 52 pt gold disc lifted 12 pt clear of the bar with a
 * `--bg` ring so it reads as sitting above the surface rather than punched
 * into it. Making it a tab would give it a screen, a title and a back stack it
 * does not want; it opens the composer modally and returns you where you were.
 */
function CreateButton() {
  const router = useRouter();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="İlan ver"
      onPress={() => router.push('/ilan-ver')}
      style={({ pressed }) => ({
        top: -theme.metric.tabPlusLift,
        width: theme.metric.tabPlusSize,
        height: theme.metric.tabPlusSize,
        borderRadius: theme.metric.tabPlusSize / 2,
        alignItems: 'center',
        justifyContent: 'center',
        alignSelf: 'center',
        backgroundColor: theme.color.goldSoft,
        borderWidth: 4,
        borderColor: theme.color.bg,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <Ionicons name="add" size={26} color={theme.color.textOnGold} />
    </Pressable>
  );
}

export default function TabsLayout() {
  const insets = useSafeAreaInsets();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: theme.color.bg },
        tabBarShowLabel: true,
        // §18.3: the active state is carried by colour *and* by the label, so
        // it does not depend on hue alone.
        tabBarActiveTintColor: theme.color.goldSoft,
        // `--text-muted` on `--surface-raised` is 3.6:1, and an 11 pt tab
        // label is not large text — §18.3 asks for 4.5:1. `--text-secondary`
        // is 7.2:1 and still reads as clearly inactive next to the gold.
        tabBarInactiveTintColor: theme.color.textSecondary,
        tabBarStyle: {
          height: theme.metric.tabBarHeight + insets.bottom,
          paddingBottom: insets.bottom,
          paddingTop: 8,
          backgroundColor: theme.color.surfaceRaised,
          borderTopWidth: 1,
          borderTopColor: theme.color.border,
          elevation: 0,
        },
        tabBarLabelStyle: {
          fontSize: theme.type.label.fontSize,
          letterSpacing: theme.type.label.tracking,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Keşfet',
          tabBarIcon: ({ color, size }) => <Ionicons name="home" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="ara"
        options={{
          title: 'Ara',
          tabBarIcon: ({ color, size }) => <Ionicons name="search" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="ilan-ver-placeholder"
        options={{
          title: '',
          tabBarButton: () => <CreateButton />,
        }}
        listeners={{ tabPress: (event) => event.preventDefault() }}
      />
      <Tabs.Screen
        name="mesajlar"
        options={{
          title: 'Mesajlar',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="chatbubble-ellipses" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="profil"
        options={{
          title: 'Profil',
          tabBarIcon: ({ color, size }) => <Ionicons name="person" size={size} color={color} />,
        }}
      />
    </Tabs>
  );
}
