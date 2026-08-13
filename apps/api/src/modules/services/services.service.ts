import { Injectable, Logger } from '@nestjs/common';
import {
  type CreateServiceInput,
  findContactInfo,
  serviceNoticeFor,
  type UpdateServiceInput,
} from '@only-horses/shared-types';

import { ApiException } from '../../common/filters/api-exception.filter.js';
import { DatabaseService } from '../../database/database.service.js';
import { EntitlementsService } from '../entitlements/entitlements.service.js';

/**
 * Service listings — spec §7, §9.3, §12 "Services", §18.2 S15/S16.
 *
 * A service shares the listing lifecycle enum with horse listings and very
 * little else. There is no quality score and no welfare policy here, because
 * neither describes a farrier; what is shared is the part that protects
 * buyers — identity verification before publishing (§3.3), the plan limit
 * (§16.1), and the contact-details rule that keeps first contact on-platform.
 */
@Injectable()
export class ServicesService {
  private readonly logger = new Logger(ServicesService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly entitlements: EntitlementsService,
  ) {}

  async create(profileId: string, input: CreateServiceInput): Promise<{ id: string; slug: string }> {
    await this.assertCategoryExists(input.category);

    if (input.organizationId) await this.assertOrgAdmin(profileId, input.organizationId);

    const slug = await this.allocateSlug(input.title);

    const rows = await this.db.withUser(profileId, async (client) => {
      const result = await client.query<{ id: string; slug: string }>(
        `INSERT INTO service_listings (
           slug, provider_profile_id, provider_org_id, category, title, description,
           price_min, price_max, price_unit, currency,
           country_code, region, city, location, service_radius_km, is_mobile,
           availability_note, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,
                 CASE WHEN $14::float8 IS NULL THEN NULL
                      ELSE ST_SetSRID(ST_MakePoint($14::float8, $15::float8), 4326)::geography END,
                 $16,$17,$18,'draft')
         RETURNING id, slug`,
        [
          slug,
          profileId,
          input.organizationId ?? null,
          input.category,
          input.title,
          this.sanitize(input.description),
          input.priceMin ?? null,
          input.priceMax ?? null,
          input.priceUnit ?? null,
          input.currency,
          input.countryCode,
          input.region ?? null,
          input.city ?? null,
          input.lng ?? null,
          input.lat ?? null,
          input.serviceRadiusKm ?? null,
          input.isMobile,
          input.availabilityNote ?? null,
        ],
      );
      return result.rows;
    });

    return rows[0]!;
  }

  async update(profileId: string, serviceId: string, input: UpdateServiceInput): Promise<void> {
    await this.loadOwned(profileId, serviceId);
    if (input.category) await this.assertCategoryExists(input.category);

    const columns: Record<string, unknown> = {
      category: input.category,
      title: input.title,
      description: input.description === undefined ? undefined : this.sanitize(input.description),
      price_min: input.priceMin,
      price_max: input.priceMax,
      price_unit: input.priceUnit,
      currency: input.currency,
      country_code: input.countryCode,
      region: input.region,
      city: input.city,
      service_radius_km: input.serviceRadiusKm,
      is_mobile: input.isMobile,
      availability_note: input.availabilityNote,
    };

    const present = Object.entries(columns).filter(([, value]) => value !== undefined);
    const movesLocation = input.lat !== undefined && input.lng !== undefined;

    if (present.length === 0 && !movesLocation) return;

    await this.db.withUser(profileId, async (client) => {
      const assignments = present.map(([column], index) => `${column} = $${index + 2}`);
      if (movesLocation) {
        assignments.push(
          `location = ST_SetSRID(ST_MakePoint($${present.length + 2}::float8, $${present.length + 3}::float8), 4326)::geography`,
        );
      }

      await client.query(`UPDATE service_listings SET ${assignments.join(', ')} WHERE id = $1`, [
        serviceId,
        ...present.map(([, value]) => value),
        ...(movesLocation ? [input.lng, input.lat] : []),
      ]);
    });
  }

  /**
   * §12 POST /services/:id/publish.
   *
   * Same ordering argument as `ListingsService.publish`: verification is
   * checked before the plan limit, because §3.3's identity rule is not
   * purchasable and answering LIMIT_EXCEEDED would send an unverified provider
   * to a paywall that cannot unblock them.
   */
  async publish(profileId: string, serviceId: string): Promise<{ status: string }> {
    const service = await this.loadOwned(profileId, serviceId);

    if (service.status === 'active') return { status: 'active' };

    const entitlements = await this.entitlements.requireVerification(
      profileId,
      'identity_verified',
      'Hizmet ilanı yayınlamak',
    );

    this.entitlements.assertUnderLimit(
      entitlements,
      'activeServiceListings',
      `${entitlements.limits.maxActiveServiceListings} aktif hizmet ilanı sınırına ulaştın. Daha fazlası için planını yükselt.`,
    );

    await this.db.withUser(profileId, (client) =>
      client.query(
        `UPDATE service_listings
         SET status = 'active',
             published_at = COALESCE(published_at, now()),
             expires_at = now() + INTERVAL '90 days'
         WHERE id = $1`,
        [serviceId],
      ),
    );

    this.logger.log(`Service ${serviceId} published`);
    return { status: 'active' };
  }

  async setStatus(profileId: string, serviceId: string, status: 'paused' | 'withdrawn'): Promise<{ status: string }> {
    await this.loadOwned(profileId, serviceId);

    await this.db.withUser(profileId, (client) =>
      client.query(`UPDATE service_listings SET status = $2 WHERE id = $1`, [serviceId, status]),
    );

    return { status };
  }

  /** §12 GET /services/:slug — public, so guests can be sent a link. */
  async findByIdOrSlug(idOrSlug: string, viewerId: string | null): Promise<Record<string, unknown>> {
    const load = async (scoped: boolean) => {
      const sql = `SELECT s.id, s.slug, s.category, s.title, s.description,
                          s.price_min, s.price_max, s.price_unit, s.currency,
                          s.country_code, s.region, s.city,
                          s.service_radius_km, s.is_mobile, s.availability_note,
                          s.status, s.view_count, s.inquiry_count, s.published_at,
                          ST_Y(s.location::geometry) AS lat, ST_X(s.location::geometry) AS lng,
                          c.name_tr AS category_name_tr, c.name_en AS category_name_en, c.icon,
                          p.id AS provider_id, p.handle AS provider_handle,
                          p.display_name AS provider_name, p.verification_level,
                          p.trust_score, p.response_rate,
                          av.cf_image_id AS provider_avatar,
                          o.id AS organization_id, o.name AS organization_name,
                          r.average AS rating_average, r.total AS rating_count
                   FROM service_listings s
                   JOIN service_categories c ON c.code = s.category
                   JOIN profiles p ON p.id = s.provider_profile_id
                   LEFT JOIN media av ON av.id = p.avatar_media_id
                   LEFT JOIN organizations o ON o.id = s.provider_org_id
                   LEFT JOIN LATERAL review_summary(p.id, NULL) r ON TRUE
                   WHERE (s.id::text = $1 OR s.slug = $1)`;

      return scoped && viewerId
        ? this.db.queryAs<Record<string, unknown>>(viewerId, sql, [idOrSlug])
        : this.db.query<Record<string, unknown>>(sql, [idOrSlug]);
    };

    // Anonymous first: `services_select` shows active listings to everyone,
    // and only the owner's own draft needs the scoped read.
    const anonymous = await load(false);
    const rows = anonymous.length > 0 ? anonymous : await load(true);
    const service = rows[0];
    if (!service) throw ApiException.notFound('Hizmet');

    // §26: transport services carry a regulatory notice, shipped by the API so
    // a stale mobile build cannot omit it.
    return { ...service, notice: serviceNoticeFor(service.category as string) };
  }

  async listMine(profileId: string): Promise<unknown[]> {
    return this.db.queryAs(
      profileId,
      `SELECT id, slug, category, title, status, price_min, price_max, price_unit, currency,
              city, is_mobile, view_count, inquiry_count, published_at, expires_at
       FROM service_listings
       WHERE provider_profile_id = $1
       ORDER BY created_at DESC`,
      [profileId],
    );
  }

  /** §18.2 S15's category grid, with live counts. */
  async categories(): Promise<unknown[]> {
    return this.db.query(
      `SELECT c.code, c.name_tr, c.name_en, c.name_es, c.name_de, c.icon,
              (SELECT count(*) FROM service_listings s
                WHERE s.category = c.code AND s.status = 'active')::int AS active_count
       FROM service_categories c
       ORDER BY c.sort_order, c.code`,
    );
  }

  private sanitize(description: string): string {
    // §14.3: contact details in the body move first contact off-platform,
    // where none of the safety features reach. Same rule as horse listings.
    const found = findContactInfo(description);
    if (found.length > 0) {
      throw ApiException.validation(
        'Açıklamada telefon numarası veya e-posta paylaşamazsın. İlk temas uygulama içinden kurulmalı.',
        { found },
      );
    }

    return description;
  }

  private async assertCategoryExists(category: string): Promise<void> {
    const rows = await this.db.query<{ code: string }>(
      `SELECT code FROM service_categories WHERE code = $1`,
      [category],
    );
    if (!rows[0]) throw ApiException.validation('Geçersiz hizmet kategorisi.');
  }

  private async assertOrgAdmin(profileId: string, organizationId: string): Promise<void> {
    const rows = await this.db.queryAs<{ role: string }>(
      profileId,
      `SELECT role FROM organization_members
       WHERE organization_id = $1 AND profile_id = $2 AND role IN ('owner','admin')`,
      [organizationId, profileId],
    );

    if (!rows[0]) throw ApiException.forbidden('Bu işletme adına ilan veremezsin.');
  }

  private async loadOwned(
    profileId: string,
    serviceId: string,
  ): Promise<{ id: string; status: string; provider_profile_id: string }> {
    const rows = await this.db.queryAs<{ id: string; status: string; provider_profile_id: string }>(
      profileId,
      `SELECT id, status, provider_profile_id FROM service_listings WHERE id = $1`,
      [serviceId],
    );

    const service = rows[0];
    // NOT_FOUND rather than FORBIDDEN — §24.25 on IDOR oracles.
    if (!service || service.provider_profile_id !== profileId) throw ApiException.notFound('Hizmet');

    return service;
  }

  private async allocateSlug(title: string): Promise<string> {
    const base = slugify(title).slice(0, 60) || 'hizmet';

    for (let attempt = 0; attempt < 50; attempt += 1) {
      const candidate = attempt === 0 ? base : `${base}-${attempt + 1}`;
      const rows = await this.db.query<{ taken: boolean }>('SELECT service_slug_taken($1) AS taken', [
        candidate,
      ]);
      if (!rows[0]?.taken) return candidate;
    }

    return `${base}-${Date.now().toString(36)}`;
  }
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
