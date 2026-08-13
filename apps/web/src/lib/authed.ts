import { readSession, writeSession } from '@/lib/session';

/**
 * Calls the API as the signed-in visitor.
 *
 * Two things this does that a bare `fetch` would not:
 *
 * `cache: 'no-store'` on everything. A signed-in response is one person's
 * data, and Next's default fetch cache is shared across requests — caching it
 * would eventually serve one user's dashboard to another. That is the kind of
 * mistake that is invisible in development, where there is one user.
 *
 * A single refresh retry. §12 access tokens expire in minutes; without this
 * every visitor is signed out mid-session and blames the product. On a 401 it
 * refreshes once, stores the new pair and replays the request; if the refresh
 * also fails the caller gets null and decides whether that means "sign in" or
 * "this is empty".
 */
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export interface ApiFailure {
  code: string;
  message: string;
  details?: unknown;
}

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: ApiFailure };

async function call<T>(path: string, init: RequestInit, token: string): Promise<Response> {
  return fetch(`${API_URL}/v1${path}`, {
    ...init,
    cache: 'no-store',
    headers: {
      'content-type': 'application/json',
      ...(init.headers ?? {}),
      authorization: `Bearer ${token}`,
    },
  });
}

async function refresh(refreshToken: string): Promise<{ accessToken: string; refreshToken: string } | null> {
  const response = await fetch(`${API_URL}/v1/auth/refresh`, {
    method: 'POST',
    cache: 'no-store',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  });

  if (!response.ok) return null;
  const body = (await response.json()) as { data?: { accessToken: string; refreshToken: string } };
  return body.data ?? null;
}

export async function apiAs<T>(path: string, init: RequestInit = {}): Promise<ApiResult<T>> {
  const session = await readSession();
  if (!session) {
    return { ok: false, error: { code: 'UNAUTHORIZED', message: 'Giriş yapman gerekiyor.' } };
  }

  let response: Response;
  try {
    response = await call(path, init, session.accessToken);

    if (response.status === 401) {
      const renewed = await refresh(session.refreshToken);
      if (!renewed) {
        return { ok: false, error: { code: 'UNAUTHORIZED', message: 'Oturumun sona erdi.' } };
      }

      await writeSession(renewed);
      response = await call(path, init, renewed.accessToken);
    }
  } catch {
    return {
      ok: false,
      error: { code: 'NETWORK', message: 'Sunucuya ulaşılamadı. Tekrar dene.' },
    };
  }

  // §12's 204s carry no body, and calling .json() on one throws.
  if (response.status === 204) return { ok: true, data: undefined as T };

  const body = (await response.json().catch(() => null)) as
    | { data?: T; error?: ApiFailure }
    | null;

  if (!response.ok || body?.error) {
    return {
      ok: false,
      error: body?.error ?? { code: 'INTERNAL_ERROR', message: 'Bir şeyler ters gitti.' },
    };
  }

  return { ok: true, data: body?.data as T };
}

/** Reads without caring why it failed — for pages that render an empty state. */
export async function apiAsOrNull<T>(path: string, init: RequestInit = {}): Promise<T | null> {
  const result = await apiAs<T>(path, init);
  return result.ok ? result.data : null;
}
