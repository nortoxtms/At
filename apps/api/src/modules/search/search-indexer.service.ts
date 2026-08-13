import { Inject, Injectable, Logger } from '@nestjs/common';

import { DatabaseService } from '../../database/database.service.js';
import {
  SEARCH_PROVIDER,
  type ListingDocument,
  type SearchDocument,
  type SearchProvider,
} from './search.provider.js';

/** §11.1's collections, and the only values `search_outbox.collection` takes. */
type IndexedCollection = 'listings' | 'services' | 'jobs' | 'professionals';

/**
 * Outbox drain — spec §11.4.
 *
 * "DB trigger writes to `search_outbox`, a BullMQ worker drains it every 2 s."
 *
 * The outbox pattern is what keeps the index consistent with the database
 * across a crash: the trigger and the row it describes commit together, so a
 * change can never be indexed without having been saved, nor saved without
 * eventually being indexed.
 */
@Injectable()
export class SearchIndexerService {
  private readonly logger = new Logger(SearchIndexerService.name);

  constructor(
    private readonly db: DatabaseService,
    @Inject(SEARCH_PROVIDER) private readonly search: SearchProvider,
  ) {}

  async drain(batchSize = 200): Promise<{ indexed: number; deleted: number; failed: number }> {
    // FOR UPDATE SKIP LOCKED lets several workers drain concurrently without
    // handing the same row to two of them.
    const batch = await this.db.query<{
      id: string;
      collection: string;
      document_id: string;
      operation: string;
    }>(
      `WITH claimed AS (
         SELECT id FROM search_outbox
         WHERE processed_at IS NULL AND attempts < 5
         ORDER BY created_at
         LIMIT $1
         FOR UPDATE SKIP LOCKED
       )
       UPDATE search_outbox o
       SET attempts = o.attempts + 1
       FROM claimed
       WHERE o.id = claimed.id
       RETURNING o.id, o.collection, o.document_id, o.operation`,
      [batchSize],
    );

    if (batch.length === 0) return { indexed: 0, deleted: 0, failed: 0 };

    let indexed = 0;
    let deleted = 0;
    let failed = 0;

    try {
      // §11.1's four collections drain through one loop. Each has its own
      // projection, but the rule is identical everywhere: a row that no longer
      // qualifies for the index — paused, withdrawn, held for review, made
      // private — is a *delete*, not a missing upsert. Leaving it indexed is
      // how a withdrawn listing keeps taking inquiries.
      for (const collection of ['listings', 'services', 'jobs', 'professionals'] as const) {
        const rows = batch.filter((row) => row.collection === collection);
        if (rows.length === 0) continue;

        const upsertIds = rows.filter((row) => row.operation === 'upsert').map((row) => row.document_id);
        const documents = upsertIds.length > 0 ? await this.buildDocuments(collection, upsertIds) : [];
        const present = new Set(documents.map((document) => document.id));

        const toDelete = [
          ...rows.filter((row) => row.operation === 'delete').map((row) => row.document_id),
          ...upsertIds.filter((id) => !present.has(id)),
        ];

        if (documents.length > 0) await this.search.upsert(collection, documents);
        if (toDelete.length > 0) await this.search.delete(collection, toDelete);

        indexed += documents.length;
        deleted += toDelete.length;
      }

      await this.db.query(
        `UPDATE search_outbox SET processed_at = now(), last_error = NULL WHERE id = ANY($1::bigint[])`,
        [batch.map((row) => row.id)],
      );
    } catch (error) {
      failed = batch.length;
      const message = error instanceof Error ? error.message : String(error);

      // Left unprocessed with the attempt counted, so the next pass retries
      // and the fifth failure parks the row for a human.
      await this.db.query(`UPDATE search_outbox SET last_error = $2 WHERE id = ANY($1::bigint[])`, [
        batch.map((row) => row.id),
        message,
      ]);

      this.logger.error(`Indexing batch of ${batch.length} failed: ${message}`);
    }

    return { indexed, deleted, failed };
  }

  /** Full reindex — `pnpm --filter api search:reindex` (§11.4). */
  async reindexAll(): Promise<Record<string, number>> {
    await this.search.ensureCollections();

    const sources: Record<IndexedCollection, string> = {
      listings: `SELECT id FROM listings WHERE status IN ('active','under_offer')`,
      services: `SELECT id FROM service_listings WHERE status = 'active'`,
      jobs: `SELECT id FROM job_listings WHERE status = 'active'`,
      // The directory indexes people who present themselves as professionals,
      // which is what a public role profile means (§7). Everyone else — the
      // buyers — is deliberately absent.
      professionals: `SELECT p.id FROM profiles p
                      WHERE p.deleted_at IS NULL AND p.is_suspended = FALSE
                        AND EXISTS (SELECT 1 FROM role_profiles r
                                    WHERE r.profile_id = p.id AND r.is_public)`,
    };

    const counts: Record<string, number> = {};

    for (const [collection, sql] of Object.entries(sources) as [IndexedCollection, string][]) {
      const ids = await this.db.query<{ id: string }>(sql);
      let indexed = 0;

      for (let offset = 0; offset < ids.length; offset += 200) {
        const slice = ids.slice(offset, offset + 200).map((row) => row.id);
        const documents = await this.buildDocuments(collection, slice);
        if (documents.length > 0) await this.search.upsert(collection, documents);
        indexed += documents.length;
      }

      counts[collection] = indexed;
      this.logger.log(`Reindexed ${indexed} ${collection}`);
    }

    return counts;
  }

  private async buildDocuments(
    collection: IndexedCollection,
    ids: string[],
  ): Promise<SearchDocument[]> {
    switch (collection) {
      case 'listings':
        return this.buildListingDocuments(ids);
      case 'services':
        return this.buildServiceDocuments(ids);
      case 'jobs':
        return this.buildJobDocuments(ids);
      case 'professionals':
        return this.buildProfessionalDocuments(ids);
    }
  }

  /** §11.1's `services` collection — the §18.2 S15 hub reads from this. */
  private async buildServiceDocuments(ids: string[]): Promise<SearchDocument[]> {
    const rows = await this.db.query<Record<string, unknown>>(
      `SELECT s.id, s.slug, s.title, s.description, s.category,
              s.price_min, s.price_max, s.price_unit, s.currency,
              s.country_code, s.region, s.city, s.is_mobile, s.service_radius_km,
              s.published_at,
              CASE WHEN s.price_min IS NULL THEN NULL
                   ELSE s.price_min * COALESCE(fx.rate_to_eur, 1) END AS price_min_eur,
              p.id AS provider_id, p.display_name AS provider_name,
              p.verification_level AS provider_verification, p.trust_score AS provider_trust_score,
              av.cf_image_id AS provider_avatar,
              o.name AS organization_name,
              r.average AS rating_average, r.total AS rating_count,
              ST_Y(s.location::geometry) AS lat, ST_X(s.location::geometry) AS lng
       FROM service_listings s
       JOIN profiles p ON p.id = s.provider_profile_id
       LEFT JOIN media av ON av.id = p.avatar_media_id
       LEFT JOIN organizations o ON o.id = s.provider_org_id
       LEFT JOIN fx_rates fx ON fx.currency = s.currency
       LEFT JOIN LATERAL review_summary(p.id, NULL) r ON TRUE
       WHERE s.id = ANY($1::uuid[]) AND s.status = 'active' AND p.deleted_at IS NULL`,
      [ids],
    );

    return rows.map((row) => ({
      id: row.id as string,
      slug: (row.slug as string) ?? '',
      title: (row.title as string) ?? '',
      description: (row.description as string) ?? '',
      category: (row.category as string) ?? '',
      provider_id: row.provider_id as string,
      provider_name: (row.provider_name as string) ?? '',
      provider_verification: (row.provider_verification as string) ?? 'none',
      provider_trust_score: Number(row.provider_trust_score ?? 0),
      provider_avatar: (row.provider_avatar as string) ?? '',
      organization_name: (row.organization_name as string) ?? '',
      price_min: row.price_min === null ? null : Number(row.price_min),
      price_max: row.price_max === null ? null : Number(row.price_max),
      price_min_eur: row.price_min_eur === null ? null : Number(row.price_min_eur),
      price_unit: (row.price_unit as string) ?? '',
      currency: (row.currency as string) ?? 'EUR',
      country_code: (row.country_code as string) ?? '',
      region: (row.region as string) ?? '',
      city: (row.city as string) ?? '',
      is_mobile: Boolean(row.is_mobile),
      service_radius_km: row.service_radius_km === null ? null : Number(row.service_radius_km),
      rating_average: row.rating_average === null ? null : Number(row.rating_average),
      rating_count: Number(row.rating_count ?? 0),
      published_at: row.published_at ? new Date(row.published_at as string).getTime() : 0,
      geo: geoOf(row),
    }));
  }

  /**
   * §11.1's `jobs` collection.
   *
   * `salary_monthly_eur` is the only derived field, and it is what makes
   * §18.2 S17's salary filter comparable across a monthly Turkish wage and an
   * hourly German one. A job whose salary the poster hid (§18.2 S20) is
   * indexed *without* it — filterable by everything else, never leaking the
   * number through a range query.
   */
  private async buildJobDocuments(ids: string[]): Promise<SearchDocument[]> {
    const rows = await this.db.query<Record<string, unknown>>(
      // roles_needed is cast to text[]: node-pg returns an array of a custom
      // enum type as the raw string "{rider,groom}", which indexed the roles
      // as a JSON string and made §18.2 S17's role filter match nothing
      // (migration 0049).
      `SELECT j.id, j.slug, j.title, j.description, j.job_type,
              j.roles_needed::text[] AS roles_needed, j.disciplines,
              j.country_code, j.region, j.city,
              j.salary_min, j.salary_max, j.salary_currency, j.salary_period, j.salary_public,
              j.accommodation, j.meals_included, j.visa_support,
              j.experience_years_min, j.application_count, j.published_at,
              CASE WHEN j.salary_public AND j.salary_min IS NOT NULL AND j.salary_period IS NOT NULL
                   THEN j.salary_min * COALESCE(fx.rate_to_eur, 1) * CASE j.salary_period
                        WHEN 'hour'  THEN 173.33
                        WHEN 'day'   THEN 21.67
                        WHEN 'week'  THEN 52.0 / 12
                        WHEN 'month' THEN 1
                        WHEN 'year'  THEN 1.0 / 12
                        ELSE 1 END
              END AS salary_monthly_eur,
              o.name AS organization_name, logo.cf_image_id AS organization_logo,
              p.display_name AS poster_name,
              ST_Y(j.location::geometry) AS lat, ST_X(j.location::geometry) AS lng
       FROM job_listings j
       LEFT JOIN organizations o ON o.id = j.organization_id
       LEFT JOIN media logo ON logo.id = o.logo_media_id
       LEFT JOIN profiles p ON p.id = j.poster_profile_id
       LEFT JOIN fx_rates fx ON fx.currency = j.salary_currency
       WHERE j.id = ANY($1::uuid[]) AND j.status = 'active'`,
      [ids],
    );

    return rows.map((row) => ({
      id: row.id as string,
      slug: (row.slug as string) ?? '',
      title: (row.title as string) ?? '',
      description: (row.description as string) ?? '',
      job_type: (row.job_type as string) ?? '',
      roles_needed: (row.roles_needed as string[]) ?? [],
      disciplines: (row.disciplines as string[]) ?? [],
      organization_name: (row.organization_name as string) ?? '',
      organization_logo: (row.organization_logo as string) ?? '',
      poster_name: (row.poster_name as string) ?? '',
      country_code: (row.country_code as string) ?? '',
      region: (row.region as string) ?? '',
      city: (row.city as string) ?? '',
      salary_min: row.salary_public && row.salary_min !== null ? Number(row.salary_min) : null,
      salary_max: row.salary_public && row.salary_max !== null ? Number(row.salary_max) : null,
      salary_currency: row.salary_public ? ((row.salary_currency as string) ?? '') : '',
      salary_period: row.salary_public ? ((row.salary_period as string) ?? '') : '',
      salary_monthly_eur:
        row.salary_monthly_eur === null || row.salary_monthly_eur === undefined
          ? null
          : Number(row.salary_monthly_eur),
      accommodation: (row.accommodation as string) ?? '',
      meals_included: Boolean(row.meals_included),
      visa_support: Boolean(row.visa_support),
      experience_years_min:
        row.experience_years_min === null ? null : Number(row.experience_years_min),
      application_count: Number(row.application_count ?? 0),
      published_at: row.published_at ? new Date(row.published_at as string).getTime() : 0,
      geo: geoOf(row),
    }));
  }

  /**
   * §11.1's `professionals` collection.
   *
   * Only public role profiles are aggregated, and only the fields a directory
   * card shows: no phone, no email, no bio. The point is indexed so "yakınımda"
   * can work, and — exactly as for listings — the API returns a distance
   * rounded to whole kilometres and never the coordinates themselves.
   */
  private async buildProfessionalDocuments(ids: string[]): Promise<SearchDocument[]> {
    const rows = await this.db.query<Record<string, unknown>>(
      `SELECT p.id, p.handle, p.display_name, p.country_code, p.region, p.city,
              p.languages, p.verification_level, p.trust_score, p.response_rate, p.created_at,
              av.cf_image_id AS avatar,
              r.average AS rating_average, r.total AS rating_count,
              agg.roles, agg.headline, agg.specialties, agg.disciplines,
              agg.years_experience, agg.travels, agg.service_radius_km,
              (SELECT count(*) FROM service_listings s
                WHERE s.provider_profile_id = p.id AND s.status = 'active')::int AS service_count,
              ST_Y(p.location::geometry) AS lat, ST_X(p.location::geometry) AS lng
       FROM profiles p
       LEFT JOIN media av ON av.id = p.avatar_media_id
       LEFT JOIN LATERAL review_summary(p.id, NULL) r ON TRUE
       JOIN LATERAL (
         SELECT array_agg(rp.role::text ORDER BY rp.is_primary DESC) AS roles,
                (array_agg(rp.headline ORDER BY rp.is_primary DESC))[1] AS headline,
                COALESCE(array_agg(DISTINCT sp) FILTER (WHERE sp IS NOT NULL), '{}') AS specialties,
                COALESCE(array_agg(DISTINCT dp) FILTER (WHERE dp IS NOT NULL), '{}') AS disciplines,
                max(rp.years_experience) AS years_experience,
                bool_or(rp.travels) AS travels,
                max(rp.service_radius_km) AS service_radius_km
         FROM role_profiles rp
         LEFT JOIN LATERAL unnest(rp.specialties) sp ON TRUE
         LEFT JOIN LATERAL unnest(rp.disciplines) dp ON TRUE
         WHERE rp.profile_id = p.id AND rp.is_public
       ) agg ON agg.roles IS NOT NULL
       WHERE p.id = ANY($1::uuid[]) AND p.deleted_at IS NULL AND p.is_suspended = FALSE`,
      [ids],
    );

    return rows.map((row) => ({
      id: row.id as string,
      handle: (row.handle as string) ?? '',
      display_name: (row.display_name as string) ?? '',
      headline: (row.headline as string) ?? '',
      avatar: (row.avatar as string) ?? '',
      roles: (row.roles as string[]) ?? [],
      specialties: (row.specialties as string[]) ?? [],
      disciplines: (row.disciplines as string[]) ?? [],
      languages: (row.languages as string[]) ?? [],
      years_experience: row.years_experience === null ? null : Number(row.years_experience),
      country_code: (row.country_code as string) ?? '',
      region: (row.region as string) ?? '',
      city: (row.city as string) ?? '',
      travels: Boolean(row.travels),
      service_radius_km: row.service_radius_km === null ? null : Number(row.service_radius_km),
      verification_level: (row.verification_level as string) ?? 'none',
      trust_score: Number(row.trust_score ?? 0),
      rating_average: row.rating_average === null ? null : Number(row.rating_average),
      rating_count: Number(row.rating_count ?? 0),
      response_rate: row.response_rate === null ? null : Number(row.response_rate),
      service_count: Number(row.service_count ?? 0),
      joined_at: row.created_at ? new Date(row.created_at as string).getTime() : 0,
      geo: geoOf(row),
    }));
  }

  /**
   * Builds the §11.1 document.
   *
   * §24.4 is the constraint: "Health records are invisible to non-granted
   * users on every surface, including … the search index." So this projection
   * carries `has_xray` — whether radiographs exist — and nothing about what
   * they show. Same for location: only the city-level point, never the exact
   * coordinates of a private yard.
   */
  private async buildListingDocuments(listingIds: string[]): Promise<ListingDocument[]> {
    const rows = await this.db.query<Record<string, never>>(
      `SELECT l.id, l.slug, l.title, l.summary, l.type AS listing_type,
              l.price_amount, l.price_currency, l.price_type,
              l.country_code, l.region, l.city,
              l.trial_allowed, l.ppe_welcome, l.transport_help,
              l.quality_score, l.is_boosted, l.boost_expires_at, l.published_at,
              h.name AS horse_name, h.sex, h.color, h.height_cm, h.date_of_birth,
              h.disciplines, h.training_level, h.rider_level_min,
              h.breed_id, h.location_precision,
              b.group_code AS breed_group,
              p.id AS seller_id,
              p.verification_level AS seller_verification,
              p.trust_score AS seller_trust_score,
              -- §11.3: filtering is on EUR; the original currency is kept for
              -- display, and a missing rate leaves price_eur null rather than
              -- guessing a conversion.
              CASE WHEN l.price_amount IS NULL THEN NULL
                   ELSE l.price_amount * COALESCE(fx.rate_to_eur, 1) END AS price_eur,
              -- Two different columns govern location, and conflating them is
              -- easy: visibility_location is §2's contract for whether the
              -- location is shown at all, while location_precision is how
              -- precisely. A horse the owner marked private is not indexed
              -- with a point; everything else is, because distance filtering
              -- needs one — and the API only ever returns a distance rounded
              -- to whole kilometres, never the coordinates (§18.2 S08 step 3).
              CASE WHEN h.visibility_location <> 'private' AND h.location IS NOT NULL
                   THEN ST_Y(h.location::geometry) END AS lat,
              CASE WHEN h.visibility_location <> 'private' AND h.location IS NOT NULL
                   THEN ST_X(h.location::geometry) END AS lng,
              (SELECT count(*) > 0 FROM horse_media hm
                 JOIN media m ON m.id = hm.media_id
                 WHERE hm.horse_id = h.id AND m.type = 'video' AND m.status = 'ready') AS has_video,
              (SELECT count(*) > 0 FROM horse_media hm
                 WHERE hm.horse_id = h.id AND hm.category = 'xray') AS has_xray,
              cover.cf_image_id AS cover_image,
              cover.blurhash AS cover_blurhash
       FROM listings l
       JOIN horses h ON h.id = l.horse_id
       JOIN profiles p ON p.id = l.seller_profile_id
       LEFT JOIN breeds b ON b.code = h.breed_id
       LEFT JOIN fx_rates fx ON fx.currency = l.price_currency
       LEFT JOIN media cover ON cover.id = h.cover_media_id
       WHERE l.id = ANY($1::uuid[])
         -- Only publicly visible listings are indexed. A draft or a listing
         -- held for review must not be discoverable.
         AND l.status IN ('active','under_offer')
         AND h.deleted_at IS NULL`,
      [listingIds],
    );

    return rows.map((raw) => {
      const row = raw as unknown as Record<string, unknown>;

      return {
        id: row.id as string,
        slug: row.slug as string,
        title: (row.title as string) ?? '',
        summary: (row.summary as string) ?? '',
        horse_name: (row.horse_name as string) ?? '',
        listing_type: row.listing_type as string,
        breed: (row.breed_id as string) ?? '',
        breed_group: (row.breed_group as string) ?? '',
        sex: (row.sex as string) ?? '',
        age_years: ageYears(row.date_of_birth as string | null),
        height_cm: row.height_cm === null ? 0 : Number(row.height_cm),
        color: (row.color as string) ?? '',
        disciplines: (row.disciplines as string[]) ?? [],
        training_level: (row.training_level as string) ?? '',
        rider_level_min: (row.rider_level_min as string) ?? '',
        price_eur: row.price_eur === null ? 0 : Number(row.price_eur),
        price_amount: row.price_amount === null ? 0 : Number(row.price_amount),
        price_currency: (row.price_currency as string) ?? 'EUR',
        price_type: (row.price_type as string) ?? 'fixed',
        country_code: (row.country_code as string) ?? '',
        region: (row.region as string) ?? '',
        city: (row.city as string) ?? '',
        geo: row.lat === null || row.lat === undefined
          ? null
          : [Number(row.lat), Number(row.lng)],
        seller_id: (row.seller_id as string) ?? '',
        seller_verification: (row.seller_verification as string) ?? 'none',
        seller_trust_score: Number(row.seller_trust_score ?? 0),
        has_video: Boolean(row.has_video),
        has_xray: Boolean(row.has_xray),
        ppe_welcome: Boolean(row.ppe_welcome),
        trial_allowed: Boolean(row.trial_allowed),
        transport_help: Boolean(row.transport_help),
        quality_score: Number(row.quality_score ?? 0),
        is_boosted: Boolean(row.is_boosted),
        // §11.2: an expired boost stops ranking immediately, without waiting
        // for a job to flip the flag.
        boost_rank:
          row.is_boosted &&
          (!row.boost_expires_at || new Date(row.boost_expires_at as string) > new Date())
            ? 2
            : 0,
        published_at: row.published_at ? new Date(row.published_at as string).getTime() : 0,
        cover_image: (row.cover_image as string) ?? '',
        cover_blurhash: (row.cover_blurhash as string) ?? '',
      };
    });
  }
}

/** Every projection stores the point the same way: [lat, lng] or nothing. */
function geoOf(row: Record<string, unknown>): [number, number] | null {
  return row.lat === null || row.lat === undefined
    ? null
    : [Number(row.lat), Number(row.lng)];
}

function ageYears(dateOfBirth: string | null): number {
  if (!dateOfBirth) return 0;

  const dob = new Date(dateOfBirth);
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const monthDelta = now.getMonth() - dob.getMonth();
  if (monthDelta < 0 || (monthDelta === 0 && now.getDate() < dob.getDate())) age -= 1;

  return Math.max(0, age);
}
