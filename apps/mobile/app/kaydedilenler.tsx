import { useRouter } from 'expo-router';
import { FlatList, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ListingCard } from '@/components/ListingCard';
import { Button } from '@/components/Button';
import { Txt } from '@/components/Text';
import { BackButton, EmptyState, Loading } from '@/components/ui';
import type { ListingSearchHit } from '@only-horses/shared-types';
import { api } from '@/lib/api';
import { useSession } from '@/lib/session';
import { useAsync } from '@/lib/useAsync';
import { theme } from '@/theme/tokens';

/**
 * S19 — saved listings.
 *
 * Signed out, this is empty and says why. §10's saved items are per account,
 * not per device: a local list would be lost on reinstall and would silently
 * disagree with the same list on the web.
 */
export default function SavedScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { me, ready } = useSession();

  const { data, loading } = useAsync(async () => {
    if (!me) return [];
    const result = await api<ListingSearchHit[]>('/me/saved');
    return result.ok && Array.isArray(result.data) ? result.data : [];
  }, [me?.id]);

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
          keyExtractor={(item) => item.id}
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
          renderItem={({ item }) => <ListingCard hit={item} />}
        />
      )}
    </View>
  );
}
