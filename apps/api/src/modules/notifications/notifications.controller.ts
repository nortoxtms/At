import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query } from '@nestjs/common';
import { z } from 'zod';

import { CurrentProfileId } from '../../common/guards/auth.guard.js';
import { zodBody } from '../../common/pipes/zod-validation.pipe.js';
import { DatabaseService } from '../../database/database.service.js';

const registerDeviceSchema = z.object({
  token: z.string().min(8).max(512),
  platform: z.enum(['ios', 'android', 'web']),
  appVersion: z.string().max(32).optional(),
});

const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(30),
  unreadOnly: z.coerce.boolean().default(false),
});

/** Spec §12 "notifications" and "devices" (§18.2 S30). */
@Controller()
export class NotificationsController {
  constructor(private readonly db: DatabaseService) {}

  @Get('notifications')
  async list(
    @CurrentProfileId() profileId: string,
    @Query() query: Record<string, string>,
  ) {
    const { limit, unreadOnly } = listQuerySchema.parse(query);

    const rows = await this.db.queryAs<{
      id: string;
      type: string;
      title: string;
      body: string | null;
      data: Record<string, unknown>;
      read_at: Date | null;
      created_at: Date;
    }>(
      profileId,
      `SELECT id, type, title, body, data, read_at, created_at
       FROM notifications
       WHERE profile_id = $1 AND ($2 = FALSE OR read_at IS NULL)
       ORDER BY created_at DESC
       LIMIT $3`,
      [profileId, unreadOnly, limit],
    );

    return {
      data: rows.map((row) => ({
        id: row.id,
        type: row.type,
        title: row.title,
        body: row.body,
        data: row.data,
        readAt: row.read_at,
        createdAt: row.created_at,
      })),
    };
  }

  @Post('notifications/read-all')
  @HttpCode(HttpStatus.NO_CONTENT)
  async readAll(@CurrentProfileId() profileId: string): Promise<void> {
    await this.db.queryAs(
      profileId,
      `UPDATE notifications SET read_at = now()
       WHERE profile_id = $1 AND read_at IS NULL`,
      [profileId],
    );
  }

  @Post('devices')
  @HttpCode(HttpStatus.CREATED)
  async registerDevice(
    @CurrentProfileId() profileId: string,
    @Body(zodBody(registerDeviceSchema)) body: z.infer<typeof registerDeviceSchema>,
  ) {
    // A device token moves with the device, not the account: reinstalling or
    // signing in as someone else must reassign it, or the previous user keeps
    // receiving pushes on a phone that is no longer theirs.
    await this.db.queryAs(
      profileId,
      `INSERT INTO device_tokens (profile_id, token, platform, app_version)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (token) DO UPDATE
         SET profile_id = EXCLUDED.profile_id,
             platform = EXCLUDED.platform,
             app_version = EXCLUDED.app_version,
             last_seen_at = now()`,
      [profileId, body.token, body.platform, body.appVersion ?? null],
    );

    return { data: { registered: true } };
  }
}
