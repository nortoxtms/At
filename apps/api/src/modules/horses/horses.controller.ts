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
import {
  attachHorseMediaSchema,
  createHorseSchema,
  reorderHorseMediaSchema,
  transferHorseSchema,
  updateHorseSchema,
} from '@only-horses/shared-types';
import type { z } from 'zod';

import { CurrentProfileId, OptionalAuth } from '../../common/guards/auth.guard.js';
import { RateLimit, RateLimitGuard } from '../../common/guards/rate-limit.guard.js';
import { zodBody } from '../../common/pipes/zod-validation.pipe.js';
import { HorsesService } from './horses.service.js';

/** Spec §12 "Horses". */
@Controller()
@UseGuards(RateLimitGuard)
export class HorsesController {
  constructor(private readonly horses: HorsesService) {}

  /** §18.2 S09 — My Stable. */
  @Get('me/horses')
  async listMine(@CurrentProfileId() profileId: string) {
    return { data: await this.horses.listMine(profileId) };
  }

  @Post('horses')
  @HttpCode(HttpStatus.CREATED)
  @RateLimit({ limit: 60, windowSeconds: 3600, per: 'profile' })
  async create(
    @CurrentProfileId() profileId: string,
    @Body(zodBody(createHorseSchema)) body: z.infer<typeof createHorseSchema>,
  ) {
    return { data: await this.horses.create(profileId, body) };
  }

  /** Guests may view a horse that has an active listing (§8, §3.3). */
  @Get('horses/:idOrSlug')
  @OptionalAuth()
  async find(
    @Param('idOrSlug') idOrSlug: string,
    @CurrentProfileId() profileId: string | null,
  ) {
    return { data: await this.horses.findByIdOrSlug(idOrSlug, profileId) };
  }

  @Patch('horses/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async update(
    @CurrentProfileId() profileId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(updateHorseSchema)) body: z.infer<typeof updateHorseSchema>,
  ): Promise<void> {
    await this.horses.update(profileId, id, body);
  }

  @Delete('horses/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @CurrentProfileId() profileId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.horses.softDelete(profileId, id);
  }

  /** §20.4 — the signature element. */
  @Get('horses/:id/timeline')
  @OptionalAuth()
  async timeline(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentProfileId() profileId: string | null,
  ) {
    return { data: await this.horses.timeline(id, profileId) };
  }

  @Get('horses/:id/media')
  @OptionalAuth()
  async listMedia(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentProfileId() profileId: string | null,
  ) {
    return { data: await this.horses.listMedia(id, profileId) };
  }

  @Post('horses/:id/media')
  @HttpCode(HttpStatus.CREATED)
  async attachMedia(
    @CurrentProfileId() profileId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(attachHorseMediaSchema)) body: z.infer<typeof attachHorseMediaSchema>,
  ) {
    await this.horses.attachMedia(profileId, id, body);
    return { data: { attached: body.mediaId } };
  }

  @Patch('horses/:id/media/reorder')
  @HttpCode(HttpStatus.NO_CONTENT)
  async reorderMedia(
    @CurrentProfileId() profileId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(reorderHorseMediaSchema)) body: z.infer<typeof reorderHorseMediaSchema>,
  ): Promise<void> {
    await this.horses.reorderMedia(profileId, id, body.order);
  }

  @Delete('horses/:id/media/:mediaId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async detachMedia(
    @CurrentProfileId() profileId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('mediaId', ParseUUIDPipe) mediaId: string,
  ): Promise<void> {
    await this.horses.detachMedia(profileId, id, mediaId);
  }

  @Post('horses/:id/transfer')
  @HttpCode(HttpStatus.NO_CONTENT)
  async transfer(
    @CurrentProfileId() profileId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(transferHorseSchema)) body: z.infer<typeof transferHorseSchema>,
  ): Promise<void> {
    await this.horses.transfer(profileId, id, body);
  }
}
