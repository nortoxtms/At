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
  applicationDecisionSchema,
  applyToJobSchema,
  createJobSchema,
  updateJobSchema,
} from '@only-horses/shared-types';
import type { z } from 'zod';

import { CurrentProfileId, OptionalAuth } from '../../common/guards/auth.guard.js';
import { RateLimit, RateLimitGuard } from '../../common/guards/rate-limit.guard.js';
import { zodBody } from '../../common/pipes/zod-validation.pipe.js';
import { ApplicationsService } from './applications.service.js';
import { JobsService } from './jobs.service.js';

/** Spec §12 "Services / Jobs / Applications". */
@Controller()
@UseGuards(RateLimitGuard)
export class JobsController {
  constructor(
    private readonly jobs: JobsService,
    private readonly applications: ApplicationsService,
  ) {}

  @Post('jobs')
  @HttpCode(HttpStatus.CREATED)
  @RateLimit({ limit: 20, windowSeconds: 86400, per: 'profile' })
  async create(
    @CurrentProfileId() profileId: string,
    @Body(zodBody(createJobSchema)) body: z.infer<typeof createJobSchema>,
  ) {
    return { data: await this.jobs.create(profileId, body) };
  }

  @Get('me/jobs')
  async listMine(@CurrentProfileId() profileId: string) {
    return { data: await this.jobs.listMine(profileId) };
  }

  /** §12 GET /me/applications — declared before `jobs/:idOrSlug` cannot shadow it. */
  @Get('me/applications')
  async myApplications(@CurrentProfileId() profileId: string) {
    return { data: await this.applications.mine(profileId) };
  }

  @Get('jobs/:idOrSlug')
  @OptionalAuth()
  async find(@Param('idOrSlug') idOrSlug: string, @CurrentProfileId() profileId: string | null) {
    return { data: await this.jobs.findByIdOrSlug(idOrSlug, profileId) };
  }

  @Patch('jobs/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async update(
    @CurrentProfileId() profileId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(updateJobSchema)) body: z.infer<typeof updateJobSchema>,
  ): Promise<void> {
    await this.jobs.update(profileId, id, body);
  }

  /** §26's legality checks and §16.1's job-post payment both land here. */
  @Post('jobs/:id/publish')
  @HttpCode(HttpStatus.OK)
  async publish(@CurrentProfileId() profileId: string, @Param('id', ParseUUIDPipe) id: string) {
    return { data: await this.jobs.publish(profileId, id) };
  }

  @Post('jobs/:id/pause')
  @HttpCode(HttpStatus.OK)
  async pause(@CurrentProfileId() profileId: string, @Param('id', ParseUUIDPipe) id: string) {
    return { data: await this.jobs.setStatus(profileId, id, 'paused') };
  }

  @Delete('jobs/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @CurrentProfileId() profileId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.jobs.setStatus(profileId, id, 'withdrawn');
  }

  /** §18.2 S19 — submitting opens a conversation with the poster. */
  @Post('jobs/:idOrSlug/apply')
  @HttpCode(HttpStatus.CREATED)
  @RateLimit({ limit: 30, windowSeconds: 86400, per: 'profile' })
  async apply(
    @CurrentProfileId() profileId: string,
    @Param('idOrSlug') idOrSlug: string,
    @Body(zodBody(applyToJobSchema)) body: z.infer<typeof applyToJobSchema>,
  ) {
    return { data: await this.applications.apply(profileId, idOrSlug, body) };
  }

  @Get('jobs/:id/applications')
  async applicationsForJob(
    @CurrentProfileId() profileId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return { data: await this.applications.forJob(profileId, id) };
  }

  /** §13.6 — every change notifies the applicant. */
  @Patch('applications/:id')
  @HttpCode(HttpStatus.OK)
  async decide(
    @CurrentProfileId() profileId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(applicationDecisionSchema)) body: z.infer<typeof applicationDecisionSchema>,
  ) {
    return { data: await this.applications.decide(profileId, id, body) };
  }
}
