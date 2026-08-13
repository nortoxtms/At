import { Controller, Get, Post, Query, UseGuards, Headers, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  jobSearchSchema,
  listingSearchSchema,
  professionalSearchSchema,
  serviceSearchSchema,
} from '@only-horses/shared-types';
import { timingSafeEqual } from 'node:crypto';

import { CurrentProfileId, OptionalAuth, Public } from '../../common/guards/auth.guard.js';
import { RateLimit, RateLimitGuard } from '../../common/guards/rate-limit.guard.js';
import type { Env } from '../../config/env.js';
import { DatabaseService } from '../../database/database.service.js';
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
    private readonly db: DatabaseService,
  ) {}

  /**
   * §24.13: "Blocking a user removes them from search results, hides their
   * listings from the blocker."
   *
   * Read as the viewer, which is the only scope that works: `blocks_select`
   * deliberately shows a user the blocks *they* made and not the ones made
   * against them (being able to enumerate who blocked you is a harassment
   * vector — migration 0036 makes the same argument).
   *
   * A guest blocks nobody, so an anonymous search skips the query entirely.
   */
  private async blockedBy(profileId: string | null): Promise<string[] | undefined> {
    if (!profileId) return undefined;

    const rows = await this.db.queryAs<{ blocked_id: string }>(
      profileId,
      `SELECT blocked_id FROM blocks WHERE blocker_id = $1 LIMIT 500`,
      [profileId],
    );

    return rows.length > 0 ? rows.map((row) => row.blocked_id) : undefined;
  }

  @Get('listings/search')
  @OptionalAuth()
  @RateLimit({ limit: 120, windowSeconds: 60, per: 'profile' })
  async searchListings(
    @Query() rawQuery: Record<string, unknown>,
    @CurrentProfileId() profileId: string | null,
  ) {
    // Parsed first, then the exclusion is attached: it is server state, not a
    // filter a client gets to choose.
    const query = listingSearchSchema.parse(normalizeArrays(rawQuery));
    query.excludeProfileIds = await this.blockedBy(profileId);
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

  /**
   * §12 GET /services/search, /jobs/search — and the professional directory
   * (§23 M4).
   *
   * All three are registered on this controller, and SearchModule is imported
   * before ServicesModule and JobsModule for the same reason it is imported
   * before ListingsModule: `GET /jobs/:idOrSlug` would otherwise match
   * "search" and every query would 404 as a missing job.
   */
  @Get('services/search')
  @OptionalAuth()
  @RateLimit({ limit: 120, windowSeconds: 60, per: 'profile' })
  async searchServices(
    @Query() rawQuery: Record<string, unknown>,
    @CurrentProfileId() profileId: string | null,
  ) {
    const query = serviceSearchSchema.parse(normalizeArrays(rawQuery));
    query.excludeProfileIds = await this.blockedBy(profileId);
    return envelope(await this.search.searchServices(query));
  }

  @Get('jobs/search')
  @Public()
  @RateLimit({ limit: 120, windowSeconds: 60, per: 'profile' })
  async searchJobs(@Query() rawQuery: Record<string, unknown>) {
    const query = jobSearchSchema.parse(normalizeArrays(rawQuery));
    return envelope(await this.search.searchJobs(query));
  }

  @Get('professionals/search')
  @OptionalAuth()
  @RateLimit({ limit: 120, windowSeconds: 60, per: 'profile' })
  async searchProfessionals(
    @Query() rawQuery: Record<string, unknown>,
    @CurrentProfileId() profileId: string | null,
  ) {
    const query = professionalSearchSchema.parse(normalizeArrays(rawQuery));
    query.excludeProfileIds = await this.blockedBy(profileId);
    return envelope(await this.search.searchProfessionals(query));
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
function envelope<THit>(result: {
  hits: THit[];
  found: number;
  page: number;
  limit: number;
  facets: Record<string, { value: string; count: number }[]>;
  tookMs: number;
}) {
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

function normalizeArrays(query: Record<string, unknown>): Record<string, unknown> {
  const arrayKeys = [
    'types', 'sexes', 'breeds', 'disciplines', 'trainingLevels', 'riderLevels', 'colors',
    // M4's collections
    'categories', 'jobTypes', 'roles', 'accommodation', 'specialties', 'languages',
  ];

  const normalized = { ...query };
  for (const key of arrayKeys) {
    const value = normalized[key];
    if (typeof value === 'string') normalized[key] = value.split(',').filter(Boolean);
  }

  return normalized;
}
