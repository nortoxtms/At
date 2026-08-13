import { Injectable } from '@nestjs/common';
import type {
  CreateHorseInput,
  MicrochipConflict,
  TransferHorseInput,
  UpdateHorseInput,
} from '@only-horses/shared-types';

import { ApiException } from '../../common/filters/api-exception.filter.js';
import { DatabaseService } from '../../database/database.service.js';
import { EntitlementsService } from '../entitlements/entitlements.service.js';

/**
 * Horses — the permanent record (spec §2, §7, §12).
 *
 * P1: "The horse is the primary entity, not the ad." Everything here is
 * written so a horse outlives its listings and its owners: deletes are soft
 * and refused while a listing is live, transfers move edit rights without
 * touching history, and the timeline reads from four tables at once because
 * the record *is* the union of them.
 */

export interface HorseSummary {
  id: string;
  slug: string;
  name: string;
  sex: string;
  breedId: string | null;
  breedName: string | null;
  dateOfBirth: string | null;
  birthYearEstimated: boolean;
  heightCm: number | null;
  color: string | null;
  status: string;
  coverMediaId: string | null;
  coverBlurhash: string | null;
  mediaCount: number;
  activeListingId: string | null;
  nextDueOn: string | null;
  nextDueTitle: string | null;
}

@Injectable()
export class HorsesService {
  constructor(
    private readonly db: DatabaseService,
    private readonly entitlements: EntitlementsService,
  ) {}

  /** §12 GET /me/horses — the My Stable list (§18.2 S09). */
  async listMine(profileId: string): Promise<HorseSummary[]> {
    const rows = await this.db.queryAs<Record<string, never>>(
      profileId,
      `SELECT h.id, h.slug, h.name, h.sex, h.breed_id, b.name_tr, b.name_en,
              h.date_of_birth, h.birth_year_estimated, h.height_cm, h.color,
              h.status, h.cover_media_id, m.blurhash,
              (SELECT count(*) FROM horse_media hm WHERE hm.horse_id = h.id) AS media_count,
              (SELECT l.id FROM listings l
                WHERE l.horse_id = h.id
                  AND l.status IN ('active','pending_review','under_offer')
                LIMIT 1) AS active_listing_id,
              -- §18.2 S09 shows the next due care item in a warning colour
              -- when it falls inside 14 days, so the list query carries it.
              (SELECT r.next_due_on FROM horse_health_records r
                WHERE r.horse_id = h.id AND r.next_due_on IS NOT NULL
                ORDER BY r.next_due_on LIMIT 1) AS next_due_on,
              (SELECT r.title FROM horse_health_records r
                WHERE r.horse_id = h.id AND r.next_due_on IS NOT NULL
                ORDER BY r.next_due_on LIMIT 1) AS next_due_title
       FROM horses h
       LEFT JOIN breeds b ON b.code = h.breed_id
       LEFT JOIN media m ON m.id = h.cover_media_id
       WHERE h.owner_profile_id = $1 AND h.deleted_at IS NULL
       ORDER BY h.created_at DESC`,
      [profileId],
    );

    return rows.map(toHorseSummary);
  }

  async findByIdOrSlug(idOrSlug: string, viewerId: string | null): Promise<Record<string, unknown>> {
    const rows = await this.db.queryAs<Record<string, never>>(
      viewerId,
      `SELECT h.*, b.name_tr AS breed_name_tr, b.name_en AS breed_name_en,
              p.display_name AS owner_display_name, p.handle AS owner_handle,
              p.trust_score AS owner_trust_score, p.verification_level AS owner_verification,
              (SELECT l.id FROM listings l
                WHERE l.horse_id = h.id AND l.status = 'active' LIMIT 1) AS active_listing_id
       FROM horses h
       LEFT JOIN breeds b ON b.code = h.breed_id
       LEFT JOIN profiles p ON p.id = h.owner_profile_id
       WHERE (h.id::text = $1 OR h.slug = $1) AND h.deleted_at IS NULL`,
      [idOrSlug],
    );

    const horse = rows[0] as Record<string, unknown> | undefined;
    if (!horse) throw ApiException.notFound('At');

    const isOwner = viewerId !== null && horse.owner_profile_id === viewerId;

    // A horse with no active listing is not public (§8 horses_select). The
    // API mirrors that rather than relying on RLS alone, because §4 makes the
    // API the primary control and RLS the second line.
    if (!isOwner && !horse.active_listing_id) {
      throw ApiException.notFound('At');
    }

    return { ...this.applyVisibility(horse, isOwner), isOwner };
  }

  /**
   * §2's field visibility contract. `on_request` fields are not simply hidden:
   * the client needs to know they exist so it can render the lock state and
   * the "Sağlık dosyası iste" button (§18.2 S08 step 6).
   */
  private applyVisibility(
    horse: Record<string, unknown>,
    isOwner: boolean,
  ): Record<string, unknown> {
    if (isOwner) return horse;

    const result = { ...horse };

    if (horse.visibility_location !== 'public') {
      delete result.location;
      // Region stays: a buyer filtering by distance needs something, and the
      // approximate map in §18.2 S08 step 3 is built from it.
      if (horse.visibility_location === 'private') delete result.current_city;
    }

    if (horse.visibility_pedigree !== 'public') {
      delete result.sire_horse_id;
      delete result.dam_horse_id;
      delete result.sire_name_text;
      delete result.dam_name_text;
    }

    // Identity documents are never public on a horse another user is viewing:
    // a microchip number is what a thief needs to claim provenance.
    delete result.microchip_number;
    delete result.ueln;
    delete result.passport_number;

    return result;
  }

  /**
   * §12 POST /horses. §3.3 caps how many horses a tier may hold, checked here
   * because a client cannot be trusted to enforce its own paywall.
   */
  async create(profileId: string, input: CreateHorseInput): Promise<{ id: string; slug: string }> {
    const entitlements = await this.entitlements.forProfile(profileId);
    this.entitlements.assertUnderLimit(
      entitlements,
      'horses',
      `${entitlements.limits.maxHorses} at kaydı sınırına ulaştın. Daha fazlası için planını yükselt.`,
    );

    if (input.microchipNumber || input.ueln) {
      const conflict = await this.findIdentifierConflict(input.microchipNumber, input.ueln);
      if (conflict) {
        // §18.2 S10 step 1: an already-registered chip is a transfer, not a
        // duplicate. CONFLICT carries the existing horse so the wizard can
        // offer the transfer flow instead of a dead end.
        throw new ApiException(
          'CONFLICT',
          'Bu mikroçip numarası kayıtlı. Sahiplik devri mi yapıyorsun?',
          409,
          conflict,
        );
      }
    }

    // Slug allocation runs unscoped on purpose. `horses_select` only exposes
    // the caller's own horses and those with an active listing, so a check
    // made inside the user's transaction is blind to most of the table and
    // would happily propose a slug that already exists.
    const slug = await this.allocateSlug(input.name);

    return this.db.withUser(profileId, async (client) => {

      const { rows } = await client.query<{ id: string; slug: string }>(
        `INSERT INTO horses (
           slug, name, stable_name, sex, date_of_birth, birth_year_estimated,
           microchip_number, ueln, passport_number, passport_issuer,
           breed_id, breed_secondary_id, color, markings, height_cm, weight_kg,
           stabled_at_org_id, current_country, current_region, current_city,
           location_precision, disciplines, training_level, temperament_score,
           rider_level_min, about, training_notes, temperament_notes,
           sire_horse_id, dam_horse_id, sire_name_text, dam_name_text,
           visibility_health, visibility_pedigree, visibility_documents, visibility_location,
           owner_profile_id, owner_org_id, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,
                 $21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,$36,$37,$38,$39)
         RETURNING id, slug`,
        [
          slug,
          input.name,
          input.stableName ?? null,
          input.sex,
          input.dateOfBirth ?? null,
          input.birthYearEstimated,
          emptyToNull(input.microchipNumber),
          emptyToNull(input.ueln),
          input.passportNumber ?? null,
          input.passportIssuer ?? null,
          input.breedId ?? null,
          input.breedSecondaryId ?? null,
          input.color ?? null,
          input.markings ?? null,
          input.heightCm ?? null,
          input.weightKg ?? null,
          input.stabledAtOrgId ?? null,
          input.currentCountry ?? null,
          input.currentRegion ?? null,
          input.currentCity ?? null,
          input.locationPrecision,
          input.disciplines,
          input.trainingLevel ?? null,
          input.temperamentScore ?? null,
          input.riderLevelMin ?? null,
          input.about ?? null,
          input.trainingNotes ?? null,
          input.temperamentNotes ?? null,
          input.sireHorseId ?? null,
          input.damHorseId ?? null,
          input.sireNameText ?? null,
          input.damNameText ?? null,
          input.visibilityHealth,
          input.visibilityPedigree,
          input.visibilityDocuments,
          input.visibilityLocation,
          input.ownerOrgId ? null : profileId,
          input.ownerOrgId ?? null,
          profileId,
        ],
      );

      const horse = rows[0]!;

      // §7: ownership history starts the moment the record does, so a horse
      // that is never sold still has a provenance chain.
      await client.query(
        `INSERT INTO horse_ownership_history (horse_id, owner_profile_id, owner_org_id,
                                              owner_name_text, from_date, verified)
         SELECT $1, $2, $3, p.display_name, CURRENT_DATE, TRUE
         FROM profiles p WHERE p.id = $4`,
        [horse.id, input.ownerOrgId ? null : profileId, input.ownerOrgId ?? null, profileId],
      );

      return horse;
    });
  }

  async update(profileId: string, horseId: string, input: UpdateHorseInput): Promise<void> {
    await this.assertCanEdit(profileId, horseId);

    if (input.microchipNumber || input.ueln) {
      const conflict = await this.findIdentifierConflict(
        input.microchipNumber,
        input.ueln,
        horseId,
      );
      if (conflict) {
        throw new ApiException('CONFLICT', 'Bu mikroçip numarası başka bir ata kayıtlı.', 409, conflict);
      }
    }

    const columns: Record<string, unknown> = {
      name: input.name,
      stable_name: input.stableName,
      sex: input.sex,
      date_of_birth: input.dateOfBirth,
      birth_year_estimated: input.birthYearEstimated,
      microchip_number: emptyToNull(input.microchipNumber),
      ueln: emptyToNull(input.ueln),
      passport_number: input.passportNumber,
      passport_issuer: input.passportIssuer,
      breed_id: input.breedId,
      breed_secondary_id: input.breedSecondaryId,
      color: input.color,
      markings: input.markings,
      height_cm: input.heightCm,
      weight_kg: input.weightKg,
      stabled_at_org_id: input.stabledAtOrgId,
      current_country: input.currentCountry,
      current_region: input.currentRegion,
      current_city: input.currentCity,
      location_precision: input.locationPrecision,
      disciplines: input.disciplines,
      training_level: input.trainingLevel,
      temperament_score: input.temperamentScore,
      rider_level_min: input.riderLevelMin,
      about: input.about,
      training_notes: input.trainingNotes,
      temperament_notes: input.temperamentNotes,
      sire_horse_id: input.sireHorseId,
      dam_horse_id: input.damHorseId,
      sire_name_text: input.sireNameText,
      dam_name_text: input.damNameText,
      visibility_health: input.visibilityHealth,
      visibility_pedigree: input.visibilityPedigree,
      visibility_documents: input.visibilityDocuments,
      visibility_location: input.visibilityLocation,
    };

    const present = Object.entries(columns).filter(([, value]) => value !== undefined);
    if (present.length === 0) return;

    const assignments = present.map(([column], index) => `${column} = $${index + 2}`);

    await this.db.withUser(profileId, (client) =>
      client.query(
        `UPDATE horses SET ${assignments.join(', ')} WHERE id = $1`,
        [horseId, ...present.map(([, value]) => value)],
      ),
    );
  }

  /** §12 DELETE /horses/:id — soft delete, blocked while a listing is live. */
  async softDelete(profileId: string, horseId: string): Promise<void> {
    await this.assertCanEdit(profileId, horseId);

    const live = await this.db.queryAs<{ id: string }>(
      profileId,
      `SELECT id FROM listings
       WHERE horse_id = $1 AND status IN ('active','pending_review','under_offer')`,
      [horseId],
    );

    if (live.length > 0) {
      throw new ApiException(
        'CONFLICT',
        'Bu atın yayında bir ilanı var. Önce ilanı kapat.',
        409,
        { listingId: live[0]!.id },
      );
    }

    await this.db.withUser(profileId, (client) =>
      client.query(`UPDATE horses SET deleted_at = now(), status = 'archived' WHERE id = $1`, [
        horseId,
      ]),
    );
  }

  /**
   * §12 GET /horses/:id/timeline — the §20.4 signature element.
   *
   * Merged in SQL rather than in four round trips: the timeline is the first
   * thing rendered on both the owner view and the listing page, and it is the
   * component §18.2 S08 step 7 tells us to give visual weight.
   */
  /**
   * §12 GET /horses/:id/competitions.
   *
   * `competitions_select` (§8) shows results to whoever can edit the horse and
   * to anyone while it is publicly listed — a competition record is part of
   * what a buyer is buying, so it travels with the listing.
   */
  async competitions(horseId: string, viewerId: string | null): Promise<unknown[]> {
    const sql = `SELECT c.id, c.event_date, c.event_name, c.discipline, c.class_name,
                        c.level, c.placing, c.score, c.location,
                        COALESCE(p.display_name, c.rider_name_text) AS rider_name,
                        m.cf_image_id AS proof_image
                 FROM horse_competition_results c
                 LEFT JOIN profiles p ON p.id = c.rider_profile_id
                 LEFT JOIN media m ON m.id = c.proof_media_id
                 WHERE c.horse_id = $1
                 ORDER BY c.event_date DESC`;

    return viewerId
      ? this.db.queryAs(viewerId, sql, [horseId])
      : this.db.query(sql, [horseId]);
  }

  /** §12 POST /horses/:id/competitions. */
  async addCompetition(
    profileId: string,
    horseId: string,
    input: Record<string, unknown>,
  ): Promise<{ id: string }> {
    await this.assertCanEdit(profileId, horseId);

    const rows = await this.db.withUser(profileId, async (client) => {
      const result = await client.query<{ id: string }>(
        // "placing" is a reserved word in Postgres, hence the quotes.
        `INSERT INTO horse_competition_results
           (horse_id, event_date, event_name, discipline, class_name, level,
            "placing", score, location, rider_profile_id, rider_name_text, proof_media_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         RETURNING id`,
        [
          horseId,
          input.eventDate,
          input.eventName,
          input.discipline ?? null,
          input.className ?? null,
          input.level ?? null,
          input.placing ?? null,
          input.score ?? null,
          input.location ?? null,
          input.riderProfileId ?? null,
          input.riderName ?? null,
          input.proofMediaId ?? null,
        ],
      );
      return result.rows;
    });

    return rows[0]!;
  }

  async timeline(idOrSlug: string, viewerId: string | null): Promise<unknown[]> {
    const horseId = await this.resolveHorseId(idOrSlug);
    const canSeeHealth = await this.canSeeHealth(horseId, viewerId);

    const rows = await this.db.queryAs<{
      kind: string;
      occurred_on: string;
      title: string;
      detail: string | null;
      reference_id: string | null;
    }>(
      viewerId,
      `SELECT 'registered' AS kind, h.created_at::date AS occurred_on,
              'Kayıt oluşturuldu' AS title,
              CASE WHEN h.microchip_number IS NOT NULL THEN 'Mikroçip kayıtlı' END AS detail,
              h.id::text AS reference_id
       FROM horses h WHERE h.id = $1

       UNION ALL
       SELECT 'ownership', o.from_date,
              CASE WHEN o.transfer_listing_id IS NOT NULL THEN 'Sahiplik devri'
                   ELSE 'Sahiplik kaydı' END,
              o.owner_name_text, o.id::text
       FROM horse_ownership_history o WHERE o.horse_id = $1

       UNION ALL
       SELECT 'competition', c.event_date, c.event_name,
              concat_ws(' · ', c.class_name,
                        CASE WHEN c."placing" IS NOT NULL THEN c."placing"::text || '. sıra' END),
              c.id::text
       FROM horse_competition_results c WHERE c.horse_id = $1

       UNION ALL
       SELECT 'listing', l.published_at::date,
              CASE l.status
                WHEN 'sold' THEN 'İlan kapandı — satıldı'
                WHEN 'active' THEN 'İlan yayınlandı'
                ELSE 'İlan' END,
              CASE WHEN l.price_amount IS NOT NULL
                   THEN l.price_amount::text || ' ' || l.price_currency END,
              l.id::text
       FROM listings l
       WHERE l.horse_id = $1 AND l.published_at IS NOT NULL

       UNION ALL
       SELECT 'health', r.performed_on, r.title, r.performed_by_name, r.id::text
       FROM horse_health_records r
       WHERE r.horse_id = $1 AND $2 = TRUE AND r.is_sensitive = FALSE

       ORDER BY occurred_on DESC`,
      [horseId, canSeeHealth],
    );

    return rows.map((row) => ({
      kind: row.kind,
      date: row.occurred_on,
      title: row.title,
      detail: row.detail,
      referenceId: row.reference_id,
    }));
  }

  /**
   * §2, §24.4: health entries appear on the timeline only for the owner or a
   * holder of an active grant. Sensitive records are excluded even then —
   * §18.2 S12's "Hassas (paylaşımda gizle)" toggle means exactly that.
   */
  /**
   * Resolves a slug to an id. Uses the SECURITY DEFINER lookup for the same
   * reason as the uniqueness checks (migration 0020): `horses_select` hides
   * most of the table, so a plain lookup would fail for exactly the public
   * listings the web renders.
   */
  private async resolveHorseId(idOrSlug: string): Promise<string> {
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idOrSlug)) {
      return idOrSlug;
    }

    const rows = await this.db.query<{ id: string }>(
      `SELECT id FROM horses WHERE slug = $1 AND deleted_at IS NULL`,
      [idOrSlug],
    );

    const horse = rows[0];
    if (!horse) throw ApiException.notFound('At');

    return horse.id;
  }

  private async canSeeHealth(horseId: string, viewerId: string | null): Promise<boolean> {
    if (!viewerId) return false;

    const rows = await this.db.queryAs<{ allowed: boolean }>(
      viewerId,
      `SELECT EXISTS (
         SELECT 1 FROM horses h
         WHERE h.id = $1 AND h.owner_profile_id = $2
       ) OR EXISTS (
         SELECT 1 FROM horse_access_grants g
         WHERE g.horse_id = $1 AND g.grantee_id = $2 AND g.status = 'granted'
           AND (g.expires_at IS NULL OR g.expires_at > now())
           AND 'health' = ANY(g.scope)
       ) AS allowed`,
      [horseId, viewerId],
    );

    return rows[0]?.allowed ?? false;
  }

  /**
   * §12 POST /horses/:id/transfer.
   *
   * §24.3: after transfer the previous owner loses edit rights, the new owner
   * gains them, and the history shows both. Ownership moves without a listing
   * here — a private sale, or correcting a record.
   */
  async transfer(profileId: string, horseId: string, input: TransferHorseInput): Promise<void> {
    await this.assertCanEdit(profileId, horseId);

    const recipients = await this.db.query<{ id: string; display_name: string }>(
      input.toProfileId
        ? `SELECT id, display_name FROM profiles WHERE id = $1 AND deleted_at IS NULL`
        : `SELECT p.id, p.display_name FROM profiles p
           JOIN auth.users u ON u.id = p.id
           WHERE u.email = $1 AND p.deleted_at IS NULL`,
      [input.toProfileId ?? input.toEmail],
    );

    const recipient = recipients[0];
    if (!recipient) throw ApiException.notFound('Devredilecek kullanıcı');
    if (recipient.id === profileId) {
      throw ApiException.validation('Atı kendine devredemezsin.');
    }

    const effectiveDate = input.date ?? new Date().toISOString().slice(0, 10);

    await this.db.withUser(profileId, async (client) => {
      await client.query(
        `UPDATE horse_ownership_history SET to_date = $2
         WHERE horse_id = $1 AND to_date IS NULL`,
        [horseId, effectiveDate],
      );

      await client.query(
        `INSERT INTO horse_ownership_history (horse_id, owner_profile_id, owner_name_text,
                                              from_date, transfer_price, transfer_currency,
                                              price_public, verified)
         VALUES ($1, $2, $3, $4, $5, $6, $7, FALSE)`,
        [
          horseId,
          recipient.id,
          recipient.display_name,
          effectiveDate,
          input.price ?? null,
          input.currency ?? null,
          input.pricePublic,
        ],
      );

      // Edit rights move with ownership. This is the last statement the
      // outgoing owner is able to run against this horse.
      await client.query(
        `UPDATE horses SET owner_profile_id = $2, owner_org_id = NULL WHERE id = $1`,
        [horseId, recipient.id],
      );
    });
  }

  async attachMedia(
    profileId: string,
    horseId: string,
    input: { mediaId: string; category: string; sortOrder: number; visibility: string },
  ): Promise<void> {
    await this.assertCanEdit(profileId, horseId);

    const owned = await this.db.queryAs<{ id: string; status: string }>(
      profileId,
      `SELECT id, status FROM media WHERE id = $1 AND owner_profile_id = $2`,
      [input.mediaId, profileId],
    );

    // Attaching someone else's media would let a listing display a photo the
    // uploader never agreed to, and would sidestep the §10.1 duplicate check.
    if (!owned[0]) throw ApiException.notFound('Medya');
    if (owned[0].status !== 'ready') {
      throw ApiException.validation('Medya henüz işlenmedi. Yükleme tamamlandıktan sonra dene.');
    }

    await this.db.withUser(profileId, async (client) => {
      await client.query(
        `INSERT INTO horse_media (horse_id, media_id, category, sort_order, visibility)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (horse_id, media_id) DO UPDATE
           SET category = EXCLUDED.category,
               sort_order = EXCLUDED.sort_order,
               visibility = EXCLUDED.visibility`,
        [horseId, input.mediaId, input.category, input.sortOrder, input.visibility],
      );

      // The first image attached becomes the cover until the owner picks one.
      await client.query(
        `UPDATE horses SET cover_media_id = $2
         WHERE id = $1 AND cover_media_id IS NULL
           AND EXISTS (SELECT 1 FROM media WHERE id = $2 AND type = 'image')`,
        [horseId, input.mediaId],
      );
    });
  }

  async reorderMedia(profileId: string, horseId: string, order: string[]): Promise<void> {
    await this.assertCanEdit(profileId, horseId);

    await this.db.withUser(profileId, async (client) => {
      for (const [index, mediaId] of order.entries()) {
        await client.query(
          `UPDATE horse_media SET sort_order = $3 WHERE horse_id = $1 AND media_id = $2`,
          [horseId, mediaId, index],
        );
      }
    });
  }

  async detachMedia(profileId: string, horseId: string, mediaId: string): Promise<void> {
    await this.assertCanEdit(profileId, horseId);

    await this.db.withUser(profileId, async (client) => {
      await client.query(`DELETE FROM horse_media WHERE horse_id = $1 AND media_id = $2`, [
        horseId,
        mediaId,
      ]);
      // Promote the next image rather than leaving the stable card blank.
      await client.query(
        `UPDATE horses SET cover_media_id = (
           SELECT hm.media_id FROM horse_media hm
           JOIN media m ON m.id = hm.media_id AND m.type = 'image'
           WHERE hm.horse_id = $1 ORDER BY hm.sort_order LIMIT 1)
         WHERE id = $1 AND cover_media_id = $2`,
        [horseId, mediaId],
      );
    });
  }

  async listMedia(horseId: string, viewerId: string | null): Promise<unknown[]> {
    const isOwner = await this.isOwner(horseId, viewerId);

    const rows = await this.db.queryAs<{
      media_id: string;
      category: string;
      sort_order: number;
      visibility: string;
      type: string;
      blurhash: string | null;
      width: number | null;
      height: number | null;
    }>(
      viewerId,
      `SELECT hm.media_id, hm.category, hm.sort_order, hm.visibility,
              m.type, m.blurhash, m.width, m.height
       FROM horse_media hm
       JOIN media m ON m.id = hm.media_id
       WHERE hm.horse_id = $1
         AND m.status = 'ready'
         AND ($2 = TRUE OR hm.visibility = 'public')
       ORDER BY hm.sort_order, m.created_at`,
      [horseId, isOwner],
    );

    return rows.map((row) => ({
      mediaId: row.media_id,
      category: row.category,
      sortOrder: row.sort_order,
      visibility: row.visibility,
      type: row.type,
      blurhash: row.blurhash,
      width: row.width,
      height: row.height,
    }));
  }

  async assertCanEdit(profileId: string, horseId: string): Promise<void> {
    const rows = await this.db.queryAs<{ allowed: boolean }>(
      profileId,
      `SELECT EXISTS (
         SELECT 1 FROM horses h
         WHERE h.id = $1 AND h.deleted_at IS NULL
           AND (h.owner_profile_id = $2
                OR EXISTS (SELECT 1 FROM organization_members m
                           WHERE m.organization_id = h.owner_org_id
                             AND m.profile_id = $2
                             AND m.role IN ('owner','admin')))
       ) AS allowed`,
      [horseId, profileId],
    );

    if (!rows[0]?.allowed) {
      // Deliberately NOT_FOUND rather than FORBIDDEN: confirming that a horse
      // exists under an id the caller cannot touch is an IDOR oracle (§24.25).
      throw ApiException.notFound('At');
    }
  }

  private async isOwner(horseId: string, profileId: string | null): Promise<boolean> {
    if (!profileId) return false;
    const rows = await this.db.queryAs<{ owner: boolean }>(
      profileId,
      `SELECT (owner_profile_id = $2) AS owner FROM horses WHERE id = $1`,
      [horseId, profileId],
    );
    return rows[0]?.owner ?? false;
  }

  private async findIdentifierConflict(
    microchip?: string,
    ueln?: string,
    excludeHorseId?: string,
  ): Promise<MicrochipConflict | null> {
    // Routed through a SECURITY DEFINER function (migration 0020): a plain
    // SELECT here is subject to `horses_select` and cannot see another
    // owner's horse, which is exactly the case this check exists to catch.
    const rows = await this.db.query<{
      horse_id: string;
      horse_name: string;
      matched_on: 'microchip' | 'ueln';
      owner_display_name: string | null;
    }>('SELECT * FROM find_horse_by_identifier($1, $2, $3)', [
      emptyToNull(microchip),
      emptyToNull(ueln),
      excludeHorseId ?? null,
    ]);

    const match = rows[0];
    if (!match) return null;

    return {
      conflict: match.matched_on,
      horseId: match.horse_id,
      horseName: match.horse_name,
      ownerDisplayName: match.owner_display_name,
    };
  }

  private async allocateSlug(name: string): Promise<string> {
    const base = slugify(name).slice(0, 40) || 'at';

    for (let attempt = 0; attempt < 50; attempt += 1) {
      const candidate = attempt === 0 ? base : `${base}-${attempt + 1}`;
      const rows = await this.db.query<{ taken: boolean }>(
        'SELECT horse_slug_taken($1) AS taken',
        [candidate],
      );
      if (!rows[0]?.taken) return candidate;
    }

    // Two clients can still pass the check for the same candidate; the unique
    // index is the real arbiter and `create` retries when it fires.
    return `${base}-${Date.now().toString(36)}`;
  }
}

function toHorseSummary(row: Record<string, never>): HorseSummary {
  const r = row as unknown as Record<string, unknown>;
  return {
    id: r.id as string,
    slug: r.slug as string,
    name: r.name as string,
    sex: r.sex as string,
    breedId: (r.breed_id as string | null) ?? null,
    breedName: ((r.name_tr ?? r.name_en) as string | null) ?? null,
    dateOfBirth: r.date_of_birth ? String(r.date_of_birth).slice(0, 10) : null,
    birthYearEstimated: Boolean(r.birth_year_estimated),
    heightCm: r.height_cm === null ? null : Number(r.height_cm),
    color: (r.color as string | null) ?? null,
    status: r.status as string,
    coverMediaId: (r.cover_media_id as string | null) ?? null,
    coverBlurhash: (r.blurhash as string | null) ?? null,
    mediaCount: Number(r.media_count ?? 0),
    activeListingId: (r.active_listing_id as string | null) ?? null,
    nextDueOn: r.next_due_on ? String(r.next_due_on).slice(0, 10) : null,
    nextDueTitle: (r.next_due_title as string | null) ?? null,
  };
}

function emptyToNull(value?: string): string | null {
  return value && value.length > 0 ? value : null;
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
