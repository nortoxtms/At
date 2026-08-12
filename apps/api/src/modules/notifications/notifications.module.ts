import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { Env } from '../../config/env.js';
import { FcmPushProvider } from './fcm-push.provider.js';
import { NotificationsController } from './notifications.controller.js';
import { NotificationsService } from './notifications.service.js';
import { LogPushProvider, PUSH_PROVIDER } from './push.provider.js';

@Global()
@Module({
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    {
      provide: PUSH_PROVIDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => {
        const projectId = config.get('FIREBASE_PROJECT_ID', { infer: true });

        if (projectId) {
          return new FcmPushProvider(
            projectId,
            config.get('FIREBASE_SERVICE_ACCOUNT_JSON', { infer: true }),
          );
        }

        // Unlike storage and identity, a missing push provider is not a
        // security hole — it degrades to "no push". It still refuses in
        // production, because silently delivering nothing is worse than
        // failing to deploy.
        if (config.get('NODE_ENV', { infer: true }) === 'production') {
          throw new Error('FIREBASE_PROJECT_ID is required in production for push delivery.');
        }

        return new LogPushProvider();
      },
    },
  ],
  exports: [NotificationsService, PUSH_PROVIDER],
})
export class NotificationsModule {}
