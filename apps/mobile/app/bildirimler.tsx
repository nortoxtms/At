import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { FlatList, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { Txt } from '@/components/Text';
import { BackButton, EmptyState, Loading } from '@/components/ui';
import { api } from '@/lib/api';
import { relativeTime } from '@/lib/format';
import { useSession } from '@/lib/session';
import { useAsync } from '@/lib/useAsync';
import { theme } from '@/theme/tokens';

/**
 * S20 — notifications (§21).
 *
 * Each row knows where it goes: `data` carries the id of the thing that
 * happened, so tapping a health reminder opens that horse's log rather than
 * the list of horses. A notification you cannot act on from the notification
 * is a notification that trains people to swipe it away.
 *
 * "Read" is marked in bulk on entering, not per row. §21's unread count exists
 * to say "there is something new", and once the list is open there isn't.
 */
interface Notification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  data: Record<string, unknown>;
  readAt: string | null;
  createdAt: string;
}

const ICON: Record<string, keyof typeof Ionicons.glyphMap> = {
  message: 'chatbubble-ellipses-outline',
  listing_published: 'megaphone-outline',
  listing_expiring: 'time-outline',
  listing_expired: 'time-outline',
  health_due: 'medkit-outline',
  saved_search: 'search-outline',
  review: 'star-outline',
  application: 'briefcase-outline',
  access_request: 'key-outline',
  verification: 'shield-checkmark-outline',
  moderation: 'flag-outline',
};

/** §21's payloads name the thing; this turns that into a destination. */
function destinationFor(notification: Notification): string | null {
  const data = notification.data ?? {};
  const conversationId = data.conversationId ?? data.threadId;
  const horseId = data.horseId;
  const listingSlug = data.listingSlug ?? data.slug;

  if (typeof conversationId === 'string') return `/mesajlar/${conversationId}`;
  if (notification.type === 'health_due' && typeof horseId === 'string') {
    return `/ahir/${horseId}/saglik`;
  }
  if (typeof horseId === 'string') return `/ahir/${horseId}`;
  if (typeof listingSlug === 'string') return `/ilan/${listingSlug}`;
  return null;
}

export default function NotificationsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { me, ready } = useSession();

  const { data, loading, reload } = useAsync(async () => {
    if (!me) return [];
    const result = await api<Notification[]>('/notifications?limit=50');
    const rows = result.ok && Array.isArray(result.data) ? result.data : [];

    // Marking read is fire-and-forget: a failure here costs a badge that
    // clears on the next visit, and blocking the list on it would be worse.
    if (rows.some((row) => !row.readAt)) {
      void api('/notifications/read-all', { method: 'POST' });
    }

    return rows;
  }, [me?.id]);

  const notifications = data ?? [];

  return (
    <View style={{ flex: 1, backgroundColor: theme.color.bg, paddingTop: insets.top }}>
      <View
        style={{
          paddingHorizontal: theme.screenPadding,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <BackButton onPress={() => router.back()} />
        <Txt variant="screenTitle" uppercase>
          Bildirimler
        </Txt>
        <View style={{ width: theme.metric.minTouchTarget }} />
      </View>

      {!ready || loading ? (
        <Loading />
      ) : (
        <FlatList
          data={notifications}
          keyExtractor={(item) => item.id}
          onRefresh={reload}
          refreshing={false}
          contentContainerStyle={{
            paddingHorizontal: theme.screenPadding,
            paddingBottom: theme.space.xxxl,
          }}
          ItemSeparatorComponent={() => (
            <View style={{ height: 1, backgroundColor: theme.color.border }} />
          )}
          ListEmptyComponent={
            me ? (
              <EmptyState
                icon="notifications-outline"
                title="Bildirim yok"
                body="Mesajlar, ilan hareketleri ve bakım hatırlatmaları burada birikir."
              />
            ) : (
              <EmptyState
                icon="notifications-outline"
                title="Bildirimler hesabına bağlı"
                body="Giriş yaptığında hatırlatmaların burada görünür."
                action={<Button label="Giriş yap" full={false} onPress={() => router.push('/auth')} />}
              />
            )
          }
          renderItem={({ item }) => {
            const destination = destinationFor(item);

            return (
              <Pressable
                accessibilityRole={destination ? 'button' : 'text'}
                accessibilityLabel={item.title}
                disabled={!destination}
                onPress={() => destination && router.push(destination as never)}
                style={({ pressed }) => ({
                  flexDirection: 'row',
                  alignItems: 'flex-start',
                  gap: theme.space.md,
                  paddingVertical: theme.space.lg,
                  opacity: pressed && destination ? 0.7 : 1,
                })}
              >
                <View
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 17,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: theme.color.surfaceRaised,
                    borderWidth: 1,
                    borderColor: item.readAt ? theme.color.border : theme.color.goldMuted,
                  }}
                >
                  <Ionicons
                    name={ICON[item.type] ?? 'notifications-outline'}
                    size={16}
                    color={item.readAt ? theme.color.textSecondary : theme.color.goldSoft}
                  />
                </View>

                <View style={{ flex: 1, gap: 2 }}>
                  <Txt variant="body" display={false} weight={item.readAt ? 'regular' : 'semibold'}>
                    {item.title}
                  </Txt>
                  {item.body ? (
                    <Txt variant="small" color={theme.color.textSecondary} display={false}>
                      {item.body}
                    </Txt>
                  ) : null}
                  <Txt variant="caption" color={theme.color.textSecondary} display={false}>
                    {relativeTime(item.createdAt)}
                  </Txt>
                </View>

                {destination ? (
                  <Ionicons name="chevron-forward" size={15} color={theme.color.textSecondary} />
                ) : null}
              </Pressable>
            );
          }}
        />
      )}
    </View>
  );
}
