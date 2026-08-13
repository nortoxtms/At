import { Module } from '@nestjs/common';

import { SavedController } from './saved.controller.js';
import { SavedService } from './saved.service.js';

@Module({
  controllers: [SavedController],
  providers: [SavedService],
  exports: [SavedService],
})
export class SavedModule {}
