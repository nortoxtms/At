import { Controller, Get, Query, UseGuards } from '@nestjs/common';

import { Public } from '../../common/guards/auth.guard.js';
import { RateLimit, RateLimitGuard } from '../../common/guards/rate-limit.guard.js';
import { ReferenceService } from './reference.service.js';

/**
 * Spec §12 "Reference". Public and cacheable: the mobile app preloads all
 * three lists on splash (§18.2 S01) so the horse wizard and filter sheet work
 * offline (§18.3).
 */
@Controller('reference')
@Public()
@UseGuards(RateLimitGuard)
@RateLimit({ limit: 120, windowSeconds: 60, per: 'ip' })
export class ReferenceController {
  constructor(private readonly reference: ReferenceService) {}

  @Get('breeds')
  async breeds(@Query('locale') locale?: string) {
    return { data: await this.reference.breeds(locale) };
  }

  @Get('disciplines')
  async disciplines(@Query('locale') locale?: string) {
    return { data: await this.reference.disciplines(locale) };
  }

  @Get('service-categories')
  async serviceCategories(@Query('locale') locale?: string) {
    return { data: await this.reference.serviceCategories(locale) };
  }
}
