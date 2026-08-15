import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ListingCard } from '@/components/ListingCard';
import { Txt } from '@/components/Text';
import { Wordmark } from '@/components/Wordmark';
import { DemoNotice, EmptyState, Loading } from '@/components/ui';
import { searchListings } from '@/lib/catalog';
import { useAsync } from '@/lib/useAsync';
import { useSession } from '@/lib/session';
import { theme } from '@/theme/tokens';

/**
 * S05 — Home.
 *
 * The mockup's fifth screen: wordmark, a search field that is a button rather
 * than an input, five category tiles, a horizontal "Öne çıkanlar" rail and
 * then the feed. §18.0's resolved deviation puts Jobs in the fifth tile.
 *
 * The search field does not accept text here. Tapping it pushes the search
 * screen, which owns the query, the filters and the results — one place that
 * can search, rather than a field on Home that has to keep its own state in
 * sync with the one on the search tab.
 */
const CATEGORIES: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  href: string;
}[] = [
  { label: 'Satılık', icon: 'pricetag-outline', href: '/ara?type=sale' },
  { label: 'Kiralık', icon: 'repeat-outline', href: '/ara?type=lease' },
  { label: 'Hizmetler', icon: 'construct-outline', href: '/hizmetler' },
  { label: 'Uzmanlar', icon: 'ribbon-outline', href: '/uzmanlar' },
  { label: 'İş ilanları', icon: 'briefcase-outline', href: '/isler' },
];

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { me } = useSession();

  const { data, loading } = useAsync(() => searchListings(), []);
  const listings = data?.data ?? [];
  const featured = listings.filter((hit) => hit.isBoosted).slice(0, 6);
  const feed = listings.filter((hit) => !hit.isBoosted);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.color.bg }}
      contentContainerStyle={{ paddingTop: insets.top + theme.space.sm, paddingBottom: theme.space.xxxl }}
      showsVerticalScrollIndicator={false}
    >
      <View
        style={{
          paddingHorizontal: theme.screenPadding,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <Wordmark size="small" />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Kaydedilenler"
          onPress={() => router.push('/kaydedilenler')}
          hitSlop={12}
          style={{ minHeight: theme.metric.minTouchTarget, justifyContent: 'center' }}
        >
          <Ionicons name="bookmark-outline" size={22} color={theme.color.textSecondary} />
        </Pressable>
      </View>

      {me ? (
        <Txt
          variant="small"
          color={theme.color.textSecondary}
          display={false}
          style={{ paddingHorizontal: theme.screenPadding, marginTop: theme.space.md }}
        >
          Merhaba {me.displayName}
        </Txt>
      ) : null}

      <Pressable
        accessibilityRole="search"
        accessibilityLabel="At, ırk veya şehir ara"
        onPress={() => router.push('/ara')}
        style={{
          marginTop: theme.space.lg,
          marginHorizontal: theme.screenPadding,
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.space.md,
          height: theme.metric.filterRowHeight,
          paddingHorizontal: theme.space.lg,
          borderRadius: theme.radius.md,
          backgroundColor: theme.color.surfaceInput,
          borderWidth: 1,
          borderColor: theme.color.border,
        }}
      >
        <Ionicons name="search" size={18} color={theme.color.textSecondary} />
        <Txt variant="body" color={theme.color.textSecondary} display={false}>
          At, ırk veya şehir ara
        </Txt>
      </Pressable>

      <View
        style={{
          marginTop: theme.space.xl,
          paddingHorizontal: theme.screenPadding,
          flexDirection: 'row',
          justifyContent: 'space-between',
        }}
      >
        {CATEGORIES.map((category) => (
          <Pressable
            key={category.label}
            accessibilityRole="button"
            accessibilityLabel={category.label}
            onPress={() => router.push(category.href as never)}
            style={({ pressed }) => ({ alignItems: 'center', gap: 6, opacity: pressed ? 0.7 : 1, flex: 1 })}
          >
            <View
              style={{
                width: theme.metric.categoryTile,
                height: theme.metric.categoryTile,
                borderRadius: theme.radius.md,
                backgroundColor: theme.color.surfaceRaised,
                borderWidth: 1,
                borderColor: theme.color.border,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Ionicons name={category.icon} size={24} color={theme.color.goldSoft} />
            </View>
            <Txt variant="caption" color={theme.color.textSecondary} display={false} align="center">
              {category.label}
            </Txt>
          </Pressable>
        ))}
      </View>

      {data?.source === 'demo' ? (
        <DemoNotice style={{ marginTop: theme.space.xl, marginHorizontal: theme.screenPadding }} />
      ) : null}

      {loading ? <Loading /> : null}

      {!loading && featured.length > 0 ? (
        <View style={{ marginTop: theme.space.xxl }}>
          <SectionTitle title="Öne çıkanlar" />
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{
              paddingHorizontal: theme.screenPadding,
              gap: theme.space.md,
            }}
          >
            {featured.map((hit) => (
              <View key={hit.id} style={{ width: 260 }}>
                <ListingCard hit={hit} />
              </View>
            ))}
          </ScrollView>
        </View>
      ) : null}

      {!loading ? (
        <View style={{ marginTop: theme.space.xxl, paddingHorizontal: theme.screenPadding }}>
          <SectionTitle title="Yeni ilanlar" padded={false} />
          {feed.length === 0 ? (
            <EmptyState
              icon="search-outline"
              title="Henüz ilan yok"
              body="İlk ilanı sen ver — sağ alttaki artıya bas."
            />
          ) : (
            <View style={{ gap: theme.space.lg, marginTop: theme.space.md }}>
              {feed.map((hit) => (
                <ListingCard key={hit.id} hit={hit} />
              ))}
            </View>
          )}
        </View>
      ) : null}
    </ScrollView>
  );
}

function SectionTitle({ title, padded = true }: { title: string; padded?: boolean }) {
  return (
    <Txt
      variant="h2"
      style={{
        paddingHorizontal: padded ? theme.screenPadding : 0,
        marginBottom: theme.space.md,
      }}
    >
      {title}
    </Txt>
  );
}
