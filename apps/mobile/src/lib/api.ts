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

export function setSession(tokens: { accessToken: string; refreshToken: string } | null) {
  accessToken = tokens?.accessToken ?? null;
  refreshToken = tokens?.refreshToken ?? null;
}

export function onSessionExpired(handler: () => void) {
  onSessionLost = handler;
}

async function refresh(): Promise<boolean> {
  if (!refreshToken) return false;

  const response = await fetch(`${API_URL}/v1/auth/refresh`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  });

  if (!response.ok) return false;

  const body = (await response.json()) as { data?: { accessToken: string; refreshToken: string } };
  if (!body.data) return false;

  setSession(body.data);
  return true;
}

export async function api<T>(
  path: string,
  init: RequestInit & { auth?: boolean } = {},
): Promise<ApiResult<T>> {
  const { auth = true, ...options } = init;

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

    if (response.status === 401 && auth) {
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
