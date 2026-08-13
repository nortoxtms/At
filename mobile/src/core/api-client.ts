import type { ApiError, ErrorCode } from '@only-horses/shared-types';

/**
 * API client — spec §12.
 *
 * Unwraps the `{ data, meta }` envelope and turns the `{ error: { code } }`
 * envelope into a typed exception, so callers switch on `code` rather than on
 * a localized message. §18.2 S08 step 9 depends on this: tapping "Mesaj
 * gönder" without identity verification must open the verification sheet, and
 * the client can only tell that apart from a generic failure by the code.
 */

export class ApiClientError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly status: number,
    readonly details?: unknown,
    readonly requestId?: string,
  ) {
    super(message);
    this.name = 'ApiClientError';
  }

  /** §3.3's hard rule: the caller should route to the verification ladder. */
  get needsVerification(): boolean {
    return this.code === 'VERIFICATION_REQUIRED';
  }

  /** §16: the caller should open the paywall (§18.2 S27). */
  get needsUpgrade(): boolean {
    return this.code === 'LIMIT_EXCEEDED' || this.code === 'PAYMENT_REQUIRED';
  }
}

export interface TokenStore {
  getAccessToken(): Promise<string | null>;
  getRefreshToken(): Promise<string | null>;
  setTokens(tokens: { accessToken: string; refreshToken: string }): Promise<void>;
  clear(): Promise<void>;
}

export interface ApiClientOptions {
  baseUrl: string;
  tokens: TokenStore;
  locale?: string;
  onUnauthenticated?: () => void;
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
  /** Skips the Authorization header — used by the auth endpoints themselves. */
  anonymous?: boolean;
}

export class ApiClient {
  private refreshInFlight: Promise<boolean> | null = null;

  constructor(private readonly options: ApiClientOptions) {}

  async request<T>(path: string, init: RequestOptions = {}): Promise<T> {
    const response = await this.send(path, init);

    // One retry after a silent refresh. A second 401 means the refresh token
    // is gone too, so the session is over.
    if (response.status === 401 && !init.anonymous) {
      const refreshed = await this.refreshOnce();

      if (!refreshed) {
        await this.options.tokens.clear();
        this.options.onUnauthenticated?.();
        throw await toError(response);
      }

      const retried = await this.send(path, init);
      return this.unwrap<T>(retried);
    }

    return this.unwrap<T>(response);
  }

  /**
   * Same request, but keeps the `meta` envelope.
   *
   * The search screens need it: `meta.total` is the result count in the header
   * and the signal for whether another page exists, and `request` deliberately
   * throws the envelope away so ordinary callers are not handed one.
   */
  async requestWithMeta<T, M = Record<string, unknown>>(
    path: string,
    init: RequestOptions = {},
  ): Promise<{ data: T; meta: M }> {
    const response = await this.send(path, init);

    if (response.status === 401 && !init.anonymous) {
      const refreshed = await this.refreshOnce();
      if (!refreshed) {
        await this.options.tokens.clear();
        this.options.onUnauthenticated?.();
        throw await toError(response);
      }

      const retried = await this.send(path, init);
      if (!retried.ok) throw await toError(retried);
      return (await retried.json()) as { data: T; meta: M };
    }

    if (!response.ok) throw await toError(response);
    return (await response.json()) as { data: T; meta: M };
  }

  private async send(path: string, init: RequestOptions): Promise<Response> {
    const url = new URL(`${this.options.baseUrl}/v1${path}`);

    for (const [key, value] of Object.entries(init.query ?? {})) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }

    const headers: Record<string, string> = {
      accept: 'application/json',
      'accept-language': this.options.locale ?? 'tr',
    };

    if (init.body !== undefined) headers['content-type'] = 'application/json';

    if (!init.anonymous) {
      const token = await this.options.tokens.getAccessToken();
      if (token) headers.authorization = `Bearer ${token}`;
    }

    return fetch(url.toString(), {
      method: init.method ?? 'GET',
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
  }

  /**
   * Concurrent 401s must not each fire their own refresh — the second one
   * would race the first and invalidate the token it just obtained.
   */
  private refreshOnce(): Promise<boolean> {
    this.refreshInFlight ??= this.performRefresh().finally(() => {
      this.refreshInFlight = null;
    });
    return this.refreshInFlight;
  }

  private async performRefresh(): Promise<boolean> {
    const refreshToken = await this.options.tokens.getRefreshToken();
    if (!refreshToken) return false;

    const response = await this.send('/auth/refresh', {
      method: 'POST',
      body: { refreshToken },
      anonymous: true,
    });

    if (!response.ok) return false;

    const payload = (await response.json()) as {
      data: { accessToken: string; refreshToken: string };
    };
    await this.options.tokens.setTokens(payload.data);
    return true;
  }

  private async unwrap<T>(response: Response): Promise<T> {
    if (response.status === 204) return undefined as T;
    if (!response.ok) throw await toError(response);

    const payload = (await response.json()) as { data: T };
    return payload.data;
  }
}

async function toError(response: Response): Promise<ApiClientError> {
  let code: ErrorCode = 'INTERNAL_ERROR';
  let message = 'Bir şeyler ters gitti. Tekrar dene.';
  let details: unknown;
  let requestId: string | undefined;

  try {
    const payload = (await response.json()) as ApiError;
    code = payload.error.code;
    message = payload.error.message;
    details = payload.error.details;
    requestId = payload.error.requestId;
  } catch {
    // A non-JSON body means a proxy or a crash, not the API. §20.7: say what
    // happened and what to do, rather than surfacing a status code.
    if (response.status >= 500) {
      message = 'Sunucuya ulaşılamadı. Bağlantını kontrol edip tekrar dene.';
    }
  }

  return new ApiClientError(code, message, response.status, details, requestId);
}
