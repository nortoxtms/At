import { Module } from '@nestjs/common';

import { HealthRemindersController } from './health-reminders.controller.js';
import { HealthRemindersJob } from './health-reminders.job.js';

/**
 * Background jobs (spec §5 `apps/api/src/jobs`).
 *
 * M1 ships the §17 health reminder. It is invoked over HTTP by Cloud
 * Scheduler rather than by an in-process timer: Cloud Run scales to zero, so a
 * setInterval would only fire while some unrelated request happened to be
 * keeping an instance warm. BullMQ workers for the §11.4 search outbox and the
 * §13.1 expiry sweep land in M2.
 */
@Module({
  controllers: [HealthRemindersController],
  providers: [HealthRemindersJob],
  exports: [HealthRemindersJob],
})
export class JobsModule {}
