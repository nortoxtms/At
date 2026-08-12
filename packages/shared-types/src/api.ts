import { z } from 'zod';

/** Response envelope and error contract — spec §12. */

export const paginationMeta = z.object({
  page: z.number().int().positive(),
  limit: z.number().int().positive(),
  total: z.number().int().nonnegative(),
  hasMore: z.boolean(),
});
export type PaginationMeta = z.infer<typeof paginationMeta>;

export interface ListEnvelope<T> {
  data: T[];
  meta: PaginationMeta;
}

export interface ItemEnvelope<T> {
  data: T;
}

/** The §12 error codes. Clients switch on `code`, never on the message. */
export const ERROR_CODES = [
  'VALIDATION_ERROR',
  'NOT_FOUND',
  'FORBIDDEN',
  'UNAUTHORIZED',
  'CONFLICT',
  'RATE_LIMITED',
  'VERIFICATION_REQUIRED',
  'LIMIT_EXCEEDED',
  'PAYMENT_REQUIRED',
  'PROHIBITED_CONTENT',
  'INTERNAL_ERROR',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export interface ApiError {
  error: {
    code: ErrorCode;
    message: string;
    details?: unknown;
    requestId: string;
  };
}

export const listQuery = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  sort: z.string().optional(),
});
export type ListQuery = z.infer<typeof listQuery>;

/**
 * §14.2 `contact_info_in_description`: emails, phone numbers and messaging
 * handles are stripped from listing text and the seller is warned. Contact
 * details are only ever revealed through the profile, after identity
 * verification (§14.3) — putting them in the body would route buyers around
 * that gate.
 */
export const CONTACT_PATTERNS: RegExp[] = [
  /[\w.+-]+@[\w-]+\.[\w.]{2,}/gi,
  /(?:\+?\d[\d\s().-]{7,}\d)/g,
  /\b(?:whatsapp|whats app|wpp|telegram|instagram|insta|signal|viber|imo)\b[\s:@]*[\w.+-]*/gi,
  /\b(?:t\.me|wa\.me|ig\.me)\/\S+/gi,
];

export function findContactInfo(text: string): string[] {
  const hits: string[] = [];
  for (const pattern of CONTACT_PATTERNS) {
    // Fresh lastIndex per call: these are module-level /g regexes.
    pattern.lastIndex = 0;
    hits.push(...(text.match(pattern) ?? []));
  }
  return hits;
}

export function stripContactInfo(text: string): string {
  return CONTACT_PATTERNS.reduce(
    (acc, pattern) => acc.replace(pattern, '[gizlendi]'),
    text,
  );
}

/**
 * §14.2 `offsite_payment_language`: shown inline to the buyer as a warning,
 * and flags the thread. Detection is deliberately broad — a false positive
 * costs a dismissible banner, a false negative costs someone their money.
 */
export const OFFSITE_PAYMENT_PATTERNS: RegExp[] = [
  /\b(?:western union|moneygram|money gram)\b/gi,
  /\b(?:bitcoin|btc|usdt|crypto|kripto)\b/gi,
  /\b(?:kapora|depozito|deposit|ön ödeme|onodeme|peşinat)\b/gi,
  /\b(?:iban)\b.{0,40}\b[A-Z]{2}\d{2}[\dA-Z]{10,}/gi,
  /\bgörmeden\s+(?:öde|kapora|transfer)/gi,
];

export function detectOffsitePaymentLanguage(text: string): boolean {
  return OFFSITE_PAYMENT_PATTERNS.some((pattern) => {
    pattern.lastIndex = 0;
    return pattern.test(text);
  });
}
