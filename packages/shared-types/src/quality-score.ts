import type { FieldVisibility, MediaCategory, VerificationLevel, PriceType } from './enums.js';
import { meetsVerification } from './enums.js';

/**
 * Listing quality score — spec §13.2.
 *
 * Lives in shared-types on purpose. §18.2 S13 step 7 shows the seller a live
 * quality meter with concrete suggestions ("Tırıs videosu ekle +5") *before*
 * publishing, while §13.1 uses the same number server-side to decide whether a
 * listing auto-approves at >= 60. If the two implementations ever disagreed,
 * the wizard would promise an approval the API then withholds. One function,
 * both callers.
 */

export interface QualityScoreInput {
  photoCount: number;
  videoCount: number;
  /** Categories assigned to the listing's videos (§18.2 S10 step 5). */
  videoCategories: MediaCategory[];
  descriptionLength: number;
  hasXray: boolean;
  horse: {
    heightCm: number | null;
    breedId: string | null;
    dateOfBirth: string | null;
    birthYearEstimated: boolean;
    color: string | null;
    disciplines: string[];
    visibilityHealth: FieldVisibility;
  };
  sellerVerification: VerificationLevel;
  priceType: PriceType;
}

export interface QualityComponent {
  key: string;
  points: number;
  earned: boolean;
  /** Turkish copy for the S13 quality meter. §20.7: name the action. */
  suggestion: string;
}

export interface QualityScoreResult {
  score: number;
  components: QualityComponent[];
  /** Unearned components, richest first — what the meter lists (§18.2 S13). */
  suggestions: QualityComponent[];
}

/** The §13.2 table, in order. Sums to exactly 100. */
export function computeQualityScore(input: QualityScoreInput): QualityScoreResult {
  const { horse } = input;
  const categories = new Set(input.videoCategories);

  const components: QualityComponent[] = [
    {
      key: 'photos_3',
      points: 15,
      earned: input.photoCount >= 3,
      suggestion: 'En az 3 fotoğraf ekle',
    },
    {
      key: 'photos_8',
      points: 10,
      earned: input.photoCount >= 8,
      suggestion: 'Fotoğraf sayısını 8’e çıkar',
    },
    {
      key: 'video',
      points: 20,
      earned: input.videoCount >= 1,
      suggestion: 'Video ekle',
    },
    {
      key: 'video_gaits',
      points: 5,
      earned: categories.has('trot') && categories.has('canter'),
      suggestion: 'Tırıs ve dörtnal videosu ekle',
    },
    {
      key: 'description',
      points: 10,
      earned: input.descriptionLength >= 300,
      suggestion: 'Açıklamayı 300 karaktere çıkar',
    },
    {
      key: 'core_fields',
      points: 10,
      earned:
        horse.heightCm !== null &&
        horse.breedId !== null &&
        horse.dateOfBirth !== null &&
        horse.color !== null,
      suggestion: 'Boy, ırk, doğum tarihi ve rengi doldur',
    },
    {
      key: 'disciplines',
      points: 5,
      earned: horse.disciplines.length >= 1,
      suggestion: 'En az bir disiplin seç',
    },
    {
      key: 'health_shared',
      points: 10,
      earned: horse.visibilityHealth !== 'private',
      suggestion: 'Sağlık kayıtlarını herkese açık veya istek üzerine yap',
    },
    {
      key: 'xray',
      points: 5,
      earned: input.hasXray,
      suggestion: 'Röntgen görüntülerini ekle',
    },
    {
      key: 'identity_verified',
      points: 5,
      earned: meetsVerification(input.sellerVerification, 'identity_verified'),
      suggestion: 'Kimliğini doğrula',
    },
    {
      key: 'price_visible',
      points: 5,
      earned: input.priceType !== 'on_request',
      suggestion: 'Fiyat belirt',
    },
  ];

  const score = components.reduce((total, c) => total + (c.earned ? c.points : 0), 0);

  return {
    score,
    components,
    suggestions: components.filter((c) => !c.earned).sort((a, b) => b.points - a.points),
  };
}

/** §13.1: auto-approve at or above this, otherwise queue for review. */
export const AUTO_APPROVE_THRESHOLD = 60;

/** §10.3: a sale listing needs a video to clear this bar. */
export const GOOD_LISTING_THRESHOLD = 70;
