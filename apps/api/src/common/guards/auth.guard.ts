import { type CanActivate, type ExecutionContext, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { createParamDecorator } from '@nestjs/common';
import type { Request } from 'express';

import { ApiException } from '../filters/api-exception.filter.js';

export const IS_PUBLIC_KEY = 'is_public';
/** Marks a route as reachable without a session (guest browsing, §3.3). */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

export const OPTIONAL_AUTH_KEY = 'optional_auth';
/**
 * Reads the session when present but does not require one. Listing detail
 * uses this: guests may browse, but a signed-in viewer sees their own saved
 * state and any health grants they hold.
 */
export const OptionalAuth = () => SetMetadata(OPTIONAL_AUTH_KEY, true);

export interface AuthenticatedRequest extends Request {
  profileId?: string;
}

/** Injects the caller's profile id. Null on optional-auth routes for guests. */
export const CurrentProfileId = createParamDecorator(
  (_data: unknown, context: ExecutionContext): string | null => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    return request.profileId ?? null;
  },
);

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const isOptional = this.reflector.getAllAndOverride<boolean>(OPTIONAL_AUTH_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = extractBearerToken(request);

    if (!token) {
      if (isPublic || isOptional) return true;
      throw ApiException.unauthorized();
    }

    try {
      const payload = await this.jwt.verifyAsync<{ sub: string; typ?: string }>(token);

      // A refresh token must not be usable as an access token.
      if (payload.typ && payload.typ !== 'access') {
        throw ApiException.unauthorized('Geçersiz oturum anahtarı.');
      }

      request.profileId = payload.sub;
      return true;
    } catch (error) {
      if (isOptional) return true;
      if (error instanceof ApiException) throw error;
      throw ApiException.unauthorized('Oturum süresi doldu. Tekrar giriş yap.');
    }
  }
}

function extractBearerToken(request: Request): string | null {
  const header = request.headers.authorization;
  if (!header) return null;

  const [scheme, token] = header.split(' ');
  return scheme?.toLowerCase() === 'bearer' && token ? token : null;
}
