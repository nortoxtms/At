import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { theme } from '../src/core/theme';

/**
 * Root layout — spec §18.1.
 *
 * The §18.1 route table is preserved path-for-path under Expo Router
 * (ADR-0002), so the `onlyhorses://` deep links and the universal links for
 * onlyhorses.app/* resolve to the same screens the spec names.
 */
export default function RootLayout() {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // §18.3: cached search results, My Stable and the conversations
            // list stay readable offline.
            staleTime: 60_000,
            gcTime: 24 * 60 * 60 * 1000,
            retry: 2,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <SafeAreaProvider>
        <StatusBar style="auto" />
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: theme.colors.cream },
            headerTintColor: theme.colors.textPrimary,
            headerTitleStyle: theme.type.h3,
            contentStyle: { backgroundColor: theme.colors.cream },
          }}
        >
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="auth" options={{ presentation: 'modal', title: 'Giriş' }} />
        </Stack>
      </SafeAreaProvider>
    </QueryClientProvider>
  );
}
