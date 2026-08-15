import {
  CormorantGaramond_400Regular,
  CormorantGaramond_600SemiBold,
} from '@expo-google-fonts/cormorant-garamond';
import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold } from '@expo-google-fonts/inter';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { SessionProvider } from '@/lib/session';
import { fonts, theme } from '@/theme/tokens';

/**
 * Root layout — §18.1.
 *
 * One theme. §20 makes the app dark-first with no light theme in v1, so there
 * is no scheme to detect and no palette to swap: the status bar is light
 * because the ground is always #0E0C0A.
 *
 * The two families are bundled rather than fetched. On web that also removes
 * the render-blocking third-party request that cost the site 13 s of LCP
 * (§24.18); on native there is no network fallback at all, so a missing face
 * silently becomes the system font and the whole §20.2 scale is wrong.
 */
export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    [fonts.display]: CormorantGaramond_400Regular,
    [fonts.displaySemibold]: CormorantGaramond_600SemiBold,
    [fonts.body]: Inter_400Regular,
    [fonts.bodyMedium]: Inter_500Medium,
    [fonts.bodySemibold]: Inter_600SemiBold,
  });

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      {/*
        Hold the ground colour while the faces load. Rendering the tree first
        and swapping fonts in reflows every screen; rendering nothing on white
        flashes. A dark rectangle is neither.
      */}
      {fontsLoaded ? (
        <SessionProvider>
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: theme.color.bg },
              animation: 'fade',
            }}
          />
        </SessionProvider>
      ) : (
        <View style={{ flex: 1, backgroundColor: theme.color.bg }} />
      )}
    </SafeAreaProvider>
  );
}
