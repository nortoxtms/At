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
import { Client } from 'typesense';

import type { ListingDocument, SearchDocument, SearchProvider } from './search.provider.js';

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

  /**
   * §11.1: "Analogous collections: `services`, `jobs`, `professionals`."
   *
   * Analogous, not identical — each carries the fields its own filter bar
   * needs (§18.2 S15, S17, S23). Optional flags are generous here on purpose:
   * a job with no salary and a professional with no city are both normal, and
   * a required field would reject the document instead of the filter simply
   * not matching.
   */
  private readonly servicesSchema = {
    name: 'services',
    fields: [
      { name: 'id', type: 'string' },
      { name: 'slug', type: 'string', index: false, optional: true },
      { name: 'title', type: 'string' },
      { name: 'description', type: 'string', optional: true },
      { name: 'category', type: 'string', facet: true },
      { name: 'provider_id', type: 'string', index: false },
      { name: 'provider_name', type: 'string' },
      { name: 'provider_verification', type: 'string', facet: true },
      { name: 'provider_trust_score', type: 'int32' },
      { name: 'provider_avatar', type: 'string', index: false, optional: true },
      { name: 'organization_name', type: 'string', optional: true },
      { name: 'price_min', type: 'float', optional: true },
      { name: 'price_max', type: 'float', optional: true },
      { name: 'price_min_eur', type: 'float', optional: true },
      { name: 'price_unit', type: 'string', facet: true, optional: true },
      { name: 'currency', type: 'string', optional: true },
      { name: 'country_code', type: 'string', facet: true },
      { name: 'region', type: 'string', facet: true, optional: true },
      { name: 'city', type: 'string', facet: true, optional: true },
      { name: 'geo', type: 'geopoint', optional: true },
      { name: 'is_mobile', type: 'bool', facet: true },
      { name: 'service_radius_km', type: 'int32', optional: true },
      { name: 'rating_average', type: 'float', optional: true },
      { name: 'rating_count', type: 'int32' },
      { name: 'published_at', type: 'int64' },
    ],
    default_sorting_field: 'published_at',
  } as const;

  private readonly jobsSchema = {
    name: 'jobs',
    fields: [
      { name: 'id', type: 'string' },
      { name: 'slug', type: 'string', index: false, optional: true },
      { name: 'title', type: 'string' },
      { name: 'description', type: 'string', optional: true },
      { name: 'job_type', type: 'string', facet: true },
      { name: 'roles_needed', type: 'string[]', facet: true },
      { name: 'disciplines', type: 'string[]', facet: true },
      { name: 'organization_name', type: 'string', optional: true },
      { name: 'organization_logo', type: 'string', index: false, optional: true },
      { name: 'poster_name', type: 'string', optional: true },
      { name: 'country_code', type: 'string', facet: true },
      { name: 'region', type: 'string', facet: true, optional: true },
      { name: 'city', type: 'string', facet: true, optional: true },
      { name: 'geo', type: 'geopoint', optional: true },
      { name: 'salary_min', type: 'float', optional: true },
      { name: 'salary_max', type: 'float', optional: true },
      { name: 'salary_currency', type: 'string', optional: true },
      { name: 'salary_period', type: 'string', optional: true },
      { name: 'salary_monthly_eur', type: 'float', optional: true },
      { name: 'accommodation', type: 'string', facet: true, optional: true },
      { name: 'meals_included', type: 'bool', facet: true },
      { name: 'visa_support', type: 'bool', facet: true },
      { name: 'experience_years_min', type: 'int32', optional: true },
      { name: 'application_count', type: 'int32' },
      { name: 'published_at', type: 'int64' },
    ],
    default_sorting_field: 'published_at',
  } as const;

  private readonly professionalsSchema = {
    name: 'professionals',
    fields: [
      { name: 'id', type: 'string' },
      { name: 'handle', type: 'string' },
      { name: 'display_name', type: 'string' },
      { name: 'headline', type: 'string', optional: true },
      { name: 'avatar', type: 'string', index: false, optional: true },
      { name: 'roles', type: 'string[]', facet: true },
      { name: 'specialties', type: 'string[]', facet: true },
      { name: 'disciplines', type: 'string[]', facet: true },
      { name: 'languages', type: 'string[]', facet: true },
      { name: 'years_experience', type: 'int32', optional: true },
      { name: 'country_code', type: 'string', facet: true, optional: true },
      { name: 'region', type: 'string', facet: true, optional: true },
      { name: 'city', type: 'string', facet: true, optional: true },
      { name: 'geo', type: 'geopoint', optional: true },
      { name: 'travels', type: 'bool', facet: true },
      { name: 'service_radius_km', type: 'int32', optional: true },
      { name: 'verification_level', type: 'string', facet: true },
      { name: 'trust_score', type: 'int32' },
      { name: 'rating_average', type: 'float', optional: true },
      { name: 'rating_count', type: 'int32' },
      { name: 'response_rate', type: 'float', optional: true },
      { name: 'service_count', type: 'int32' },
      { name: 'joined_at', type: 'int64' },
    ],
    default_sorting_field: 'joined_at',
  } as const;

  async ensureCollections(): Promise<void> {
    for (const schema of [
      this.listingsSchema,
      this.servicesSchema,
      this.jobsSchema,
      this.professionalsSchema,
    ]) {
      try {
        await this.client.collections(schema.name).retrieve();
      } catch {
        this.logger.log(`Creating the ${schema.name} collection`);
        await this.client.collections().create(schema as never);
      }
    }
  }

  async upsert(collection: string, documents: SearchDocument[]): Promise<void> {
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

  async searchServices(query: ServiceSearchQuery): Promise<ServiceSearchResult> {
    const filters: string[] = [];
    if (query.categories?.length) filters.push(`category:=[${query.categories.join(',')}]`);
    if (query.isMobile) filters.push('is_mobile:=true');
    if (query.priceMaxEur !== undefined) filters.push(`price_min_eur:<=${query.priceMaxEur}`);
    if (query.minRating !== undefined) filters.push(`rating_average:>=${query.minRating}`);
    if (query.verifiedOnly) {
      filters.push(
        'provider_verification:=[identity_verified,professional_verified,business_verified]',
      );
    }
    pushLocationFilters(filters, query);

    const sort = {
      newest: 'published_at:desc',
      distance: geoSort(query, 'published_at:desc'),
      rating: 'rating_average:desc,rating_count:desc',
      price_asc: 'price_min_eur:asc',
      recommended: '_text_match:desc,rating_average:desc,provider_trust_score:desc,published_at:desc',
    }[query.sort];

    return this.searchCollection<ServiceSearchHit>({
      collection: 'services',
      q: query.q,
      queryBy: 'title,description,provider_name,organization_name',
      filters,
      sort,
      facetBy: 'category,country_code,city',
      page: query.page,
      limit: query.limit,
      map: (document, distanceKm) => ({
        id: document.id as string,
        slug: (document.slug as string) ?? '',
        title: (document.title as string) ?? '',
        category: (document.category as string) ?? '',
        providerId: (document.provider_id as string) ?? '',
        providerName: (document.provider_name as string) ?? '',
        providerVerification: (document.provider_verification as string) ?? 'none',
        providerTrustScore: Number(document.provider_trust_score ?? 0),
        providerAvatar: (document.provider_avatar as string) || null,
        organizationName: (document.organization_name as string) || null,
        priceMin: document.price_min === undefined ? null : Number(document.price_min),
        priceMax: document.price_max === undefined ? null : Number(document.price_max),
        priceUnit: (document.price_unit as string) || null,
        currency: (document.currency as string) || 'EUR',
        countryCode: (document.country_code as string) ?? '',
        region: (document.region as string) || null,
        city: (document.city as string) || null,
        distanceKm,
        isMobile: Boolean(document.is_mobile),
        serviceRadiusKm:
          document.service_radius_km === undefined ? null : Number(document.service_radius_km),
        ratingAverage:
          document.rating_average === undefined ? null : Number(document.rating_average),
        ratingCount: Number(document.rating_count ?? 0),
        publishedAt: document.published_at
          ? new Date(Number(document.published_at)).toISOString()
          : null,
      }),
    });
  }

  async searchJobs(query: JobSearchQuery): Promise<JobSearchResult> {
    const filters: string[] = [];
    if (query.jobTypes?.length) filters.push(`job_type:=[${query.jobTypes.join(',')}]`);
    if (query.roles?.length) filters.push(`roles_needed:=[${query.roles.join(',')}]`);
    if (query.disciplines?.length) filters.push(`disciplines:=[${query.disciplines.join(',')}]`);
    if (query.accommodation?.length) filters.push(`accommodation:=[${query.accommodation.join(',')}]`);
    if (query.mealsIncluded) filters.push('meals_included:=true');
    if (query.visaSupport) filters.push('visa_support:=true');
    if (query.experienceMaxYears !== undefined) {
      filters.push(`experience_years_min:<=${query.experienceMaxYears}`);
    }
    if (query.salaryMinEur !== undefined) filters.push(`salary_monthly_eur:>=${query.salaryMinEur}`);
    pushLocationFilters(filters, query);

    const sort = {
      newest: 'published_at:desc',
      distance: geoSort(query, 'published_at:desc'),
      salary_desc: 'salary_monthly_eur:desc',
      recommended: '_text_match:desc,published_at:desc',
    }[query.sort];

    return this.searchCollection<JobSearchHit>({
      collection: 'jobs',
      q: query.q,
      queryBy: 'title,description,organization_name',
      filters,
      sort,
      facetBy: 'job_type,country_code,city,accommodation',
      page: query.page,
      limit: query.limit,
      map: (document, distanceKm) => ({
        id: document.id as string,
        slug: (document.slug as string) ?? '',
        title: (document.title as string) ?? '',
        jobType: (document.job_type as string) ?? '',
        rolesNeeded: (document.roles_needed as string[]) ?? [],
        organizationName: (document.organization_name as string) || null,
        organizationLogo: (document.organization_logo as string) || null,
        posterName: (document.poster_name as string) || null,
        countryCode: (document.country_code as string) ?? '',
        region: (document.region as string) || null,
        city: (document.city as string) || null,
        distanceKm,
        salaryMin: document.salary_min === undefined ? null : Number(document.salary_min),
        salaryMax: document.salary_max === undefined ? null : Number(document.salary_max),
        salaryCurrency: (document.salary_currency as string) || null,
        salaryPeriod: (document.salary_period as string) || null,
        salaryMonthlyEur:
          document.salary_monthly_eur === undefined ? null : Number(document.salary_monthly_eur),
        accommodation: (document.accommodation as string) || null,
        mealsIncluded: Boolean(document.meals_included),
        visaSupport: Boolean(document.visa_support),
        experienceYearsMin:
          document.experience_years_min === undefined ? null : Number(document.experience_years_min),
        applicationCount: Number(document.application_count ?? 0),
        publishedAt: document.published_at
          ? new Date(Number(document.published_at)).toISOString()
          : null,
      }),
    });
  }

  async searchProfessionals(query: ProfessionalSearchQuery): Promise<ProfessionalSearchResult> {
    const filters: string[] = [];
    if (query.roles?.length) filters.push(`roles:=[${query.roles.join(',')}]`);
    if (query.disciplines?.length) filters.push(`disciplines:=[${query.disciplines.join(',')}]`);
    if (query.specialties?.length) filters.push(`specialties:=[${query.specialties.join(',')}]`);
    if (query.languages?.length) filters.push(`languages:=[${query.languages.join(',')}]`);
    if (query.minRating !== undefined) filters.push(`rating_average:>=${query.minRating}`);
    if (query.minYearsExperience !== undefined) {
      filters.push(`years_experience:>=${query.minYearsExperience}`);
    }
    if (query.verifiedOnly) {
      filters.push('verification_level:=[identity_verified,professional_verified,business_verified]');
    }
    pushLocationFilters(filters, query);

    const sort = {
      rating: 'rating_average:desc,rating_count:desc',
      distance: geoSort(query, 'trust_score:desc'),
      newest: 'joined_at:desc',
      recommended: '_text_match:desc,trust_score:desc,rating_average:desc',
    }[query.sort];

    return this.searchCollection<ProfessionalSearchHit>({
      collection: 'professionals',
      q: query.q,
      queryBy: 'display_name,headline,specialties',
      filters,
      sort,
      facetBy: 'roles,country_code,city',
      page: query.page,
      limit: query.limit,
      map: (document, distanceKm) => ({
        id: document.id as string,
        handle: (document.handle as string) ?? '',
        displayName: (document.display_name as string) ?? '',
        avatar: (document.avatar as string) || null,
        roles: (document.roles as string[]) ?? [],
        headline: (document.headline as string) || null,
        specialties: (document.specialties as string[]) ?? [],
        disciplines: (document.disciplines as string[]) ?? [],
        languages: (document.languages as string[]) ?? [],
        yearsExperience:
          document.years_experience === undefined ? null : Number(document.years_experience),
        countryCode: (document.country_code as string) || null,
        region: (document.region as string) || null,
        city: (document.city as string) || null,
        distanceKm,
        travels: Boolean(document.travels),
        serviceRadiusKm:
          document.service_radius_km === undefined ? null : Number(document.service_radius_km),
        verificationLevel: (document.verification_level as string) ?? 'none',
        trustScore: Number(document.trust_score ?? 0),
        ratingAverage:
          document.rating_average === undefined ? null : Number(document.rating_average),
        ratingCount: Number(document.rating_count ?? 0),
        responseRate: document.response_rate === undefined ? null : Number(document.response_rate),
        serviceCount: Number(document.service_count ?? 0),
      }),
    });
  }

  /** Shared query shape for the three collections without a boosted tier. */
  private async searchCollection<THit>(options: {
    collection: string;
    q?: string;
    queryBy: string;
    filters: string[];
    sort: string;
    facetBy: string;
    page: number;
    limit: number;
    map: (document: Record<string, unknown>, distanceKm: number | null) => THit;
  }): Promise<SearchResult<THit>> {
    const response = (await this.client
      .collections(options.collection)
      .documents()
      .search({
        q: options.q ?? '*',
        query_by: options.queryBy,
        filter_by: options.filters.join(' && ') || undefined,
        sort_by: options.sort,
        facet_by: options.facetBy,
        max_facet_values: 30,
        page: options.page,
        per_page: options.limit,
      })) as never as GenericTypesenseResponse;

    return {
      hits: response.hits.map((hit) => {
        const meters = hit.geo_distance_meters ? Object.values(hit.geo_distance_meters)[0] : undefined;
        return options.map(hit.document, meters === undefined ? null : Math.round(meters / 1000));
      }),
      found: response.found,
      page: options.page,
      limit: options.limit,
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

interface GenericTypesenseResponse {
  found: number;
  search_time_ms: number;
  hits: { document: Record<string, unknown>; geo_distance_meters?: Record<string, number> }[];
  facet_counts?: { field_name: string; counts: { value: string; count: number }[] }[];
}

/** Shared by the three M4 collections: same location filters, same syntax. */
function pushLocationFilters(
  filters: string[],
  query: { countryCode?: string; region?: string; city?: string; lat?: number; lng?: number; radiusKm?: number },
): void {
  if (query.countryCode) filters.push(`country_code:=${query.countryCode}`);
  if (query.region) filters.push(`region:=\`${query.region}\``);
  if (query.city) filters.push(`city:=\`${query.city}\``);
  if (query.lat !== undefined && query.lng !== undefined && query.radiusKm) {
    filters.push(`geo:(${query.lat}, ${query.lng}, ${query.radiusKm} km)`);
  }
}

function geoSort(query: { lat?: number; lng?: number }, fallback: string): string {
  return query.lat !== undefined && query.lng !== undefined
    ? `geo(${query.lat}, ${query.lng}):asc`
    : fallback;
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
