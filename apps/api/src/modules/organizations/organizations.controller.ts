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
  createOrganizationSchema,
  inviteMemberSchema,
  setMemberRoleSchema,
  updateOrganizationSchema,
} from '@only-horses/shared-types';
import type { z } from 'zod';

import { CurrentProfileId, Public } from '../../common/guards/auth.guard.js';
import { RateLimit, RateLimitGuard } from '../../common/guards/rate-limit.guard.js';
import { zodBody } from '../../common/pipes/zod-validation.pipe.js';
import { OrganizationsService } from './organizations.service.js';

/** Spec §12 "Organizations". */
@Controller()
@UseGuards(RateLimitGuard)
export class OrganizationsController {
  constructor(private readonly organizations: OrganizationsService) {}

  @Post('organizations')
  @HttpCode(HttpStatus.CREATED)
  @RateLimit({ limit: 5, windowSeconds: 86400, per: 'profile' })
  async create(
    @CurrentProfileId() profileId: string,
    @Body(zodBody(createOrganizationSchema)) body: z.infer<typeof createOrganizationSchema>,
  ) {
    return { data: await this.organizations.create(profileId, body) };
  }

  /** Declared before `organizations/:slug` so the literal path wins. */
  @Get('me/organizations')
  async mine(@CurrentProfileId() profileId: string) {
    return { data: await this.organizations.mine(profileId) };
  }

  /** Public: §19.1 renders the farm page server-side for SEO. */
  @Get('organizations/:slug')
  @Public()
  async find(@Param('slug') slug: string) {
    return { data: await this.organizations.findBySlug(slug) };
  }

  @Patch('organizations/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async update(
    @CurrentProfileId() profileId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(updateOrganizationSchema)) body: z.infer<typeof updateOrganizationSchema>,
  ): Promise<void> {
    await this.organizations.update(profileId, id, body);
  }

  @Get('organizations/:id/members')
  async members(
    @CurrentProfileId() profileId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return { data: await this.organizations.members(profileId, id) };
  }

  @Post('organizations/:id/members')
  @HttpCode(HttpStatus.OK)
  async invite(
    @CurrentProfileId() profileId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(inviteMemberSchema)) body: z.infer<typeof inviteMemberSchema>,
  ) {
    return { data: await this.organizations.invite(profileId, id, body) };
  }

  @Patch('organizations/:id/members/:profileId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async setRole(
    @CurrentProfileId() actorId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('profileId', ParseUUIDPipe) memberId: string,
    @Body(zodBody(setMemberRoleSchema)) body: z.infer<typeof setMemberRoleSchema>,
  ): Promise<void> {
    await this.organizations.setMemberRole(actorId, id, memberId, body.role);
  }

  @Delete('organizations/:id/members/:profileId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeMember(
    @CurrentProfileId() actorId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('profileId', ParseUUIDPipe) memberId: string,
  ): Promise<void> {
    await this.organizations.removeMember(actorId, id, memberId);
  }
}
