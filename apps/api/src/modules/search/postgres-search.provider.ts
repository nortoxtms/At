import { Injectable, Logger } from '@nestjs/common';
import {
  BOOSTED_PER_PAGE,
  type ListingSearchHit,
  type ListingSearchQuery,
  type ListingSearchResult,
} from '@only-horses/shared-types';

import { DatabaseService } from '../../database/database.service.js';
import type { ListingDocument, SearchProvider } from './search.provider.js';

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

  async upsert(collection: string, documents: ListingDocument[]): Promise<void> {
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
