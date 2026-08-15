import { Ionicons } from '@expo/vector-icons';
import { LISTING_TYPE_LABEL_TR, SEX_LABEL_TR } from '@only-horses/shared-types';
import { useRouter } from 'expo-router';
import { FlatList, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { Txt } from '@/components/Text';
import { BackButton, DemoNotice, EmptyState, Loading } from '@/components/ui';
import { SAMPLE_STABLE, type SampleHorse } from '@/content/sample';
import { api } from '@/lib/api';
import { washFromBlurhash } from '@/lib/format';
import { useSession } from '@/lib/session';
import { useAsync } from '@/lib/useAsync';
import { theme } from '@/theme/tokens';

/**
 * S09 — My Stable, reached from Profile (§18.0's first resolved deviation).
 *
 * This is the registry, not the shop window: every horse you own appears here
 * whether or not it is for sale, and a horse that is listed says so as a
 * secondary line rather than being sorted to the top. §1.3's P1 — the identity
 * record is the product — collapses the moment this screen starts behaving
 * like a seller dashboard.
 */
interface ApiHorse {
  id: string;
  name: string;
  slug: string;
  sex: string;
  date_of_birth: string | null;
  height_cm: string | null;
  breed_name_tr: string | null;
  color: string | null;
  disciplines: string[] | null;
  cover_blurhash: string | null;
  active_listing_type: string | null;
}

function normalise(horse: ApiHorse): SampleHorse {
  const year = horse.date_of_birth ? new Date(horse.date_of_birth).getFullYear() : null;

  return {
    id: horse.id,
    name: horse.name,
    slug: horse.slug,
    sex: horse.sex,
    ageYears: year ? Math.max(0, new Date().getFullYear() - year) : 0,
    heightCm: horse.height_cm ? Math.round(Number(horse.height_cm)) : 0,
    breed: horse.breed_name_tr ?? '',
    color: horse.color ?? '',
    disciplines: horse.disciplines ?? [],
    blurhash: horse.cover_blurhash,
    listedAs: horse.active_listing_type,
  };
}

export default function StableScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { me } = useSession();

  const { data, loading } = useAsync(async () => {
    const result = await api<ApiHorse[]>('/me/horses');
    if (result.ok && Array.isArray(result.data)) {
      return { data: result.data.map(normalise), source: 'live' as const };
    }
    return { data: me ? [] : SAMPLE_STABLE, source: me ? ('live' as const) : ('demo' as const) };
  }, [me?.id]);

  const horses = data?.data ?? [];

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
          Ahırım
        </Txt>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="At ekle"
          onPress={() => router.push('/ahir/yeni')}
          hitSlop={12}
          style={{ minHeight: theme.metric.minTouchTarget, justifyContent: 'center' }}
        >
          <Ionicons name="add" size={24} color={theme.color.goldSoft} />
        </Pressable>
      </View>

      {loading ? (
        <Loading />
      ) : (
        <FlatList
          data={horses}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{
            paddingHorizontal: theme.screenPadding,
            paddingBottom: theme.space.xxxl,
          }}
          ListHeaderComponent={
            data?.source === 'demo' ? (
              <DemoNotice style={{ marginVertical: theme.space.lg }} />
            ) : (
              <View style={{ height: theme.space.lg }} />
            )
          }
          ItemSeparatorComponent={() => (
            <View style={{ height: 1, backgroundColor: theme.color.border }} />
          )}
          ListEmptyComponent={
            <EmptyState
              icon="add-circle-outline"
              title="Ahırın boş"
              body="Atını kaydet — kayıt at seninleyken başlar ve at el değiştirse bile onunla kalır."
              action={<Button label="At ekle" full={false} onPress={() => router.push('/ahir/yeni')} />}
            />
          }
          renderItem={({ item }) => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={item.name}
              onPress={() => router.push(`/ahir/${item.id}`)}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: theme.space.md,
                minHeight: theme.metric.listRowHeight,
                paddingVertical: theme.space.xs,
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <View
                style={{
                  width: theme.metric.listRowThumb,
                  height: theme.metric.listRowThumb,
                  borderRadius: theme.radius.md,
                  backgroundColor: washFromBlurhash(item.blurhash),
                }}
              />

              <View style={{ flex: 1, gap: 2 }}>
                <Txt variant="h3" numberOfLines={1}>
                  {item.name}
                </Txt>
                <Txt variant="small" color={theme.color.textSecondary} display={false}>
                  {[
                    SEX_LABEL_TR[item.sex] ?? item.sex,
                    item.ageYears ? `${item.ageYears} yaş` : null,
                    item.heightCm ? `${item.heightCm} cm` : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </Txt>
                {item.listedAs ? (
                  <Txt variant="caption" color={theme.color.goldSoft} display={false}>
                    {LISTING_TYPE_LABEL_TR[item.listedAs] ?? item.listedAs} ilanı yayında
                  </Txt>
                ) : null}
              </View>

              <Ionicons name="chevron-forward" size={16} color={theme.color.textSecondary} />
            </Pressable>
          )}
        />
      )}
    </View>
  );
}
