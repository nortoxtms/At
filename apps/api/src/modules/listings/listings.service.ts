import { Injectable, Logger } from '@nestjs/common';
import {
  AUTO_APPROVE_THRESHOLD,
  type HorseSex,
  type MediaCategory,
  type PriceType,
  type FieldVisibility,
  canTransition,
  checkPublishPreconditions,
  checkWelfarePolicy,
  type CloseListingInput,
  computeQualityScore,
  type CreateListingInput,
  findContactInfo,
  type ListingAction,
  type ListingStatus,
  LISTING_TTL_DAYS,
  nextStatus,
  stripContactInfo,
  type UpdateListingInput,
  type VerificationLevel,
} from '@only-horses/shared-types';

import { ApiException } from '../../common/filters/api-exception.filter.js';
import { DatabaseService } from '../../database/database.service.js';
import { EntitlementsService } from '../entitlements/entitlements.service.js';
import { HorsesService } from '../horses/horses.service.js';
import { MediaService } from '../media/media.service.js';

/**
 * Listings — spec §7, §13.1, §13.2, §14.
 *
 * The listing is the temporary object; the horse is permanent (§2). Publishing
 * is the gate where §3.3's hard rule, §13.1's preconditions, §13.2's quality
 * score and §14.4's welfare policy all converge, so `publish` is deliberately
 * the longest method here and everything it checks is checked server-side.
 */
@Injectable()
export class ListingsService {
  private readonly logger = new Logger(ListingsService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly entitlements: EntitlementsService,
    private readonly horses: HorsesService,
    private readonly media: MediaService,
  ) {}

  async create(profileId: string, input: CreateListingInput): Promise<{ id: string; slug: string }> {
    await this.horses.assertCanEdit(profileId, input.horseId);

    // §7's partial unique index enforces this too, but a 409 with the existing
    // listing is a usable answer where a constraint violation is a 500.
    const existing = await this.db.queryAs<{ id: string; status: string }>(
      profileId,
      `SELECT id, status FROM listings
       WHERE horse_id = $1 AND status IN ('active','pending_review','under_offer')`,
      [input.horseId],
    );

    if (existing[0]) {
      throw new ApiException(
        'CONFLICT',
        'Bu atın zaten yayında bir ilanı var. Önce onu kapat.',
        409,
        { listingId: existing[0].id, status: existing[0].status },
      );
    }

    const slug = await this.allocateSlug(input.title);
    const description = this.sanitizeDescription(input.description);

    return this.db.withUser(profileId, async (client) => {
      const { rows } = await client.query<{ id: string; slug: string }>(
        `INSERT INTO listings (
           slug, horse_id, seller_profile_id, type, status, title, summary, description,
           price_amount, price_currency, price_type, price_period, vat_included,
           trial_allowed, ppe_welcome, transport_help, suitable_for,
           country_code, region, city)
         VALUES ($1,$2,$3,$4,'draft',$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
         RETURNING id, slug`,
        [
          slug,
          input.horseId,
          profileId,
          input.type,
          input.title,
          input.summary ?? null,
          description,
          input.priceAmount ?? null,
          input.priceCurrency,
          input.priceType,
          input.pricePeriod ?? null,
          input.vatIncluded ?? null,
          input.trialAllowed,
          input.ppeWelcome,
          input.transportHelp,
          input.suitableFor,
          input.countryCode,
          input.region ?? null,
          input.city ?? null,
        ],
      );

      await this.applyVisibilityToHorse(client, input.horseId, input);

      return rows[0]!;
    });
  }

  async update(profileId: string, listingId: string, input: UpdateListingInput): Promise<void> {
    const listing = await this.loadOwned(profileId, listingId);

    // §13.1: a live listing may be edited, but not into a different horse or a
    // different type — that is a new listing, and its history should say so.
    if (input.type && input.type !== listing.type && listing.status !== 'draft') {
      throw ApiException.validation(
        'Yayındaki bir ilanın türü değiştirilemez. İlanı kapatıp yenisini oluştur.',
      );
    }

    const columns: Record<string, unknown> = {
      type: input.type,
      title: input.title,
      summary: input.summary,
      description: input.description === undefined ? undefined : this.sanitizeDescription(input.description),
      price_amount: input.priceAmount,
      price_currency: input.priceCurrency,
      price_type: input.priceType,
      price_period: input.pricePeriod,
      vat_included: input.vatIncluded,
      trial_allowed: input.trialAllowed,
      ppe_welcome: input.ppeWelcome,
      transport_help: input.transportHelp,
      suitable_for: input.suitableFor,
      country_code: input.countryCode,
      region: input.region,
      city: input.city,
    };

    const present = Object.entries(columns).filter(([, value]) => value !== undefined);

    await this.db.withUser(profileId, async (client) => {
      if (present.length > 0) {
        const assignments = present.map(([column], index) => `${column} = $${index + 2}`);
        await client.query(`UPDATE listings SET ${assignments.join(', ')} WHERE id = $1`, [
          listingId,
          ...present.map(([, value]) => value),
        ]);
      }

      await this.applyVisibilityToHorse(client, listing.horse_id, input);
    });

    // The score moves with the content, so it is recomputed on every edit
    // rather than only at publish — §18.2 S13 shows it live in the wizard.
    await this.refreshQualityScore(profileId, listingId);
  }

  /**
   * §13.1 publish.
   *
   * Order matters, and it is verification first.
   *
   * A free, unverified seller has an active-listing allowance of zero (§3.3),
   * so checking the plan limit first answers LIMIT_EXCEEDED — which sends them
   * to the paywall. But §3.3's identity rule is deliberately not purchasable:
   * buying Pro would not unblock them, and the paywall is a dead end. The
   * accurate answer is VERIFICATION_REQUIRED, which routes to the ladder
   * (§18.2 S26). Limits are checked after, for the seller who really is over
   * their plan.
   */
  async publish(profileId: string, listingId: string): Promise<{
    status: ListingStatus;
    qualityScore: number;
  }> {
    const listing = await this.loadOwned(profileId, listingId);

    if (!canTransition(listing.status, 'publish')) {
      throw ApiException.validation(
        `Bu ilan "${listing.status}" durumundayken yayınlanamaz.`,
      );
    }

    const entitlements = await this.entitlements.forProfile(profileId);
    const context = await this.loadPublishContext(profileId, listingId);

    // §3.3 / §24.2: identity verification is the gate, and it is not
    // purchasable. checkPublishPreconditions reports every failure at once so
    // the wizard can show a checklist.
    const failures = checkPublishPreconditions({
      sellerVerification: entitlements.verificationLevel,
      imageCount: context.imageCount,
      priceAmount: context.priceAmount,
      priceType: context.priceType,
      descriptionLength: context.description.length,
      horse: {
        breedId: context.breedId,
        sex: context.sex,
        dateOfBirth: context.dateOfBirth,
        birthYearEstimated: context.birthYearEstimated,
        heightCm: context.heightCm,
      },
    });

    if (failures.length > 0) {
      const needsVerification = failures.some((f) => f.key === 'identity_required');
      const message = failures.map((f) => f.messageTr).join(' ');

      throw needsVerification
        ? ApiException.verificationRequired(message, { failures })
        : ApiException.validation(message, { failures });
    }

    // Verified but over their plan: now the paywall is the right destination.
    this.entitlements.assertUnderLimit(
      entitlements,
      'activeSaleListings',
      `${entitlements.limits.maxActiveSaleListings} aktif ilan sınırına ulaştın. Daha fazlası için planını yükselt.`,
    );

    // §14.4 / §24.28. Categorical violations block outright; the rest route to
    // human review rather than refusing a seller who may be acting in good
    // faith.
    const violations = checkWelfarePolicy({
      title: context.title,
      description: context.description,
      priceAmount: context.priceAmount,
      priceType: context.priceType,
      sellerIdentityVerified: true,
      horse: { sex: context.sex, dateOfBirth: context.dateOfBirth },
      recentHealthRecords: context.recentHealthRecords,
    });

    const hardBlocks = violations.filter((v) => !v.requiresReview);
    if (hardBlocks.length > 0) {
      throw ApiException.prohibitedContent(hardBlocks.map((v) => v.messageTr).join(' '), {
        violations: hardBlocks,
      });
    }

    const quality = computeQualityScore({
      photoCount: context.imageCount,
      videoCount: context.videoCount,
      videoCategories: context.videoCategories,
      descriptionLength: context.description.length,
      hasXray: context.hasXray,
      horse: {
        heightCm: context.heightCm,
        breedId: context.breedId,
        dateOfBirth: context.dateOfBirth,
        birthYearEstimated: context.birthYearEstimated,
        color: context.color,
        disciplines: context.disciplines,
        visibilityHealth: context.visibilityHealth,
      },
      sellerVerification: entitlements.verificationLevel,
      priceType: context.priceType,
    });

    // §13.1 auto-approve: quality >= 60, no open moderation case, no duplicate
    // image signal. Any one of those failing means a human looks at it.
    const [openCase, flaggedMedia] = await Promise.all([
      this.hasOpenModerationCase(profileId),
      this.media.hasFlaggedMedia(context.horseId),
    ]);

    const reviewReasons: string[] = [];
    if (quality.score < AUTO_APPROVE_THRESHOLD) reviewReasons.push('quality_below_threshold');
    if (openCase) reviewReasons.push('seller_has_open_case');
    if (flaggedMedia) reviewReasons.push('phash_duplicate_other_owner');
    for (const violation of violations) reviewReasons.push(violation.rule);

    const status: ListingStatus = reviewReasons.length === 0 ? 'active' : 'pending_review';

    await this.db.withUser(profileId, (client) =>
      client.query(
        `UPDATE listings
         SET status = $2,
             quality_score = $3,
             published_at = COALESCE(published_at, now()),
             expires_at = now() + ($4 || ' days')::interval,
             rejection_reason = NULL
         WHERE id = $1`,
        [listingId, status, quality.score, LISTING_TTL_DAYS],
      ),
    );

    if (status === 'pending_review') {
      await this.db.query(
        `SELECT open_moderation_case('listing', $1, $2::smallint, $3::jsonb, $4)`,
        [
          listingId,
          flaggedMedia ? 4 : 2,
          JSON.stringify({ review_reasons: reviewReasons, quality_score: quality.score }),
          profileId,
        ],
      );

      this.logger.log(`Listing ${listingId} held for review: ${reviewReasons.join(', ')}`);
    }

    return { status, qualityScore: quality.score };
  }

  /** §13.1 pause / resume / under_offer / withdraw / renew. */
  async transition(
    profileId: string,
    listingId: string,
    action: ListingAction,
  ): Promise<{ status: ListingStatus }> {
    const listing = await this.loadOwned(profileId, listingId);
    const target = nextStatus(listing.status, action);

    if (!target) {
      throw ApiException.validation(
        `"${listing.status}" durumundaki bir ilana bu işlem uygulanamaz.`,
      );
    }

    await this.db.withUser(profileId, (client) =>
      client.query(
        // Every use of $2 is cast. Postgres infers a parameter's type from how
        // it is used, and this used $2 twice — once assigned to a
        // `listing_status` column and once compared to a string literal — so
        // it deduced two incompatible types and refused the statement outright
        // with "inconsistent types deduced for parameter $2". Every transition
        // routed through here (pause, resume, renew, mark under offer) failed
        // at runtime; nothing caught it because the milestone runs exercise the
        // downgrade path's `pause_listings()` function, not this endpoint.
        `UPDATE listings
         SET status = $2::listing_status,
             under_offer_since = CASE WHEN $2::listing_status = 'under_offer' THEN now() ELSE NULL END,
             expires_at = CASE WHEN $3::boolean THEN now() + ($4 || ' days')::interval ELSE expires_at END
         WHERE id = $1::uuid`,
        [listingId, target, action === 'renew', LISTING_TTL_DAYS],
      ),
    );

    return { status: target };
  }

  /**
   * §12 POST /listings/:id/close, §18.2 S14.
   *
   * When the buyer is named, the §7 trigger moves ownership on the horse and
   * writes both tenures into its history — the listing ends, the record does
   * not (§24.3).
   */
  async close(
    profileId: string,
    listingId: string,
    input: CloseListingInput,
  ): Promise<{ status: ListingStatus }> {
    const listing = await this.loadOwned(profileId, listingId);

    if (['sold', 'withdrawn'].includes(listing.status)) {
      throw ApiException.validation('Bu ilan zaten kapalı.');
    }

    const sold = input.reason === 'sold_on_platform' || input.reason === 'sold_elsewhere';
    const status: ListingStatus = sold ? 'sold' : 'withdrawn';

    await this.db.withUser(profileId, async (client) => {
      await client.query(
        `UPDATE listings
         SET status = $2,
             closed_at = now(),
             closed_reason = $3,
             sold_to_profile_id = $4,
             price_amount = COALESCE($5, price_amount)
         WHERE id = $1`,
        [
          listingId,
          status,
          input.reason,
          input.reason === 'sold_on_platform' ? (input.soldToProfileId ?? null) : null,
          input.price ?? null,
        ],
      );

      // §18.2 S14's "fiyatı gizli tut" applies to the history row the trigger
      // just wrote, which is what the public timeline reads.
      if (input.soldToProfileId) {
        await client.query(
          `UPDATE horse_ownership_history
           SET price_public = $3
           WHERE horse_id = $1 AND transfer_listing_id = $2`,
          [listing.horse_id, listingId, input.pricePublic],
        );
      }
    });

    return { status };
  }

  /** §12 GET /listings/:id/stats — owner only (§18.2 S14). */
  async stats(profileId: string, listingId: string): Promise<Record<string, unknown>> {
    await this.loadOwned(profileId, listingId);

    const rows = await this.db.queryAs<{
      view_count: number;
      save_count: number;
      inquiry_count: number;
      replied_inquiries: string;
      quality_score: number;
      published_at: Date | null;
      category_median_views: string | null;
    }>(
      profileId,
      `SELECT l.view_count, l.save_count, l.inquiry_count, l.quality_score, l.published_at,
              (SELECT count(*) FROM inquiries i
                WHERE i.listing_id = l.id AND i.first_reply_at IS NOT NULL) AS replied_inquiries,
              (SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY peer.view_count)
                 FROM listings peer
                 WHERE peer.status = 'active'
                   AND peer.type = l.type
                   AND peer.country_code = l.country_code) AS category_median_views
       FROM listings l WHERE l.id = $1`,
      [listingId],
    );

    const row = rows[0]!;
    const replied = Number(row.replied_inquiries);

    return {
      viewCount: row.view_count,
      saveCount: row.save_count,
      inquiryCount: row.inquiry_count,
      repliedInquiries: replied,
      // §22's north star is qualified inquiries, so the seller sees the same
      // funnel step the business measures.
      firstReplyRate: row.inquiry_count > 0 ? replied / row.inquiry_count : null,
      qualityScore: row.quality_score,
      publishedAt: row.published_at,
      categoryMedianViews:
        row.category_median_views === null ? null : Number(row.category_median_views),
    };
  }

  async findByIdOrSlug(idOrSlug: string, viewerId: string | null): Promise<Record<string, unknown>> {
    const rows = await this.db.queryAs<Record<string, never>>(
      viewerId,
      `SELECT l.*, h.name AS horse_name, h.slug AS horse_slug, h.sex, h.color,
              h.height_cm, h.date_of_birth, h.birth_year_estimated, h.disciplines,
              h.training_level, h.rider_level_min, h.about AS horse_about,
              h.temperament_notes, h.training_notes, h.breed_id,
              h.visibility_health, h.visibility_pedigree, h.visibility_documents,
              b.name_tr AS breed_name_tr, b.name_en AS breed_name_en,
              p.handle AS seller_handle, p.display_name AS seller_name,
              p.trust_score AS seller_trust_score,
              p.verification_level AS seller_verification,
              p.response_rate AS seller_response_rate
       FROM listings l
       JOIN horses h ON h.id = l.horse_id
       LEFT JOIN breeds b ON b.code = h.breed_id
       JOIN profiles p ON p.id = l.seller_profile_id
       WHERE l.id::text = $1 OR l.slug = $1`,
      [idOrSlug],
    );

    const listing = rows[0] as Record<string, unknown> | undefined;
    if (!listing) throw ApiException.notFound('İlan');

    const isOwner = viewerId !== null && listing.seller_profile_id === viewerId;

    if (!isOwner && !['active', 'under_offer', 'sold', 'expired'].includes(listing.status as string)) {
      throw ApiException.notFound('İlan');
    }

    // Counted before the response is built so a failed render still records
    // the view; §22 tracks `listing_viewed` client-side as well.
    if (!isOwner && listing.status === 'active') {
      await this.db.query(`UPDATE listings SET view_count = view_count + 1 WHERE id = $1`, [
        listing.id,
      ]);
    }

    return { ...listing, isOwner };
  }

  async listMine(profileId: string, status?: string): Promise<unknown[]> {
    const rows = await this.db.queryAs<Record<string, never>>(
      profileId,
      `SELECT l.id, l.slug, l.title, l.status, l.type, l.price_amount, l.price_currency,
              l.price_type, l.quality_score, l.view_count, l.save_count, l.inquiry_count,
              l.published_at, l.expires_at, l.is_boosted,
              h.name AS horse_name, h.cover_media_id
       FROM listings l
       JOIN horses h ON h.id = l.horse_id
       WHERE l.seller_profile_id = $1
         AND ($2::listing_status IS NULL OR l.status = $2)
       ORDER BY l.updated_at DESC`,
      [profileId, status ?? null],
    );

    return rows;
  }

  /**
   * §14.2 `contact_info_in_description`: "Auto-strip + warn seller". Contact
   * details are revealed through the profile after identity verification
   * (§14.3); leaving them in the body routes buyers around that gate.
   */
  private sanitizeDescription(description?: string): string | null {
    if (!description) return description === undefined ? null : '';

    const found = findContactInfo(description);
    if (found.length === 0) return description;

    this.logger.debug(`Stripped ${found.length} contact detail(s) from a listing description`);
    return stripContactInfo(description);
  }

  private async applyVisibilityToHorse(
    client: { query: (text: string, params: unknown[]) => Promise<unknown> },
    horseId: string,
    input: Partial<CreateListingInput>,
  ): Promise<void> {
    const columns: Record<string, unknown> = {
      visibility_health: input.visibilityHealth,
      visibility_pedigree: input.visibilityPedigree,
      visibility_documents: input.visibilityDocuments,
      visibility_location: input.visibilityLocation,
    };

    const present = Object.entries(columns).filter(([, value]) => value !== undefined);
    if (present.length === 0) return;

    // Visibility is a property of the horse record, not the ad — it must
    // outlive the listing that set it (§2).
    const assignments = present.map(([column], index) => `${column} = $${index + 2}`);
    await client.query(`UPDATE horses SET ${assignments.join(', ')} WHERE id = $1`, [
      horseId,
      ...present.map(([, value]) => value),
    ]);
  }

  /**
   * §18.2 S13 step 7: the quality meter and its concrete suggestions
   * ("Tırıs videosu ekle +5"). The same function the publish gate uses, so the
   * wizard cannot promise an auto-approval the API then withholds.
   */
  async qualityBreakdown(profileId: string, listingId: string): Promise<Record<string, unknown>> {
    const context = await this.loadPublishContext(profileId, listingId);
    const verification = await this.db.queryAs<{ verification_level: VerificationLevel }>(
      profileId,
      `SELECT verification_level FROM profiles WHERE id = $1`,
      [profileId],
    );

    const quality = computeQualityScore({
      photoCount: context.imageCount,
      videoCount: context.videoCount,
      videoCategories: context.videoCategories,
      descriptionLength: context.description.length,
      hasXray: context.hasXray,
      horse: {
        heightCm: context.heightCm,
        breedId: context.breedId,
        dateOfBirth: context.dateOfBirth,
        birthYearEstimated: context.birthYearEstimated,
        color: context.color,
        disciplines: context.disciplines,
        visibilityHealth: context.visibilityHealth,
      },
      sellerVerification: verification[0]?.verification_level ?? 'none',
      priceType: context.priceType,
    });

    return {
      score: quality.score,
      autoApproveThreshold: AUTO_APPROVE_THRESHOLD,
      willAutoApprove: quality.score >= AUTO_APPROVE_THRESHOLD,
      components: quality.components,
      suggestions: quality.suggestions.map((component) => ({
        key: component.key,
        points: component.points,
        suggestion: component.suggestion,
      })),
    };
  }

  async refreshQualityScore(profileId: string, listingId: string): Promise<number> {
    const context = await this.loadPublishContext(profileId, listingId);
    const verification = await this.db.queryAs<{ verification_level: VerificationLevel }>(
      profileId,
      `SELECT verification_level FROM profiles WHERE id = $1`,
      [profileId],
    );

    const quality = computeQualityScore({
      photoCount: context.imageCount,
      videoCount: context.videoCount,
      videoCategories: context.videoCategories,
      descriptionLength: context.description.length,
      hasXray: context.hasXray,
      horse: {
        heightCm: context.heightCm,
        breedId: context.breedId,
        dateOfBirth: context.dateOfBirth,
        birthYearEstimated: context.birthYearEstimated,
        color: context.color,
        disciplines: context.disciplines,
        visibilityHealth: context.visibilityHealth,
      },
      sellerVerification: verification[0]?.verification_level ?? 'none',
      priceType: context.priceType,
    });

    await this.db.withUser(profileId, (client) =>
      client.query(`UPDATE listings SET quality_score = $2 WHERE id = $1`, [
        listingId,
        quality.score,
      ]),
    );

    return quality.score;
  }

  /** Everything the publish gate and the quality meter need, in one round trip. */
  async loadPublishContext(profileId: string, listingId: string): Promise<PublishContext> {
    const rows = await this.db.queryAs<Record<string, never>>(
      profileId,
      `SELECT l.title, l.description, l.price_amount, l.price_type,
              h.id AS horse_id, h.breed_id, h.sex, h.date_of_birth, h.birth_year_estimated,
              h.height_cm, h.color, h.disciplines, h.visibility_health,
              (SELECT count(*) FROM horse_media hm
                JOIN media m ON m.id = hm.media_id
                WHERE hm.horse_id = h.id AND m.type = 'image' AND m.status = 'ready') AS image_count,
              (SELECT count(*) FROM horse_media hm
                JOIN media m ON m.id = hm.media_id
                WHERE hm.horse_id = h.id AND m.type = 'video' AND m.status = 'ready') AS video_count,
              (SELECT coalesce(array_agg(DISTINCT hm.category), '{}')
                 FROM horse_media hm
                 JOIN media m ON m.id = hm.media_id
                 WHERE hm.horse_id = h.id AND m.type = 'video') AS video_categories,
              (SELECT count(*) > 0 FROM horse_media hm
                WHERE hm.horse_id = h.id AND hm.category = 'xray') AS has_xray,
              (SELECT coalesce(json_agg(json_build_object(
                        'type', r.type, 'title', r.title, 'performedOn', r.performed_on)), '[]')
                 FROM horse_health_records r
                 WHERE r.horse_id = h.id AND r.performed_on > CURRENT_DATE - 365) AS recent_health
       FROM listings l
       JOIN horses h ON h.id = l.horse_id
       WHERE l.id = $1`,
      [listingId],
    );

    const row = rows[0] as unknown as Record<string, unknown> | undefined;
    if (!row) throw ApiException.notFound('İlan');

    return {
      horseId: row.horse_id as string,
      title: (row.title as string) ?? '',
      description: (row.description as string) ?? '',
      priceAmount: row.price_amount === null ? null : Number(row.price_amount),
      priceType: row.price_type as PriceType,
      breedId: (row.breed_id as string | null) ?? null,
      sex: row.sex as HorseSex,
      dateOfBirth: (row.date_of_birth as string | null) ?? null,
      birthYearEstimated: Boolean(row.birth_year_estimated),
      heightCm: row.height_cm === null ? null : Number(row.height_cm),
      color: (row.color as string | null) ?? null,
      disciplines: (row.disciplines as string[] | null) ?? [],
      visibilityHealth: row.visibility_health as FieldVisibility,
      imageCount: Number(row.image_count ?? 0),
      videoCount: Number(row.video_count ?? 0),
      videoCategories: (row.video_categories as MediaCategory[] | null) ?? [],
      hasXray: Boolean(row.has_xray),
      recentHealthRecords: (row.recent_health as { type: string; title: string; performedOn: string }[]) ?? [],
    };
  }

  private async hasOpenModerationCase(profileId: string): Promise<boolean> {
    const rows = await this.db.query<{ open: string }>(
      `SELECT count(*) AS open FROM moderation_cases
       WHERE subject_profile_id = $1 AND status IN ('open','in_review')`,
      [profileId],
    );
    return Number(rows[0]?.open ?? 0) > 0;
  }

  private async loadOwned(profileId: string, listingId: string): Promise<ListingRow> {
    const rows = await this.db.queryAs<ListingRow>(
      profileId,
      `SELECT id, horse_id, seller_profile_id, status, type FROM listings WHERE id = $1`,
      [listingId],
    );

    const listing = rows[0];
    // NOT_FOUND rather than FORBIDDEN: confirming a listing exists under an id
    // the caller cannot touch is an IDOR oracle (§24.25).
    if (!listing || listing.seller_profile_id !== profileId) throw ApiException.notFound('İlan');

    return listing;
  }

  private async allocateSlug(title: string): Promise<string> {
    const base = slugify(title).slice(0, 60) || 'ilan';

    for (let attempt = 0; attempt < 50; attempt += 1) {
      const candidate = attempt === 0 ? base : `${base}-${attempt + 1}`;
      const rows = await this.db.query<{ taken: boolean }>(
        'SELECT listing_slug_taken($1) AS taken',
        [candidate],
      );
      if (!rows[0]?.taken) return candidate;
    }

    return `${base}-${Date.now().toString(36)}`;
  }
}

interface ListingRow {
  id: string;
  horse_id: string;
  seller_profile_id: string;
  status: ListingStatus;
  type: string;
}

export interface PublishContext {
  horseId: string;
  title: string;
  description: string;
  priceAmount: number | null;
  priceType: PriceType;
  breedId: string | null;
  sex: HorseSex;
  dateOfBirth: string | null;
  birthYearEstimated: boolean;
  heightCm: number | null;
  color: string | null;
  disciplines: string[];
  visibilityHealth: FieldVisibility;
  imageCount: number;
  videoCount: number;
  videoCategories: MediaCategory[];
  hasXray: boolean;
  recentHealthRecords: { type: string; title: string; performedOn: string }[];
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
