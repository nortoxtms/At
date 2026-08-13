import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';

import { CurrentProfileId } from '../../common/guards/auth.guard.js';
import { RateLimit, RateLimitGuard } from '../../common/guards/rate-limit.guard.js';
import { PrivacyService } from './privacy.service.js';

/**
 * §26's DSAR endpoints — §18.2 S31's "veri indirme" and "hesabı sil".
 *
 * Rate limited hard: both are expensive, and neither is something a person
 * does twice in an hour.
 */
@Controller('me')
@UseGuards(RateLimitGuard)
export class PrivacyController {
  constructor(private readonly privacy: PrivacyService) {}

  @Get('data-requests')
  async mine(@CurrentProfileId() profileId: string) {
    return { data: await this.privacy.myRequests(profileId) };
  }

  /** §24.27 — a complete JSON export within 24 h. */
  @Post('export')
  @HttpCode(HttpStatus.ACCEPTED)
  @RateLimit({ limit: 3, windowSeconds: 86400, per: 'profile' })
  async requestExport(@CurrentProfileId() profileId: string) {
    return { data: await this.privacy.requestExport(profileId) };
  }

  @Get('export/:id')
  @RateLimit({ limit: 10, windowSeconds: 86400, per: 'profile' })
  async download(
    @CurrentProfileId() profileId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return { data: await this.privacy.downloadExport(profileId, id) };
  }

  /** §24.14 — scheduled, not immediate, and cancellable for 30 days. */
  @Delete('account')
  @HttpCode(HttpStatus.ACCEPTED)
  @RateLimit({ limit: 5, windowSeconds: 86400, per: 'profile' })
  async requestErasure(@CurrentProfileId() profileId: string) {
    return { data: await this.privacy.requestErasure(profileId) };
  }

  @Post('account/restore')
  @HttpCode(HttpStatus.OK)
  async cancelErasure(@CurrentProfileId() profileId: string) {
    return { data: await this.privacy.cancelErasure(profileId) };
  }
}
