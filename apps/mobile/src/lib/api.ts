/**
 * The API client (§12).
 *
 * Thin on purpose. §4 is explicit that the NestJS API owns all business logic,
 * so this layer's whole job is to carry a token, unwrap the §12 envelope and
 * turn an error body into something a screen can render. Any rule that lives
 * here is a rule that can disagree with the server.
 */
import Constants from 'expo-constants';

const API_URL =
  (Constants.expoConfig?.extra?.apiUrl as string | undefined) ?? 'http://localhost:3001';

export interface ApiError {
  code: string;
  message: string;
  details?: unknown;
}

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: ApiError };

export interface Page<T> {
  data: T;
  meta?: { page: number; limit: number; total: number; hasMore: boolean };
}

let accessToken: string | null = null;
let refreshToken: string | null = null;
let onSessionLost: (() => void) | null = null;

/**
 * The boot barrier.
 *
 * Reading the keychain is asynchronous, and the first screen mounts and starts
 * fetching before it finishes. Without this, a cold start on a signed-in
 * device sends the opening requests with no `authorization` header, gets a
 * 401, and the 401 handler — correctly, for a real expiry — *deletes the
 * stored tokens*. The person is signed out by the act of opening the app, and
 * nothing anywhere reports an error.
 *
 * So every authenticated request waits here first. It is resolved once by the
 * session provider, whether or not a session was found; there is nothing to
 * wait for after that.
 */
let releaseRestore: () => void = () => {};
let restored = new Promise<void>((resolve) => {
  releaseRestore = resolve;
});

/** Called by the session provider once the keychain has been read. */
export function sessionRestored() {
  releaseRestore();
}

export function setSession(tokens: { accessToken: string; refreshToken: string } | null) {
  accessToken = tokens?.accessToken ?? null;
  refreshToken = tokens?.refreshToken ?? null;
}

export function onSessionExpired(handler: () => void) {
  onSessionLost = handler;
}

/** Test seam: lets a signed-out flow start from a clean barrier. */
export function resetRestoreBarrier() {
  restored = new Promise<void>((resolve) => {
    releaseRestore = resolve;
  });
}

async function refresh(): Promise<boolean> {
  if (!refreshToken) return false;

  const response = await fetch(`${API_URL}/v1/auth/refresh`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  });

  if (!response.ok) return false;

  const body = (await response.json()) as {
    data?: { accessToken: string; refreshToken: string };
  };
  if (!body.data?.accessToken) return false;

  setSession({ accessToken: body.data.accessToken, refreshToken: body.data.refreshToken });
  return true;
}

export async function api<T>(
  path: string,
  init: RequestInit & { auth?: boolean } = {},
): Promise<ApiResult<T>> {
  const { auth = true, ...options } = init;

  // Never race the keychain (see `restored` above).
  if (auth) await restored;

  const send = () =>
    fetch(`${API_URL}/v1${path}`, {
      ...options,
      headers: {
        'content-type': 'application/json',
        ...(options.headers ?? {}),
        ...(auth && accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
      },
    });

  let response: Response;
  try {
    response = await send();

    // §12's access tokens are short-lived. One retry, then the session is
    // genuinely over and the caller is told rather than left on a blank screen.
    if (response.status === 401 && auth && (await refresh())) {
      response = await send();
    }

    // Only a request that actually carried a token can prove the session is
    // over. A 401 on a request sent without one says the app forgot to attach
    // it, and treating that as an expiry deletes a session that was fine.
    if (response.status === 401 && auth && accessToken) {
      onSessionLost?.();
    }
  } catch {
    return {
      ok: false,
      error: { code: 'NETWORK', message: 'Sunucuya ulaşılamadı. Bağlantını kontrol et.' },
    };
  }

  if (response.status === 204) return { ok: true, data: undefined as T };

  const body = (await response.json().catch(() => null)) as
    | { data?: T; error?: ApiError }
    | null;

  if (!response.ok || body?.error) {
    return {
      ok: false,
      error: body?.error ?? { code: 'INTERNAL_ERROR', message: 'Bir şeyler ters gitti.' },
    };
  }

  return { ok: true, data: body?.data as T };
}

/** Search endpoints answer with `meta`, which the caller usually needs. */
export async function apiPage<T>(path: string): Promise<ApiResult<Page<T>>> {
  const result = await api<T>(path, { auth: false });
  return result.ok ? { ok: true, data: { data: result.data } } : result;
}

export { API_URL };
