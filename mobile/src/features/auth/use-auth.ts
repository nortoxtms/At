import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import { useCallback, useMemo, useState } from 'react';
import type { VerificationLevel } from '@only-horses/shared-types';

import { ApiClient, type TokenStore } from '../../core/api-client';

/**
 * Auth hook backing S03 (spec §18.2).
 *
 * Tokens go to the platform keychain via expo-secure-store rather than
 * AsyncStorage: a session token is a credential, and §25/§26 treat the
 * account as personal data.
 */

export interface AuthProfile {
  id: string;
  handle: string;
  displayName: string;
  locale: string;
  verificationLevel: VerificationLevel;
  trustScore: number;
  onboardingStep: string | null;
}

interface SessionResponse {
  profile: AuthProfile;
  tokens: { accessToken: string; refreshToken: string; expiresIn: string };
}

const ACCESS_KEY = 'oh.access_token';
const REFRESH_KEY = 'oh.refresh_token';

const secureTokenStore: TokenStore = {
  getAccessToken: () => SecureStore.getItemAsync(ACCESS_KEY),
  getRefreshToken: () => SecureStore.getItemAsync(REFRESH_KEY),
  async setTokens({ accessToken, refreshToken }) {
    await SecureStore.setItemAsync(ACCESS_KEY, accessToken);
    await SecureStore.setItemAsync(REFRESH_KEY, refreshToken);
  },
  async clear() {
    await SecureStore.deleteItemAsync(ACCESS_KEY);
    await SecureStore.deleteItemAsync(REFRESH_KEY);
  },
};

function resolveBaseUrl(): string {
  const configured =
    process.env.EXPO_PUBLIC_API_URL ??
    (Constants.expoConfig?.extra as { apiUrl?: string } | undefined)?.apiUrl;

  return configured ?? 'http://localhost:3001';
}

export function useAuth() {
  const [isPending, setIsPending] = useState(false);
  const [profile, setProfile] = useState<AuthProfile | null>(null);

  const client = useMemo(
    () => new ApiClient({ baseUrl: resolveBaseUrl(), tokens: secureTokenStore }),
    [],
  );

  const establishSession = useCallback(
    async (path: string, body: unknown): Promise<AuthProfile> => {
      setIsPending(true);
      try {
        const session = await client.request<SessionResponse>(path, {
          method: 'POST',
          body,
          anonymous: true,
        });

        await secureTokenStore.setTokens(session.tokens);
        setProfile(session.profile);
        return session.profile;
      } finally {
        setIsPending(false);
      }
    },
    [client],
  );

  const register = useCallback(
    (input: { email: string; password: string; displayName: string; locale?: string }) =>
      establishSession('/auth/register', input),
    [establishSession],
  );

  const login = useCallback(
    (input: { email: string; password: string }) => establishSession('/auth/login', input),
    [establishSession],
  );

  const logout = useCallback(async () => {
    await client.request('/auth/logout', { method: 'POST' }).catch(() => {
      // The server call is best-effort; clearing the device is what matters.
    });
    await secureTokenStore.clear();
    setProfile(null);
  }, [client]);

  return { client, profile, register, login, logout, isPending };
}
