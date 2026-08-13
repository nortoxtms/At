import { Module } from '@nestjs/common';

import { StaffGuard } from '../../common/guards/staff.guard.js';
import { VerificationModule } from '../verification/verification.module.js';
import { AdminModerationController, ModerationController } from './moderation.controller.js';
import { ModerationService } from './moderation.service.js';

@Module({
  imports: [VerificationModule],
  controllers: [ModerationController, AdminModerationController],
  providers: [ModerationService, StaffGuard],
  exports: [ModerationService],
})
export class ModerationModule {}
