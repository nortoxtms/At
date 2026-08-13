import { z } from 'zod';

import { fieldVisibility, horseSex, mediaCategory } from './enums.js';

/**
 * Horse schemas — spec §7, §18.2 S10 (the six-step wizard).
 *
 * Shared so the wizard validates each step against the same rules the API
 * enforces on save. §18.2 S10 autosaves a draft after every step, which means
 * every field has to be optional at rest and only required at publish time
 * (§13.1) — a half-filled draft is a normal state, not an error.
 */

/** §9.4: height is stored in cm always, whatever the user's unit preference. */
export const heightCm = z
  .number()
  .min(50, 'Boy 50 cm’den küçük olamaz.')
  .max(220, 'Boy 220 cm’den büyük olamaz.');

/**
 * §7 makes microchip and UELN globally unique. Normalising them here means a
 * chip typed with spaces still collides with the same chip typed without, so
 * the "this horse is already registered — are you transferring ownership?"
 * prompt in S10 step 1 actually fires.
 */
export const microchipNumber = z
  .string()
  .trim()
  .transform((value) => value.replace(/[\s-]/g, ''))
  .pipe(
    z
      .string()
      .regex(/^\d{15}$/, 'Mikroçip numarası 15 haneli olmalı.')
      .or(z.literal('')),
  );

export const ueln = z
  .string()
  .trim()
  .toUpperCase()
  .transform((value) => value.replace(/\s/g, ''))
  .pipe(
    z
      .string()
      .regex(/^[A-Z0-9]{15}$/, 'UELN 15 karakter olmalı.')
      .or(z.literal('')),
  );

export const createHorseSchema = z.object({
  // Step 1 — Kimlik
  name: z.string().trim().min(1, 'Atın adını gir.').max(120),
  stableName: z.string().trim().max(120).optional(),
  sex: horseSex,
  dateOfBirth: z.string().date().optional(),
  birthYearEstimated: z.boolean().default(false),
  microchipNumber: microchipNumber.optional(),
  ueln: ueln.optional(),
  passportNumber: z.string().trim().max(60).optional(),
  passportIssuer: z.string().trim().max(120).optional(),

  // Step 2 — Özellikler
  breedId: z.string().max(60).optional(),
  breedSecondaryId: z.string().max(60).optional(),
  color: z.string().trim().max(60).optional(),
  markings: z.string().trim().max(400).optional(),
  heightCm: heightCm.optional(),
  weightKg: z.number().min(20).max(1500).optional(),

  // Step 3 — Konum
  stabledAtOrgId: z.string().uuid().optional(),
  currentCountry: z.string().length(2).optional(),
  currentRegion: z.string().trim().max(120).optional(),
  currentCity: z.string().trim().max(120).optional(),
  locationPrecision: z.enum(['exact', 'city', 'region']).default('city'),

  // Step 4 — Eğitim & mizaç
  disciplines: z.array(z.string().max(60)).max(12).default([]),
  trainingLevel: z.string().trim().max(60).optional(),
  // §18.2 S10: slider 1–10, labelled Sakin ↔ Hassas.
  temperamentScore: z.number().int().min(1).max(10).optional(),
  riderLevelMin: z.string().trim().max(60).optional(),
  about: z.string().trim().max(4000).optional(),
  trainingNotes: z.string().trim().max(4000).optional(),
  temperamentNotes: z.string().trim().max(4000).optional(),

  // Step 6 — Soy
  sireHorseId: z.string().uuid().optional(),
  damHorseId: z.string().uuid().optional(),
  sireNameText: z.string().trim().max(120).optional(),
  damNameText: z.string().trim().max(120).optional(),

  // §2 field visibility contract. Health defaults to on_request: private by
  // default (P3), but discoverable enough that a serious buyer can ask.
  visibilityHealth: fieldVisibility.default('on_request'),
  visibilityPedigree: fieldVisibility.default('public'),
  visibilityDocuments: fieldVisibility.default('on_request'),
  visibilityLocation: fieldVisibility.default('public'),

  ownerOrgId: z.string().uuid().optional(),
});
export type CreateHorseInput = z.infer<typeof createHorseSchema>;

export const updateHorseSchema = createHorseSchema.partial();
export type UpdateHorseInput = z.infer<typeof updateHorseSchema>;

export const attachHorseMediaSchema = z.object({
  mediaId: z.string().uuid(),
  category: mediaCategory.default('general'),
  sortOrder: z.number().int().min(0).max(200).default(0),
  visibility: fieldVisibility.default('public'),
});

export const reorderHorseMediaSchema = z.object({
  order: z.array(z.string().uuid()).min(1),
});

/** §12 POST /horses/:id/transfer. */
export const transferHorseSchema = z
  .object({
    toProfileId: z.string().uuid().optional(),
    toEmail: z.string().email().optional(),
    price: z.number().nonnegative().optional(),
    currency: z.string().length(3).optional(),
    date: z.string().date().optional(),
    pricePublic: z.boolean().default(false),
  })
  .refine((value) => Boolean(value.toProfileId ?? value.toEmail), {
    message: 'Devredilecek kişiyi seç.',
    path: ['toProfileId'],
  });
export type TransferHorseInput = z.infer<typeof transferHorseSchema>;

/**
 * §18.2 S10 step 1: a horse whose microchip is already registered is a
 * transfer, not a duplicate. The API returns this so the wizard can offer the
 * transfer flow instead of a dead-end error.
 */
export interface MicrochipConflict {
  conflict: 'microchip' | 'ueln';
  horseId: string;
  horseName: string;
  ownerDisplayName: string | null;
}

/**
 * §12 POST /horses/:id/competitions — §18.2 S11's results section.
 *
 * A result may name a rider who has no account (`riderName`), because most
 * competition records predate the platform. Either the id or the text, and
 * neither is required: plenty of results are just "the horse placed".
 */
export const competitionSchema = z.object({
  eventDate: z.string().date(),
  eventName: z.string().trim().min(2).max(160),
  discipline: z.string().trim().max(60).optional(),
  className: z.string().trim().max(120).optional(),
  level: z.string().trim().max(60).optional(),
  placing: z.number().int().min(1).max(999).optional(),
  score: z.number().min(0).max(1000).optional(),
  location: z.string().trim().max(160).optional(),
  riderProfileId: z.string().uuid().optional(),
  riderName: z.string().trim().max(160).optional(),
  proofMediaId: z.string().uuid().optional(),
});
export type CompetitionInput = z.infer<typeof competitionSchema>;
