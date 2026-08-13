import { Controller, ForbiddenException, Headers, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'node:crypto';

import { Public } from '../common/guards/auth.guard.js';
import type { Env } from '../config/env.js';
import { MarketplaceSweepsJob } from './marketplace-sweeps.job.js';
import { SavedSearchAlertsJob } from './saved-search-alerts.job.js';

/** Cron entry point for the hourly sweep. Same shared-secret rule as §17's reminders. */
@Controller('jobs')
export class MarketplaceSweepsController {
  constructor(
    private readonly job: MarketplaceSweepsJob,
    private readonly savedSearches: SavedSearchAlertsJob,
    private readonly config: ConfigService<Env, true>,
  ) {}

  @Post('marketplace-sweeps')
  @Public()
  @HttpCode(HttpStatus.OK)
  async run(@Headers('x-cron-secret') secret?: string) {
    this.assertCronSecret(secret);
    return { data: await this.job.run() };
  }

  /**
   * §24.5's five-minute budget. Scheduled every two minutes rather than every
   * five: the criterion is measured from *publish* to *push*, so the interval
   * has to leave room for the run itself.
   */
  @Post('saved-search-alerts')
  @Public()
  @HttpCode(HttpStatus.OK)
  async savedSearchAlerts(@Headers('x-cron-secret') secret?: string) {
    this.assertCronSecret(secret);
    return { data: await this.savedSearches.run() };
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
