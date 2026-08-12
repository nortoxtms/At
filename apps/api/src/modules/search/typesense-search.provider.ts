import { Injectable, Logger } from '@nestjs/common';
import {
  BOOSTED_PER_PAGE,
  type ListingSearchHit,
  type ListingSearchQuery,
  type ListingSearchResult,
} from '@only-horses/shared-types';
import { Client } from 'typesense';

import type { ListingDocument, SearchProvider } from './search.provider.js';

/**
 * Typesense search provider — the production engine (spec §4, §11).
 *
 * The collection schema below is §11.1 verbatim. `default_sorting_field` is
 * `published_at`, and the §11.2 ranking is expressed as `sort_by`.
 */
@Injectable()
export class TypesenseSearchProvider implements SearchProvider {
  readonly name = 'typesense';
  private readonly logger = new Logger(TypesenseSearchProvider.name);
  private readonly client: Client;

  constructor(config: { host: string; port: number; protocol: string; apiKey: string }) {
    this.client = new Client({
      nodes: [{ host: config.host, port: config.port, protocol: config.protocol }],
      apiKey: config.apiKey,
      connectionTimeoutSeconds: 5,
    });
  }

  /** §11.1 `listings`, field for field. */
  private readonly listingsSchema = {
    name: 'listings',
    fields: [
      { name: 'id', type: 'string' },
      { name: 'slug', type: 'string', index: false, optional: true },
      { name: 'title', type: 'string' },
      { name: 'summary', type: 'string', optional: true },
      { name: 'horse_name', type: 'string' },
      { name: 'listing_type', type: 'string', facet: true },
      { name: 'breed', type: 'string', facet: true },
      { name: 'breed_group', type: 'string', facet: true },
      { name: 'sex', type: 'string', facet: true },
      { name: 'age_years', type: 'float', facet: true },
      { name: 'height_cm', type: 'float', facet: true },
      { name: 'color', type: 'string', facet: true },
      { name: 'disciplines', type: 'string[]', facet: true },
      { name: 'training_level', type: 'string', facet: true, optional: true },
      { name: 'rider_level_min', type: 'string', facet: true, optional: true },
      { name: 'price_eur', type: 'float', facet: true },
      { name: 'price_amount', type: 'float' },
      { name: 'price_currency', type: 'string', facet: true },
      { name: 'price_type', type: 'string', facet: true },
      { name: 'country_code', type: 'string', facet: true },
      { name: 'region', type: 'string', facet: true, optional: true },
      { name: 'city', type: 'string', facet: true, optional: true },
      { name: 'geo', type: 'geopoint', optional: true },
      { name: 'seller_verification', type: 'string', facet: true },
      { name: 'seller_trust_score', type: 'int32' },
      { name: 'has_video', type: 'bool', facet: true },
      { name: 'has_xray', type: 'bool', facet: true },
      { name: 'ppe_welcome', type: 'bool', facet: true },
      { name: 'trial_allowed', type: 'bool', facet: true },
      { name: 'transport_help', type: 'bool', facet: true, optional: true },
      { name: 'quality_score', type: 'int32' },
      { name: 'is_boosted', type: 'bool' },
      { name: 'boost_rank', type: 'int32' },
      { name: 'published_at', type: 'int64' },
      { name: 'cover_image', type: 'string', index: false, optional: true },
      { name: 'cover_blurhash', type: 'string', index: false, optional: true },
    ],
    default_sorting_field: 'published_at',
  } as const;

  async ensureCollections(): Promise<void> {
    try {
      await this.client.collections('listings').retrieve();
    } catch {
      this.logger.log('Creating the listings collection');
      await this.client.collections().create(this.listingsSchema as never);
    }
  }

  async upsert(collection: string, documents: ListingDocument[]): Promise<void> {
    if (documents.length === 0) return;

    // `emplace` upserts, so a re-index of an unchanged document is a no-op
    // rather than a duplicate-id error — the outbox retries on failure and
    // must be safe to replay.
    await this.client
      .collections(collection)
      .documents()
      .import(documents, { action: 'emplace' });
  }

  async delete(collection: string, documentIds: string[]): Promise<void> {
    for (const id of documentIds) {
      try {
        await this.client.collections(collection).documents(id).delete();
      } catch (error) {
        // A document that is already gone is the desired end state.
        if ((error as { httpStatus?: number }).httpStatus !== 404) throw error;
      }
    }
  }

  async searchListings(query: ListingSearchQuery): Promise<ListingSearchResult> {
    const filters = this.buildFilterBy(query);

    const response = (await this.client
      .collections('listings')
      .documents()
      .search({
        q: query.q ?? '*',
        query_by: 'title,horse_name,summary',
        filter_by: filters.join(' && ') || undefined,
        sort_by: this.buildSortBy(query),
        facet_by: 'listing_type,breed,sex,country_code,region,color',
        max_facet_values: 30,
        page: query.page,
        per_page: query.limit,
      })) as never as TypesenseResponse;

    const hits = response.hits.map((hit) => toHit(hit.document, hit.geo_distance_meters));

    return {
      // §11.2 caps boosted results at 2 per 20-result page. Typesense has no
      // native per-page quota, so the cap is applied after retrieval: the
      // promise to buyers is that a page is mostly organic, and a page that is
      // half advertising stops being a search result.
      hits: capBoosted(hits, query.limit),
      found: response.found,
      page: query.page,
      limit: query.limit,
      facets: Object.fromEntries(
        (response.facet_counts ?? []).map((facet) => [
          facet.field_name,
          facet.counts.map((entry) => ({ value: entry.value, count: entry.count })),
        ]),
      ),
      tookMs: response.search_time_ms,
    };
  }

  private buildFilterBy(query: ListingSearchQuery): string[] {
    const filters: string[] = [];

    if (query.countryCode) filters.push(`country_code:=${query.countryCode}`);
    if (query.region) filters.push(`region:=\`${query.region}\``);
    if (query.city) filters.push(`city:=\`${query.city}\``);
    if (query.types?.length) filters.push(`listing_type:=[${query.types.join(',')}]`);
    if (query.sexes?.length) filters.push(`sex:=[${query.sexes.join(',')}]`);
    if (query.breeds?.length) filters.push(`breed:=[${query.breeds.join(',')}]`);
    if (query.colors?.length) filters.push(`color:=[${query.colors.join(',')}]`);
    if (query.disciplines?.length) filters.push(`disciplines:=[${query.disciplines.join(',')}]`);

    if (query.ageMin !== undefined) filters.push(`age_years:>=${query.ageMin}`);
    if (query.ageMax !== undefined) filters.push(`age_years:<=${query.ageMax}`);
    if (query.heightMinCm !== undefined) filters.push(`height_cm:>=${query.heightMinCm}`);
    if (query.heightMaxCm !== undefined) filters.push(`height_cm:<=${query.heightMaxCm}`);

    if (query.priceMinEur !== undefined) filters.push(`price_eur:>=${query.priceMinEur}`);
    if (query.priceMaxEur !== undefined) filters.push(`price_eur:<=${query.priceMaxEur}`);
    if (!query.includeOnRequest) filters.push(`price_type:!=on_request`);

    if (query.hasVideo) filters.push('has_video:=true');
    if (query.hasXray) filters.push('has_xray:=true');
    if (query.trialAllowed) filters.push('trial_allowed:=true');
    if (query.ppeWelcome) filters.push('ppe_welcome:=true');
    if (query.transportHelp) filters.push('transport_help:=true');

    if (query.verifiedSellersOnly) {
      filters.push(
        'seller_verification:=[identity_verified,professional_verified,business_verified]',
      );
    }
    if (query.sellerType === 'business') filters.push('seller_verification:=business_verified');
    if (query.sellerType === 'individual') filters.push('seller_verification:!=business_verified');

    if (query.lat !== undefined && query.lng !== undefined && query.radiusKm) {
      filters.push(`geo:(${query.lat}, ${query.lng}, ${query.radiusKm} km)`);
    }

    return filters;
  }

  /** §11.2 default sort. */
  private buildSortBy(query: ListingSearchQuery): string {
    switch (query.sort) {
      case 'newest':
        return 'published_at:desc';
      case 'price_asc':
        return 'price_eur:asc';
      case 'price_desc':
        return 'price_eur:desc';
      case 'distance':
        return query.lat !== undefined && query.lng !== undefined
          ? `geo(${query.lat}, ${query.lng}):asc`
          : 'published_at:desc';
      case 'most_viewed':
        return 'quality_score:desc,published_at:desc';
      default:
        return '_text_match:desc,boost_rank:desc,quality_score:desc,published_at:desc';
    }
  }
}

interface TypesenseResponse {
  found: number;
  search_time_ms: number;
  hits: { document: ListingDocument; geo_distance_meters?: Record<string, number> }[];
  facet_counts?: { field_name: string; counts: { value: string; count: number }[] }[];
}

/** Keeps at most §11.2's quota of boosted results, preserving order. */
export function capBoosted(hits: ListingSearchHit[], limit: number): ListingSearchHit[] {
  const allowance = Math.max(1, Math.round((limit * BOOSTED_PER_PAGE) / 20));
  let used = 0;

  return hits.filter((hit) => {
    if (!hit.isBoosted) return true;
    if (used >= allowance) return false;
    used += 1;
    return true;
  });
}

function toHit(
  document: ListingDocument,
  geoDistance?: Record<string, number>,
): ListingSearchHit {
  const distanceMeters = geoDistance ? Object.values(geoDistance)[0] : undefined;

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
    distanceKm: distanceMeters === undefined ? null : Math.round(distanceMeters / 1000),
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
