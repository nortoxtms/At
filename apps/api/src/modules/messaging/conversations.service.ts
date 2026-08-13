import { randomUUID } from 'node:crypto';

import { Inject, Injectable, Logger } from '@nestjs/common';
import { detectOffsitePaymentLanguage, UNLIMITED } from '@only-horses/shared-types';

import { ApiException } from '../../common/filters/api-exception.filter.js';
import { DatabaseService } from '../../database/database.service.js';
import { AccessGrantsService } from '../access-grants/access-grants.service.js';
import { EntitlementsService } from '../entitlements/entitlements.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import {
  MESSAGING_PROVIDER,
  QUICK_ACTIONS,
  type MessagingProvider,
  type QuickAction,
} from './messaging.provider.js';

/**
 * Conversations — spec §15, §13.4, §13.5.
 *
 * §15.1: "A conversation is always created **with context**." There is no
 * path here that opens an empty thread — the context is what makes a message
 * answerable, and it is what the §18.2 S22 pinned card renders.
 */

export interface ConversationSummary {
  id: string;
  contextType: string | null;
  contextId: string | null;
  contextTitle: string | null;
  counterpartId: string | null;
  counterpartName: string | null;
  lastMessageAt: string | null;
  lastMessageBody: string | null;
  unread: boolean;
  isArchived: boolean;
  blocked: boolean;
}

@Injectable()
export class ConversationsService {
  private readonly logger = new Logger(ConversationsService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly entitlements: EntitlementsService,
    private readonly notifications: NotificationsService,
    private readonly grants: AccessGrantsService,
    @Inject(MESSAGING_PROVIDER) private readonly messaging: MessagingProvider,
  ) {}

  /** §12 POST /conversations. */
  async create(
    profileId: string,
    input: {
      contextType: 'listing' | 'service' | 'job' | 'horse' | 'direct';
      contextId?: string;
      participantId: string;
      firstMessage: string;
    },
  ): Promise<{ conversationId: string; messageId: string }> {
    if (input.participantId === profileId) {
      throw ApiException.validation('Kendine mesaj gönderemezsin.');
    }

    // §24.13: blocking freezes threads and prevents new ones. Checked in both
    // directions — a blocked user must not be able to route around it by
    // opening the conversation themselves.
    await this.assertNotBlocked(profileId, input.participantId);

    // §3.3's daily message cap. Enforced here rather than by a rate limiter
    // because the limit is a plan entitlement, not abuse protection, and the
    // client needs LIMIT_EXCEEDED to open the paywall rather than a 429.
    const entitlements = await this.entitlements.forProfile(profileId);
    if (
      entitlements.limits.messagesPerDay !== UNLIMITED &&
      entitlements.usage.messagesToday >= entitlements.limits.messagesPerDay
    ) {
      throw ApiException.limitExceeded(
        `Günlük ${entitlements.limits.messagesPerDay} mesaj sınırına ulaştın.`,
        {
          used: entitlements.usage.messagesToday,
          limit: entitlements.limits.messagesPerDay,
          tier: entitlements.tier,
        },
      );
    }

    const context = await this.resolveContext(input.contextType, input.contextId ?? null);
    const conversationId = randomUUID();

    const { messageId, isNew } = await this.db.withUser(profileId, async (client) => {
      // One thread per pair per context: a buyer tapping "Mesaj gönder" twice
      // must land back in the conversation they already have, not start a
      // parallel one the seller has to reconcile.
      const { rows: existing } = await client.query<{ id: string }>(
        `SELECT c.id FROM conversations c
         WHERE c.context_type = $1
           AND c.context_id IS NOT DISTINCT FROM $2::uuid
           AND EXISTS (SELECT 1 FROM conversation_participants p
                       WHERE p.conversation_id = c.id AND p.profile_id = $3)
           AND EXISTS (SELECT 1 FROM conversation_participants p
                       WHERE p.conversation_id = c.id AND p.profile_id = $4)
         LIMIT 1`,
        [input.contextType, input.contextId ?? null, profileId, input.participantId],
      );

      const id = existing[0]?.id ?? conversationId;

      if (!existing[0]) {
        // The channel id is passed separately rather than reusing $1: the
        // same placeholder read once as uuid and once as text gives Postgres
        // no single type to deduce.
        await client.query(
          `INSERT INTO conversations (id, stream_channel_id, context_type, context_id, created_by)
           VALUES ($1::uuid, $2, $3, $4, $5)`,
          [id, id, input.contextType, input.contextId ?? null, profileId],
        );

        for (const participant of [profileId, input.participantId]) {
          await client.query(
            `INSERT INTO conversation_participants (conversation_id, profile_id, role)
             VALUES ($1, $2, $3)`,
            [id, participant, participant === profileId ? 'initiator' : 'member'],
          );
        }
      }

      const message = await this.appendMessage(client, id, profileId, input.firstMessage);

      return { messageId: message, isNew: !existing[0] };
    });

    const targetId = isNew ? conversationId : await this.findExisting(profileId, input);

    if (isNew) {
      await this.messaging.createChannel({
        channelId: conversationId,
        contextType: input.contextType,
        contextId: input.contextId ?? null,
        members: [],
        contextTitle: context.title,
      });

      // §15.1: the context is pinned as a card and included in the first
      // system message, so a thread opened from a listing still reads as
      // being about that listing three weeks later.
      await this.messaging.sendSystemMessage({
        channelId: conversationId,
        text: context.title,
        attachment: { type: 'context_card', payload: { ...context, id: input.contextId } },
      });

      if (input.contextType === 'listing' && input.contextId) {
        await this.openInquiry(conversationId, input.contextId, profileId);
      }
    }

    await this.notifications.dispatch({
      profileId: input.participantId,
      type: 'message.new',
      title: context.title,
      body: input.firstMessage.slice(0, 140),
      data: { conversationId: targetId },
      channels: ['push', 'in_app'],
    });

    return { conversationId: targetId, messageId };
  }

  /** §12 POST /conversations/:id/messages. */
  async send(
    profileId: string,
    conversationId: string,
    body: string,
  ): Promise<{ messageId: string; paymentWarning: boolean }> {
    const participant = await this.assertParticipant(profileId, conversationId);

    // §24.13: an existing thread with a blocked party becomes read-only.
    if (participant.blocked) {
      throw ApiException.forbidden('Bu konuşma engellendiği için kapalı.');
    }

    const warning = detectOffsitePaymentLanguage(body);

    const messageId = await this.db.withUser(profileId, (client) =>
      this.appendMessage(client, conversationId, profileId, body),
    );

    const counterpart = await this.counterpartOf(profileId, conversationId);

    if (counterpart) {
      // §13.5: response rate is replies within 48 h to first-time inquiries.
      // Stamping the first reply here is what makes it measurable.
      await this.db.queryAs(
        profileId,
        `UPDATE inquiries SET first_reply_at = now(), outcome = 'in_progress'
         WHERE conversation_id = $1 AND seller_id = $2 AND first_reply_at IS NULL`,
        [conversationId, profileId],
      );

      await this.notifications.dispatch({
        profileId: counterpart,
        type: 'message.new',
        title: 'Yeni mesaj',
        body: body.slice(0, 140),
        data: { conversationId },
        channels: ['push', 'in_app'],
      });
    }

    if (warning) {
      // §14.3: "Message scanner that shows an inline warning when off-platform
      // payment language is detected." The warning goes to the *recipient*,
      // who is the one at risk, and the thread is flagged for review.
      this.logger.warn(`Off-platform payment language in conversation ${conversationId}`);

      await this.db.query(
        `SELECT open_moderation_case('message', $1, 4::smallint, $2::jsonb, $3)`,
        [
          conversationId,
          JSON.stringify({ offsite_payment_language: true, message_id: messageId }),
          profileId,
        ],
      );
    }

    return { messageId, paymentWarning: warning };
  }

  /**
   * §12 POST /conversations/:id/quick-action, §15.1.
   *
   * These are not canned text. "Sağlık dosyası iste" creates the actual
   * access request (§2), so the buyer does not have to leave the thread and
   * find the button on the listing page.
   */
  async quickAction(
    profileId: string,
    conversationId: string,
    action: QuickAction,
    payload: Record<string, unknown> = {},
  ): Promise<{ action: QuickAction; result: Record<string, unknown> }> {
    await this.assertParticipant(profileId, conversationId);

    const conversation = await this.db.queryAs<{ context_type: string; context_id: string | null }>(
      profileId,
      `SELECT context_type, context_id FROM conversations WHERE id = $1`,
      [conversationId],
    );

    const context = conversation[0];
    let result: Record<string, unknown> = {};

    if (action === 'request_health') {
      if (context?.context_type !== 'listing' || !context.context_id) {
        throw ApiException.validation('Sağlık dosyası yalnızca ilan konuşmalarından istenebilir.');
      }

      const horse = await this.db.query<{ horse_id: string }>(
        `SELECT horse_id FROM listings WHERE id = $1`,
        [context.context_id],
      );

      const horseId = horse[0]?.horse_id;
      if (!horseId) throw ApiException.notFound('İlan');

      result = await this.grants.request(profileId, horseId, {
        scope: ['health'],
        message: String(payload.message ?? 'Sağlık dosyasını görebilir miyim?'),
      });
    }

    // §18.2 S22 renders these as centred chips, so the text is written to read
    // as a statement of what happened rather than as someone speaking.
    await this.messaging.sendSystemMessage({
      channelId: conversationId,
      text: QUICK_ACTIONS[action],
      attachment: { type: 'quick_action', payload: { action, ...payload, ...result } },
    });

    return { action, result };
  }

  /** §12 GET /conversations, §18.2 S21. */
  async list(profileId: string, filter?: 'buying' | 'selling' | 'job'): Promise<ConversationSummary[]> {
    const rows = await this.db.queryAs<Record<string, never>>(
      profileId,
      `SELECT c.id, c.context_type, c.context_id, c.last_message_at, c.is_archived,
              me.last_read_at, me.blocked,
              other.profile_id AS counterpart_id,
              op.display_name AS counterpart_name,
              (SELECT m.body FROM conversation_messages m
                WHERE m.conversation_id = c.id AND m.is_system = FALSE
                ORDER BY m.created_at DESC LIMIT 1) AS last_body,
              (SELECT max(m.created_at) FROM conversation_messages m
                WHERE m.conversation_id = c.id) AS last_at,
              CASE c.context_type
                WHEN 'listing' THEN (SELECT l.title FROM listings l WHERE l.id = c.context_id)
                WHEN 'job' THEN (SELECT j.title FROM job_listings j WHERE j.id = c.context_id)
                WHEN 'horse' THEN (SELECT h.name FROM horses h WHERE h.id = c.context_id)
              END AS context_title,
              (SELECT l.seller_profile_id FROM listings l WHERE l.id = c.context_id) AS listing_seller
       FROM conversations c
       JOIN conversation_participants me ON me.conversation_id = c.id AND me.profile_id = $1
       LEFT JOIN conversation_participants other
              ON other.conversation_id = c.id AND other.profile_id <> $1
       LEFT JOIN profiles op ON op.id = other.profile_id
       ORDER BY COALESCE(c.last_message_at, c.created_at) DESC`,
      [profileId],
    );

    const summaries = rows.map((raw) => {
      const row = raw as unknown as Record<string, unknown>;
      const lastAt = (row.last_at ?? row.last_message_at) as string | null;
      const lastRead = row.last_read_at as string | null;

      return {
        id: row.id as string,
        contextType: (row.context_type as string | null) ?? null,
        contextId: (row.context_id as string | null) ?? null,
        contextTitle: (row.context_title as string | null) ?? null,
        counterpartId: (row.counterpart_id as string | null) ?? null,
        counterpartName: (row.counterpart_name as string | null) ?? null,
        lastMessageAt: lastAt,
        lastMessageBody: (row.last_body as string | null) ?? null,
        unread: Boolean(lastAt) && (!lastRead || new Date(lastAt!) > new Date(lastRead)),
        isArchived: Boolean(row.is_archived),
        blocked: Boolean(row.blocked),
        _listingSeller: (row.listing_seller as string | null) ?? null,
      };
    });

    // §18.2 S21's tabs. "Buying" and "selling" are the same table read from
    // two sides, so the filter is which side of the listing you are on.
    const filtered = summaries.filter((summary) => {
      if (!filter) return true;
      if (filter === 'job') return summary.contextType === 'job';
      if (filter === 'selling') return summary._listingSeller === profileId;
      return summary.contextType === 'listing' && summary._listingSeller !== profileId;
    });

    return filtered.map(({ _listingSeller: _unused, ...summary }) => summary);
  }

  async messages(profileId: string, conversationId: string, limit = 100): Promise<unknown[]> {
    await this.assertParticipant(profileId, conversationId);

    const rows = await this.db.queryAs<Record<string, never>>(
      profileId,
      `SELECT m.id, m.sender_id, m.body, m.attachment, m.is_system, m.payment_warning,
              m.created_at, p.display_name AS sender_name
       FROM conversation_messages m
       LEFT JOIN profiles p ON p.id = m.sender_id
       WHERE m.conversation_id = $1
       ORDER BY m.created_at
       LIMIT $2`,
      [conversationId, limit],
    );

    await this.db.queryAs(
      profileId,
      `UPDATE conversation_participants SET last_read_at = now()
       WHERE conversation_id = $1 AND profile_id = $2`,
      [conversationId, profileId],
    );

    return rows;
  }

  async archive(profileId: string, conversationId: string): Promise<void> {
    await this.assertParticipant(profileId, conversationId);
    await this.db.queryAs(
      profileId,
      `UPDATE conversations SET is_archived = TRUE WHERE id = $1`,
      [conversationId],
    );
  }

  async issueToken(profileId: string) {
    return this.messaging.issueToken(profileId);
  }

  /**
   * Appends a message and keeps the two derived counters honest:
   * `conversations.last_message_at` for the inbox ordering, and
   * `conversation_participants.message_count` for §13.4's review eligibility.
   */
  private async appendMessage(
    client: { query: (text: string, params: unknown[]) => Promise<{ rows: unknown[] }> },
    conversationId: string,
    senderId: string,
    body: string,
  ): Promise<string> {
    const messageId = randomUUID();
    const warning = detectOffsitePaymentLanguage(body);

    await client.query(
      `INSERT INTO conversation_messages (id, conversation_id, sender_id, body, payment_warning)
       VALUES ($1,$2,$3,$4,$5)`,
      [messageId, conversationId, senderId, body, warning],
    );

    await client.query(`UPDATE conversations SET last_message_at = now() WHERE id = $1`, [
      conversationId,
    ]);

    await client.query(
      `UPDATE conversation_participants SET message_count = message_count + 1
       WHERE conversation_id = $1 AND profile_id = $2`,
      [conversationId, senderId],
    );

    return messageId;
  }

  /**
   * §15.1: "The first message from a buyer creates an `inquiries` row."
   *
   * Written as the buyer, which `inquiries_insert` allows. The listing's
   * inquiry counter is bumped by a trigger (migration 0033) rather than here —
   * a buyer has no rights over the seller's listing row, and a counter that
   * can drift from the rows it counts is worse than no counter.
   */
  private async openInquiry(
    conversationId: string,
    listingId: string,
    buyerId: string,
  ): Promise<void> {
    await this.db.queryAs(
      buyerId,
      `INSERT INTO inquiries (conversation_id, listing_id, buyer_id, seller_id, outcome)
       SELECT $1, l.id, $2, l.seller_profile_id, 'no_reply'
       FROM listings l WHERE l.id = $3 AND l.seller_profile_id <> $2`,
      [conversationId, buyerId, listingId],
    );
  }

  private async resolveContext(
    contextType: string,
    contextId: string | null,
  ): Promise<{ type: string; title: string }> {
    if (contextType === 'direct' || !contextId) {
      return { type: contextType, title: 'Doğrudan mesaj' };
    }

    const sql: Record<string, string> = {
      listing: 'SELECT title FROM listings WHERE id = $1',
      service: 'SELECT title FROM service_listings WHERE id = $1',
      job: 'SELECT title FROM job_listings WHERE id = $1',
      horse: 'SELECT name AS title FROM horses WHERE id = $1',
    };

    const rows = await this.db.query<{ title: string }>(sql[contextType] ?? sql.listing!, [
      contextId,
    ]);

    if (!rows[0]) throw ApiException.notFound('Konuşma konusu');
    return { type: contextType, title: rows[0].title };
  }

  private async assertParticipant(
    profileId: string,
    conversationId: string,
  ): Promise<{ blocked: boolean }> {
    const rows = await this.db.queryAs<{ blocked: boolean }>(
      profileId,
      `SELECT blocked FROM conversation_participants
       WHERE conversation_id = $1 AND profile_id = $2`,
      [conversationId, profileId],
    );

    if (!rows[0]) throw ApiException.notFound('Konuşma');
    return rows[0];
  }

  private async counterpartOf(profileId: string, conversationId: string): Promise<string | null> {
    const rows = await this.db.queryAs<{ profile_id: string }>(
      profileId,
      `SELECT profile_id FROM conversation_participants
       WHERE conversation_id = $1 AND profile_id <> $2 LIMIT 1`,
      [conversationId, profileId],
    );
    return rows[0]?.profile_id ?? null;
  }

  /**
   * §24.13. Routed through a SECURITY DEFINER function (migration 0036): the
   * question spans both directions, and `blocks_select` deliberately shows a
   * user only the blocks they made — being able to enumerate who has blocked
   * you is itself a harassment vector. The function answers with a bare
   * boolean, which is enough to refuse and not enough to reveal.
   */
  private async assertNotBlocked(a: string, b: string): Promise<void> {
    const rows = await this.db.query<{ blocked: boolean }>(
      `SELECT is_blocked_between($1, $2) AS blocked`,
      [a, b],
    );

    if (rows[0]?.blocked) {
      // Deliberately vague: telling the sender they have been blocked is
      // information the blocker did not choose to share.
      throw ApiException.forbidden('Bu kullanıcıya mesaj gönderemezsin.');
    }
  }

  private async findExisting(
    profileId: string,
    input: { contextType: string; contextId?: string; participantId: string },
  ): Promise<string> {
    const rows = await this.db.queryAs<{ id: string }>(
      profileId,
      `SELECT c.id FROM conversations c
       WHERE c.context_type = $1
         AND c.context_id IS NOT DISTINCT FROM $2::uuid
         AND EXISTS (SELECT 1 FROM conversation_participants p
                     WHERE p.conversation_id = c.id AND p.profile_id = $3)
         AND EXISTS (SELECT 1 FROM conversation_participants p
                     WHERE p.conversation_id = c.id AND p.profile_id = $4)
       LIMIT 1`,
      [input.contextType, input.contextId ?? null, profileId, input.participantId],
    );

    return rows[0]!.id;
  }
}
