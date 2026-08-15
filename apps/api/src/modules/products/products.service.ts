import { Injectable } from '@nestjs/common';
import type {
  CreateProductInput,
  ProductSearchInput,
  UpdateProductInput,
} from '@only-horses/shared-types';

import { ApiException } from '../../common/filters/api-exception.filter.js';
import { DatabaseService } from '../../database/database.service.js';
import { MediaService } from '../media/media.service.js';

/**
 * The product marketplace (§13, extended).
 *
 * Search runs on Postgres, not Typesense, for the same reason listing search
 * does (ADR-0008): the tsvector index is measured and the Typesense adapter
 * has never been run. The query shape is deliberately the same as
 * `postgres-search.provider.ts` uses — a sanitised prefix `to_tsquery` on the
 * `simple` configuration — because the two must agree about what "eyer 17"
 * matches.
 */
@Injectable()
export class ProductsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly media: MediaService,
  ) {}

  /**
   * Turn user text into a prefix tsquery.
   *
   * Lifted from the listing search, and for the reasons recorded there: the
   * tsquery operators have to be stripped or a stray `!` inverts the whole
   * query, internal hyphens have to survive because model numbers are full of
   * them, and an empty result needs a sentinel that cannot match rather than a
   * negation that matches everything.
   */
  private toPrefixQuery(input: string): string {
    const terms = input
      .replace(/[&|!():*<>]/g, ' ')
      .split(/\s+/)
      .map((term) => term.trim())
      .filter((term) => term.length > 0)
      .map((term) => `${term}:*`);

    return terms.length > 0 ? terms.join(' & ') : 'zzznomatchzzz';
  }

  private slugify(value: string): string {
    return value
      .toLocaleLowerCase('tr')
      .replace(/ı/g, 'i')
      .replace(/ş/g, 's')
      .replace(/ğ/g, 'g')
      .replace(/ü/g, 'u')
      .replace(/ö/g, 'o')
      .replace(/ç/g, 'c')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 60);
  }

  /** §12 GET /products/categories — the tile grid, with live counts. */
  async categories(): Promise<unknown[]> {
    return this.db.query(
      `SELECT c.code, c.parent_code, c.name_tr, c.name_en, c.icon, c.sort_order,
              (SELECT count(*) FROM product_listings p
                WHERE p.status = 'active'
                  AND (p.category = c.code
                       OR p.category IN (SELECT code FROM product_categories
                                          WHERE parent_code = c.code))) AS active_count
       FROM product_categories c
       ORDER BY c.sort_order, c.name_tr`,
    );
  }

  async search(query: ProductSearchInput, viewerId: string | null) {
    const params: unknown[] = [];
    const push = (value: unknown) => `$${params.push(value)}`;

    const clauses = [`p.status = 'active'`];

    if (query.q) {
      clauses.push(`p.text_search @@ to_tsquery('simple', ${push(this.toPrefixQuery(query.q))})`);
    }

    // A parent category matches its children. Tapping "Koşum ve saraciye" and
    // getting nothing because every saddle is filed under "Eyer" is the most
    // obvious way a two-level taxonomy fails.
    if (query.category) {
      clauses.push(
        `(p.category = ${push(query.category)}
          OR p.category IN (SELECT code FROM product_categories WHERE parent_code = ${push(query.category)}))`,
      );
    }

    if (query.condition) clauses.push(`p.condition = ${push(query.condition)}::product_condition`);
    if (query.brand) clauses.push(`p.brand ILIKE ${push(`%${query.brand}%`)}`);
    if (query.region) clauses.push(`p.region = ${push(query.region)}`);
    if (query.minPrice !== undefined) clauses.push(`p.price_amount >= ${push(query.minPrice)}`);
    if (query.maxPrice !== undefined) clauses.push(`p.price_amount <= ${push(query.maxPrice)}`);

    // "Kargo" must include sellers who offer both, or half the stock vanishes
    // from the filter people use most.
    if (query.delivery) {
      clauses.push(
        query.delivery === 'both'
          ? `p.delivery = 'both'`
          : `p.delivery IN (${push(query.delivery)}::product_delivery, 'both')`,
      );
    }

    const order =
      query.sort === 'price_asc'
        ? 'p.price_amount ASC NULLS LAST'
        : query.sort === 'price_desc'
          ? 'p.price_amount DESC NULLS LAST'
          : 'p.published_at DESC NULLS LAST';

    const where = clauses.join(' AND ');
    const limit = push(query.limit);
    const offset = push((query.page - 1) * query.limit);

    const rows = await this.db.queryAs<Record<string, never>>(
      viewerId,
      `SELECT p.id, p.slug, p.title, p.category, p.brand, p.model, p.size_label,
              p.condition, p.price_amount, p.price_currency, p.price_type,
              p.price_unit, p.quantity, p.delivery, p.country_code, p.region,
              p.city, p.is_boosted, p.published_at,
              c.name_tr AS category_name, c.parent_code,
              s.handle AS seller_handle, s.display_name AS seller_name,
              s.verification_level AS seller_verification,
              s.trust_score AS seller_trust_score,
              (SELECT pm.media_id FROM product_media pm
                WHERE pm.product_id = p.id ORDER BY pm.sort_order LIMIT 1) AS cover_media_id
       FROM product_listings p
       JOIN product_categories c ON c.code = p.category
       JOIN profiles s ON s.id = p.seller_profile_id
       WHERE ${where}
       -- §11: boosted first within the page, never across it, so paying
       -- cannot buy the whole result set.
       ORDER BY p.is_boosted DESC, ${order}
       LIMIT ${limit} OFFSET ${offset}`,
      params,
    );

    const total = await this.db.queryAs<{ count: string }>(
      viewerId,
      `SELECT count(*) AS count FROM product_listings p WHERE ${where}`,
      params.slice(0, params.length - 2),
    );

    const urls = await this.media.createViewUrls(
      rows.map((row) => (row as Record<string, string | null>).cover_media_id).filter(Boolean) as string[],
      viewerId,
    );

    return {
      hits: rows.map((raw) => this.toHit(raw as Record<string, unknown>, urls)),
      total: Number(total[0]?.count ?? 0),
      page: query.page,
      limit: query.limit,
    };
  }

  private toHit(row: Record<string, unknown>, urls: Map<string, string>) {
    const cover = row.cover_media_id as string | null;

    return {
      id: row.id as string,
      slug: row.slug as string,
      title: row.title as string,
      category: row.category as string,
      categoryName: (row.category_name as string) ?? null,
      parentCategory: (row.parent_code as string) ?? null,
      brand: (row.brand as string) ?? null,
      model: (row.model as string) ?? null,
      sizeLabel: (row.size_label as string) ?? null,
      condition: row.condition as string,
      priceAmount: row.price_amount === null ? null : Number(row.price_amount),
      priceCurrency: row.price_currency as string,
      priceType: row.price_type as string,
      priceUnit: (row.price_unit as string) ?? null,
      quantity: Number(row.quantity ?? 1),
      delivery: row.delivery as string,
      countryCode: row.country_code as string,
      region: (row.region as string) ?? null,
      city: (row.city as string) ?? null,
      sellerHandle: row.seller_handle as string,
      sellerName: row.seller_name as string,
      sellerVerification: row.seller_verification as string,
      sellerTrustScore: Number(row.seller_trust_score ?? 0),
      coverImage: cover ? (urls.get(cover) ?? null) : null,
      isBoosted: Boolean(row.is_boosted),
      publishedAt: (row.published_at as string) ?? null,
    };
  }

  async byIdOrSlug(idOrSlug: string, viewerId: string | null) {
    const isUuid = /^[0-9a-f-]{36}$/i.test(idOrSlug);

    const rows = await this.db.queryAs<Record<string, never>>(
      viewerId,
      `SELECT p.*, c.name_tr AS category_name, c.parent_code,
              s.handle AS seller_handle, s.display_name AS seller_name,
              s.verification_level AS seller_verification,
              s.trust_score AS seller_trust_score
       FROM product_listings p
       JOIN product_categories c ON c.code = p.category
       JOIN profiles s ON s.id = p.seller_profile_id
       WHERE ${isUuid ? 'p.id = $1::uuid' : 'p.slug = $1'}`,
      [idOrSlug],
    );

    const row = rows[0] as Record<string, unknown> | undefined;
    if (!row) throw ApiException.notFound('Ürün');

    const mediaRows = await this.db.queryAs<{ media_id: string }>(
      viewerId,
      `SELECT media_id FROM product_media WHERE product_id = $1 ORDER BY sort_order`,
      [row.id],
    );

    const urls = await this.media.createViewUrls(
      mediaRows.map((entry) => entry.media_id),
      viewerId,
    );

    // Counted on read, like every other detail page. It is the only view
    // signal a seller gets, and §22's dashboard shows it.
    await this.db
      .queryAs(viewerId, `UPDATE product_listings SET view_count = view_count + 1 WHERE id = $1`, [
        row.id,
      ])
      .catch(() => undefined);

    return {
      ...this.toHit(row, new Map()),
      description: row.description as string,
      shippingNote: (row.shipping_note as string) ?? null,
      color: (row.color as string) ?? null,
      status: row.status as string,
      viewCount: Number(row.view_count ?? 0),
      sellerProfileId: row.seller_profile_id as string,
      images: mediaRows.map((entry) => urls.get(entry.media_id)).filter(Boolean) as string[],
    };
  }

  async listMine(profileId: string): Promise<unknown[]> {
    return this.db.queryAs(
      profileId,
      `SELECT p.id, p.slug, p.title, p.status, p.category, p.price_amount,
              p.price_currency, p.price_type, p.price_unit, p.quantity,
              p.view_count, p.save_count, p.inquiry_count, p.is_boosted,
              c.name_tr AS category_name
       FROM product_listings p
       JOIN product_categories c ON c.code = p.category
       WHERE p.seller_profile_id = $1
       ORDER BY p.created_at DESC`,
      [profileId],
    );
  }

  async create(profileId: string, input: CreateProductInput): Promise<{ id: string; slug: string }> {
    const base = this.slugify(input.title) || 'urun';
    const slug = `${base}-${Date.now().toString(36)}`;

    const rows = await this.db.queryAs<{ id: string; slug: string }>(
      profileId,
      `INSERT INTO product_listings
         (slug, seller_profile_id, category, title, description, brand, model,
          size_label, color, condition, price_amount, price_currency, price_type,
          price_unit, quantity, delivery, shipping_note, country_code, region, city)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::product_condition,$11,$12,$13,$14,$15,
               $16::product_delivery,$17,$18,$19,$20)
       RETURNING id, slug`,
      [
        slug,
        profileId,
        input.category,
        input.title,
        input.description,
        input.brand ?? null,
        input.model ?? null,
        input.sizeLabel ?? null,
        input.color ?? null,
        input.condition,
        input.priceAmount ?? null,
        input.priceCurrency,
        input.priceType,
        input.priceUnit,
        input.quantity,
        input.delivery,
        input.shippingNote ?? null,
        input.countryCode,
        input.region ?? null,
        input.city ?? null,
      ],
    );

    const created = rows[0];
    if (!created) throw ApiException.forbidden('Ürün oluşturulamadı.');
    return created;
  }

  async update(profileId: string, id: string, input: UpdateProductInput): Promise<void> {
    const columns: Record<string, unknown> = {
      category: input.category,
      title: input.title,
      description: input.description,
      brand: input.brand,
      model: input.model,
      size_label: input.sizeLabel,
      color: input.color,
      condition: input.condition,
      price_amount: input.priceAmount,
      price_currency: input.priceCurrency,
      price_type: input.priceType,
      price_unit: input.priceUnit,
      quantity: input.quantity,
      delivery: input.delivery,
      shipping_note: input.shippingNote,
      region: input.region,
      city: input.city,
    };

    const entries = Object.entries(columns).filter(([, value]) => value !== undefined);
    if (entries.length === 0) return;

    const sets = entries.map(([column], index) => `${column} = $${index + 3}`);

    await this.db.queryAs(
      profileId,
      `UPDATE product_listings SET ${sets.join(', ')}
       WHERE id = $1 AND seller_profile_id = $2`,
      [id, profileId, ...entries.map(([, value]) => value)],
    );
  }

  /**
   * §5's lifecycle, for products.
   *
   * The same table the listing service uses, and refused the same way: a
   * transition that is not in it is a 409, not a silent no-op. The web had
   * exactly that bug for weeks — four verbs that appeared to work and did
   * nothing.
   */
  private static readonly TRANSITIONS: Record<string, Record<string, string>> = {
    draft: { publish: 'active' },
    active: { pause: 'paused', close: 'closed' },
    paused: { resume: 'active', close: 'closed' },
    expired: { renew: 'active' },
  };

  async transition(profileId: string, id: string, action: string): Promise<{ status: string }> {
    const rows = await this.db.queryAs<{ status: string }>(
      profileId,
      `SELECT status FROM product_listings WHERE id = $1 AND seller_profile_id = $2`,
      [id, profileId],
    );

    const current = rows[0]?.status;
    if (!current) throw ApiException.notFound('Ürün');

    const next = ProductsService.TRANSITIONS[current]?.[action];
    if (!next) {
      throw ApiException.conflict(
        `Bu ürün "${current}" durumundayken bu işlem yapılamaz.`,
        { from: current, action },
      );
    }

    await this.db.queryAs(
      profileId,
      `UPDATE product_listings
          SET status = $3::listing_status,
              published_at = CASE WHEN $3 = 'active' AND published_at IS NULL
                                  THEN now() ELSE published_at END
        WHERE id = $1 AND seller_profile_id = $2`,
      [id, profileId, next],
    );

    return { status: next };
  }

  /**
   * A product's photos, with signed URLs.
   *
   * Same shape as the horse gallery so the client can share one component, and
   * same rule: the visibility filter runs first, the URLs are issued after,
   * and the read carries the viewer's identity — a draft's photos belong to
   * its seller and an anonymous read must not resolve them.
   */
  async listMedia(id: string, viewerId: string | null): Promise<unknown[]> {
    const rows = await this.db.queryAs<{ media_id: string; sort_order: number }>(
      viewerId,
      `SELECT pm.media_id, pm.sort_order
         FROM product_media pm
         JOIN product_listings p ON p.id = pm.product_id
         JOIN media m ON m.id = pm.media_id
        WHERE pm.product_id = $1 AND m.status = 'ready'
        ORDER BY pm.sort_order`,
      [id],
    );

    const urls = await this.media.createViewUrls(
      rows.map((row) => row.media_id),
      viewerId,
    );

    return rows.map((row) => ({
      mediaId: row.media_id,
      url: urls.get(row.media_id) ?? null,
      category: 'general',
      sortOrder: row.sort_order,
      visibility: 'public',
      type: 'image',
      blurhash: null,
      width: null,
      height: null,
    }));
  }

  async attachMedia(profileId: string, id: string, mediaId: string): Promise<void> {
    await this.db.queryAs(
      profileId,
      `INSERT INTO product_media (product_id, media_id, sort_order)
       SELECT $1, $2, coalesce(max(sort_order) + 1, 0) FROM product_media WHERE product_id = $1
       ON CONFLICT DO NOTHING`,
      [id, mediaId],
    );
  }

  async removeMedia(profileId: string, id: string, mediaId: string): Promise<void> {
    await this.db.queryAs(
      profileId,
      `DELETE FROM product_media WHERE product_id = $1 AND media_id = $2`,
      [id, mediaId],
    );
  }

  async remove(profileId: string, id: string): Promise<void> {
    await this.db.queryAs(
      profileId,
      `UPDATE product_listings SET status = 'closed' WHERE id = $1 AND seller_profile_id = $2`,
      [id, profileId],
    );
  }
}
