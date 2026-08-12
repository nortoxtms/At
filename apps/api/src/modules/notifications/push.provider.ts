import { Injectable, Logger } from '@nestjs/common';

/**
 * Push delivery abstraction — spec §4 (FCM).
 *
 * `send` returns the tokens the provider rejected as permanently invalid, so
 * the caller can prune them. Same rationale as §15.2's MessagingService: the
 * vendor is swappable, and the dev implementation lets the reminder job be
 * exercised without credentials or a device.
 */
export interface PushMessage {
  tokens: string[];
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

export interface PushProvider {
  readonly name: string;
  /** @returns tokens that are permanently invalid and should be deleted. */
  send(message: PushMessage): Promise<string[]>;
}

export const PUSH_PROVIDER = Symbol('PUSH_PROVIDER');

/** Development provider: logs what would have been sent, delivers nothing. */
@Injectable()
export class LogPushProvider implements PushProvider {
  readonly name = 'log';
  private readonly logger = new Logger(LogPushProvider.name);

  async send(message: PushMessage): Promise<string[]> {
    this.logger.log(
      `[push] "${message.title}" — ${message.body} → ${message.tokens.length} device(s)`,
    );
    return [];
  }
}
