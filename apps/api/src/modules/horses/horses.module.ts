import { Module } from '@nestjs/common';

import { MediaModule } from '../media/media.module.js';
import { HorsesController } from './horses.controller.js';
import { HorsesService } from './horses.service.js';

@Module({
  imports: [MediaModule],
  controllers: [HorsesController],
  providers: [HorsesService],
  exports: [HorsesService],
})
export class HorsesModule {}
