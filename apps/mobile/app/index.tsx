import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Wordmark } from '@/components/Wordmark';
import { theme } from '@/theme/tokens';

/**
 * S01 — Splash.
 *
 * §18.2 gives this 1.2 s maximum and a job: preload the session, remote config
 * and the reference-data cache, then leave. It is not a brand moment to linger
 * on — a splash screen that outstays its work is a loading spinner wearing a
 * logo.
 */
const SPLASH_MS = 1200;

export default function Splash() {
  const router = useRouter();

  useEffect(() => {
    const timer = setTimeout(() => router.replace('/(tabs)'), SPLASH_MS);
    return () => clearTimeout(timer);
  }, [router]);

  return (
    <View style={styles.root}>
      <Wordmark size="large" />
      <Text style={styles.tagline}>CONNECT. TRAIN. TRUST.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.color.bg,
    gap: theme.space.xxl,
  },
  tagline: {
    ...theme.type.label,
    letterSpacing: theme.type.label.tracking,
    color: theme.color.goldMuted,
  },
});
