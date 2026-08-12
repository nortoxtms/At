import { Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { nanoid } from 'nanoid';

/**
 * Assigns every request an id, echoed in the `X-Request-Id` header and in the
 * §12 error envelope. It is what lets a user reporting "it failed" be matched
 * to a Sentry event without guesswork.
 *
 * Middleware, not an interceptor: Nest runs guards before interceptors, so an
 * interceptor-assigned id would be missing from exactly the responses that
 * need it most — the 401s and 429s thrown by AuthGuard and RateLimitGuard.
 */
@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(request: Request & { requestId?: string }, response: Response, next: NextFunction): void {
    const incoming = request.headers['x-request-id'];
    const requestId = (typeof incoming === 'string' && incoming) || nanoid(16);

    request.requestId = requestId;
    response.setHeader('X-Request-Id', requestId);

    next();
  }
}
