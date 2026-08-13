import { cookies } from 'next/headers';

/**
 * The browser session for the web app (§12).
 *
 * Tokens live in httpOnly cookies, not in `localStorage`. The API issues a
 * short access token and a long refresh token; anything a script can read is
 * anything an injected script can steal, and §12's tokens grant the whole
 * account. httpOnly means the page never touches them — only the server
 * components and route handlers in this app do.
 *
 * `sameSite: 'lax'` rather than 'strict': a listing link shared in a message
 * should still arrive signed in, and none of the state-changing routes are
 * reachable by a top-level GET.
 */
const ACCESS = 'oh_access';
const REFRESH = 'oh_refresh';

/** §12's access tokens are short-lived; the refresh token is what persists. */
const ACCESS_MAX_AGE = 60 * 15;
const REFRESH_MAX_AGE = 60 * 60 * 24 * 30;

const BASE = {
  httpOnly: true,
  sameSite: 'lax',
  path: '/',
  secure: process.env.NODE_ENV === 'production',
} as const;

export interface SessionTokens {
  accessToken: string;
  refreshToken: string;
}

export async function readSession(): Promise<SessionTokens | null> {
  const jar = await cookies();
  const accessToken = jar.get(ACCESS)?.value;
  const refreshToken = jar.get(REFRESH)?.value;

  if (!accessToken || !refreshToken) return null;
  return { accessToken, refreshToken };
}

export async function writeSession(tokens: SessionTokens): Promise<void> {
  const jar = await cookies();
  jar.set(ACCESS, tokens.accessToken, { ...BASE, maxAge: ACCESS_MAX_AGE });
  jar.set(REFRESH, tokens.refreshToken, { ...BASE, maxAge: REFRESH_MAX_AGE });
}

export async function clearSession(): Promise<void> {
  const jar = await cookies();
  jar.delete(ACCESS);
  jar.delete(REFRESH);
}
