import {
  type CanActivate,
  type ExecutionContext,
  HttpStatus,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request, Response } from 'express';

import { ApiException } from '../filters/api-exception.filter.js';

export interface RateLimitOptions {
  limit: number;
  windowSeconds: number;
  /**
   * §24.9: "enforced per profile, not per IP alone". Authenticated routes key
   * on the profile so rotating IPs does not reset the budget; unauthenticated
   * routes (auth/*) have no profile yet and fall back to IP.
   */
  per: 'profile' | 'ip';
}

export const RATE_LIMIT_KEY = 'rate_limit';
export const RateLimit = (options: RateLimitOptions) => SetMetadata(RATE_LIMIT_KEY, options);

interface Hit {
  timestamps: number[];
}

/**
 * Sliding-window rate limiter (§12).
 *
 * The store is in-memory here, which is correct for a single instance and for
 * tests. On Cloud Run with more than one instance this must be backed by
 * Memorystore — the interface is the seam for that, and the semantics
 * (timestamps in a window) map directly onto a Redis sorted set.
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly hits = new Map<string, Hit>();

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const options = this.reflector.getAllAndOverride<RateLimitOptions | undefined>(
      RATE_LIMIT_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!options) return true;

    const request = context.switchToHttp().getRequest<Request & { profileId?: string }>();
    const response = context.switchToHttp().getResponse<Response>();

    const identity =
      options.per === 'profile' && request.profileId
        ? `profile:${request.profileId}`
        : `ip:${request.ip}`;

    const key = `${context.getClass().name}.${context.getHandler().name}:${identity}`;
    const now = Date.now();
    const windowStart = now - options.windowSeconds * 1000;

    const entry = this.hits.get(key) ?? { timestamps: [] };
    entry.timestamps = entry.timestamps.filter((t) => t > windowStart);

    if (entry.timestamps.length >= options.limit) {
      const oldest = entry.timestamps[0] ?? now;
      const retryAfter = Math.max(1, Math.ceil((oldest + options.windowSeconds * 1000 - now) / 1000));

      // §24.9 requires the Retry-After header, not just the status.
      response.setHeader('Retry-After', String(retryAfter));
      response.setHeader('X-RateLimit-Limit', String(options.limit));
      response.setHeader('X-RateLimit-Remaining', '0');

      throw new ApiException(
        'RATE_LIMITED',
        `Çok fazla istek gönderdin. ${retryAfter} saniye sonra tekrar dene.`,
        HttpStatus.TOO_MANY_REQUESTS,
        { retryAfter },
      );
    }

    entry.timestamps.push(now);
    this.hits.set(key, entry);

    response.setHeader('X-RateLimit-Limit', String(options.limit));
    response.setHeader('X-RateLimit-Remaining', String(options.limit - entry.timestamps.length));

    return true;
  }
}
