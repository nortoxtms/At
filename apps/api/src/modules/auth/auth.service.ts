import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { VerificationLevel } from '@only-horses/shared-types';

import type { Env } from '../../config/env.js';
import { DatabaseService } from '../../database/database.service.js';
import { ApiException } from '../../common/filters/api-exception.filter.js';
import {
  DuplicateEmailError,
  IDENTITY_PROVIDER,
  type IdentityProvider,
  type IdentityUser,
} from './identity-provider.js';

export interface SessionTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: string;
}

export interface AuthenticatedProfile {
  id: string;
  handle: string;
  displayName: string;
  locale: string;
  verificationLevel: VerificationLevel;
  trustScore: number;
  onboardingStep: string | null;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly db: DatabaseService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService<Env, true>,
    @Inject(IDENTITY_PROVIDER) private readonly identity: IdentityProvider,
  ) {}

  async register(input: {
    email: string;
    password: string;
    displayName: string;
    locale?: string;
    dateOfBirth?: string;
  }): Promise<{ profile: AuthenticatedProfile; tokens: SessionTokens }> {
    // §26: 16+ to register, 18+ to publish. The publish gate is enforced
    // separately at §13.1; this is the registration floor.
    if (input.dateOfBirth && ageInYears(input.dateOfBirth) < 16) {
      throw ApiException.validation('Kayıt olmak için en az 16 yaşında olman gerekiyor.');
    }

    let identityUser: IdentityUser;
    try {
      identityUser = await this.identity.createUser({
        email: input.email,
        password: input.password,
      });
    } catch (error) {
      if (error instanceof DuplicateEmailError) {
        throw new ApiException('CONFLICT', error.message, 409);
      }
      throw error;
    }

    const profile = await this.provisionProfile(identityUser, {
      displayName: input.displayName,
      locale: input.locale,
      dateOfBirth: input.dateOfBirth,
    });

    return { profile, tokens: await this.issueTokens(profile.id) };
  }

  async login(input: {
    email: string;
    password: string;
  }): Promise<{ profile: AuthenticatedProfile; tokens: SessionTokens }> {
    const identityUser = await this.identity.verifyPassword(input);

    if (!identityUser) {
      throw ApiException.unauthorized('E-posta veya şifre hatalı.');
    }

    const profile = await this.loadProfileByProviderUid(identityUser.providerUid);

    if (!profile) {
      // The identity exists but the profile row does not — an interrupted
      // registration. Complete it rather than stranding the account.
      const provisioned = await this.provisionProfile(identityUser, {
        displayName: identityUser.email?.split('@')[0] ?? 'Kullanıcı',
      });
      return { profile: provisioned, tokens: await this.issueTokens(provisioned.id) };
    }

    if (profile.is_suspended) {
      throw ApiException.forbidden('Hesabın askıya alındı.');
    }

    await this.db.query('UPDATE profiles SET last_active_at = now() WHERE id = $1', [profile.id]);

    return { profile: toAuthenticatedProfile(profile), tokens: await this.issueTokens(profile.id) };
  }

  /**
   * Mirrors the provider's user into `auth.users` and creates the §7 profile
   * row, its notification preferences and its free subscription in one
   * transaction — a half-provisioned account is worse than a failed signup.
   */
  private async provisionProfile(
    identityUser: IdentityUser,
    input: { displayName: string; locale?: string; dateOfBirth?: string },
  ): Promise<AuthenticatedProfile> {
    const locale = input.locale ?? this.config.get('DEFAULT_LOCALE', { infer: true });
    const currency = this.config.get('DEFAULT_CURRENCY', { infer: true });
    const region = this.config.get('LAUNCH_REGION', { infer: true });

    // The identity mirror is written first, outside any user scope: the `auth`
    // schema carries no RLS, and there is no profile to be scoped to yet.
    // Firebase creates its record remotely so the row may not exist; the local
    // provider creates it itself and seeds firebase_uid with its own id, so
    // both providers land here as an upsert on the same key.
    const userRows = await this.db.query<{ id: string }>(
      `INSERT INTO auth.users (firebase_uid, email, providers, email_confirmed_at)
       VALUES ($1, $2, ARRAY['password'], $3)
       ON CONFLICT (firebase_uid) DO UPDATE
         SET email = EXCLUDED.email,
             last_sign_in_at = now()
       RETURNING id`,
      [
        identityUser.providerUid,
        identityUser.email,
        identityUser.emailVerified ? new Date() : null,
      ],
    );

    const userId = userRows[0]!.id;

    // Everything below runs as the user being created, so the §8 policies
    // apply to signup exactly as they do to any later write (ADR-0004,
    // migration 0015). A half-provisioned account is worse than a failed
    // signup, so it is one transaction.
    return this.db.withUser(userId, async (client) => {
      const handle = await this.allocateHandle(client, input.displayName);

      const { rows: profileRows } = await client.query<ProfileRow>(
        `INSERT INTO profiles (
           id, handle, display_name, locale, preferred_currency, country_code,
           date_of_birth, verification_level, onboarding_step)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'role_picker')
         RETURNING id, handle, display_name, locale, verification_level,
                   trust_score, onboarding_step, is_suspended`,
        [
          userId,
          handle,
          input.displayName,
          locale,
          currency,
          region,
          input.dateOfBirth ?? null,
          identityUser.emailVerified ? 'email_verified' : 'none',
        ],
      );

      await client.query(
        `INSERT INTO notification_preferences (profile_id) VALUES ($1)
         ON CONFLICT (profile_id) DO NOTHING`,
        [userId],
      );

      // §16.1: everyone starts on the free tier; limits resolve from it.
      await client.query(
        `INSERT INTO subscriptions (profile_id, tier, status) VALUES ($1, 'free', 'active')`,
        [userId],
      );

      return toAuthenticatedProfile(profileRows[0]!);
    });
  }

  /**
   * §7 makes `profiles.handle` unique. Derive it from the display name and
   * disambiguate with a counter rather than failing the signup.
   */
  private async allocateHandle(
    client: { query: (text: string, params: unknown[]) => Promise<{ rows: unknown[] }> },
    displayName: string,
  ): Promise<string> {
    const base =
      slugify(displayName).slice(0, 24) || `binici${Math.floor(Math.random() * 100000)}`;

    for (let attempt = 0; attempt < 50; attempt += 1) {
      const candidate = attempt === 0 ? base : `${base}${attempt + 1}`;
      const { rows } = await client.query('SELECT 1 FROM profiles WHERE handle = $1', [candidate]);
      if (rows.length === 0) return candidate;
    }

    return `${base}-${Date.now().toString(36)}`;
  }

  private async loadProfileByProviderUid(providerUid: string): Promise<ProfileRow | null> {
    const rows = await this.db.query<ProfileRow>(
      `SELECT p.id, p.handle, p.display_name, p.locale, p.verification_level,
              p.trust_score, p.onboarding_step, p.is_suspended
       FROM profiles p
       JOIN auth.users u ON u.id = p.id
       WHERE (u.firebase_uid = $1 OR u.id::text = $1) AND p.deleted_at IS NULL`,
      [providerUid],
    );
    return rows[0] ?? null;
  }

  private async issueTokens(profileId: string): Promise<SessionTokens> {
    const expiresIn = this.config.get('JWT_EXPIRES_IN', { infer: true });

    const accessToken = await this.jwt.signAsync(
      { sub: profileId, typ: 'access' },
      { expiresIn },
    );
    const refreshToken = await this.jwt.signAsync(
      { sub: profileId, typ: 'refresh' },
      { expiresIn: this.config.get('REFRESH_TOKEN_EXPIRES_IN', { infer: true }) },
    );

    return { accessToken, refreshToken, expiresIn };
  }

  async refresh(refreshToken: string): Promise<SessionTokens> {
    let payload: { sub: string; typ: string };
    try {
      payload = await this.jwt.verifyAsync(refreshToken);
    } catch {
      throw ApiException.unauthorized('Oturum süresi doldu. Tekrar giriş yap.');
    }

    if (payload.typ !== 'refresh') {
      throw ApiException.unauthorized('Geçersiz yenileme anahtarı.');
    }

    return this.issueTokens(payload.sub);
  }
}

interface ProfileRow {
  id: string;
  handle: string;
  display_name: string;
  locale: string;
  verification_level: VerificationLevel;
  trust_score: number;
  onboarding_step: string | null;
  is_suspended: boolean;
}

function toAuthenticatedProfile(row: ProfileRow): AuthenticatedProfile {
  return {
    id: row.id,
    handle: row.handle,
    displayName: row.display_name,
    locale: row.locale,
    verificationLevel: row.verification_level,
    trustScore: row.trust_score,
    onboardingStep: row.onboarding_step,
  };
}

function slugify(input: string): string {
  const turkish: Record<string, string> = {
    ı: 'i', İ: 'i', ş: 's', Ş: 's', ğ: 'g', Ğ: 'g',
    ü: 'u', Ü: 'u', ö: 'o', Ö: 'o', ç: 'c', Ç: 'c',
  };

  return input
    .replace(/[ıİşŞğĞüÜöÖçÇ]/g, (char) => turkish[char] ?? char)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function ageInYears(dateOfBirth: string): number {
  const dob = new Date(dateOfBirth);
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const monthDelta = now.getMonth() - dob.getMonth();
  if (monthDelta < 0 || (monthDelta === 0 && now.getDate() < dob.getDate())) age -= 1;
  return age;
}
