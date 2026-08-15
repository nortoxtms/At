import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, Pressable, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Txt } from '@/components/Text';
import { Avatar, BackButton, DemoNotice, EmptyState, Loading } from '@/components/ui';
import { SAMPLE_THREADS, type SampleMessage } from '@/content/sample';
import { api } from '@/lib/api';
import type { ConversationMessage, ConversationSummary } from '@/lib/endpoints';
import { relativeTime } from '@/lib/format';
import { useSession } from '@/lib/session';
import { useAsync } from '@/lib/useAsync';
import { theme } from '@/theme/tokens';

/**
 * S22 — a conversation.
 *
 * Three decisions worth naming.
 *
 * The subject sits in a bar under the header, not as the first bubble: it is
 * context for every message, and a first bubble scrolls away.
 *
 * An outgoing message appears immediately, marked as sending. §16 puts
 * messages through moderation, so the round trip is not instant; a chat that
 * waits for the server before showing what you typed feels broken on a mobile
 * connection. If the send fails the bubble says so rather than vanishing, and
 * the text stays in the composer so nothing is lost.
 *
 * And §16's payment warning is rendered where the message is, not as a banner
 * on the screen. A warning about *this* message that floats at the top is a
 * warning about nothing in particular by the third message.
 */
type Pending = SampleMessage & { state?: 'sending' | 'failed'; warning?: boolean; system?: boolean };

export default function ThreadScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { me } = useSession();
  const list = useRef<FlatList<Pending>>(null);

  const [draft, setDraft] = useState('');
  const [outgoing, setOutgoing] = useState<Pending[]>([]);
  const [sending, setSending] = useState(false);

  const { data, loading } = useAsync(async () => {
    const [messages, summaries] = await Promise.all([
      api<ConversationMessage[]>(`/conversations/${id}`),
      api<ConversationSummary[]>('/conversations'),
    ]);

    if (messages.ok && Array.isArray(messages.data)) {
      const summary = summaries.ok
        ? (summaries.data ?? []).find((entry) => entry.id === id)
        : undefined;

      return {
        counterparty: summary?.counterpartName ?? 'Konuşma',
        subject: summary?.contextTitle ?? null,
        subjectType: summary?.contextType ?? null,
        subjectId: summary?.contextId ?? null,
        messages: messages.data.map<Pending>((message) => ({
          id: message.id,
          fromMe: !!me && message.sender_id === me.id,
          body: message.body,
          sentAt: message.created_at,
          warning: message.payment_warning,
          system: message.is_system,
        })),
        source: 'live' as const,
      };
    }

    const sample = SAMPLE_THREADS.find((entry) => entry.id === id) ?? SAMPLE_THREADS[0];
    if (!sample) return null;

    return {
      counterparty: sample.counterparty,
      subject: sample.listingTitle,
      subjectType: 'listing' as string | null,
      subjectId: null as string | null,
      messages: sample.messages as Pending[],
      source: 'demo' as const,
    };
  }, [id, me?.id]);

  const messages = [...(data?.messages ?? []), ...outgoing];

  useEffect(() => {
    if (messages.length > 0) {
      const timer = setTimeout(() => list.current?.scrollToEnd({ animated: false }), 60);
      return () => clearTimeout(timer);
    }
  }, [messages.length]);

  const send = async () => {
    const body = draft.trim();
    if (!body || sending) return;

    const local: Pending = {
      id: `local-${messages.length}-${body.length}`,
      fromMe: true,
      body,
      sentAt: new Date().toISOString(),
      state: 'sending',
    };

    setSending(true);
    setOutgoing((current) => [...current, local]);
    setDraft('');

    const result = await api(`/conversations/${id}/messages`, {
      method: 'POST',
      body: JSON.stringify({ body }),
    });

    setSending(false);

    if (!result.ok) {
      // Put the text back. A failed send that also eats the message is the
      // one failure mode people never forgive.
      setDraft(body);
    }

    setOutgoing((current) =>
      current.map((message) =>
        message.id === local.id ? { ...message, state: result.ok ? undefined : 'failed' } : message,
      ),
    );
  };

  if (loading) return <Loading />;

  if (!data) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.color.bg, paddingTop: insets.top + theme.space.xxxl }}>
        <EmptyState icon="alert-circle-outline" title="Konuşma bulunamadı" />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1, backgroundColor: theme.color.bg, paddingTop: insets.top }}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.space.md,
          paddingHorizontal: theme.screenPadding,
        }}
      >
        <BackButton onPress={() => router.back()} />
        <Avatar name={data.counterparty} size={32} />
        <Txt variant="h3" style={{ flex: 1 }} numberOfLines={1}>
          {data.counterparty}
        </Txt>
      </View>

      {data.subject ? (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: theme.space.sm,
            marginHorizontal: theme.screenPadding,
            marginTop: theme.space.sm,
            padding: theme.space.md,
            borderRadius: theme.radius.sm,
            backgroundColor: theme.color.surface,
            borderWidth: 1,
            borderColor: theme.color.border,
          }}
        >
          <Ionicons name="pricetag-outline" size={14} color={theme.color.goldSoft} />
          <Txt variant="caption" display={false} style={{ flex: 1 }} numberOfLines={1}>
            {data.subject}
          </Txt>
        </View>
      ) : null}

      <FlatList
        ref={list}
        data={messages}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: theme.screenPadding, gap: theme.space.md }}
        ListHeaderComponent={
          data.source === 'demo' ? <DemoNotice style={{ marginBottom: theme.space.md }} /> : null
        }
        ListEmptyComponent={
          <EmptyState icon="chatbubble-outline" title="Henüz mesaj yok" />
        }
        renderItem={({ item }) =>
          item.system ? (
            <Txt
              variant="caption"
              align="center"
              color={theme.color.textSecondary}
              display={false}
              style={{ paddingVertical: theme.space.sm }}
            >
              {item.body}
            </Txt>
          ) : (
            <View style={{ alignSelf: item.fromMe ? 'flex-end' : 'flex-start', maxWidth: '82%', gap: 4 }}>
              <View
                style={{
                  padding: theme.space.md,
                  borderRadius: theme.radius.md,
                  backgroundColor: item.fromMe ? theme.color.goldSoft : theme.color.surfaceRaised,
                  borderWidth: item.fromMe ? 0 : 1,
                  borderColor: theme.color.border,
                  gap: 4,
                }}
              >
                <Txt
                  variant="body"
                  display={false}
                  color={item.fromMe ? theme.color.textOnGold : theme.color.textPrimary}
                >
                  {item.body}
                </Txt>
                <Txt
                  variant="caption"
                  display={false}
                  color={item.fromMe ? theme.color.textOnGold : theme.color.textSecondary}
                  style={{ opacity: 0.75, alignSelf: 'flex-end' }}
                >
                  {item.state === 'sending'
                    ? 'gönderiliyor…'
                    : item.state === 'failed'
                      ? 'gönderilemedi'
                      : relativeTime(item.sentAt)}
                </Txt>
              </View>

              {/* §16: money moving off-platform is the scam, so the warning
                  sits on the message that mentioned it. */}
              {item.warning ? (
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 6,
                    paddingHorizontal: theme.space.md,
                    paddingVertical: 6,
                    borderRadius: theme.radius.sm,
                    backgroundColor: theme.color.surface,
                    borderWidth: 1,
                    borderColor: theme.color.warning,
                  }}
                >
                  <Ionicons name="warning-outline" size={13} color={theme.color.warning} />
                  <Txt variant="caption" color={theme.color.textSecondary} display={false} style={{ flex: 1 }}>
                    Kapora ya da havale isteyen mesajlara dikkat et. Atı görmeden ödeme yapma.
                  </Txt>
                </View>
              ) : null}
            </View>
          )
        }
      />

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'flex-end',
          gap: theme.space.sm,
          paddingHorizontal: theme.screenPadding,
          paddingTop: theme.space.sm,
          paddingBottom: insets.bottom + theme.space.sm,
          borderTopWidth: 1,
          borderTopColor: theme.color.border,
          backgroundColor: theme.color.surfaceRaised,
        }}
      >
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder="Mesaj yaz"
          placeholderTextColor={theme.color.textMuted}
          multiline
          accessibilityLabel="Mesaj"
          style={{
            flex: 1,
            maxHeight: 120,
            minHeight: theme.metric.minTouchTarget,
            paddingHorizontal: theme.space.lg,
            paddingTop: theme.space.md,
            paddingBottom: theme.space.md,
            borderRadius: theme.radius.lg,
            backgroundColor: theme.color.surfaceInput,
            borderWidth: 1,
            borderColor: theme.color.border,
            color: theme.color.textPrimary,
            fontFamily: 'Inter',
            fontSize: theme.type.body.fontSize,
          }}
        />

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Gönder"
          accessibilityState={{ disabled: !draft.trim() || sending }}
          disabled={!draft.trim() || sending}
          onPress={() => void send()}
          style={{
            width: theme.metric.minTouchTarget,
            height: theme.metric.minTouchTarget,
            borderRadius: theme.metric.minTouchTarget / 2,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: draft.trim() ? theme.color.goldSoft : theme.color.surfaceInput,
          }}
        >
          <Ionicons
            name="arrow-up"
            size={20}
            color={draft.trim() ? theme.color.textOnGold : theme.color.textSecondary}
          />
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}
