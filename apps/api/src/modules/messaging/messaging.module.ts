import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { Env } from '../../config/env.js';
import { DatabaseService } from '../../database/database.service.js';
import { AccessGrantsModule } from '../access-grants/access-grants.module.js';
import { ConversationsController } from './conversations.controller.js';
import { ConversationsService } from './conversations.service.js';
import { LocalMessagingProvider } from './local-messaging.provider.js';
import { MESSAGING_PROVIDER } from './messaging.provider.js';
import { StreamMessagingProvider } from './stream-messaging.provider.js';

@Module({
  imports: [AccessGrantsModule],
  controllers: [ConversationsController],
  providers: [
    ConversationsService,
    {
      provide: MESSAGING_PROVIDER,
      inject: [ConfigService, DatabaseService],
      useFactory: (config: ConfigService<Env, true>, db: DatabaseService) => {
        const apiKey = process.env.STREAM_API_KEY;
        const apiSecret = process.env.STREAM_API_SECRET;

        if (apiKey && apiSecret) return new StreamMessagingProvider(apiKey, apiSecret);

        // Like search and unlike storage, the fallback is a real
        // implementation rather than a stub — §15.2 requires a self-hosted
        // option to stay possible, and this is one. It is still refused in
        // production, where message history landing in a table nobody
        // operates would be a silent data-retention problem.
        if (config.get('NODE_ENV', { infer: true }) === 'production') {
          throw new Error('STREAM_API_KEY and STREAM_API_SECRET are required in production.');
        }

        return new LocalMessagingProvider(db, config.get('JWT_SECRET', { infer: true }));
      },
    },
  ],
  exports: [ConversationsService, MESSAGING_PROVIDER],
})
export class MessagingModule {}
