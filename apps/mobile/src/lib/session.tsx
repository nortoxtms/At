import * as SecureStore from 'expo-secure-store';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';
import type { ReactNode } from 'react';

import { api, onSessionExpired, setSession as setApiSession } from '@/lib/api';

/**
 * The signed-in session (§3, §12).
 *
 * Tokens live in the device keychain, not in AsyncStorage: §17 treats a
 * refresh token as a credential, and AsyncStorage is a plaintext file any
 * process with the app's sandbox can read. `expo-secure-store` has no web
 * implementation — calling it there throws — so the web build (which exists to
 * preview the app, not to ship) falls back to localStorage and says so.
 */
const KEY = 'only-horses.session';

export interface Me {
  id: string;
  handle: string;
  displayName: string;
  email: string;
  verificationLevel: string;
  trustScore: number;
  city: string | null;
  region: string | null;
  roles: unknown[];
}

interface Tokens {
  accessToken: string;
  refreshToken: string;
}

interface SessionValue {
  me: Me | null;
  ready: boolean;
  signIn: (tokens: Tokens) => Promise<void>;
  signOut: () => Promise<void>;
  refreshMe: () => Promise<void>;
}

const SessionContext = createContext<SessionValue>({
  me: null,
  ready: false,
  signIn: async () => {},
  signOut: async () => {},
  refreshMe: async () => {},
});

const store = {
  async get(): Promise<string | null> {
    if (Platform.OS === 'web') return globalThis.localStorage?.getItem(KEY) ?? null;
    return SecureStore.getItemAsync(KEY);
  },
  async set(value: string) {
    if (Platform.OS === 'web') return void globalThis.localStorage?.setItem(KEY, value);
    return SecureStore.setItemAsync(KEY, value);
  },
  async clear() {
    if (Platform.OS === 'web') return void globalThis.localStorage?.removeItem(KEY);
    return SecureStore.deleteItemAsync(KEY);
  },
};

export function SessionProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [ready, setReady] = useState(false);

  const refreshMe = useCallback(async () => {
    const result = await api<Me>('/me');
    setMe(result.ok ? result.data : null);
  }, []);

  const signIn = useCallback(
    async (tokens: Tokens) => {
      setApiSession(tokens);
      await store.set(JSON.stringify(tokens));
      await refreshMe();
    },
    [refreshMe],
  );

  const signOut = useCallback(async () => {
    setApiSession(null);
    await store.clear();
    setMe(null);
  }, []);

  // Rehydrate once. A token in the keychain is not proof of a live session —
  // it may have been revoked (§17) — so the app asks /me and believes the
  // answer rather than the storage.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const raw = await store.get().catch(() => null);
      if (raw) {
        try {
          setApiSession(JSON.parse(raw) as Tokens);
          await refreshMe();
        } catch {
          await store.clear().catch(() => {});
        }
      }
      if (!cancelled) setReady(true);
    })();

    onSessionExpired(() => {
      void store.clear().catch(() => {});
      setMe(null);
    });

    return () => {
      cancelled = true;
    };
  }, [refreshMe]);

  const value = useMemo<SessionValue>(
    () => ({ me, ready, signIn, signOut, refreshMe }),
    [me, ready, signIn, signOut, refreshMe],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  return useContext(SessionContext);
}
