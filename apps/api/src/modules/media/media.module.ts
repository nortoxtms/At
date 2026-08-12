import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { Env } from '../../config/env.js';
import { GcsStorageProvider } from './gcs-storage.provider.js';
import { LocalStorageProvider } from './local-storage.provider.js';
import { MediaController } from './media.controller.js';
import { MediaService } from './media.service.js';
import { STORAGE_PROVIDER } from './storage.provider.js';

@Module({
  controllers: [MediaController],
  providers: [
    MediaService,
    {
      // Cloud Storage whenever a bucket is configured. The local provider is a
      // development affordance and is refused in production, where falling
      // back silently would mean user uploads landing on an ephemeral Cloud
      // Run disk and disappearing on the next deploy.
      provide: STORAGE_PROVIDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => {
        const bucket = config.get('GCS_BUCKET', { infer: true });
        const isProduction = config.get('NODE_ENV', { infer: true }) === 'production';

        if (bucket) {
          return new GcsStorageProvider(bucket, config.get('GCP_PROJECT_ID', { infer: true }));
        }

        if (isProduction) {
          throw new Error(
            'GCS_BUCKET is required in production. Refusing to start with local storage.',
          );
        }

        return new LocalStorageProvider(
          config.get('API_URL', { infer: true }) ?? 'http://localhost:3001',
          config.get('JWT_SECRET', { infer: true }),
        );
      },
    },
  ],
  exports: [MediaService, STORAGE_PROVIDER],
})
export class MediaModule {}
