import { createHmac } from 'node:crypto';

import { Injectable, Logger } from '@nestjs/common';

import { DatabaseService } from '../../database/database.service.js';
import type {
  CreateChannelInput,
  MessagingProvider,
  SystemMessageInput,
} from './messaging.provider.js';

/**
 * Development and test messaging provider.
 *
 * Stores message bodies in Postgres (migration 0032) instead of Stream, so the
 * whole §15 flow — context cards, quick actions, inquiry creation, first-reply
 * timing and §14.2's payment scanner — runs without a Stream account.
 *
 * §15.2 requires that a self-hosted implementation stay possible; this is a
 * working sketch of one rather than a stub.
 */
@Injectable()
export class LocalMessagingProvider implements MessagingProvider {
  readonly name = 'local';
  private readonly logger = new Logger(LocalMessagingProvider.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly signingSecret: string,
  ) {
    this.logger.warn('Using the local messaging provider. Stream Chat is production (§4).');
  }

  async createChannel(input: CreateChannelInput): Promise<{ channelId: string }> {
    // The conversation row is written by ConversationsService; the channel is
    // that row's id here, so there is nothing external to provision.
    this.logger.debug(`Channel ${input.channelId} for ${input.contextType}`);
    return { channelId: input.channelId };
  }

  async issueToken(profileId: string): Promise<{ token: string; expiresAt: Date }> {
    // Shaped like Stream's user token so the client code path is identical:
    // a signed, short-lived credential the client presents directly.
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
    const payload = `${profileId}.${expiresAt.getTime()}`;
    const signature = createHmac('sha256', this.signingSecret).update(payload).digest('hex');

    return { token: `${payload}.${signature}`, expiresAt };
  }

  /**
   * Routed through a SECURITY DEFINER function (migration 0034): a system
   * message has no sender, so it cannot satisfy `messages_insert`, and
   * loosening that policy would let a participant forge one.
   */
  async sendSystemMessage(input: SystemMessageInput): Promise<void> {
    await this.db.query(`SELECT post_system_message($1, $2, $3::jsonb)`, [
      input.channelId,
      input.text,
      input.attachment ? JSON.stringify(input.attachment) : null,
    ]);
  }

  async muteChannel(channelId: string, profileId: string, muted: boolean): Promise<void> {
    await this.db.query(
      `UPDATE conversation_participants SET muted = $3
       WHERE conversation_id = $1 AND profile_id = $2`,
      [channelId, profileId, muted],
    );
  }

  async deleteChannel(channelId: string): Promise<void> {
    await this.db.query(`DELETE FROM conversation_messages WHERE conversation_id = $1`, [
      channelId,
    ]);
  }
}
