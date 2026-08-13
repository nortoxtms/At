import { useCallback, useState } from 'react';
import type { VerificationLevel } from '@only-horses/shared-types';

import { apiClient, secureTokenStore } from '../../core/client';

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

export function useAuth() {
  const [isPending, setIsPending] = useState(false);
  const [profile, setProfile] = useState<AuthProfile | null>(null);

  // One client for the whole app (src/core/client.ts) — a second instance
  // would run its own token refresh and race this one.
  const client = apiClient;

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
