import { Controller, Get, Post, Query, UseGuards, Headers, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { listingSearchSchema } from '@only-horses/shared-types';
import { timingSafeEqual } from 'node:crypto';

import { Public } from '../../common/guards/auth.guard.js';
import { RateLimit, RateLimitGuard } from '../../common/guards/rate-limit.guard.js';
import type { Env } from '../../config/env.js';
import { SearchIndexerService } from './search-indexer.service.js';
import { SEARCH_PROVIDER, type SearchProvider } from './search.provider.js';
import { Inject } from '@nestjs/common';

/** Spec §12 "GET /listings/search". Public: §1.3 P6 makes the web the funnel. */
@Controller()
@UseGuards(RateLimitGuard)
export class SearchController {
  constructor(
    @Inject(SEARCH_PROVIDER) private readonly search: SearchProvider,
    private readonly indexer: SearchIndexerService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  @Get('listings/search')
  @Public()
  @RateLimit({ limit: 120, windowSeconds: 60, per: 'profile' })
  async searchListings(@Query() rawQuery: Record<string, unknown>) {
    const query = listingSearchSchema.parse(normalizeArrays(rawQuery));
    const result = await this.search.searchListings(query);

    return {
      data: result.hits,
      meta: {
        page: result.page,
        limit: result.limit,
        total: result.found,
        hasMore: result.page * result.limit < result.found,
        facets: result.facets,
        tookMs: result.tookMs,
      },
    };
  }

  /** §11.4 outbox drain, invoked by Cloud Scheduler. */
  @Post('jobs/search-sync')
  @Public()
  async sync(@Headers('x-cron-secret') secret?: string) {
    this.assertCronSecret(secret);
    return { data: await this.indexer.drain() };
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

/**
 * Query strings carry repeated keys (`?types=sale&types=lease`) or a single
 * value; zod arrays need the former shape either way, so a lone value is
 * wrapped rather than rejected.
 */
function normalizeArrays(query: Record<string, unknown>): Record<string, unknown> {
  const arrayKeys = [
    'types', 'sexes', 'breeds', 'disciplines', 'trainingLevels', 'riderLevels', 'colors',
  ];

  const normalized = { ...query };
  for (const key of arrayKeys) {
    const value = normalized[key];
    if (typeof value === 'string') normalized[key] = value.split(',').filter(Boolean);
  }

  return normalized;
}
