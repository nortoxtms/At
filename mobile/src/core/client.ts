import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';

import { ApiClient, type TokenStore } from './api-client';

/**
 * The app's single API client.
 *
 * Extracted from `useAuth` in M4: the job and service screens need the same
 * client, and a second instance would carry a second in-flight refresh —
 * exactly the race `ApiClient.refreshOnce` exists to prevent.
 *
 * Tokens live in the platform keychain via expo-secure-store rather than
 * AsyncStorage: a session token is a credential (§26).
 */

const ACCESS_KEY = 'oh.access_token';
const REFRESH_KEY = 'oh.refresh_token';

export const secureTokenStore: TokenStore = {
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

export function resolveBaseUrl(): string {
  const configured =
    process.env.EXPO_PUBLIC_API_URL ??
    (Constants.expoConfig?.extra as { apiUrl?: string } | undefined)?.apiUrl;

  return configured ?? 'http://localhost:3001';
}

export const apiClient = new ApiClient({
  baseUrl: resolveBaseUrl(),
  tokens: secureTokenStore,
});
