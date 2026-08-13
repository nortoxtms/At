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
import { saveItemSchema, saveSearchSchema, updateSavedSearchSchema } from '@only-horses/shared-types';
import type { z } from 'zod';

import { CurrentProfileId } from '../../common/guards/auth.guard.js';
import { RateLimit, RateLimitGuard } from '../../common/guards/rate-limit.guard.js';
import { zodBody } from '../../common/pipes/zod-validation.pipe.js';
import { SavedService } from './saved.service.js';

/** Spec §12 "Reviews, saved, search, misc" — the saved half. */
@Controller()
@UseGuards(RateLimitGuard)
export class SavedController {
  constructor(private readonly saved: SavedService) {}

  @Get('saved')
  async items(@CurrentProfileId() profileId: string, @Query('type') type?: string) {
    return { data: await this.saved.items(profileId, type) };
  }

  @Post('saved')
  @HttpCode(HttpStatus.CREATED)
  @RateLimit({ limit: 300, windowSeconds: 3600, per: 'profile' })
  async save(
    @CurrentProfileId() profileId: string,
    @Body(zodBody(saveItemSchema)) body: z.infer<typeof saveItemSchema>,
  ) {
    return { data: await this.saved.save(profileId, body) };
  }

  @Delete('saved/:type/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async unsave(
    @CurrentProfileId() profileId: string,
    @Param('type') type: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.saved.unsave(profileId, type, id);
  }

  @Get('saved-searches')
  async searches(@CurrentProfileId() profileId: string) {
    return { data: await this.saved.searches(profileId) };
  }

  /** §24.5: saving a search is what subscribes the user to the alert. */
  @Post('saved-searches')
  @HttpCode(HttpStatus.CREATED)
  @RateLimit({ limit: 50, windowSeconds: 86400, per: 'profile' })
  async saveSearch(
    @CurrentProfileId() profileId: string,
    @Body(zodBody(saveSearchSchema)) body: z.infer<typeof saveSearchSchema>,
  ) {
    return { data: await this.saved.saveSearch(profileId, body) };
  }

  @Patch('saved-searches/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async updateSearch(
    @CurrentProfileId() profileId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(updateSavedSearchSchema)) body: z.infer<typeof updateSavedSearchSchema>,
  ): Promise<void> {
    await this.saved.updateSearch(profileId, id, body);
  }

  @Delete('saved-searches/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteSearch(
    @CurrentProfileId() profileId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.saved.deleteSearch(profileId, id);
  }
}
