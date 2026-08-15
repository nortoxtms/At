import { Ionicons } from '@expo/vector-icons';
import { LISTING_TYPE_LABEL_TR } from '@only-horses/shared-types';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ListingCard } from '@/components/ListingCard';
import { Txt } from '@/components/Text';
import { Chip, DemoNotice, EmptyState, Loading } from '@/components/ui';
import { LISTING_TYPES, searchListings, type ListingFilters } from '@/lib/catalog';
import { useAsync, useDebounced } from '@/lib/useAsync';
import { theme } from '@/theme/tokens';

/**
 * S06 — Search results, with S07's filters reachable from the row above them.
 *
 * The query is debounced rather than fired per keystroke: §11's search is a
 * network round trip, and typing "andalusian" at one request per character is
 * eleven searches for one answer. The type chips are not debounced — a tap is
 * a decision, and waiting 250 ms after it feels broken.
 *
 * Filters chosen in the sheet arrive back as route params, so a filtered search
 * is a URL. That is what makes it shareable and what makes the back button
 * restore the previous set rather than clear everything.
 */
export default function SearchScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{
    q?: string;
    type?: string;
    region?: string;
    sex?: string;
    discipline?: string;
    maxPriceEur?: string;
  }>();

  const [text, setText] = useState(params.q ?? '');
  const query = useDebounced(text);

  const filters = useMemo<ListingFilters>(
    () => ({
      q: query || undefined,
      type: params.type || undefined,
      region: params.region || undefined,
      sex: params.sex || undefined,
      discipline: params.discipline || undefined,
      maxPriceEur: params.maxPriceEur ? Number(params.maxPriceEur) : undefined,
    }),
    [query, params.type, params.region, params.sex, params.discipline, params.maxPriceEur],
  );

  const { data, loading } = useAsync(() => searchListings(filters), [
    filters.q,
    filters.type,
    filters.region,
    filters.sex,
    filters.discipline,
    filters.maxPriceEur,
  ]);

  const hits = data?.data ?? [];
  const activeCount = [
    params.region,
    params.sex,
    params.discipline,
    params.maxPriceEur,
  ].filter(Boolean).length;

  const setParam = (key: string, value: string | undefined) => {
    router.setParams({ ...params, [key]: value ?? '' } as never);
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.color.bg, paddingTop: insets.top }}>
      <View style={{ paddingHorizontal: theme.screenPadding, paddingTop: theme.space.sm }}>
        <View
          style={{
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
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder="At, ırk veya şehir ara"
            placeholderTextColor={theme.color.textMuted}
            autoCorrect={false}
            returnKeyType="search"
            accessibilityLabel="Arama"
            style={{
              flex: 1,
              color: theme.color.textPrimary,
              fontFamily: 'Inter',
              fontSize: theme.type.body.fontSize,
            }}
          />
          {text ? (
            <Pressable accessibilityLabel="Aramayı temizle" onPress={() => setText('')} hitSlop={10}>
              <Ionicons name="close-circle" size={18} color={theme.color.textSecondary} />
            </Pressable>
          ) : null}
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space.sm, marginTop: theme.space.md }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Filtreler${activeCount ? `, ${activeCount} etkin` : ''}`}
            onPress={() => router.push({ pathname: '/filtreler', params } as never)}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              minHeight: 36,
              paddingHorizontal: theme.space.lg,
              borderRadius: theme.radius.full,
              backgroundColor: activeCount ? theme.color.goldSoft : theme.color.surfaceRaised,
              borderWidth: 1,
              borderColor: activeCount ? theme.color.goldSoft : theme.color.border,
              opacity: pressed ? 0.8 : 1,
            })}
          >
            <Ionicons
              name="options-outline"
              size={15}
              color={activeCount ? theme.color.textOnGold : theme.color.textSecondary}
            />
            <Txt
              variant="small"
              display={false}
              color={activeCount ? theme.color.textOnGold : theme.color.textPrimary}
            >
              {activeCount ? `Filtreler · ${activeCount}` : 'Filtreler'}
            </Txt>
          </Pressable>

          <FlatList
            horizontal
            showsHorizontalScrollIndicator={false}
            data={LISTING_TYPES}
            keyExtractor={(item) => item}
            contentContainerStyle={{ gap: theme.space.sm }}
            renderItem={({ item }) => (
              <Chip
                label={LISTING_TYPE_LABEL_TR[item] ?? item}
                selected={params.type === item}
                onPress={() => setParam('type', params.type === item ? undefined : item)}
              />
            )}
          />
        </View>
      </View>

      {loading ? (
        <Loading label="Aranıyor" />
      ) : (
        <FlatList
          data={hits}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{
            paddingHorizontal: theme.screenPadding,
            paddingBottom: theme.space.xxxl,
          }}
          ListHeaderComponent={
            <View style={{ gap: theme.space.md, paddingVertical: theme.space.lg }}>
              {data?.source === 'demo' ? <DemoNotice /> : null}
              <Txt variant="small" color={theme.color.textSecondary} display={false}>
                {hits.length} ilan
              </Txt>
            </View>
          }
          ItemSeparatorComponent={() => (
            <View style={{ height: 1, backgroundColor: theme.color.border }} />
          )}
          ListEmptyComponent={
            <EmptyState
              icon="search-outline"
              title="Bu filtrelerle ilan yok"
              body="Filtreleri genişlet ya da aramayı sadeleştir."
            />
          }
          renderItem={({ item }) => <ListingCard hit={item} shape="row" />}
          keyboardShouldPersistTaps="handled"
        />
      )}
    </View>
  );
}
