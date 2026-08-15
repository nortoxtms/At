import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { ProductSearchHit } from '@only-horses/shared-types';

import { ListingCard } from '@/components/ListingCard';
import { ProductCard } from '@/components/ProductCard';
import { Txt } from '@/components/Text';
import { Wordmark } from '@/components/Wordmark';
import { DemoNotice, EmptyState, Loading } from '@/components/ui';
import { api } from '@/lib/api';
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
/**
 * Six tiles, two rows of three.
 *
 * §18.0 resolved the fifth tile as Jobs when there were five things to reach.
 * There are six now: equipment is not a sub-case of anything above it — a
 * saddle, a ton of hay and fifty metres of fencing are what a yard buys most
 * weeks, and burying that behind "Hizmetler" would hide the busiest half of
 * the market. Two rows of three stays reachable with one thumb at 390 pt;
 * a single row of six does not.
 */
const CATEGORIES: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  href: string;
}[] = [
  { label: 'Satılık at', icon: 'pricetag-outline', href: '/ara?type=sale' },
  { label: 'Kiralık at', icon: 'repeat-outline', href: '/ara?type=lease' },
  { label: 'Ekipman', icon: 'cube-outline', href: '/urunler' },
  { label: 'Hizmetler', icon: 'construct-outline', href: '/hizmetler' },
  { label: 'Uzmanlar', icon: 'ribbon-outline', href: '/uzmanlar' },
  { label: 'İş ilanları', icon: 'briefcase-outline', href: '/isler' },
];

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { me } = useSession();

  const { data, loading } = useAsync(() => searchListings(), []);

  const { data: unreadCount } = useAsync(async () => {
    if (!me) return 0;
    const result = await api<{ readAt: string | null }[]>('/notifications?unreadOnly=true&limit=50');
    return result.ok && Array.isArray(result.data) ? result.data.length : 0;
  }, [me?.id]);

  const { data: products } = useAsync(async () => {
    const result = await api<ProductSearchHit[]>('/products/search?limit=4', { auth: false });
    return result.ok && Array.isArray(result.data) ? result.data : [];
  }, []);

  const unread = unreadCount ?? 0;
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

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space.lg }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              unread > 0 ? `Bildirimler, ${unread} okunmamış` : 'Bildirimler'
            }
            onPress={() => router.push('/bildirimler')}
            hitSlop={12}
            style={{ minHeight: theme.metric.minTouchTarget, justifyContent: 'center' }}
          >
            <Ionicons name="notifications-outline" size={22} color={theme.color.textSecondary} />
            {/*
              §21's badge is a count, not a dot. "You have something" sends
              people in to find one stale reminder; "7" is a reason to go.
            */}
            {unread > 0 ? (
              <View
                style={{
                  position: 'absolute',
                  top: 4,
                  right: -6,
                  minWidth: 18,
                  height: 18,
                  paddingHorizontal: 5,
                  borderRadius: 9,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: theme.color.goldSoft,
                }}
              >
                <Txt variant="caption" display={false} color={theme.color.textOnGold}>
                  {unread > 9 ? '9+' : unread}
                </Txt>
              </View>
            ) : null}
          </Pressable>

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
          flexWrap: 'wrap',
          rowGap: theme.space.lg,
        }}
      >
        {CATEGORIES.map((category) => (
          <Pressable
            key={category.label}
            accessibilityRole="button"
            accessibilityLabel={category.label}
            onPress={() => router.push(category.href as never)}
            style={({ pressed }) => ({
              alignItems: 'center',
              gap: 6,
              opacity: pressed ? 0.7 : 1,
              width: '33.33%',
            })}
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

      {(products ?? []).length > 0 ? (
        <View style={{ marginTop: theme.space.xxl, paddingHorizontal: theme.screenPadding }}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: theme.space.md,
            }}
          >
            <Txt variant="h2">Ekipman</Txt>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Tüm ekipman"
              onPress={() => router.push('/urunler')}
              hitSlop={8}
              style={{ minHeight: theme.metric.minTouchTarget, justifyContent: 'center' }}
            >
              <Txt variant="small" color={theme.color.goldSoft} display={false}>
                Tümü
              </Txt>
            </Pressable>
          </View>

          {(products ?? []).slice(0, 4).map((product, index) => (
            <View key={product.id}>
              {index > 0 ? (
                <View style={{ height: 1, backgroundColor: theme.color.border }} />
              ) : null}
              <ProductCard hit={product} />
            </View>
          ))}
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
