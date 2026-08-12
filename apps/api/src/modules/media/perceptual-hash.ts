import sharp from 'sharp';

/**
 * Perceptual hashing — spec §10.1 step 5, §14.2 `phash_duplicate_other_owner`.
 *
 * The point is §24.7: "Uploading a photo already used by a different account's
 * listing puts the new listing into pending_review and creates a moderation
 * case." Stolen photography is the most common horse-sale scam, so this has to
 * survive a re-encode, a resize and a light crop — a cryptographic hash of the
 * bytes would not.
 *
 * DCT-based pHash: reduce to 32×32 greyscale, take the 2-D DCT, keep the
 * low-frequency 8×8 block (which carries structure rather than detail), and
 * threshold each coefficient against the median. Distance is Hamming.
 */

const SAMPLE_SIZE = 32;
const HASH_SIZE = 8;

/** Precomputed DCT-II basis: cos((2x+1)·u·π / 2N). */
const COS_TABLE: number[][] = Array.from({ length: SAMPLE_SIZE }, (_, x) =>
  Array.from({ length: SAMPLE_SIZE }, (_, u) =>
    Math.cos(((2 * x + 1) * u * Math.PI) / (2 * SAMPLE_SIZE)),
  ),
);

function dct2d(pixels: number[][]): number[][] {
  const rows: number[][] = [];

  // Separable transform: rows first, then columns. O(N³) instead of O(N⁴).
  for (let y = 0; y < SAMPLE_SIZE; y += 1) {
    const row = new Array<number>(SAMPLE_SIZE).fill(0);
    for (let u = 0; u < SAMPLE_SIZE; u += 1) {
      let sum = 0;
      for (let x = 0; x < SAMPLE_SIZE; x += 1) {
        sum += pixels[y]![x]! * COS_TABLE[x]![u]!;
      }
      row[u] = sum * (u === 0 ? Math.SQRT1_2 : 1);
    }
    rows.push(row);
  }

  const result: number[][] = [];
  for (let u = 0; u < SAMPLE_SIZE; u += 1) {
    const column = new Array<number>(SAMPLE_SIZE).fill(0);
    for (let v = 0; v < SAMPLE_SIZE; v += 1) {
      let sum = 0;
      for (let y = 0; y < SAMPLE_SIZE; y += 1) {
        sum += rows[y]![u]! * COS_TABLE[y]![v]!;
      }
      column[v] = sum * (v === 0 ? Math.SQRT1_2 : 1);
    }
    result.push(column);
  }

  // result[u][v]: u indexes horizontal frequency, v vertical.
  return result;
}

export async function computePerceptualHash(image: Buffer): Promise<string> {
  const { data } = await sharp(image)
    .greyscale()
    .resize(SAMPLE_SIZE, SAMPLE_SIZE, { fit: 'fill' })
    .raw()
    .toBuffer({ resolveWithObject: true });

  const pixels: number[][] = [];
  for (let y = 0; y < SAMPLE_SIZE; y += 1) {
    const row: number[] = [];
    for (let x = 0; x < SAMPLE_SIZE; x += 1) {
      row.push(data[y * SAMPLE_SIZE + x]!);
    }
    pixels.push(row);
  }

  const dct = dct2d(pixels);

  const lowFrequency: number[] = [];
  for (let v = 0; v < HASH_SIZE; v += 1) {
    for (let u = 0; u < HASH_SIZE; u += 1) {
      lowFrequency.push(dct[u]![v]!);
    }
  }

  // The DC term encodes overall brightness, not structure. Including it in the
  // median would make every dark photo hash alike.
  const withoutDc = lowFrequency.slice(1);
  const sorted = [...withoutDc].sort((a, b) => a - b);
  const median = (sorted[Math.floor(sorted.length / 2) - 1]! + sorted[Math.floor(sorted.length / 2)]!) / 2;

  let hash = '';
  for (let index = 0; index < lowFrequency.length; index += 4) {
    let nibble = 0;
    for (let bit = 0; bit < 4; bit += 1) {
      if ((lowFrequency[index + bit] ?? 0) > median) nibble |= 1 << (3 - bit);
    }
    hash += nibble.toString(16);
  }

  return hash;
}

/** Hamming distance between two hex pHashes. Compared to IMAGE_HASH_THRESHOLD. */
export function hammingDistance(a: string, b: string): number {
  if (a.length !== b.length) return Number.MAX_SAFE_INTEGER;

  let distance = 0;
  for (let index = 0; index < a.length; index += 1) {
    const difference = parseInt(a[index]!, 16) ^ parseInt(b[index]!, 16);
    distance += ((difference >> 3) & 1) + ((difference >> 2) & 1) + ((difference >> 1) & 1) + (difference & 1);
  }
  return distance;
}
