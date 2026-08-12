import { Inject, Injectable, Logger } from '@nestjs/common';
import type { NotificationChannel } from '@only-horses/shared-types';

import { DatabaseService } from '../../database/database.service.js';
import { PUSH_PROVIDER, type PushProvider } from './push.provider.js';

/**
 * Notification dispatch — spec §17.
 *
 * Two rules shape everything here, and both are about not becoming noise:
 * preferences are per type × channel, and quiet hours are honoured in the
 * user's own timezone. §24.6 states the reminders must fire "respecting quiet
 * hours", so the check is part of dispatch rather than a client concern.
 */

export interface NotificationInput {
  profileId: string;
  type: string;
  title: string;
  body?: string;
  data?: Record<string, unknown>;
  channels: NotificationChannel[];
  /** Set when the notification must fire at most once (migration 0022). */
  dedupeKey?: string;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly db: DatabaseService,
    @Inject(PUSH_PROVIDER) private readonly push: PushProvider,
  ) {}

  /**
   * Returns false when the notification was suppressed — already sent, or
   * turned off by the recipient. The caller uses that to keep counters honest.
   */
  async dispatch(input: NotificationInput): Promise<boolean> {
    const preferences = await this.loadPreferences(input.profileId);

    const allowed = input.channels.filter((channel) =>
      this.isChannelEnabled(preferences.prefs, input.type, channel),
    );

    if (allowed.length === 0) return false;

    // The in-app row is written first and is what makes the send idempotent:
    // a conflict means this reminder already went out.
    // Scoped as the recipient: the row is theirs, and the §8 policy on
    // `notifications` keys off auth.uid(). The job has no session of its own,
    // so it borrows the recipient's identity for exactly this write.
    const inserted = await this.db.queryAs<{ id: string }>(
      input.profileId,
      `INSERT INTO notifications (profile_id, type, title, body, data, dedupe_key)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (profile_id, dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING
       RETURNING id`,
      [
        input.profileId,
        input.type,
        input.title,
        input.body ?? null,
        JSON.stringify(input.data ?? {}),
        input.dedupeKey ?? null,
      ],
    );

    if (inserted.length === 0) return false;

    if (allowed.includes('push')) {
      if (this.isQuietHour(preferences)) {
        // Held rather than dropped: the in-app row already exists, so the user
        // sees it when they next open the app, and the push is not re-sent
        // later — a reminder that arrives at 3am has already failed.
        this.logger.debug(
          `Suppressed push for ${input.type} to ${input.profileId} during quiet hours`,
        );
      } else {
        await this.sendPush(input);
      }
    }

    return true;
  }

  private async sendPush(input: NotificationInput): Promise<void> {
    const tokens = await this.db.queryAs<{ token: string; platform: string }>(
      input.profileId,
      `SELECT token, platform FROM device_tokens WHERE profile_id = $1`,
      [input.profileId],
    );

    if (tokens.length === 0) return;

    const stale = await this.push.send({
      tokens: tokens.map((row) => row.token),
      title: input.title,
      body: input.body ?? '',
      data: { type: input.type, ...(input.data ?? {}) },
    });

    // A token the provider rejected will never work again; leaving it behind
    // makes every future send look partially failed.
    if (stale.length > 0) {
      await this.db.queryAs(input.profileId, `DELETE FROM device_tokens WHERE token = ANY($1)`, [
        stale,
      ]);
    }
  }

  private async loadPreferences(profileId: string): Promise<{
    prefs: Record<string, Record<string, boolean>>;
    quietStart: number | null;
    quietEnd: number | null;
    timezone: string;
  }> {
    const rows = await this.db.queryAs<{
      prefs: Record<string, Record<string, boolean>>;
      quiet_hours_start: number | null;
      quiet_hours_end: number | null;
      timezone: string;
    }>(
      profileId,
      `SELECT prefs, quiet_hours_start, quiet_hours_end, timezone
       FROM notification_preferences WHERE profile_id = $1`,
      [profileId],
    );

    const row = rows[0];
    return {
      prefs: row?.prefs ?? {},
      quietStart: row?.quiet_hours_start ?? null,
      quietEnd: row?.quiet_hours_end ?? null,
      timezone: row?.timezone ?? 'Europe/Istanbul',
    };
  }

  /**
   * Opt-out rather than opt-in: an empty preference object means the defaults
   * in §17 apply. A new user who has never opened settings should still get
   * the reminder they signed up for.
   */
  private isChannelEnabled(
    prefs: Record<string, Record<string, boolean>>,
    type: string,
    channel: NotificationChannel,
  ): boolean {
    return prefs[type]?.[channel] ?? true;
  }

  private isQuietHour(preferences: {
    quietStart: number | null;
    quietEnd: number | null;
    timezone: string;
  }): boolean {
    const { quietStart, quietEnd, timezone } = preferences;
    if (quietStart === null || quietEnd === null) return false;

    const hour = Number(
      new Intl.DateTimeFormat('en-GB', {
        hour: 'numeric',
        hour12: false,
        timeZone: timezone,
      }).format(new Date()),
    );

    // A window like 22:00–07:00 wraps past midnight, which is the common case.
    return quietStart <= quietEnd
      ? hour >= quietStart && hour < quietEnd
      : hour >= quietStart || hour < quietEnd;
  }
}
