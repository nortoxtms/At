import { Link, Stack } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { theme } from '../../src/core/theme';
import { useServiceCategories, useServiceSearch } from '../../src/features/services/use-services';

/**
 * S15 — Services hub (spec §18.2).
 *
 * "Category grid (12 tiles with icons). Below: 'Yakınındaki hizmetler' list
 * with provider avatar, category, price range, distance, rating, 'Mobil
 * hizmet' chip."
 *
 * The grid shows the twelve busiest categories rather than a fixed twelve:
 * §9.3 seeds 22, and a hub that leads with empty tiles teaches people the app
 * is empty. The full list stays reachable by search.
 */
export default function ServicesScreen() {
  const categories = useServiceCategories();
  const [category, setCategory] = useState<string | null>(null);

  const { hits, total, isPending } = useServiceSearch({
    categories: category ? [category] : undefined,
    sort: 'recommended',
    page: 1,
    limit: 20,
  });

  const tiles = [...categories]
    .sort((a, b) => b.active_count - a.active_count)
    .slice(0, 12);

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: 'Hizmetler' }} />

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.grid}>
        {tiles.map((tile) => (
          <Pressable
            key={tile.code}
            onPress={() => setCategory(category === tile.code ? null : tile.code)}
            accessibilityRole="button"
            accessibilityState={{ selected: category === tile.code }}
            style={[styles.tile, category === tile.code && styles.tileActive]}
          >
            <Text style={[styles.tileLabel, category === tile.code && styles.tileLabelActive]}>
              {tile.name_tr}
            </Text>
            <Text style={styles.tileCount}>{tile.active_count}</Text>
          </Pressable>
        ))}
      </ScrollView>

      <FlatList
        data={hits}
        keyExtractor={(service) => service.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <Text style={styles.count}>
            {isPending ? 'Aranıyor…' : `${total} hizmet`}
          </Text>
        }
        ListEmptyComponent={
          isPending ? null : (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>Bu kategoride hizmet yok</Text>
              <Text style={styles.emptyBody}>
                Mobil hizmet verenler de dahil, yakındaki illere bakmayı dene.
              </Text>
            </View>
          )
        }
        renderItem={({ item }) => (
          <Link href={`/services/${item.slug}`} asChild>
            <Pressable style={styles.card}>
              <Text style={styles.cardTitle}>{item.title}</Text>
              <Text style={styles.cardMeta}>
                {item.providerName}
                {item.city ? ` · ${item.city}` : ''}
                {item.distanceKm !== null ? ` · ${item.distanceKm} km` : ''}
              </Text>

              <View style={styles.chipRow}>
                {item.isMobile ? <Text style={styles.chip}>Mobil hizmet</Text> : null}
                {item.ratingAverage !== null ? (
                  <Text style={styles.chip}>
                    ★ {item.ratingAverage.toFixed(1)} ({item.ratingCount})
                  </Text>
                ) : null}
                {item.priceMin !== null ? (
                  <Text style={styles.chip}>
                    {item.priceMin}
                    {item.priceMax && item.priceMax !== item.priceMin ? `–${item.priceMax}` : ''}{' '}
                    {item.currency}
                    {item.priceUnit ? `/${item.priceUnit}` : ''}
                  </Text>
                ) : null}
              </View>
            </Pressable>
          </Link>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.cream },
  grid: { gap: theme.spacing[2], padding: theme.spacing[4] },
  tile: {
    minWidth: 120,
    minHeight: theme.minTouchTarget + 16,
    justifyContent: 'center',
    padding: theme.spacing[3],
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.paper,
  },
  tileActive: { borderColor: theme.colors.brass, backgroundColor: theme.colors.sand },
  tileLabel: { ...theme.type.small, color: theme.colors.textPrimary },
  tileLabelActive: { color: theme.colors.leatherDeep },
  tileCount: { ...theme.type.caption, color: theme.colors.textSecondary },
  list: { paddingHorizontal: theme.spacing[4], paddingBottom: theme.spacing[8], gap: theme.spacing[3] },
  count: { ...theme.type.small, color: theme.colors.textSecondary, marginBottom: theme.spacing[2] },
  card: {
    backgroundColor: theme.colors.paper,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing[4],
    gap: theme.spacing[2],
  },
  cardTitle: { ...theme.type.h3, color: theme.colors.textPrimary },
  cardMeta: { ...theme.type.small, color: theme.colors.textSecondary },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing[2] },
  chip: {
    ...theme.type.caption,
    color: theme.colors.textSecondary,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.full,
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[1],
  },
  empty: { alignItems: 'center', padding: theme.spacing[8] },
  emptyTitle: { ...theme.type.h3, color: theme.colors.textPrimary },
  emptyBody: {
    ...theme.type.small,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing[2],
    textAlign: 'center',
  },
});
