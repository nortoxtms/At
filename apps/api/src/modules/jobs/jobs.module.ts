import { Module } from '@nestjs/common';

import { EntitlementsModule } from '../entitlements/entitlements.module.js';
import { MessagingModule } from '../messaging/messaging.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { ApplicationsService } from './applications.service.js';
import { JobsController } from './jobs.controller.js';
import { JobsService } from './jobs.service.js';

/**
 * `JobBoardModule`, not `JobsModule`: `src/jobs/jobs.module.ts` already owns
 * that name for the *cron* jobs (health reminders, sweeps). One word, two
 * meanings — the collision is real enough that TypeScript caught it, and
 * naming this one for the job board is clearer than aliasing at the import.
 */
@Module({
  imports: [EntitlementsModule, NotificationsModule, MessagingModule],
  controllers: [JobsController],
  providers: [JobsService, ApplicationsService],
  exports: [JobsService, ApplicationsService],
})
export class JobBoardModule {}
