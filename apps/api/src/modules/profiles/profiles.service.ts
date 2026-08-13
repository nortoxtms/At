import { Injectable } from '@nestjs/common';
import { trustChipsTr, type RoleType, type VerificationLevel } from '@only-horses/shared-types';

import { ApiException } from '../../common/filters/api-exception.filter.js';
import { DatabaseService } from '../../database/database.service.js';
import { EntitlementsService } from '../entitlements/entitlements.service.js';

/**
 * Profiles and role profiles — spec §3, §12, §18.2 S23–S25.
 *
 * P2: "One account, many roles." There is no account type at signup; a user
 * adds role profiles as they need them, and a single person can be an owner, a
 * rider and a farrier at once without three accounts.
 */
@Injectable()
export class ProfilesService {
  constructor(
    private readonly db: DatabaseService,
    private readonly entitlements: EntitlementsService,
  ) {}

  async me(profileId: string): Promise<Record<string, unknown>> {
    const rows = await this.db.queryAs<Record<string, never>>(
      profileId,
      `SELECT p.id, p.handle, p.display_name, p.bio, p.avatar_media_id,
              p.country_code, p.region, p.city, p.location_precision,
              p.phone_e164, p.phone_public, p.email_public, p.languages,
              p.verification_level, p.trust_score, p.response_rate,
              p.response_time_mins, p.locale, p.preferred_currency,
              p.preferred_units, p.onboarding_step, p.is_moderator, p.is_admin,
              u.email
       FROM profiles p
       JOIN auth.users u ON u.id = p.id
       WHERE p.id = $1 AND p.deleted_at IS NULL`,
      [profileId],
    );

    const profile = rows[0] as Record<string, unknown> | undefined;
    if (!profile) throw ApiException.notFound('Profil');

    return {
      ...toCamel(profile),
      roles: await this.listRoles(profileId, true),
    };
  }

  /** §12 GET /profiles/:handle — the public view (§18.2 S23). */
  async byHandle(handle: string): Promise<Record<string, unknown>> {
    const rows = await this.db.query<Record<string, never>>(
      `SELECT p.id, p.handle, p.display_name, p.bio, p.avatar_media_id,
              p.country_code, p.region, p.city, p.languages,
              p.verification_level, p.trust_score, p.response_rate,
              p.response_time_mins, p.created_at,
              -- Contact details are opt-in and, per §14.3, only meaningful
              -- once the viewer is identity verified; the controller decides
              -- whether to pass them on.
              CASE WHEN p.phone_public THEN p.phone_e164 END AS phone_e164,
              CASE WHEN p.email_public THEN u.email END AS email,
              (SELECT count(*) FROM reviews r
                WHERE r.subject_profile_id = p.id AND r.is_hidden = FALSE) AS review_count,
              (SELECT avg(r.rating) FROM reviews r
                WHERE r.subject_profile_id = p.id AND r.is_hidden = FALSE) AS review_average
       FROM profiles p
       JOIN auth.users u ON u.id = p.id
       WHERE p.handle = $1 AND p.deleted_at IS NULL AND p.is_suspended = FALSE`,
      [handle],
    );

    const profile = rows[0] as Record<string, unknown> | undefined;
    if (!profile) throw ApiException.notFound('Profil');

    const accountAgeMonths = Math.floor(
      (Date.now() - new Date(profile.created_at as string).getTime()) / (30 * 86_400_000),
    );

    const verification = profile.verification_level as VerificationLevel;
    const reviewCount = Number(profile.review_count ?? 0);
    const responseRate = profile.response_rate === null ? null : Number(profile.response_rate);

    return {
      ...toCamel(profile),
      roles: await this.listRoles(profile.id as string, false),
      // P4 / §13.3: never show the bare number. The chips are what make the
      // score explainable, so they are computed alongside it rather than left
      // to each client.
      trustChips: trustChipsTr({
        emailVerified: verification !== 'none',
        phoneVerified: ['phone_verified', 'identity_verified', 'professional_verified', 'business_verified'].includes(verification),
        identityVerified: ['identity_verified', 'professional_verified', 'business_verified'].includes(verification),
        professionalVerified: ['professional_verified', 'business_verified'].includes(verification),
        accountAgeMonths,
        reviewCount,
        reviewAverage: profile.review_average === null ? null : Number(profile.review_average),
        // §13.5 withholds the rate below 5 inquiries; the column is null then.
        responseRate,
        upheldActions: 0,
      }),
    };
  }

  async updateMe(profileId: string, input: Record<string, unknown>): Promise<void> {
    const columns: Record<string, unknown> = {
      display_name: input.displayName,
      bio: input.bio,
      avatar_media_id: input.avatarMediaId,
      country_code: input.countryCode,
      region: input.region,
      city: input.city,
      location_precision: input.locationPrecision,
      phone_public: input.phonePublic,
      email_public: input.emailPublic,
      languages: input.languages,
      locale: input.locale,
      preferred_currency: input.preferredCurrency,
      preferred_units: input.preferredUnits,
      onboarding_step: input.onboardingStep,
    };

    const present = Object.entries(columns).filter(([, value]) => value !== undefined);
    if (present.length === 0) return;

    const assignments = present.map(([column], index) => `${column} = $${index + 2}`);

    await this.db.withUser(profileId, (client) =>
      client.query(`UPDATE profiles SET ${assignments.join(', ')} WHERE id = $1`, [
        profileId,
        ...present.map(([, value]) => value),
      ]),
    );
  }

  /** §12 GET /me/limits — what the client needs to render the paywall early. */
  async limits(profileId: string): Promise<Record<string, unknown>> {
    const entitlements = await this.entitlements.forProfile(profileId);

    return {
      tier: entitlements.tier,
      verificationLevel: entitlements.verificationLevel,
      // Infinity does not survive JSON, and a client that reads `null` as zero
      // would show a paid user as having no allowance at all.
      limits: Object.fromEntries(
        Object.entries(entitlements.limits).map(([key, value]) => [
          key,
          value === Number.POSITIVE_INFINITY ? 'unlimited' : value,
        ]),
      ),
      usage: entitlements.usage,
    };
  }

  /** §12 GET /me/dashboard — the counts behind §18.2 S24's tiles. */
  async dashboard(profileId: string): Promise<Record<string, unknown>> {
    const rows = await this.db.queryAs<Record<string, never>>(
      profileId,
      `SELECT
         (SELECT count(*) FROM horses
           WHERE owner_profile_id = $1 AND deleted_at IS NULL) AS horses,
         (SELECT count(*) FROM listings
           WHERE seller_profile_id = $1 AND status = 'active') AS active_listings,
         (SELECT count(*) FROM listings
           WHERE seller_profile_id = $1 AND status = 'draft') AS draft_listings,
         (SELECT count(*) FROM notifications
           WHERE profile_id = $1 AND read_at IS NULL) AS unread_notifications,
         (SELECT count(*) FROM saved_items WHERE profile_id = $1) AS saved_items,
         (SELECT count(*) FROM horse_access_grants g
           JOIN horses h ON h.id = g.horse_id
           WHERE h.owner_profile_id = $1 AND g.status = 'requested') AS pending_access_requests,
         (SELECT count(*) FROM horse_health_records r
           JOIN horses h ON h.id = r.horse_id
           WHERE h.owner_profile_id = $1
             AND r.next_due_on IS NOT NULL
             AND r.next_due_on <= CURRENT_DATE + INTERVAL '14 days') AS due_reminders`,
      [profileId],
    );

    return toCamel(rows[0] as unknown as Record<string, unknown>, Number);
  }

  async listRoles(profileId: string, includePrivate: boolean): Promise<unknown[]> {
    const rows = await this.db.queryAs<Record<string, never>>(
      includePrivate ? profileId : null,
      `SELECT id, role, headline, about, years_experience, specialties, disciplines,
              service_radius_km, travels, hourly_rate_min, hourly_rate_max, currency,
              is_primary, is_public, verified_at
       FROM role_profiles
       WHERE profile_id = $1 AND ($2 = TRUE OR is_public = TRUE)
       ORDER BY is_primary DESC, created_at`,
      [profileId, includePrivate],
    );

    return rows.map((row) => toCamel(row as unknown as Record<string, unknown>));
  }

  async addRole(profileId: string, input: { role: RoleType } & Record<string, unknown>): Promise<{ id: string }> {
    const rows = await this.db.withUser(profileId, async (client) => {
      const result = await client.query<{ id: string }>(
        `INSERT INTO role_profiles (profile_id, role, headline, about, years_experience,
                                    specialties, disciplines, service_radius_km, travels,
                                    hourly_rate_min, hourly_rate_max, currency, is_primary)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,
                 -- The first role a user adds is their primary one.
                 NOT EXISTS (SELECT 1 FROM role_profiles WHERE profile_id = $1))
         ON CONFLICT (profile_id, role) DO UPDATE
           SET headline = EXCLUDED.headline, about = EXCLUDED.about
         RETURNING id`,
        [
          profileId,
          input.role,
          input.headline ?? null,
          input.about ?? null,
          input.yearsExperience ?? null,
          input.specialties ?? [],
          input.disciplines ?? [],
          input.serviceRadiusKm ?? null,
          input.travels ?? false,
          input.hourlyRateMin ?? null,
          input.hourlyRateMax ?? null,
          input.currency ?? null,
        ],
      );
      return result.rows;
    });

    return rows[0]!;
  }

  /** §12 PATCH /me/roles/:roleId — the role profile is the professional's page. */
  async updateRole(
    profileId: string,
    roleId: string,
    input: Record<string, unknown>,
  ): Promise<void> {
    const columns: Record<string, unknown> = {
      headline: input.headline,
      about: input.about,
      years_experience: input.yearsExperience,
      specialties: input.specialties,
      disciplines: input.disciplines,
      service_radius_km: input.serviceRadiusKm,
      travels: input.travels,
      hourly_rate_min: input.hourlyRateMin,
      hourly_rate_max: input.hourlyRateMax,
      currency: input.currency,
      is_primary: input.isPrimary,
      is_public: input.isPublic,
    };

    const present = Object.entries(columns).filter(([, value]) => value !== undefined);
    if (present.length === 0) return;

    const updated = await this.db.withUser(profileId, async (client) => {
      const assignments = present.map(([column], index) => `${column} = $${index + 3}`);
      const result = await client.query(
        `UPDATE role_profiles SET ${assignments.join(', ')}
         WHERE id = $1 AND profile_id = $2 RETURNING id`,
        [roleId, profileId, ...present.map(([, value]) => value)],
      );
      return result.rows;
    });

    if (updated.length === 0) throw ApiException.notFound('Rol profili');
  }

  /**
   * §12 POST /me/roles/:roleId/credentials.
   *
   * A credential is a *claim* until a moderator approves it (§14.1): the row
   * carries the evidence and `verified_at` stays null, so nothing here can
   * grant a badge on its own.
   */
  async addCredential(
    profileId: string,
    roleId: string,
    input: { title: string; issuer?: string; issuedOn?: string; expiresOn?: string; mediaId?: string },
  ): Promise<{ id: string }> {
    const owns = await this.db.queryAs<{ id: string }>(
      profileId,
      `SELECT id FROM role_profiles WHERE id = $1 AND profile_id = $2`,
      [roleId, profileId],
    );

    if (!owns[0]) throw ApiException.notFound('Rol profili');

    const rows = await this.db.withUser(profileId, async (client) => {
      const result = await client.query<{ id: string }>(
        `INSERT INTO credentials (role_profile_id, title, issuer, issued_on, expires_on, document_media_id)
         VALUES ($1,$2,$3,$4,$5,$6)
         RETURNING id`,
        [
          roleId,
          input.title,
          input.issuer ?? null,
          input.issuedOn ?? null,
          input.expiresOn ?? null,
          input.mediaId ?? null,
        ],
      );
      return result.rows;
    });

    return rows[0]!;
  }

  /** §12 POST /me/avatar {mediaId}. */
  async setAvatar(profileId: string, mediaId: string): Promise<void> {
    const owns = await this.db.queryAs<{ id: string }>(
      profileId,
      // The image has to be this user's own upload; otherwise anyone could
      // point their avatar at someone else's private media id.
      `SELECT id FROM media WHERE id = $1 AND owner_profile_id = $2 AND type = 'image'`,
      [mediaId, profileId],
    );

    if (!owns[0]) throw ApiException.notFound('Görsel');

    await this.db.withUser(profileId, (client) =>
      client.query(`UPDATE profiles SET avatar_media_id = $2 WHERE id = $1`, [profileId, mediaId]),
    );
  }

  async removeRole(profileId: string, roleId: string): Promise<void> {
    const result = await this.db.withUser(profileId, (client) =>
      client.query(`DELETE FROM role_profiles WHERE id = $1 AND profile_id = $2`, [
        roleId,
        profileId,
      ]),
    );

    if (result.rowCount === 0) throw ApiException.notFound('Rol');
  }
}

/** snake_case rows to the camelCase the §12 contract uses. */
function toCamel(
  row: Record<string, unknown>,
  transform: (value: unknown) => unknown = (value) => value,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [
      key.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase()),
      transform(value),
    ]),
  );
}
