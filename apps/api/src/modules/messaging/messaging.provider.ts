/**
 * Messaging abstraction — spec §15.2.
 *
 * "Implement `MessagingService` interface in the API with methods
 * `createChannel`, `issueToken`, `sendSystemMessage`, `muteChannel`,
 * `deleteChannel`. Stream Chat is one implementation; a self-hosted
 * implementation must be possible without touching call sites."
 *
 * The spec asks for this seam by name, which is unusual — and correct.
 * Message history is the one dataset that becomes unmovable if it lives only
 * in a vendor: §24.14's export obligation and any future dispute both need it
 * back.
 */
export interface ChannelMember {
  profileId: string;
  displayName: string;
}

export interface CreateChannelInput {
  channelId: string;
  contextType: 'listing' | 'service' | 'job' | 'horse' | 'direct';
  contextId: string | null;
  members: ChannelMember[];
  /** Rendered as the pinned card at the top of the thread (§15.1). */
  contextTitle: string;
}

export interface SystemMessageInput {
  channelId: string;
  text: string;
  /** Quick actions render as structured attachments, not as plain text. */
  attachment?: { type: string; payload: Record<string, unknown> };
}

export interface MessagingProvider {
  readonly name: string;

  createChannel(input: CreateChannelInput): Promise<{ channelId: string }>;

  /** Short-lived token the client uses to connect directly (§12). */
  issueToken(profileId: string): Promise<{ token: string; expiresAt: Date }>;

  sendSystemMessage(input: SystemMessageInput): Promise<void>;

  muteChannel(channelId: string, profileId: string, muted: boolean): Promise<void>;

  deleteChannel(channelId: string): Promise<void>;
}

export const MESSAGING_PROVIDER = Symbol('MESSAGING_PROVIDER');

/**
 * §15.1's quick actions. They are structured attachments rather than typed
 * text so both sides render the same thing and the API can act on them —
 * "Sağlık dosyası iste" actually creates the access request.
 */
export const QUICK_ACTIONS = {
  request_health: 'Sağlık dosyası iste',
  propose_viewing: 'Görüşme öner',
  propose_ppe: 'Veteriner muayenesi (PPE) öner',
  share_horse: 'Atı paylaş',
  propose_price: 'Fiyat teklif et',
} as const;

export type QuickAction = keyof typeof QUICK_ACTIONS;
