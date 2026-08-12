import { Inject, Injectable, Logger } from '@nestjs/common';

import { DatabaseService } from '../../database/database.service.js';
import { SEARCH_PROVIDER, type ListingDocument, type SearchProvider } from './search.provider.js';

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

    const listingIds = batch
      .filter((row) => row.collection === 'listings' && row.operation === 'upsert')
      .map((row) => row.document_id);

    const documents = listingIds.length > 0 ? await this.buildListingDocuments(listingIds) : [];

    // A listing that no longer qualifies for the index — paused, withdrawn,
    // held for review — is a delete, not a missing upsert. Leaving it indexed
    // is how a withdrawn listing keeps taking inquiries.
    const indexedIds = new Set(documents.map((document) => document.id));
    const toDelete = [
      ...batch.filter((row) => row.operation === 'delete').map((row) => row.document_id),
      ...listingIds.filter((id) => !indexedIds.has(id)),
    ];

    let failed = 0;

    try {
      if (documents.length > 0) await this.search.upsert('listings', documents);
      if (toDelete.length > 0) await this.search.delete('listings', toDelete);

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

    return { indexed: documents.length, deleted: toDelete.length, failed };
  }

  /** Full reindex — `pnpm --filter api search:reindex` (§11.4). */
  async reindexAll(): Promise<number> {
    await this.search.ensureCollections();

    const ids = await this.db.query<{ id: string }>(
      `SELECT id FROM listings WHERE status IN ('active','under_offer')`,
    );

    let indexed = 0;
    for (let offset = 0; offset < ids.length; offset += 200) {
      const slice = ids.slice(offset, offset + 200).map((row) => row.id);
      const documents = await this.buildListingDocuments(slice);
      await this.search.upsert('listings', documents);
      indexed += documents.length;
    }

    this.logger.log(`Reindexed ${indexed} listings`);
    return indexed;
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

function ageYears(dateOfBirth: string | null): number {
  if (!dateOfBirth) return 0;

  const dob = new Date(dateOfBirth);
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const monthDelta = now.getMonth() - dob.getMonth();
  if (monthDelta < 0 || (monthDelta === 0 && now.getDate() < dob.getDate())) age -= 1;

  return Math.max(0, age);
}
