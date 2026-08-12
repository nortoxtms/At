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
} from '@nestjs/common';
import {
  createHealthRecordSchema,
  healthRecordType,
  updateHealthRecordSchema,
} from '@only-horses/shared-types';
import { z } from 'zod';

import { CurrentProfileId } from '../../common/guards/auth.guard.js';
import { zodBody } from '../../common/pipes/zod-validation.pipe.js';
import { HealthRecordsService } from './health-records.service.js';

const dueQuerySchema = z.object({ days: z.coerce.number().int().min(1).max(365).default(30) });

/**
 * Spec §12 "Horses / health". Every route requires a session — there is no
 * anonymous read path to a health file (§24.4).
 */
@Controller()
export class HealthRecordsController {
  constructor(private readonly records: HealthRecordsService) {}

  @Get('horses/:id/health')
  async list(
    @CurrentProfileId() profileId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('type') type?: string,
  ) {
    const parsed = type ? healthRecordType.parse(type) : undefined;
    return { data: await this.records.list(id, profileId, parsed) };
  }

  @Post('horses/:id/health')
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentProfileId() profileId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(createHealthRecordSchema)) body: z.infer<typeof createHealthRecordSchema>,
  ) {
    return { data: await this.records.create(profileId, id, body) };
  }

  @Patch('horses/:id/health/:recordId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async update(
    @CurrentProfileId() profileId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('recordId', ParseUUIDPipe) recordId: string,
    @Body(zodBody(updateHealthRecordSchema)) body: z.infer<typeof updateHealthRecordSchema>,
  ): Promise<void> {
    await this.records.update(profileId, id, recordId, body);
  }

  @Delete('horses/:id/health/:recordId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @CurrentProfileId() profileId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('recordId', ParseUUIDPipe) recordId: string,
  ): Promise<void> {
    await this.records.remove(profileId, id, recordId);
  }

  /** §18.2 S09 "Yaklaşan bakımlar". */
  @Get('me/health/due')
  async due(
    @CurrentProfileId() profileId: string,
    @Query() query: Record<string, string>,
  ) {
    const { days } = dueQuerySchema.parse(query);
    return { data: await this.records.due(profileId, days) };
  }
}
