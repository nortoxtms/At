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
  UseGuards,
} from '@nestjs/common';
import { createServiceSchema, updateServiceSchema } from '@only-horses/shared-types';
import type { z } from 'zod';

import { CurrentProfileId, OptionalAuth, Public } from '../../common/guards/auth.guard.js';
import { RateLimit, RateLimitGuard } from '../../common/guards/rate-limit.guard.js';
import { zodBody } from '../../common/pipes/zod-validation.pipe.js';
import { ServicesService } from './services.service.js';

/** Spec §12 "Services". */
@Controller()
@UseGuards(RateLimitGuard)
export class ServicesController {
  constructor(private readonly services: ServicesService) {}

  /**
   * §18.2 S15's category grid, with live counts.
   *
   * Distinct from `GET /reference/service-categories`, which is the cacheable
   * taxonomy the app preloads on splash (§18.3). This one counts active
   * listings per tile, so it changes constantly and is not cacheable.
   *
   * Declared before `services/:idOrSlug` — Nest matches in declaration order,
   * and the parameterized route would otherwise swallow "categories".
   */
  @Get('services/categories')
  @Public()
  async categories() {
    return { data: await this.services.categories() };
  }

  @Post('services')
  @HttpCode(HttpStatus.CREATED)
  @RateLimit({ limit: 20, windowSeconds: 86400, per: 'profile' })
  async create(
    @CurrentProfileId() profileId: string,
    @Body(zodBody(createServiceSchema)) body: z.infer<typeof createServiceSchema>,
  ) {
    return { data: await this.services.create(profileId, body) };
  }

  @Get('me/services')
  async listMine(@CurrentProfileId() profileId: string) {
    return { data: await this.services.listMine(profileId) };
  }

  @Get('services/:idOrSlug')
  @OptionalAuth()
  async find(@Param('idOrSlug') idOrSlug: string, @CurrentProfileId() profileId: string | null) {
    return { data: await this.services.findByIdOrSlug(idOrSlug, profileId) };
  }

  @Patch('services/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async update(
    @CurrentProfileId() profileId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(updateServiceSchema)) body: z.infer<typeof updateServiceSchema>,
  ): Promise<void> {
    await this.services.update(profileId, id, body);
  }

  @Post('services/:id/publish')
  @HttpCode(HttpStatus.OK)
  async publish(@CurrentProfileId() profileId: string, @Param('id', ParseUUIDPipe) id: string) {
    return { data: await this.services.publish(profileId, id) };
  }

  @Post('services/:id/pause')
  @HttpCode(HttpStatus.OK)
  async pause(@CurrentProfileId() profileId: string, @Param('id', ParseUUIDPipe) id: string) {
    return { data: await this.services.setStatus(profileId, id, 'paused') };
  }

  @Delete('services/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @CurrentProfileId() profileId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.services.setStatus(profileId, id, 'withdrawn');
  }
}
