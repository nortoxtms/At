import { Injectable, Logger } from '@nestjs/common';
import {
  HEALTH_TYPE_LABEL_TR,
  REMINDER_LEAD_DAYS,
  type HealthRecordType,
  type ReminderStage,
} from '@only-horses/shared-types';

import { DatabaseService } from '../database/database.service.js';
import { NotificationsService } from '../modules/notifications/notifications.service.js';

/**
 * `health.due` reminders — spec §17, §24.6.
 *
 * "Vaccination/farrier reminders fire at 7 days and on the due date,
 * respecting quiet hours."
 *
 * Runs hourly. The hourly cadence is what makes quiet hours workable: a user
 * in a timezone where 09:00 has not yet arrived is skipped on this pass and
 * picked up on a later one, rather than being woken or missed entirely. The
 * dedupe key (migration 0022) is what keeps that from meaning twenty-four
 * pushes.
 */
@Injectable()
export class HealthRemindersJob {
  private readonly logger = new Logger(HealthRemindersJob.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly notifications: NotificationsService,
  ) {}

  async run(): Promise<{ considered: number; sent: number }> {
    // Cross-tenant by nature: no user is behind a scheduled run. Routed
    // through a SECURITY DEFINER function (migration 0023) that returns only
    // records which are actually due, and only the fields the notification
    // needs — the health file's notes and costs never leave the database.
    const candidates = await this.db.query<{
      record_id: string;
      horse_id: string;
      horse_name: string;
      owner_profile_id: string;
      type: HealthRecordType;
      title: string;
      next_due_on: string;
      days_until: number;
    }>('SELECT * FROM list_due_health_reminders($1)', [REMINDER_LEAD_DAYS]);

    let sent = 0;

    for (const candidate of candidates) {
      const stage: ReminderStage = candidate.days_until === 0 ? 'due' : 'lead';
      const label = HEALTH_TYPE_LABEL_TR[candidate.type];

      const delivered = await this.notifications.dispatch({
        profileId: candidate.owner_profile_id,
        type: 'health.due',
        // §20.7: name the thing and the horse. "Luna · aşı 7 gün içinde" is the
        // copy §18.2 S05 uses for the same reminder in the Discover feed.
        title:
          stage === 'due'
            ? `${candidate.horse_name} · ${label} bugün`
            : `${candidate.horse_name} · ${label} ${REMINDER_LEAD_DAYS} gün içinde`,
        body: candidate.title,
        data: {
          horseId: candidate.horse_id,
          recordId: candidate.record_id,
          nextDueOn: candidate.next_due_on,
          stage,
        },
        channels: ['push', 'in_app'],
        dedupeKey: `health.due:${candidate.record_id}:${stage}`,
      });

      if (delivered) sent += 1;
    }

    if (candidates.length > 0) {
      this.logger.log(`health.due — ${sent} sent of ${candidates.length} due`);
    }

    return { considered: candidates.length, sent };
  }
}
