'use server';

import { redirect } from 'next/navigation';

import { apiAs } from '@/lib/authed';
import { clearSession, writeSession } from '@/lib/session';

/**
 * Sign-in, sign-up and sign-out as server actions (§12).
 *
 * Server actions rather than client fetches, for one reason: the tokens must
 * land in an httpOnly cookie, and a cookie a script can set is a cookie a
 * script can read. The password crosses the network once, to this app's own
 * server, and the browser never holds a token.
 */
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export interface AuthState {
  error?: string;
  /** Field-level messages, keyed by field, from §12's VALIDATION_ERROR details. */
  fields?: Record<string, string>;
}

interface AuthResponse {
  data?: { tokens: { accessToken: string; refreshToken: string } };
  error?: { code: string; message: string; details?: unknown };
}

async function authenticate(path: string, payload: unknown): Promise<AuthState | never> {
  let body: AuthResponse;

  try {
    const response = await fetch(`${API_URL}/v1/auth/${path}`, {
      method: 'POST',
      cache: 'no-store',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    body = (await response.json()) as AuthResponse;
  } catch {
    return { error: 'Sunucuya ulaşılamadı. Tekrar dene.' };
  }

  if (body.error || !body.data) {
    const fields: Record<string, string> = {};
    // §12 returns validation details as [{ field, message }]; surfacing them
    // next to the input is the difference between "check your details" and
    // knowing which one is wrong.
    for (const detail of (body.error?.details as { field?: string; message?: string }[]) ?? []) {
      if (detail?.field && detail.message) fields[detail.field] = detail.message;
    }

    return {
      error: body.error?.message ?? 'Giriş yapılamadı.',
      fields: Object.keys(fields).length > 0 ? fields : undefined,
    };
  }

  await writeSession(body.data.tokens);
  redirect('/tr/hesap');
}

export async function signIn(_state: AuthState, form: FormData): Promise<AuthState> {
  return authenticate('login', {
    email: String(form.get('email') ?? ''),
    password: String(form.get('password') ?? ''),
  });
}

export async function signUp(_state: AuthState, form: FormData): Promise<AuthState> {
  return authenticate('register', {
    email: String(form.get('email') ?? ''),
    password: String(form.get('password') ?? ''),
    displayName: String(form.get('displayName') ?? ''),
    locale: 'tr',
  });
}

export async function signOut(): Promise<void> {
  // Tell the API first, then drop the cookies. If the call fails the cookies
  // still go: a sign-out that leaves the browser signed in is worse than a
  // server-side session the API will expire on its own.
  await apiAs('/auth/logout', { method: 'POST' }).catch(() => undefined);
  await clearSession();
  redirect('/tr/giris');
}
