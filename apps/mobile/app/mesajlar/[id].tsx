import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, Pressable, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Txt } from '@/components/Text';
import { Avatar, BackButton, DemoNotice, EmptyState, Loading } from '@/components/ui';
import { SAMPLE_THREADS, type SampleMessage } from '@/content/sample';
import { api } from '@/lib/api';
import { relativeTime } from '@/lib/format';
import { useAsync } from '@/lib/useAsync';
import { theme } from '@/theme/tokens';

/**
 * S22 — a conversation.
 *
 * Two decisions worth naming. The subject sits in a bar under the header, not
 * as the first bubble: it is context for every message, and a first bubble
 * scrolls away.
 *
 * And an outgoing message appears immediately, marked as sending. §16 puts
 * messages through moderation, so the round trip is not instant; a chat that
 * waits for the server before showing what you typed feels broken on a mobile
 * connection. If the send fails the bubble says so and offers a retry rather
 * than vanishing.
 */
interface ApiMessage {
  id: string;
  body: string;
  senderId: string;
  sentAt: string;
}

type Pending = SampleMessage & { state?: 'sending' | 'failed' };

export default function ThreadScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const list = useRef<FlatList<Pending>>(null);

  const [draft, setDraft] = useState('');
  const [outgoing, setOutgoing] = useState<Pending[]>([]);

  const { data, loading } = useAsync(async () => {
    const [thread, messages] = await Promise.all([
      api<{ counterpartyName: string; subjectTitle: string | null; subjectSlug: string | null }>(
        `/messages/threads/${id}`,
      ),
      api<ApiMessage[]>(`/messages/threads/${id}/messages`),
    ]);

    if (thread.ok && messages.ok && Array.isArray(messages.data)) {
      return {
        counterparty: thread.data.counterpartyName,
        subject: thread.data.subjectTitle,
        subjectSlug: thread.data.subjectSlug,
        messages: messages.data.map<Pending>((message) => ({
          id: message.id,
          fromMe: false,
          body: message.body,
          sentAt: message.sentAt,
        })),
        source: 'live' as const,
      };
    }

    const sample = SAMPLE_THREADS.find((entry) => entry.id === id) ?? SAMPLE_THREADS[0];
    if (!sample) return null;

    return {
      counterparty: sample.counterparty,
      subject: sample.listingTitle,
      subjectSlug: sample.listingSlug,
      messages: sample.messages as Pending[],
      source: 'demo' as const,
    };
  }, [id]);

  const messages = [...(data?.messages ?? []), ...outgoing];

  useEffect(() => {
    if (messages.length > 0) {
      const timer = setTimeout(() => list.current?.scrollToEnd({ animated: false }), 60);
      return () => clearTimeout(timer);
    }
  }, [messages.length]);

  const send = async () => {
    const body = draft.trim();
    if (!body) return;

    const local: Pending = {
      id: `local-${messages.length}-${body.length}`,
      fromMe: true,
      body,
      sentAt: new Date().toISOString(),
      state: 'sending',
    };

    setOutgoing((current) => [...current, local]);
    setDraft('');

    const result = await api(`/messages/threads/${id}/messages`, {
      method: 'POST',
      body: JSON.stringify({ body }),
    });

    setOutgoing((current) =>
      current.map((message) =>
        message.id === local.id
          ? { ...message, state: result.ok ? undefined : 'failed' }
          : message,
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
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={`İlana git: ${data.subject}`}
          onPress={() => data.subjectSlug && router.push(`/ilan/${data.subjectSlug}`)}
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
          <Ionicons name="chevron-forward" size={14} color={theme.color.textSecondary} />
        </Pressable>
      ) : null}

      <FlatList
        ref={list}
        data={messages}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{
          padding: theme.screenPadding,
          gap: theme.space.md,
        }}
        ListHeaderComponent={
          data.source === 'demo' ? <DemoNotice style={{ marginBottom: theme.space.md }} /> : null
        }
        renderItem={({ item }) => (
          <View
            style={{
              alignSelf: item.fromMe ? 'flex-end' : 'flex-start',
              maxWidth: '82%',
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
        )}
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
          accessibilityState={{ disabled: !draft.trim() }}
          disabled={!draft.trim()}
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
