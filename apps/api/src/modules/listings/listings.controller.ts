import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  closeListingSchema,
  createListingSchema,
  updateListingSchema,
} from '@only-horses/shared-types';
import type { z } from 'zod';

import { CurrentProfileId, OptionalAuth } from '../../common/guards/auth.guard.js';
import { RateLimit, RateLimitGuard } from '../../common/guards/rate-limit.guard.js';
import { zodBody } from '../../common/pipes/zod-validation.pipe.js';
import { ListingsService } from './listings.service.js';

/** Spec §12 "Listings". */
@Controller()
@UseGuards(RateLimitGuard)
export class ListingsController {
  constructor(private readonly listings: ListingsService) {}

  @Post('listings')
  @HttpCode(HttpStatus.CREATED)
  // §12 rate limits: 20 listings per day, per profile.
  @RateLimit({ limit: 20, windowSeconds: 86400, per: 'profile' })
  async create(
    @CurrentProfileId() profileId: string,
    @Body(zodBody(createListingSchema)) body: z.infer<typeof createListingSchema>,
  ) {
    return { data: await this.listings.create(profileId, body) };
  }

  @Get('me/listings')
  async listMine(
    @CurrentProfileId() profileId: string,
    @Query('status') status?: string,
  ) {
    return { data: await this.listings.listMine(profileId, status) };
  }

  /** Guests may read an active listing — that is the acquisition funnel. */
  @Get('listings/:idOrSlug')
  @OptionalAuth()
  async find(
    @Param('idOrSlug') idOrSlug: string,
    @CurrentProfileId() profileId: string | null,
  ) {
    return { data: await this.listings.findByIdOrSlug(idOrSlug, profileId) };
  }

  @Patch('listings/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async update(
    @CurrentProfileId() profileId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(updateListingSchema)) body: z.infer<typeof updateListingSchema>,
  ): Promise<void> {
    await this.listings.update(profileId, id, body);
  }

  /** §13.1 — where identity verification, welfare and quality all converge. */
  @Post('listings/:id/publish')
  @HttpCode(HttpStatus.OK)
  async publish(
    @CurrentProfileId() profileId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return { data: await this.listings.publish(profileId, id) };
  }

  @Post('listings/:id/pause')
  @HttpCode(HttpStatus.OK)
  async pause(@CurrentProfileId() profileId: string, @Param('id', ParseUUIDPipe) id: string) {
    return { data: await this.listings.transition(profileId, id, 'pause') };
  }

  @Post('listings/:id/resume')
  @HttpCode(HttpStatus.OK)
  async resume(@CurrentProfileId() profileId: string, @Param('id', ParseUUIDPipe) id: string) {
    return { data: await this.listings.transition(profileId, id, 'resume') };
  }

  @Post('listings/:id/renew')
  @HttpCode(HttpStatus.OK)
  async renew(@CurrentProfileId() profileId: string, @Param('id', ParseUUIDPipe) id: string) {
    return { data: await this.listings.transition(profileId, id, 'renew') };
  }

  @Post('listings/:id/close')
  @HttpCode(HttpStatus.OK)
  async close(
    @CurrentProfileId() profileId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(closeListingSchema)) body: z.infer<typeof closeListingSchema>,
  ) {
    return { data: await this.listings.close(profileId, id, body) };
  }

  @Get('listings/:id/stats')
  async stats(@CurrentProfileId() profileId: string, @Param('id', ParseUUIDPipe) id: string) {
    return { data: await this.listings.stats(profileId, id) };
  }

  /** §18.2 S13 step 7 — the live quality meter with its suggestions. */
  @Get('listings/:id/quality')
  async quality(@CurrentProfileId() profileId: string, @Param('id', ParseUUIDPipe) id: string) {
    return { data: await this.listings.qualityBreakdown(profileId, id) };
  }

  @Delete('listings/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @CurrentProfileId() profileId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.listings.transition(profileId, id, 'withdraw');
  }
}
