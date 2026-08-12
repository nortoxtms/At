import { Controller, Get } from '@nestjs/common';

import { DatabaseService } from '../../database/database.service.js';
import { Public } from '../../common/guards/auth.guard.js';

/** Liveness and readiness for Cloud Run. */
@Controller('health')
@Public()
export class HealthController {
  constructor(private readonly db: DatabaseService) {}

  @Get()
  live() {
    return { data: { status: 'ok' } };
  }

  @Get('ready')
  async ready() {
    const database = await this.db.healthCheck();
    return { data: { status: database ? 'ok' : 'degraded', database } };
  }
}
