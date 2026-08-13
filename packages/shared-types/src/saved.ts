import { z } from 'zod';

import { notificationChannel } from './enums.js';

/**
 * Saved items and saved searches — spec §7, §12, §18.2 S29, §24.5.
 *
 * §24.5 is the reason saved searches are not a convenience feature: "a saved
 * search produces a push notification within 5 minutes of a matching listing
 * being published". That makes the stored query an executable object, which is
 * why §11's search schema was written as a shared zod object in the first
 * place — `saved_searches.query` is literally a `ListingSearchQuery` persisted,
 * so any filter the search API gains becomes alertable with no migration.
 */

export const savedItemType = z.enum([
  'listing',
  'service',
  'job',
  'profile',
  'organization',
  'horse',
]);
export type SavedItemType = z.infer<typeof savedItemType>;

export const saveItemSchema = z.object({
  itemType: savedItemType,
  itemId: z.string().uuid(),
  /** §18.2 S29 lets a buyer annotate what they saved. */
  note: z.string().trim().max(500).optional(),
});
export type SaveItemInput = z.infer<typeof saveItemSchema>;

export const savedSearchEntity = z.enum(['listings', 'services', 'jobs']);
export type SavedSearchEntity = z.infer<typeof savedSearchEntity>;

/** §17: batched per frequency; `off` keeps the search without the alerts. */
export const alertFrequency = z.enum(['instant', 'daily', 'weekly', 'off']);
export type AlertFrequency = z.infer<typeof alertFrequency>;

export const saveSearchSchema = z.object({
  name: z.string().trim().min(2, 'Aramaya bir ad ver.').max(80),
  entity: savedSearchEntity.default('listings'),
  /** The search query itself, stored verbatim and re-parsed when it runs. */
  query: z.record(z.string(), z.unknown()),
  alertChannel: z.array(notificationChannel).default(['push']),
  alertFrequency: alertFrequency.default('instant'),
});
export type SaveSearchInput = z.infer<typeof saveSearchSchema>;

export const updateSavedSearchSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  alertChannel: z.array(notificationChannel).optional(),
  alertFrequency: alertFrequency.optional(),
});
export type UpdateSavedSearchInput = z.infer<typeof updateSavedSearchSchema>;

/**
 * How often each frequency may notify.
 *
 * `instant` is not "the moment it happens" — it is "as soon as the next sweep
 * runs", and §24.5 sets that sweep's budget at five minutes. Naming the
 * interval here keeps the cron schedule and the acceptance criterion in one
 * place instead of in a scheduler config nobody reads.
 */
export const ALERT_INTERVAL_MINUTES: Record<AlertFrequency, number | null> = {
  instant: 5,
  daily: 24 * 60,
  weekly: 7 * 24 * 60,
  off: null,
};

/** §24.5's budget, so the test and the scheduler agree on the number. */
export const SAVED_SEARCH_ALERT_BUDGET_MINUTES = 5;

export function isAlertDue(
  frequency: AlertFrequency,
  lastRunAt: string | null,
  now: Date = new Date(),
): boolean {
  const interval = ALERT_INTERVAL_MINUTES[frequency];
  if (interval === null) return false;
  if (!lastRunAt) return true;

  return now.getTime() - new Date(lastRunAt).getTime() >= interval * 60 * 1000;
}

export interface SavedSearchMatch {
  savedSearchId: string;
  name: string;
  entity: SavedSearchEntity;
  newMatches: number;
  /** The newest match, for the notification body. */
  sampleTitle: string | null;
  sampleId: string | null;
}
