import { z } from 'zod';

import { healthRecordType, type HealthRecordType } from './enums.js';

/**
 * Health record schemas and scheduling — spec §7, §18.2 S12, §17.
 *
 * The registry side of the product is what earns weekly retention (§1.2), and
 * the reminders are the mechanism. That makes the interval table below a
 * product surface rather than a detail: getting a farrier cycle wrong is how
 * an owner stops trusting the reminders and stops opening the app.
 */

/**
 * §18.2 S12: "next due (auto-suggested: vaccination +12 months, deworming +3,
 * farrier +6 weeks, dental +12)". Types with no natural cycle return null —
 * the field stays empty rather than inventing a follow-up date.
 */
export const DEFAULT_INTERVAL_DAYS: Partial<Record<HealthRecordType, number>> = {
  vaccination: 365,
  deworming: 91,
  farrier: 42,
  dental: 365,
};

export function suggestNextDue(
  type: HealthRecordType,
  performedOn: string,
): string | null {
  const interval = DEFAULT_INTERVAL_DAYS[type];
  if (interval === undefined) return null;

  const performed = new Date(`${performedOn}T00:00:00Z`);
  performed.setUTCDate(performed.getUTCDate() + interval);
  return performed.toISOString().slice(0, 10);
}

export const createHealthRecordSchema = z
  .object({
    type: healthRecordType,
    title: z.string().trim().min(1, 'Kayda bir başlık ver.').max(200),
    notes: z.string().trim().max(4000).optional(),
    performedOn: z.string().date(),
    /** Omit to accept the suggestion from `suggestNextDue`; null to opt out. */
    nextDueOn: z.string().date().nullish(),
    performedByProfileId: z.string().uuid().optional(),
    performedByName: z.string().trim().max(160).optional(),
    clinicName: z.string().trim().max(160).optional(),
    costAmount: z.number().nonnegative().optional(),
    costCurrency: z.string().length(3).optional(),
    documentMediaIds: z.array(z.string().uuid()).max(20).default([]),
    /** §18.2 S12: "Hassas (paylaşımda gizle)". */
    isSensitive: z.boolean().default(false),
  })
  .refine(
    (value) => !value.nextDueOn || value.nextDueOn >= value.performedOn,
    { message: 'Sonraki tarih, yapıldığı tarihten önce olamaz.', path: ['nextDueOn'] },
  )
  .refine((value) => value.performedOn <= new Date().toISOString().slice(0, 10), {
    message: 'Yapıldığı tarih gelecekte olamaz.',
    path: ['performedOn'],
  });
export type CreateHealthRecordInput = z.infer<typeof createHealthRecordSchema>;

export const updateHealthRecordSchema = z.object({
  type: healthRecordType.optional(),
  title: z.string().trim().min(1).max(200).optional(),
  notes: z.string().trim().max(4000).nullish(),
  performedOn: z.string().date().optional(),
  nextDueOn: z.string().date().nullish(),
  performedByProfileId: z.string().uuid().nullish(),
  performedByName: z.string().trim().max(160).nullish(),
  clinicName: z.string().trim().max(160).nullish(),
  costAmount: z.number().nonnegative().nullish(),
  costCurrency: z.string().length(3).nullish(),
  documentMediaIds: z.array(z.string().uuid()).max(20).optional(),
  isSensitive: z.boolean().optional(),
});

/**
 * §17: `health.due` fires 7 days before and again on the day. Both are pushes
 * on the same record, so the job needs to know which one it is sending to
 * avoid repeating itself.
 */
export const REMINDER_LEAD_DAYS = 7;

export type ReminderStage = 'lead' | 'due';

export function reminderStageFor(
  nextDueOn: string,
  today = new Date().toISOString().slice(0, 10),
): ReminderStage | null {
  const due = new Date(`${nextDueOn}T00:00:00Z`).getTime();
  const now = new Date(`${today}T00:00:00Z`).getTime();
  const daysUntil = Math.round((due - now) / 86_400_000);

  if (daysUntil === REMINDER_LEAD_DAYS) return 'lead';
  if (daysUntil === 0) return 'due';
  return null;
}

/** Turkish labels for the §18.2 S12 filter chips and the reminder copy. */
export const HEALTH_TYPE_LABEL_TR: Record<HealthRecordType, string> = {
  vaccination: 'Aşı',
  deworming: 'Paraziter ilaç',
  dental: 'Diş bakımı',
  farrier: 'Nal',
  vet_exam: 'Veteriner muayenesi',
  ppe: 'Satın alma öncesi muayene',
  surgery: 'Ameliyat',
  injury: 'Yaralanma',
  lameness: 'Topallık',
  xray: 'Röntgen',
  lab_result: 'Laboratuvar sonucu',
  medication: 'İlaç',
  other: 'Diğer',
};
