import { useRouter } from 'expo-router';
import { FlatList, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { Txt } from '@/components/Text';
import { BackButton, Card, EmptyState, Loading } from '@/components/ui';
import { api } from '@/lib/api';
import { relativeTime } from '@/lib/format';
import { useSession } from '@/lib/session';
import { useAsync, useReloadOnFocus } from '@/lib/useAsync';
import { theme } from '@/theme/tokens';

/**
 * S19 — saved items.
 *
 * Signed out, this is empty and says why. §10's saved items are per account,
 * not per device: a local list would be lost on reinstall and would silently
 * disagree with the same list on the web.
 *
 * `resolve_saved_items` returns listings, services and jobs in one flat set
 * with a `item_type` discriminator, so this renders a generic row rather than
 * a listing card. Filtering it down to listings would hide the saved farrier
 * without ever saying so.
 */
interface SavedRow {
  item_type: string;
  item_id: string;
  note: string | null;
  created_at: string | null;
  title: string | null;
  slug: string | null;
  subtitle: string | null;
  /** §10: a listing that closed stays on the list, marked, rather than vanishing. */
  is_available: boolean;
}

const TYPE_LABEL: Record<string, string> = {
  listing: 'İlan',
  service: 'Hizmet',
  job: 'İş',
  horse: 'At',
  profile: 'Profil',
  organization: 'İşletme',
};

export default function SavedScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { me, ready } = useSession();

  const { data, loading, reload } = useAsync(async () => {
    if (!me) return [];
    const result = await api<SavedRow[]>('/saved');
    return result.ok && Array.isArray(result.data) ? result.data : [];
  }, [me?.id]);

  // Coming back from a screen that added something must show it.
  useReloadOnFocus(reload);

  const saved = data ?? [];

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
          Kaydedilenler
        </Txt>
        <View style={{ width: theme.metric.minTouchTarget }} />
      </View>

      {!ready || loading ? (
        <Loading />
      ) : (
        <FlatList
          data={saved}
          keyExtractor={(item) => `${item.item_type}:${item.item_id}`}
          contentContainerStyle={{
            paddingHorizontal: theme.screenPadding,
            paddingVertical: theme.space.lg,
            gap: theme.space.lg,
          }}
          ListEmptyComponent={
            me ? (
              <EmptyState
                icon="bookmark-outline"
                title="Kaydettiğin ilan yok"
                body="Bir ilanın sağ üstündeki yer imine dokun; buradan takip et."
                action={<Button label="İlanlara göz at" full={false} onPress={() => router.push('/(tabs)/ara')} />}
              />
            ) : (
              <EmptyState
                icon="bookmark-outline"
                title="Kaydetmek için giriş yap"
                body="Kaydedilen ilanlar hesabına bağlıdır — telefonunu değiştirsen de kalır."
                action={<Button label="Giriş yap" full={false} onPress={() => router.push('/auth')} />}
              />
            )
          }
          renderItem={({ item }) => (
            <Pressable
              accessibilityRole={item.slug && item.item_type === 'listing' ? 'link' : 'text'}
              disabled={!item.slug || item.item_type !== 'listing'}
              onPress={() => router.push(`/ilan/${item.slug}`)}
            >
            <Card style={{ gap: 4 }}>
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: theme.space.sm }}>
                <Txt variant="h3" style={{ flex: 1 }} numberOfLines={2}>
                  {item.title ?? 'Kaldırılmış kayıt'}
                </Txt>
                <Txt variant="caption" color={theme.color.textSecondary} display={false}>
                  {TYPE_LABEL[item.item_type] ?? item.item_type}
                </Txt>
              </View>

              {item.subtitle ? (
                <Txt variant="small" color={theme.color.textSecondary} display={false} numberOfLines={1}>
                  {item.subtitle}
                </Txt>
              ) : null}

              {item.is_available ? null : (
                <Txt variant="caption" color={theme.color.warning} display={false}>
                  Artık yayında değil
                </Txt>
              )}

              {item.note ? (
                <Txt variant="caption" color={theme.color.textSecondary} display={false}>
                  Notun: {item.note}
                </Txt>
              ) : null}

              {item.created_at ? (
                <Txt variant="caption" color={theme.color.textSecondary} display={false}>
                  {relativeTime(item.created_at)} kaydedildi
                </Txt>
              ) : null}
            </Card>
            </Pressable>
          )}
        />
      )}
    </View>
  );
}
