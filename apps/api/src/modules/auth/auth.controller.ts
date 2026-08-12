import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { z } from 'zod';

import { Public } from '../../common/guards/auth.guard.js';
import { RateLimit, RateLimitGuard } from '../../common/guards/rate-limit.guard.js';
import { zodBody } from '../../common/pipes/zod-validation.pipe.js';
import { AuthService } from './auth.service.js';

const registerSchema = z.object({
  email: z.string().email('Geçerli bir e-posta adresi gir.'),
  password: z.string().min(8, 'Şifre en az 8 karakter olmalı.'),
  displayName: z.string().min(2, 'Adın en az 2 karakter olmalı.').max(80),
  locale: z.string().optional(),
  dateOfBirth: z.string().date().optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1, 'Şifreni gir.'),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

/** Spec §12 "Auth". */
@Controller('auth')
// Signing up and signing in cannot require a session.
@Public()
@UseGuards(RateLimitGuard)
// §12 rate limits: auth is 10 per 5 minutes per IP. There is no profile yet,
// so IP is the only key available.
@RateLimit({ limit: 10, windowSeconds: 300, per: 'ip' })
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  async register(@Body(zodBody(registerSchema)) body: z.infer<typeof registerSchema>) {
    const { profile, tokens } = await this.auth.register(body);
    return { data: { profile, tokens } };
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body(zodBody(loginSchema)) body: z.infer<typeof loginSchema>) {
    const { profile, tokens } = await this.auth.login(body);
    return { data: { profile, tokens } };
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Body(zodBody(refreshSchema)) body: z.infer<typeof refreshSchema>) {
    return { data: await this.auth.refresh(body.refreshToken) };
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(): Promise<void> {
    // Access tokens are short-lived and stateless; the client discards them.
    // A refresh-token denylist lands with the session store in M3.
  }
}
