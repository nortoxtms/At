import { Module } from '@nestjs/common';

import { HorsesModule } from '../horses/horses.module.js';
import { HealthRecordsController } from './health-records.controller.js';
import { HealthRecordsService } from './health-records.service.js';

@Module({
  imports: [HorsesModule],
  controllers: [HealthRecordsController],
  providers: [HealthRecordsService],
  exports: [HealthRecordsService],
})
export class HealthRecordsModule {}
