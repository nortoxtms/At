import { createHmac } from 'node:crypto';

import { Injectable, Logger } from '@nestjs/common';

import type {
  CreateChannelInput,
  MessagingProvider,
  SystemMessageInput,
} from './messaging.provider.js';

/**
 * Stream Chat provider — production (spec §4, §15).
 *
 * Implemented against Stream's REST API rather than its SDK so the dependency
 * stays a network contract: §15.2 requires that swapping this out does not
 * touch call sites, and an SDK whose types leak into the service would make
 * that harder than it needs to be.
 */
@Injectable()
export class StreamMessagingProvider implements MessagingProvider {
  readonly name = 'stream';
  private readonly logger = new Logger(StreamMessagingProvider.name);
  private readonly baseUrl = 'https://chat.stream-io-api.com';

  constructor(
    private readonly apiKey: string,
    private readonly apiSecret: string,
  ) {}

  /**
   * Stream user tokens are JWTs signed with the API secret. Built by hand
   * because it is twelve lines and the alternative is pulling the SDK in for
   * one function.
   */
  async issueToken(profileId: string): Promise<{ token: string; expiresAt: Date }> {
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

    const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
    const payload = base64url(
      JSON.stringify({ user_id: profileId, exp: Math.floor(expiresAt.getTime() / 1000) }),
    );
    const signature = createHmac('sha256', this.apiSecret)
      .update(`${header}.${payload}`)
      .digest('base64url');

    return { token: `${header}.${payload}.${signature}`, expiresAt };
  }

  private async serverToken(): Promise<string> {
    const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
    const payload = base64url(JSON.stringify({ server: true }));
    const signature = createHmac('sha256', this.apiSecret)
      .update(`${header}.${payload}`)
      .digest('base64url');

    return `${header}.${payload}.${signature}`;
  }

  private async call(path: string, body: unknown): Promise<Response> {
    const response = await fetch(`${this.baseUrl}${path}?api_key=${this.apiKey}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: await this.serverToken(),
        'stream-auth-type': 'jwt',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const detail = await response.text();
      this.logger.error(`Stream ${path} failed: ${response.status} ${detail}`);
      throw new Error(`Stream request failed with ${response.status}`);
    }

    return response;
  }

  async createChannel(input: CreateChannelInput): Promise<{ channelId: string }> {
    await this.call(`/channels/messaging/${input.channelId}/query`, {
      data: {
        members: input.members.map((member) => member.profileId),
        created_by_id: input.members[0]?.profileId,
        // §15.1: the context is carried on the channel so the pinned card
        // survives a client that joins the thread later.
        context_type: input.contextType,
        context_id: input.contextId,
        context_title: input.contextTitle,
      },
      state: true,
    });

    return { channelId: input.channelId };
  }

  async sendSystemMessage(input: SystemMessageInput): Promise<void> {
    await this.call(`/channels/messaging/${input.channelId}/message`, {
      message: {
        text: input.text,
        type: 'system',
        ...(input.attachment
          ? { attachments: [{ type: input.attachment.type, ...input.attachment.payload }] }
          : {}),
      },
    });
  }

  async muteChannel(channelId: string, profileId: string, muted: boolean): Promise<void> {
    await this.call(muted ? '/moderation/mute/channel' : '/moderation/unmute/channel', {
      channel_cids: [`messaging:${channelId}`],
      user_id: profileId,
    });
  }

  async deleteChannel(channelId: string): Promise<void> {
    await fetch(`${this.baseUrl}/channels/messaging/${channelId}?api_key=${this.apiKey}`, {
      method: 'DELETE',
      headers: { authorization: await this.serverToken(), 'stream-auth-type': 'jwt' },
    });
  }
}

function base64url(value: string): string {
  return Buffer.from(value).toString('base64url');
}
