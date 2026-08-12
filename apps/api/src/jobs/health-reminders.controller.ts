import { Controller, ForbiddenException, Headers, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'node:crypto';

import { Public } from '../common/guards/auth.guard.js';
import type { Env } from '../config/env.js';
import { HealthRemindersJob } from './health-reminders.job.js';

/**
 * Cron entry point for the §17 `health.due` reminder.
 *
 * Public in the routing sense — there is no user session behind a scheduled
 * run — but authenticated by a shared secret, because an open endpoint that
 * fans out push notifications is a spam cannon.
 */
@Controller('jobs')
export class HealthRemindersController {
  constructor(
    private readonly job: HealthRemindersJob,
    private readonly config: ConfigService<Env, true>,
  ) {}

  @Post('health-reminders')
  @Public()
  @HttpCode(HttpStatus.OK)
  async run(@Headers('x-cron-secret') secret?: string) {
    this.assertCronSecret(secret);
    return { data: await this.job.run() };
  }

  private assertCronSecret(provided?: string): void {
    const expected = this.config.get('JWT_SECRET', { infer: true });

    if (!provided || provided.length !== expected.length) {
      throw new ForbiddenException('Invalid cron secret');
    }

    if (!timingSafeEqual(Buffer.from(provided), Buffer.from(expected))) {
      throw new ForbiddenException('Invalid cron secret');
    }
  }
}
