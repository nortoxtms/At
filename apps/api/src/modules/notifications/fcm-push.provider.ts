import { Injectable, Logger } from '@nestjs/common';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getMessaging, type Messaging } from 'firebase-admin/messaging';

import type { PushMessage, PushProvider } from './push.provider.js';

/** Firebase Cloud Messaging (spec §4; shares the Firebase app with Auth). */
@Injectable()
export class FcmPushProvider implements PushProvider {
  readonly name = 'fcm';
  private readonly logger = new Logger(FcmPushProvider.name);
  private readonly messaging: Messaging;

  constructor(projectId: string, serviceAccountJson?: string) {
    const app =
      getApps()[0] ??
      initializeApp(
        serviceAccountJson ? { credential: cert(JSON.parse(serviceAccountJson)) } : { projectId },
      );

    this.messaging = getMessaging(app);
  }

  async send(message: PushMessage): Promise<string[]> {
    const response = await this.messaging.sendEachForMulticast({
      tokens: message.tokens,
      notification: { title: message.title, body: message.body },
      // FCM data payloads must be string-valued.
      data: Object.fromEntries(
        Object.entries(message.data ?? {}).map(([key, value]) => [key, String(value)]),
      ),
    });

    const stale: string[] = [];
    response.responses.forEach((result, index) => {
      const code = result.error?.code;
      // Everything else (quota, transient network) may succeed on a retry, so
      // only these two mean the token is genuinely dead.
      if (
        code === 'messaging/registration-token-not-registered' ||
        code === 'messaging/invalid-registration-token'
      ) {
        stale.push(message.tokens[index]!);
      } else if (result.error) {
        this.logger.warn(`Push failed: ${result.error.message}`);
      }
    });

    return stale;
  }
}
