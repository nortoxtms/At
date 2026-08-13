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
} from '@nestjs/common';
import { roleType } from '@only-horses/shared-types';
import { z } from 'zod';

import { CurrentProfileId, OptionalAuth } from '../../common/guards/auth.guard.js';
import { zodBody } from '../../common/pipes/zod-validation.pipe.js';
import { ProfilesService } from './profiles.service.js';

const updateMeSchema = z.object({
  displayName: z.string().trim().min(2).max(80).optional(),
  bio: z.string().trim().max(2000).nullish(),
  avatarMediaId: z.string().uuid().nullish(),
  countryCode: z.string().length(2).optional(),
  region: z.string().trim().max(120).nullish(),
  city: z.string().trim().max(120).nullish(),
  locationPrecision: z.enum(['exact', 'city', 'region']).optional(),
  phonePublic: z.boolean().optional(),
  emailPublic: z.boolean().optional(),
  languages: z.array(z.string().max(10)).max(10).optional(),
  locale: z.string().max(10).optional(),
  preferredCurrency: z.string().length(3).optional(),
  preferredUnits: z.enum(['metric', 'imperial']).optional(),
  onboardingStep: z.string().max(60).nullish(),
});

const credentialSchema = z.object({
  title: z.string().trim().min(2).max(160),
  issuer: z.string().trim().max(160).optional(),
  issuedOn: z.string().date().optional(),
  expiresOn: z.string().date().optional(),
  mediaId: z.string().uuid().optional(),
});

const avatarSchema = z.object({ mediaId: z.string().uuid() });

const addRoleSchema = z.object({
  role: roleType,
  headline: z.string().trim().max(160).optional(),
  about: z.string().trim().max(4000).optional(),
  yearsExperience: z.number().int().min(0).max(80).optional(),
  specialties: z.array(z.string().max(60)).max(20).optional(),
  disciplines: z.array(z.string().max(60)).max(20).optional(),
  serviceRadiusKm: z.number().int().min(0).max(2000).optional(),
  travels: z.boolean().optional(),
  hourlyRateMin: z.number().nonnegative().optional(),
  hourlyRateMax: z.number().nonnegative().optional(),
  currency: z.string().length(3).optional(),
});

/** Spec §12 "Profiles". */
@Controller()
export class ProfilesController {
  constructor(private readonly profiles: ProfilesService) {}

  @Get('me')
  async me(@CurrentProfileId() profileId: string) {
    return { data: await this.profiles.me(profileId) };
  }

  @Patch('me')
  @HttpCode(HttpStatus.NO_CONTENT)
  async updateMe(
    @CurrentProfileId() profileId: string,
    @Body(zodBody(updateMeSchema)) body: z.infer<typeof updateMeSchema>,
  ): Promise<void> {
    await this.profiles.updateMe(profileId, body);
  }

  @Get('me/limits')
  async limits(@CurrentProfileId() profileId: string) {
    return { data: await this.profiles.limits(profileId) };
  }

  @Get('me/dashboard')
  async dashboard(@CurrentProfileId() profileId: string) {
    return { data: await this.profiles.dashboard(profileId) };
  }

  @Post('me/roles')
  @HttpCode(HttpStatus.CREATED)
  async addRole(
    @CurrentProfileId() profileId: string,
    @Body(zodBody(addRoleSchema)) body: z.infer<typeof addRoleSchema>,
  ) {
    return { data: await this.profiles.addRole(profileId, body) };
  }

  @Patch('me/roles/:roleId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async updateRole(
    @CurrentProfileId() profileId: string,
    @Param('roleId', ParseUUIDPipe) roleId: string,
    @Body(zodBody(addRoleSchema.partial().omit({ role: true }))) body: Record<string, unknown>,
  ): Promise<void> {
    await this.profiles.updateRole(profileId, roleId, body);
  }

  /** §14.1: a credential is a claim until a moderator approves it. */
  @Post('me/roles/:roleId/credentials')
  @HttpCode(HttpStatus.CREATED)
  async addCredential(
    @CurrentProfileId() profileId: string,
    @Param('roleId', ParseUUIDPipe) roleId: string,
    @Body(zodBody(credentialSchema)) body: z.infer<typeof credentialSchema>,
  ) {
    return { data: await this.profiles.addCredential(profileId, roleId, body) };
  }

  @Post('me/avatar')
  @HttpCode(HttpStatus.NO_CONTENT)
  async setAvatar(
    @CurrentProfileId() profileId: string,
    @Body(zodBody(avatarSchema)) body: z.infer<typeof avatarSchema>,
  ): Promise<void> {
    await this.profiles.setAvatar(profileId, body.mediaId);
  }

  @Delete('me/roles/:roleId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeRole(
    @CurrentProfileId() profileId: string,
    @Param('roleId', ParseUUIDPipe) roleId: string,
  ): Promise<void> {
    await this.profiles.removeRole(profileId, roleId);
  }

  /** Guests may view a public profile (§3.3 "Browse listings"). */
  @Get('profiles/:handle')
  @OptionalAuth()
  async byHandle(@Param('handle') handle: string) {
    return { data: await this.profiles.byHandle(handle) };
  }
}
