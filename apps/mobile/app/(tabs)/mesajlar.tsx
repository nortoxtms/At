import { useRouter } from 'expo-router';
import { FlatList, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TabHeader } from '@/components/TabHeader';
import { Txt } from '@/components/Text';
import { Avatar, DemoNotice, EmptyState, Loading } from '@/components/ui';
import { SAMPLE_THREADS, type SampleThread } from '@/content/sample';
import { api } from '@/lib/api';
import type { ConversationSummary } from '@/lib/endpoints';
import { relativeTime } from '@/lib/format';
import { useSession } from '@/lib/session';
import { useAsync, useReloadOnFocus } from '@/lib/useAsync';
import { theme } from '@/theme/tokens';

/**
 * S21 — the inbox.
 *
 * §16's threads are always about something: a listing, a service or a job. So
 * the row shows the subject under the name rather than a message preview alone
 * — with three enquiries about three horses from the same yard, the preview is
 * the only thing that tells them apart, and it is the wrong thing.
 */
function normalise(thread: ConversationSummary): SampleThread {
  return {
    id: thread.id,
    counterparty: thread.counterpartName ?? 'Silinmiş hesap',
    counterpartyHandle: thread.counterpartId ?? '',
    // §12's summary carries the context's title, not its slug — opening the
    // listing needs a second read, so the row links to the conversation and
    // the conversation links to the listing.
    listingSlug: '',
    listingTitle: thread.contextTitle ?? '',
    horseName: thread.contextTitle ?? '',
    unread: thread.unread ? 1 : 0,
    lastAt: thread.lastMessageAt ?? '',
    messages: thread.lastMessageBody
      ? [
          {
            id: 'last',
            fromMe: false,
            body: thread.lastMessageBody,
            sentAt: thread.lastMessageAt ?? '',
          },
        ]
      : [],
  };
}

export default function MessagesScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { me, ready } = useSession();

  const { data, loading, reload } = useAsync(async () => {
    const result = await api<ConversationSummary[]>('/conversations');
    if (result.ok && Array.isArray(result.data)) {
      return { data: result.data.map(normalise), source: 'live' as const };
    }
    return { data: SAMPLE_THREADS, source: 'demo' as const };
  }, [me?.id]);

  // Coming back from a screen that added something must show it.
  useReloadOnFocus(reload);

  const threads = data?.data ?? [];

  return (
    <View style={{ flex: 1, backgroundColor: theme.color.bg, paddingTop: insets.top }}>
      <View style={{ paddingHorizontal: theme.screenPadding }}>
        <TabHeader title="Mesajlar" />
      </View>

      {!ready || loading ? (
        <Loading />
      ) : (
        <FlatList
          data={threads}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingHorizontal: theme.screenPadding, paddingBottom: theme.space.xxxl }}
          ListHeaderComponent={
            data?.source === 'demo' ? <DemoNotice style={{ marginBottom: theme.space.lg }} /> : null
          }
          ItemSeparatorComponent={() => (
            <View style={{ height: 1, backgroundColor: theme.color.border }} />
          )}
          ListEmptyComponent={
            <EmptyState
              icon="chatbubble-ellipses-outline"
              title="Kutun boş"
              body="Bir ilana mesaj attığında konuşma burada açılır."
            />
          }
          renderItem={({ item }) => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${item.counterparty} ile konuşma`}
              onPress={() => router.push(`/mesajlar/${item.id}`)}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: theme.space.md,
                paddingVertical: theme.space.lg,
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <Avatar name={item.counterparty} size={44} />

              <View style={{ flex: 1, gap: 2 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: theme.space.sm }}>
                  <Txt variant="h3" numberOfLines={1} style={{ flex: 1 }}>
                    {item.counterparty}
                  </Txt>
                  <Txt variant="caption" color={theme.color.textSecondary} display={false}>
                    {relativeTime(item.lastAt)}
                  </Txt>
                </View>

                {item.listingTitle ? (
                  <Txt variant="caption" color={theme.color.goldSoft} display={false} numberOfLines={1}>
                    {item.listingTitle}
                  </Txt>
                ) : null}

                <Txt
                  variant="small"
                  color={theme.color.textSecondary}
                  display={false}
                  numberOfLines={1}
                >
                  {item.messages.at(-1)?.body ?? ''}
                </Txt>
              </View>

              {item.unread > 0 ? (
                <View
                  style={{
                    minWidth: 22,
                    height: 22,
                    paddingHorizontal: 6,
                    borderRadius: 11,
                    backgroundColor: theme.color.goldSoft,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Txt variant="caption" display={false} color={theme.color.textOnGold}>
                    {item.unread}
                  </Txt>
                </View>
              ) : null}
            </Pressable>
          )}
        />
      )}
    </View>
  );
}
