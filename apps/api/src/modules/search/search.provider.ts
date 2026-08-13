import type {
  JobSearchQuery,
  JobSearchResult,
  ListingSearchQuery,
  ListingSearchResult,
  ProfessionalSearchQuery,
  ProfessionalSearchResult,
  ServiceSearchQuery,
  ServiceSearchResult,
} from '@only-horses/shared-types';

/**
 * Search abstraction — spec §11.
 *
 * Typesense is the engine (§4) and `TypesenseSearchProvider` is the production
 * implementation. The interface exists for the same reason as the identity,
 * storage and push abstractions, and it buys one more thing here: search is
 * the surface where a bad query silently returns fewer results rather than an
 * error, so being able to run the same query against Postgres and compare is
 * a real debugging tool rather than only a test convenience.
 */

/** The §11.1 `listings` document, denormalized for filtering and display. */
export interface ListingDocument extends SearchDocument {
  slug: string;
  title: string;
  summary: string;
  horse_name: string;
  listing_type: string;
  breed: string;
  breed_group: string;
  sex: string;
  age_years: number;
  height_cm: number;
  color: string;
  disciplines: string[];
  training_level: string;
  rider_level_min: string;
  price_eur: number;
  price_amount: number;
  price_currency: string;
  price_type: string;
  country_code: string;
  region: string;
  city: string;
  geo: [number, number] | null;
  seller_verification: string;
  seller_trust_score: number;
  has_video: boolean;
  has_xray: boolean;
  ppe_welcome: boolean;
  trial_allowed: boolean;
  transport_help: boolean;
  quality_score: number;
  is_boosted: boolean;
  /** §11.2: 2 when boosted and unexpired, else 0. */
  boost_rank: number;
  published_at: number;
  cover_image: string;
  cover_blurhash: string;
}

/**
 * §11.1: "Analogous collections: `services`, `jobs`, `professionals`."
 *
 * They share the listings document's two structural requirements — an `id` to
 * upsert on and an optional `geo` point for radius filtering — and nothing
 * else, so the indexing side is typed on the shared part and each collection
 * keeps its own fields.
 */
export interface SearchDocument {
  id: string;
  geo: [number, number] | null;
  [field: string]: unknown;
}

export interface ServiceDocument extends SearchDocument {
  slug: string;
  category: string;
  title: string;
  provider_id: string;
  published_at: number;
}

export interface JobDocument extends SearchDocument {
  slug: string;
  title: string;
  job_type: string;
  published_at: number;
}

export interface ProfessionalDocument extends SearchDocument {
  handle: string;
  display_name: string;
  roles: string[];
}

export interface SearchProvider {
  readonly name: string;

  /** Creates collections if absent. Safe to call on every boot. */
  ensureCollections(): Promise<void>;

  upsert(collection: string, documents: SearchDocument[]): Promise<void>;

  delete(collection: string, documentIds: string[]): Promise<void>;

  searchListings(query: ListingSearchQuery): Promise<ListingSearchResult>;

  searchServices(query: ServiceSearchQuery): Promise<ServiceSearchResult>;

  searchJobs(query: JobSearchQuery): Promise<JobSearchResult>;

  searchProfessionals(query: ProfessionalSearchQuery): Promise<ProfessionalSearchResult>;
}

export const SEARCH_PROVIDER = Symbol('SEARCH_PROVIDER');
