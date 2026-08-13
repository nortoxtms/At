import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { z } from 'zod';

import { CurrentProfileId } from '../../common/guards/auth.guard.js';
import { zodBody } from '../../common/pipes/zod-validation.pipe.js';
import { AccessGrantsService } from './access-grants.service.js';

const requestSchema = z.object({
  scope: z.array(z.enum(['health', 'documents', 'pedigree'])).min(1).default(['health']),
  message: z.string().trim().max(500).optional(),
});

const decideSchema = z.object({
  status: z.enum(['granted', 'denied', 'revoked']),
  expiresInDays: z.number().int().min(1).max(180).optional(),
});

/** Spec §12 "access-requests". */
@Controller()
export class AccessGrantsController {
  constructor(private readonly grants: AccessGrantsService) {}

  @Post('horses/:idOrSlug/access-requests')
  @HttpCode(HttpStatus.CREATED)
  async request(
    @CurrentProfileId() profileId: string,
    @Param('idOrSlug') idOrSlug: string,
    @Body(zodBody(requestSchema)) body: z.infer<typeof requestSchema>,
  ) {
    return { data: await this.grants.request(profileId, idOrSlug, body) };
  }

  @Get('me/access-requests')
  async mine(@CurrentProfileId() profileId: string) {
    return { data: await this.grants.mine(profileId) };
  }

  @Patch('access-requests/:id')
  async decide(
    @CurrentProfileId() profileId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(decideSchema)) body: z.infer<typeof decideSchema>,
  ) {
    return { data: await this.grants.decide(profileId, id, body) };
  }
}
