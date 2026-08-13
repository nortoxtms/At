import { Injectable, Logger } from '@nestjs/common';
import {
  BOOSTED_PER_PAGE,
  type JobSearchHit,
  type JobSearchQuery,
  type JobSearchResult,
  type ListingSearchHit,
  type ListingSearchQuery,
  type ListingSearchResult,
  type ProfessionalSearchHit,
  type ProfessionalSearchQuery,
  type ProfessionalSearchResult,
  type SearchResult,
  type ServiceSearchHit,
  type ServiceSearchQuery,
  type ServiceSearchResult,
} from '@only-horses/shared-types';

import { DatabaseService } from '../../database/database.service.js';
import type { ListingDocument, SearchDocument, SearchProvider } from './search.provider.js';

/**
 * Postgres-backed search — development and test.
 *
 * Typesense is the production engine (§4, ADR-0005). This provider reads the
 * same `search_documents` table the outbox worker writes, so the indexing
 * pipeline, the query shape, the §11.2 ranking and the boosted-per-page cap
 * are all exercised without a Typesense instance.
 *
 * What it does not reproduce is Typesense's typo tolerance and its `_text_match`
 * relevance; full-text here is a trigram match on title and horse name, which
 * is close enough to develop against and explicitly not the production
 * behaviour.
 */
@Injectable()
export class PostgresSearchProvider implements SearchProvider {
  readonly name = 'postgres';
  private readonly logger = new Logger(PostgresSearchProvider.name);

  constructor(private readonly db: DatabaseService) {
    this.logger.warn(
      'Using the Postgres search provider. Typesense is the production engine (ADR-0005).',
    );
  }

  async ensureCollections(): Promise<void> {
    // The table and its indexes are created by migration 0025.
  }

  async upsert(collection: string, documents: SearchDocument[]): Promise<void> {
    for (const document of documents) {
      await this.db.query(
        `INSERT INTO search_documents (collection, document_id, document, geo, indexed_at)
         VALUES ($1, $2, $3::jsonb,
                 CASE WHEN $4::float8 IS NULL THEN NULL
                      ELSE ST_SetSRID(ST_MakePoint($5::float8, $4::float8), 4326)::geography END,
                 now())
         ON CONFLICT (collection, document_id) DO UPDATE
           SET document = EXCLUDED.document,
               geo = EXCLUDED.geo,
               indexed_at = now()`,
        [
          collection,
          document.id,
          JSON.stringify(document),
          document.geo?.[0] ?? null,
          document.geo?.[1] ?? null,
        ],
      );
    }
  }

  async delete(collection: string, documentIds: string[]): Promise<void> {
    if (documentIds.length === 0) return;
    await this.db.query(
      `DELETE FROM search_documents WHERE collection = $1 AND document_id = ANY($2::uuid[])`,
      [collection, documentIds],
    );
  }

  async searchListings(query: ListingSearchQuery): Promise<ListingSearchResult> {
    const startedAt = Date.now();
    const { where, params: filterParams } = this.buildFilters(query);

    // The distance expression appends its own parameters. The facet queries
    // reuse only the filter clause, so they must not inherit them — passing a
    // longer parameter list than the SQL references is a bind error, not a
    // silent one, but it is easy to introduce by sharing one array.
    const params = [...filterParams];
    const orderBy = this.buildOrder(query, params);
    const offset = (query.page - 1) * query.limit;

    // Boosting applies to the default "Önerilen" ranking only.
    //
    // §11.2 puts boost_rank in the default sort, and §18.2 S06 offers explicit
    // alternatives — En yeni, Fiyat artan, Mesafe. An explicit sort that
    // quietly floats paid listings to the top is not that sort; a buyer who
    // asked for cheapest-first and got an advert first has been misled. So the
    // boosted tier is skipped unless the user is on the recommended ranking,
    // where §11.2's label ("Öne çıkarılan") sets the expectation.
    const boostsApply = query.sort === 'recommended';

    // Capped at 2 per 20-result page: assembled from two queries rather than
    // one ordered scan, because sorting boosted results to the top of a single
    // query would let a well-funded seller own an entire page.
    const boostedLimit = !boostsApply
      ? 0
      : Math.min(
          BOOSTED_PER_PAGE,
          Math.floor((query.limit * BOOSTED_PER_PAGE) / 20) || BOOSTED_PER_PAGE,
        );

    const rows = await this.db.query<{ document: ListingDocument; distance_km: number | null; total: string }>(
      `WITH filtered AS (
         SELECT document, ${this.distanceExpression(query, params)} AS distance_km,
                (document->>'boost_rank')::int AS boost_rank
         FROM search_documents
         WHERE collection = 'listings' AND ${where}
       ),
       counted AS (SELECT count(*) AS total FROM filtered),
       boosted AS (
         SELECT * FROM filtered WHERE boost_rank > 0 AND ${boostsApply ? 'TRUE' : 'FALSE'}
         ORDER BY ${orderBy} LIMIT ${boostedLimit}
       ),
       organic AS (
         -- Excludes boosted listings outright when boosts apply. Excluding only
         -- the two already selected would let the rest flow back in through the
         -- organic ordering, which sorts by boost_rank first — the cap would
         -- hold on paper while the page filled with paid results.
         SELECT * FROM filtered
         WHERE ${boostsApply ? 'boost_rank = 0' : 'TRUE'}
         ORDER BY ${orderBy}
         LIMIT ${query.limit} OFFSET ${offset}
       )
       SELECT document, distance_km, (SELECT total FROM counted)::text AS total
       FROM (
         SELECT *, 0 AS tier FROM boosted
         UNION ALL
         SELECT *, 1 AS tier FROM organic
       ) merged
       ORDER BY tier, ${orderBy}
       LIMIT ${query.limit}`,
      params,
    );

    const facets = await this.buildFacets(where, filterParams);

    return {
      hits: rows.map((row) => toHit(row.document, row.distance_km)),
      found: Number(rows[0]?.total ?? 0),
      page: query.page,
      limit: query.limit,
      facets,
      tookMs: Date.now() - startedAt,
    };
  }

  /** §18.2 S15's "yakınındaki hizmetler". */
  async searchServices(query: ServiceSearchQuery): Promise<ServiceSearchResult> {
    const clauses = new ClauseBuilder();

    if (query.q) {
      const term = clauses.bind(`%${query.q}%`);
      clauses.push(`(document->>'title' ILIKE ${term} OR document->>'description' ILIKE ${term})`);
    }
    if (query.categories?.length) {
      clauses.push(`document->>'category' = ANY(${clauses.bind(query.categories)})`);
    }
    this.pushLocation(clauses, query);

    if (query.lat !== undefined && query.lng !== undefined && query.radiusKm) {
      const point = clauses.point(query.lng, query.lat);
      const radius = clauses.bind(query.radiusKm * 1000);
      // A mobile farrier who covers 80 km is "near" a buyer 60 km away even
      // though their pin is not. §18.2 S16 draws that circle; this matches it.
      clauses.push(
        query.includeRadiusMatches
          ? `geo IS NOT NULL AND (ST_DWithin(geo, ${point}, ${radius})
             OR ST_DWithin(geo, ${point}, COALESCE((document->>'service_radius_km')::float, 0) * 1000))`
          : `geo IS NOT NULL AND ST_DWithin(geo, ${point}, ${radius})`,
      );
    }

    if (query.isMobile) clauses.push(`(document->>'is_mobile')::boolean = TRUE`);
    if (query.priceMaxEur !== undefined) {
      // Compares the *lowest* quoted price: a provider whose range starts under
      // the budget is worth showing, even if their top rate is above it.
      clauses.push(
        `((document->>'price_min_eur')::float IS NULL OR (document->>'price_min_eur')::float <= ${clauses.bind(query.priceMaxEur)})`,
      );
    }
    if (query.verifiedOnly) {
      clauses.push(
        `document->>'provider_verification' IN ('identity_verified','professional_verified','business_verified')`,
      );
    }
    if (query.minRating !== undefined) {
      clauses.push(`(document->>'rating_average')::float >= ${clauses.bind(query.minRating)}`);
    }
    // §24.13, for services: the provider is the person who was blocked.
    if (query.excludeProfileIds?.length) {
      clauses.push(`document->>'provider_id' <> ALL(${clauses.bind(query.excludeProfileIds)})`);
    }

    return this.queryCollection<ServiceSearchHit>({
      collection: 'services',
      clauses,
      page: query.page,
      limit: query.limit,
      point: query.lat !== undefined && query.lng !== undefined ? { lat: query.lat, lng: query.lng } : undefined,
      order: {
        newest: `(document->>'published_at')::bigint DESC`,
        distance: `distance_km ASC NULLS LAST`,
        rating: `(document->>'rating_average')::float DESC NULLS LAST, (document->>'rating_count')::int DESC`,
        price_asc: `(document->>'price_min_eur')::float ASC NULLS LAST`,
        // Rated providers first, then trust, then recency — a directory that
        // ranked purely by recency would bury everyone who has been here a while.
        recommended: `(document->>'rating_average')::float DESC NULLS LAST,
                      (document->>'provider_trust_score')::int DESC,
                      (document->>'published_at')::bigint DESC`,
      }[query.sort],
      facetFields: ['category', 'country_code', 'city'],
      map: (document, distanceKm) => ({
        id: str(document.id),
        slug: str(document.slug),
        title: str(document.title),
        category: str(document.category),
        providerId: str(document.provider_id),
        providerName: str(document.provider_name),
        providerVerification: str(document.provider_verification),
        providerTrustScore: num(document.provider_trust_score) ?? 0,
        providerAvatar: str(document.provider_avatar) || null,
        organizationName: str(document.organization_name) || null,
        priceMin: num(document.price_min),
        priceMax: num(document.price_max),
        priceUnit: str(document.price_unit) || null,
        currency: str(document.currency) || 'EUR',
        countryCode: str(document.country_code),
        region: str(document.region) || null,
        city: str(document.city) || null,
        distanceKm,
        isMobile: Boolean(document.is_mobile),
        serviceRadiusKm: num(document.service_radius_km),
        ratingAverage: num(document.rating_average),
        ratingCount: num(document.rating_count) ?? 0,
        publishedAt: epochToIso(document.published_at),
      }),
    });
  }

  /** §18.2 S17's filter bar: konum, iş türü, konaklama, deneyim, maaş. */
  async searchJobs(query: JobSearchQuery): Promise<JobSearchResult> {
    const clauses = new ClauseBuilder();

    if (query.q) {
      const term = clauses.bind(`%${query.q}%`);
      clauses.push(
        `(document->>'title' ILIKE ${term} OR document->>'description' ILIKE ${term} OR document->>'organization_name' ILIKE ${term})`,
      );
    }
    this.pushLocation(clauses, query);

    if (query.lat !== undefined && query.lng !== undefined && query.radiusKm) {
      clauses.push(
        `geo IS NOT NULL AND ST_DWithin(geo, ${clauses.point(query.lng, query.lat)}, ${clauses.bind(query.radiusKm * 1000)})`,
      );
    }

    if (query.jobTypes?.length) clauses.push(`document->>'job_type' = ANY(${clauses.bind(query.jobTypes)})`);
    if (query.accommodation?.length) {
      clauses.push(`document->>'accommodation' = ANY(${clauses.bind(query.accommodation)})`);
    }
    if (query.roles?.length) clauses.push(`document->'roles_needed' ?| ${clauses.bind(query.roles)}`);
    if (query.disciplines?.length) {
      clauses.push(`document->'disciplines' ?| ${clauses.bind(query.disciplines)}`);
    }
    if (query.mealsIncluded) clauses.push(`(document->>'meals_included')::boolean = TRUE`);
    if (query.visaSupport) clauses.push(`(document->>'visa_support')::boolean = TRUE`);

    if (query.experienceMaxYears !== undefined) {
      // "I have 2 years" means "show me jobs asking for 2 or fewer", and a job
      // that states no requirement asks for none.
      clauses.push(
        `COALESCE((document->>'experience_years_min')::int, 0) <= ${clauses.bind(query.experienceMaxYears)}`,
      );
    }

    if (query.salaryMinEur !== undefined) {
      const bound = `(document->>'salary_monthly_eur')::float >= ${clauses.bind(query.salaryMinEur)}`;
      clauses.push(
        query.includeUndisclosedSalary
          ? `(${bound} OR document->>'salary_monthly_eur' IS NULL)`
          : bound,
      );
    } else if (!query.includeUndisclosedSalary) {
      clauses.push(`document->>'salary_monthly_eur' IS NOT NULL`);
    }

    return this.queryCollection<JobSearchHit>({
      collection: 'jobs',
      clauses,
      page: query.page,
      limit: query.limit,
      point: query.lat !== undefined && query.lng !== undefined ? { lat: query.lat, lng: query.lng } : undefined,
      order: {
        newest: `(document->>'published_at')::bigint DESC`,
        distance: `distance_km ASC NULLS LAST`,
        salary_desc: `(document->>'salary_monthly_eur')::float DESC NULLS LAST`,
        recommended: `(document->>'published_at')::bigint DESC`,
      }[query.sort],
      facetFields: ['job_type', 'country_code', 'city', 'accommodation'],
      map: (document, distanceKm) => ({
        id: str(document.id),
        slug: str(document.slug),
        title: str(document.title),
        jobType: str(document.job_type),
        rolesNeeded: (document.roles_needed as string[]) ?? [],
        organizationName: str(document.organization_name) || null,
        organizationLogo: str(document.organization_logo) || null,
        posterName: str(document.poster_name) || null,
        countryCode: str(document.country_code),
        region: str(document.region) || null,
        city: str(document.city) || null,
        distanceKm,
        salaryMin: num(document.salary_min),
        salaryMax: num(document.salary_max),
        salaryCurrency: str(document.salary_currency) || null,
        salaryPeriod: str(document.salary_period) || null,
        salaryMonthlyEur: num(document.salary_monthly_eur),
        accommodation: str(document.accommodation) || null,
        mealsIncluded: Boolean(document.meals_included),
        visaSupport: Boolean(document.visa_support),
        experienceYearsMin: num(document.experience_years_min),
        applicationCount: num(document.application_count) ?? 0,
        publishedAt: epochToIso(document.published_at),
      }),
    });
  }

  /** §11.1's `professionals` collection — §23 M4's directory. */
  async searchProfessionals(query: ProfessionalSearchQuery): Promise<ProfessionalSearchResult> {
    const clauses = new ClauseBuilder();

    if (query.q) {
      const term = clauses.bind(`%${query.q}%`);
      clauses.push(
        `(document->>'display_name' ILIKE ${term} OR document->>'headline' ILIKE ${term})`,
      );
    }
    this.pushLocation(clauses, query);

    if (query.lat !== undefined && query.lng !== undefined && query.radiusKm) {
      const point = clauses.point(query.lng, query.lat);
      const radius = clauses.bind(query.radiusKm * 1000);
      clauses.push(
        query.includeTravelling
          ? `geo IS NOT NULL AND (ST_DWithin(geo, ${point}, ${radius})
             OR ((document->>'travels')::boolean
                 AND ST_DWithin(geo, ${point}, COALESCE((document->>'service_radius_km')::float, 0) * 1000)))`
          : `geo IS NOT NULL AND ST_DWithin(geo, ${point}, ${radius})`,
      );
    }

    if (query.roles?.length) clauses.push(`document->'roles' ?| ${clauses.bind(query.roles)}`);
    if (query.disciplines?.length) clauses.push(`document->'disciplines' ?| ${clauses.bind(query.disciplines)}`);
    if (query.specialties?.length) clauses.push(`document->'specialties' ?| ${clauses.bind(query.specialties)}`);
    if (query.languages?.length) clauses.push(`document->'languages' ?| ${clauses.bind(query.languages)}`);

    if (query.verifiedOnly) {
      clauses.push(
        `document->>'verification_level' IN ('identity_verified','professional_verified','business_verified')`,
      );
    }
    if (query.minRating !== undefined) {
      clauses.push(`(document->>'rating_average')::float >= ${clauses.bind(query.minRating)}`);
    }
    if (query.minYearsExperience !== undefined) {
      clauses.push(
        `COALESCE((document->>'years_experience')::int, 0) >= ${clauses.bind(query.minYearsExperience)}`,
      );
    }
    // §24.13, for the directory: the document *is* the person.
    if (query.excludeProfileIds?.length) {
      clauses.push(`document->>'id' <> ALL(${clauses.bind(query.excludeProfileIds)})`);
    }

    return this.queryCollection<ProfessionalSearchHit>({
      collection: 'professionals',
      clauses,
      page: query.page,
      limit: query.limit,
      point: query.lat !== undefined && query.lng !== undefined ? { lat: query.lat, lng: query.lng } : undefined,
      order: {
        rating: `(document->>'rating_average')::float DESC NULLS LAST, (document->>'rating_count')::int DESC`,
        distance: `distance_km ASC NULLS LAST`,
        newest: `(document->>'joined_at')::bigint DESC`,
        recommended: `(document->>'trust_score')::int DESC,
                      (document->>'rating_average')::float DESC NULLS LAST`,
      }[query.sort],
      facetFields: ['country_code', 'city'],
      map: (document, distanceKm) => ({
        id: str(document.id),
        handle: str(document.handle),
        displayName: str(document.display_name),
        avatar: str(document.avatar) || null,
        roles: (document.roles as string[]) ?? [],
        headline: str(document.headline) || null,
        specialties: (document.specialties as string[]) ?? [],
        disciplines: (document.disciplines as string[]) ?? [],
        languages: (document.languages as string[]) ?? [],
        yearsExperience: num(document.years_experience),
        countryCode: str(document.country_code) || null,
        region: str(document.region) || null,
        city: str(document.city) || null,
        distanceKm,
        travels: Boolean(document.travels),
        serviceRadiusKm: num(document.service_radius_km),
        verificationLevel: str(document.verification_level) || 'none',
        trustScore: num(document.trust_score) ?? 0,
        ratingAverage: num(document.rating_average),
        ratingCount: num(document.rating_count) ?? 0,
        responseRate: num(document.response_rate),
        serviceCount: num(document.service_count) ?? 0,
      }),
    });
  }

  private pushLocation(
    clauses: ClauseBuilder,
    query: { countryCode?: string; region?: string; city?: string },
  ): void {
    if (query.countryCode) clauses.push(`document->>'country_code' = ${clauses.bind(query.countryCode)}`);
    if (query.region) clauses.push(`document->>'region' = ${clauses.bind(query.region)}`);
    if (query.city) clauses.push(`document->>'city' = ${clauses.bind(query.city)}`);
  }

  /**
   * One query shape for services, jobs and professionals.
   *
   * Listings keep their own method because §11.2's boosted tier makes them
   * structurally different — two queries merged with a per-page cap. Nothing
   * in the other three collections is paid placement, so ranking them is a
   * single ordered scan and pretending otherwise would only obscure it.
   */
  private async queryCollection<THit>(options: {
    collection: string;
    clauses: ClauseBuilder;
    page: number;
    limit: number;
    point?: { lat: number; lng: number };
    order: string;
    facetFields: string[];
    map: (document: Record<string, unknown>, distanceKm: number | null) => THit;
  }): Promise<SearchResult<THit>> {
    const startedAt = Date.now();
    const filterParams = options.clauses.values();
    const params = [...filterParams];

    let distance = 'NULL::float8';
    if (options.point) {
      params.push(options.point.lng, options.point.lat);
      distance = `CASE WHEN geo IS NULL THEN NULL
                       ELSE ST_Distance(geo, ST_SetSRID(ST_MakePoint($${params.length - 1}::float8, $${params.length}::float8), 4326)::geography) / 1000 END`;
    }

    const where = options.clauses.sql();
    const offset = (options.page - 1) * options.limit;

    const rows = await this.db.query<{
      document: Record<string, unknown>;
      distance_km: number | null;
      total: string;
    }>(
      `WITH filtered AS (
         SELECT document, ${distance} AS distance_km
         FROM search_documents
         WHERE collection = '${options.collection}' AND ${where}
       ),
       counted AS (SELECT count(*) AS total FROM filtered)
       SELECT document, distance_km, (SELECT total FROM counted)::text AS total
       FROM filtered
       ORDER BY ${options.order}
       LIMIT ${options.limit} OFFSET ${offset}`,
      params,
    );

    const facets: Record<string, { value: string; count: number }[]> = {};
    for (const field of options.facetFields) {
      const counts = await this.db.query<{ value: string; count: string }>(
        `SELECT document->>'${field}' AS value, count(*)::text AS count
         FROM search_documents
         WHERE collection = '${options.collection}' AND ${where}
           AND COALESCE(document->>'${field}', '') <> ''
         GROUP BY 1 ORDER BY count(*) DESC LIMIT 30`,
        filterParams,
      );

      facets[field] = counts.map((row) => ({ value: row.value, count: Number(row.count) }));
    }

    return {
      hits: rows.map((row) =>
        options.map(row.document, row.distance_km === null ? null : Math.round(row.distance_km)),
      ),
      found: Number(rows[0]?.total ?? 0),
      page: options.page,
      limit: options.limit,
      facets,
      tookMs: Date.now() - startedAt,
    };
  }

  /** §18.2 S07's filter sheet, translated to SQL over the JSONB document. */
  private buildFilters(query: ListingSearchQuery): { where: string; params: unknown[] } {
    const clauses: string[] = ['TRUE'];
    const params: unknown[] = [];

    const push = (value: unknown): string => {
      params.push(value);
      return `$${params.length}`;
    };

    if (query.q) {
      const term = push(`%${query.q}%`);
      clauses.push(`(document->>'title' ILIKE ${term} OR document->>'horse_name' ILIKE ${term})`);
    }

    if (query.countryCode) clauses.push(`document->>'country_code' = ${push(query.countryCode)}`);
    if (query.region) clauses.push(`document->>'region' = ${push(query.region)}`);
    if (query.city) clauses.push(`document->>'city' = ${push(query.city)}`);

    if (query.lat !== undefined && query.lng !== undefined && query.radiusKm) {
      clauses.push(
        `geo IS NOT NULL AND ST_DWithin(geo, ST_SetSRID(ST_MakePoint(${push(query.lng)}, ${push(query.lat)}), 4326)::geography, ${push(query.radiusKm * 1000)})`,
      );
    }

    if (query.types?.length) {
      clauses.push(`document->>'listing_type' = ANY(${push(query.types)})`);
    }

    // §11.3: cross-currency filtering is always on price_eur. A listing with
    // no price ("fiyat sorunuz") is included unless the buyer opts out, since
    // excluding it would hide most stud listings.
    if (query.priceMinEur !== undefined || query.priceMaxEur !== undefined) {
      const bounds: string[] = [];
      if (query.priceMinEur !== undefined) {
        bounds.push(`(document->>'price_eur')::float >= ${push(query.priceMinEur)}`);
      }
      if (query.priceMaxEur !== undefined) {
        bounds.push(`(document->>'price_eur')::float <= ${push(query.priceMaxEur)}`);
      }

      const priced = `(document->>'price_type' <> 'on_request' AND ${bounds.join(' AND ')})`;
      clauses.push(
        query.includeOnRequest
          ? `(${priced} OR document->>'price_type' = 'on_request')`
          : priced,
      );
    } else if (!query.includeOnRequest) {
      clauses.push(`document->>'price_type' <> 'on_request'`);
    }

    if (query.ageMin !== undefined) clauses.push(`(document->>'age_years')::float >= ${push(query.ageMin)}`);
    if (query.ageMax !== undefined) clauses.push(`(document->>'age_years')::float <= ${push(query.ageMax)}`);
    if (query.heightMinCm !== undefined) clauses.push(`(document->>'height_cm')::float >= ${push(query.heightMinCm)}`);
    if (query.heightMaxCm !== undefined) clauses.push(`(document->>'height_cm')::float <= ${push(query.heightMaxCm)}`);

    if (query.sexes?.length) clauses.push(`document->>'sex' = ANY(${push(query.sexes)})`);
    if (query.breeds?.length) clauses.push(`document->>'breed' = ANY(${push(query.breeds)})`);
    if (query.colors?.length) clauses.push(`document->>'color' = ANY(${push(query.colors)})`);
    if (query.trainingLevels?.length) clauses.push(`document->>'training_level' = ANY(${push(query.trainingLevels)})`);
    if (query.riderLevels?.length) clauses.push(`document->>'rider_level_min' = ANY(${push(query.riderLevels)})`);

    if (query.disciplines?.length) {
      // Any-of, not all-of: a buyer picking "dressage, show jumping" wants
      // either, and requiring both would return almost nothing.
      clauses.push(
        `EXISTS (SELECT 1 FROM jsonb_array_elements_text(document->'disciplines') d
                 WHERE d = ANY(${push(query.disciplines)}))`,
      );
    }

    if (query.hasVideo) clauses.push(`(document->>'has_video')::boolean = TRUE`);
    if (query.hasXray) clauses.push(`(document->>'has_xray')::boolean = TRUE`);
    if (query.trialAllowed) clauses.push(`(document->>'trial_allowed')::boolean = TRUE`);
    if (query.ppeWelcome) clauses.push(`(document->>'ppe_welcome')::boolean = TRUE`);
    if (query.transportHelp) clauses.push(`(document->>'transport_help')::boolean = TRUE`);

    if (query.verifiedSellersOnly) {
      clauses.push(
        `document->>'seller_verification' IN ('identity_verified','professional_verified','business_verified')`,
      );
    }

    if (query.sellerType === 'business') {
      clauses.push(`document->>'seller_verification' = 'business_verified'`);
    } else if (query.sellerType === 'individual') {
      clauses.push(`document->>'seller_verification' <> 'business_verified'`);
    }

    // §24.13: a blocked seller's listings disappear for the blocker. Applied
    // as a filter rather than at render time so the counts, the facets and the
    // pagination all agree with what is shown.
    if (query.excludeProfileIds?.length) {
      clauses.push(`document->>'seller_id' <> ALL(${push(query.excludeProfileIds)})`);
    }

    return { where: clauses.join(' AND '), params };
  }

  private distanceExpression(query: ListingSearchQuery, params: unknown[]): string {
    if (query.lat === undefined || query.lng === undefined) return 'NULL::float8';

    params.push(query.lng, query.lat);
    const lng = `$${params.length - 1}`;
    const lat = `$${params.length}`;

    return `CASE WHEN geo IS NULL THEN NULL
                 ELSE ST_Distance(geo, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography) / 1000 END`;
  }

  /** §11.2 default: boost_rank, quality_score, published_at. */
  private buildOrder(query: ListingSearchQuery, _params: unknown[]): string {
    switch (query.sort) {
      case 'newest':
        return `(document->>'published_at')::bigint DESC`;
      case 'price_asc':
        return `(document->>'price_eur')::float ASC NULLS LAST`;
      case 'price_desc':
        return `(document->>'price_eur')::float DESC NULLS LAST`;
      case 'distance':
        return `distance_km ASC NULLS LAST`;
      case 'most_viewed':
        return `(document->>'quality_score')::int DESC`;
      default:
        return `boost_rank DESC, (document->>'quality_score')::int DESC, (document->>'published_at')::bigint DESC`;
    }
  }

  /** Facet counts for the §18.2 S07 sheet's active-count badges. */
  private async buildFacets(
    where: string,
    params: unknown[],
  ): Promise<Record<string, { value: string; count: number }[]>> {
    const facetFields = ['listing_type', 'breed', 'sex', 'country_code', 'region', 'color'];
    const facets: Record<string, { value: string; count: number }[]> = {};

    for (const field of facetFields) {
      const rows = await this.db.query<{ value: string; count: string }>(
        `SELECT document->>'${field}' AS value, count(*)::text AS count
         FROM search_documents
         WHERE collection = 'listings' AND ${where} AND document->>'${field}' <> ''
         GROUP BY 1 ORDER BY count(*) DESC LIMIT 30`,
        params,
      );

      facets[field] = rows.map((row) => ({ value: row.value, count: Number(row.count) }));
    }

    return facets;
  }
}

/**
 * Collects WHERE fragments and their bind values together.
 *
 * The listings method threads a params array by hand and has a comment
 * explaining why the facet queries must not inherit the distance parameters.
 * That bug is easy to reintroduce, so the three collections added in M4 use
 * this instead: filter values and distance values are kept separate by
 * construction, and `values()` returns only the former.
 */
class ClauseBuilder {
  private readonly clauses: string[] = ['TRUE'];
  private readonly params: unknown[] = [];

  bind(value: unknown): string {
    this.params.push(value);
    return `$${this.params.length}`;
  }

  point(lng: number, lat: number): string {
    return `ST_SetSRID(ST_MakePoint(${this.bind(lng)}::float8, ${this.bind(lat)}::float8), 4326)::geography`;
  }

  push(clause: string): void {
    this.clauses.push(clause);
  }

  sql(): string {
    return this.clauses.join(' AND ');
  }

  values(): unknown[] {
    return [...this.params];
  }
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function num(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function epochToIso(value: unknown): string | null {
  const epoch = num(value);
  return epoch ? new Date(epoch).toISOString() : null;
}

function toHit(document: ListingDocument, distanceKm: number | null): ListingSearchHit {
  return {
    id: document.id,
    slug: document.slug,
    title: document.title,
    horseName: document.horse_name,
    listingType: document.listing_type,
    breed: document.breed || null,
    sex: document.sex,
    ageYears: document.age_years ?? null,
    heightCm: document.height_cm ?? null,
    color: document.color || null,
    disciplines: document.disciplines ?? [],
    priceAmount: document.price_amount ?? null,
    priceCurrency: document.price_currency,
    priceEur: document.price_eur ?? null,
    priceType: document.price_type,
    countryCode: document.country_code,
    region: document.region || null,
    city: document.city || null,
    distanceKm: distanceKm === null ? null : Math.round(distanceKm),
    sellerVerification: document.seller_verification,
    sellerTrustScore: document.seller_trust_score,
    hasVideo: document.has_video,
    hasXray: document.has_xray,
    qualityScore: document.quality_score,
    isBoosted: document.boost_rank > 0,
    coverImage: document.cover_image || null,
    coverBlurhash: document.cover_blurhash || null,
    publishedAt: document.published_at ? new Date(document.published_at).toISOString() : null,
  };
}
