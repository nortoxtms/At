import { z } from 'zod';

/**
 * The equestrian market that is not a horse — spec §13 extended.
 *
 * Everything else on this platform is an animal, a person or a piece of work.
 * This is the objects: a saddle, a rug, a trailer, fifty metres of fencing, a
 * ton of hay. It is most of what actually changes hands in a yard, and until
 * now none of it had anywhere to go.
 *
 * Deliberately *not* modelled as a `listing_type` on `listings`. §1.3 P1 makes
 * a listing a view of a horse record — `horse_id` is required and the whole §8
 * visibility system hangs off it. A bit has no pedigree.
 */

export const productCondition = z.enum(['new', 'like_new', 'good', 'used', 'for_parts']);
export type ProductCondition = z.infer<typeof productCondition>;

export const productDelivery = z.enum(['pickup', 'shipping', 'both']);
export type ProductDelivery = z.infer<typeof productDelivery>;

/**
 * Feed and fencing are not sold by the item.
 *
 * A number without its unit is how a season's hay gets quoted as one bale, and
 * how a buyer drives two hours for a tenth of what they expected.
 */
export const productPriceUnit = z.enum([
  'item',
  'kg',
  'ton',
  'bale',
  'sack',
  'metre',
  'set',
  'pair',
]);
export type ProductPriceUnit = z.infer<typeof productPriceUnit>;

export const createProductSchema = z.object({
  category: z.string().min(2).max(60),
  title: z.string().trim().min(4, 'Başlık en az 4 karakter olmalı.').max(140),
  description: z.string().trim().min(20, 'Ürünü biraz anlat — en az 20 karakter.').max(8000),

  brand: z.string().trim().max(80).optional(),
  model: z.string().trim().max(80).optional(),
  /** Free text: 17.5", 145 cm, 41 numara. One numeric column cannot hold it. */
  sizeLabel: z.string().trim().max(60).optional(),
  color: z.string().trim().max(60).optional(),
  condition: productCondition.default('good'),

  priceAmount: z.number().nonnegative().max(99_999_999).optional(),
  priceCurrency: z.string().length(3).default('TRY'),
  priceType: z
    .enum(['fixed', 'negotiable', 'on_request', 'auction_reserve', 'free'])
    .default('fixed'),
  priceUnit: productPriceUnit.default('item'),
  quantity: z.number().int().min(1).max(100_000).default(1),

  delivery: productDelivery.default('pickup'),
  shippingNote: z.string().trim().max(400).optional(),

  countryCode: z.string().length(2),
  region: z.string().trim().max(120).optional(),
  city: z.string().trim().max(120).optional(),
});
export type CreateProductInput = z.infer<typeof createProductSchema>;

export const updateProductSchema = createProductSchema.partial();
export type UpdateProductInput = z.infer<typeof updateProductSchema>;

/** §11's query, for the product collection. */
export const productSearchSchema = z.object({
  q: z.string().trim().max(120).optional(),
  category: z.string().max(60).optional(),
  condition: productCondition.optional(),
  delivery: productDelivery.optional(),
  brand: z.string().trim().max(80).optional(),
  region: z.string().trim().max(120).optional(),
  minPrice: z.coerce.number().nonnegative().optional(),
  maxPrice: z.coerce.number().nonnegative().optional(),
  sort: z.enum(['newest', 'price_asc', 'price_desc']).default('newest'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(24),
});
export type ProductSearchInput = z.infer<typeof productSearchSchema>;

export interface ProductSearchHit {
  id: string;
  slug: string;
  title: string;
  category: string;
  categoryName: string | null;
  parentCategory: string | null;
  brand: string | null;
  model: string | null;
  sizeLabel: string | null;
  condition: string;
  priceAmount: number | null;
  priceCurrency: string;
  priceType: string;
  priceUnit: string | null;
  quantity: number;
  delivery: string;
  countryCode: string;
  region: string | null;
  city: string | null;
  sellerHandle: string;
  sellerName: string;
  sellerVerification: string;
  sellerTrustScore: number;
  coverImage: string | null;
  isBoosted: boolean;
  publishedAt: string | null;
}

export interface ProductDetail extends ProductSearchHit {
  description: string;
  shippingNote: string | null;
  color: string | null;
  status: string;
  viewCount: number;
  sellerProfileId: string;
  images: string[];
}

export const PRODUCT_CONDITION_LABEL_TR: Record<string, string> = {
  new: 'Sıfır',
  like_new: 'Sıfır ayarında',
  good: 'İyi',
  used: 'Kullanılmış',
  for_parts: 'Parça / tamir',
};

export const PRODUCT_DELIVERY_LABEL_TR: Record<string, string> = {
  pickup: 'Elden teslim',
  shipping: 'Kargo',
  both: 'Elden teslim veya kargo',
};

export const PRODUCT_PRICE_UNIT_LABEL_TR: Record<string, string> = {
  item: 'adet',
  kg: 'kg',
  ton: 'ton',
  bale: 'balya',
  sack: 'çuval',
  metre: 'metre',
  set: 'takım',
  pair: 'çift',
};
