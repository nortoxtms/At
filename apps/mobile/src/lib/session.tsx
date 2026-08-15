import * as SecureStore from 'expo-secure-store';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';
import type { ReactNode } from 'react';

import {
  api,
  onSessionExpired,
  sessionRestored,
  setSession as setApiSession,
} from '@/lib/api';
import { disableDemo, enableDemo, restoreDemo } from '@/lib/demo';

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
  /** True while the app is answering itself instead of a server. */
  demo: boolean;
  signIn: (tokens: Tokens) => Promise<void>;
  signOut: () => Promise<void>;
  refreshMe: () => Promise<void>;
  startDemo: () => Promise<void>;
  stopDemo: () => Promise<void>;
}

const SessionContext = createContext<SessionValue>({
  me: null,
  ready: false,
  demo: false,
  signIn: async () => {},
  signOut: async () => {},
  refreshMe: async () => {},
  startDemo: async () => {},
  stopDemo: async () => {},
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
  const [demo, setDemo] = useState(false);

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

  /**
   * §18.2 has no demo mode; the product needs one. Without a server the app is
   * a set of empty screens, and "install it and see" is the whole point of a
   * phone app. So this is a real account against a real (local) store — see
   * `demo-api.ts` — and every screen shows a banner saying which one it is.
   */
  const startDemo = useCallback(async () => {
    await enableDemo();
    setDemo(true);
    await refreshMe();
  }, [refreshMe]);

  const stopDemo = useCallback(async () => {
    await disableDemo();
    setDemo(false);
    setMe(null);
  }, []);

  // Rehydrate once. A token in the keychain is not proof of a live session —
  // it may have been revoked (§17) — so the app asks /me and believes the
  // answer rather than the storage.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      // Demo first: if it is on, nothing should touch the network at all.
      if (await restoreDemo().catch(() => false)) {
        setDemo(true);
        sessionRestored();
        await refreshMe();
        if (!cancelled) setReady(true);
        return;
      }

      const raw = await store.get().catch(() => null);

      if (raw) {
        try {
          setApiSession(JSON.parse(raw) as Tokens);
        } catch {
          await store.clear().catch(() => {});
        }
      }

      // Open the gate before the first authenticated read, not after:
      // `refreshMe` is itself an authenticated request and would deadlock
      // behind its own barrier.
      sessionRestored();

      if (raw) await refreshMe();
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
    () => ({ me, ready, demo, signIn, signOut, refreshMe, startDemo, stopDemo }),
    [me, ready, demo, signIn, signOut, refreshMe, startDemo, stopDemo],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  return useContext(SessionContext);
}
