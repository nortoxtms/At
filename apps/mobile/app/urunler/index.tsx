import { Ionicons } from '@expo/vector-icons';
import { PRODUCT_CONDITION_LABEL_TR } from '@only-horses/shared-types';
import type { ProductSearchHit } from '@only-horses/shared-types';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { ProductCard } from '@/components/ProductCard';
import { Txt } from '@/components/Text';
import { BackButton, Chip, EmptyState, Loading } from '@/components/ui';
import { api } from '@/lib/api';
import { useAsync, useDebounced, useReloadOnFocus } from '@/lib/useAsync';
import { theme } from '@/theme/tokens';

/**
 * The product marketplace — everything equestrian that is not a horse.
 *
 * The category grid is the entry point rather than the search box, because
 * nobody arrives knowing the word for what they want. "Ahır ve çit" is
 * browsable; "fence panel 3m galvanised" is a query you can only type if you
 * already know the answer.
 *
 * Tapping a group filters to that group *and its children* — the API rolls
 * parents up — so "Koşum ve saraciye" shows saddles, bridles and bits rather
 * than the empty set of things filed directly under the parent.
 */
interface Category {
  code: string;
  parent_code: string | null;
  name_tr: string;
  icon: string | null;
  active_count: string | number;
}

const CONDITIONS = ['new', 'like_new', 'good', 'used'];

export default function ProductsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ category?: string; condition?: string }>();

  const [text, setText] = useState('');
  const query = useDebounced(text);

  const { data: categories } = useAsync(async () => {
    const result = await api<Category[]>('/products/categories', { auth: false });
    return result.ok && Array.isArray(result.data) ? result.data : [];
  }, []);

  const { data, loading, reload } = useAsync(async () => {
    const search = new URLSearchParams();
    if (query) search.set('q', query);
    if (params.category) search.set('category', params.category);
    if (params.condition) search.set('condition', params.condition);

    const result = await api<ProductSearchHit[]>(`/products/search?${search.toString()}`, {
      auth: false,
    });
    return result.ok && Array.isArray(result.data) ? result.data : [];
  }, [query, params.category, params.condition]);

  useReloadOnFocus(reload);

  const groups = (categories ?? []).filter((entry) => !entry.parent_code);
  const children = (categories ?? []).filter(
    (entry) => params.category && entry.parent_code === params.category,
  );
  const active = (categories ?? []).find((entry) => entry.code === params.category);
  const hits = data ?? [];

  const setParam = (key: string, value: string | undefined) =>
    router.setParams({ ...params, [key]: value ?? '' } as never);

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
          Ekipman
        </Txt>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Ürün sat"
          onPress={() => router.push('/urunler/yeni')}
          hitSlop={12}
          style={{ minHeight: theme.metric.minTouchTarget, justifyContent: 'center' }}
        >
          <Ionicons name="add" size={24} color={theme.color.goldSoft} />
        </Pressable>
      </View>

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
            placeholder="Eyer, çit, yem, kask…"
            placeholderTextColor={theme.color.textMuted}
            autoCorrect={false}
            accessibilityLabel="Ürün ara"
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
      </View>

      {/* The grid, until you pick something; then the group's own children. */}
      {params.category ? (
        <View style={{ paddingHorizontal: theme.screenPadding, paddingTop: theme.space.md, gap: theme.space.sm }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space.sm }}>
            <Chip label={`← ${active?.name_tr ?? 'Tümü'}`} selected onPress={() => setParam('category', undefined)} />
          </View>

          {children.length > 0 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: theme.space.sm }}
            >
              {children.map((entry) => (
                <Chip
                  key={entry.code}
                  label={`${entry.name_tr} (${entry.active_count})`}
                  onPress={() => setParam('category', entry.code)}
                />
              ))}
            </ScrollView>
          ) : null}

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: theme.space.sm }}
          >
            {CONDITIONS.map((condition) => (
              <Chip
                key={condition}
                label={PRODUCT_CONDITION_LABEL_TR[condition] ?? condition}
                selected={params.condition === condition}
                onPress={() =>
                  setParam('condition', params.condition === condition ? undefined : condition)
                }
              />
            ))}
          </ScrollView>
        </View>
      ) : (
        <View
          style={{
            flexDirection: 'row',
            flexWrap: 'wrap',
            gap: theme.space.md,
            paddingHorizontal: theme.screenPadding,
            paddingTop: theme.space.lg,
          }}
        >
          {groups.map((group) => (
            <Pressable
              key={group.code}
              accessibilityRole="button"
              accessibilityLabel={group.name_tr}
              onPress={() => setParam('category', group.code)}
              style={({ pressed }) => ({
                width: '47%',
                flexDirection: 'row',
                alignItems: 'center',
                gap: theme.space.md,
                padding: theme.space.md,
                borderRadius: theme.radius.md,
                backgroundColor: theme.color.surface,
                borderWidth: 1,
                borderColor: theme.color.border,
                opacity: pressed ? 0.8 : 1,
              })}
            >
              <Ionicons
                name={(group.icon ?? 'cube') as keyof typeof Ionicons.glyphMap}
                size={20}
                color={theme.color.goldSoft}
              />
              <View style={{ flex: 1 }}>
                <Txt variant="small" display={false} numberOfLines={2}>
                  {group.name_tr}
                </Txt>
                <Txt variant="caption" color={theme.color.textSecondary} display={false}>
                  {group.active_count} ilan
                </Txt>
              </View>
            </Pressable>
          ))}
        </View>
      )}

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
            <Txt
              variant="small"
              color={theme.color.textSecondary}
              display={false}
              style={{ paddingVertical: theme.space.lg }}
            >
              {hits.length} ürün
            </Txt>
          }
          ItemSeparatorComponent={() => (
            <View style={{ height: 1, backgroundColor: theme.color.border }} />
          )}
          ListEmptyComponent={
            <EmptyState
              icon="cube-outline"
              title="Burada henüz ürün yok"
              body="Eyerinden çitine, yeminden kaskına — satmak istediğin ne varsa buraya koyabilirsin."
              action={<Button label="Ürün sat" full={false} onPress={() => router.push('/urunler/yeni')} />}
            />
          }
          renderItem={({ item }) => <ProductCard hit={item} />}
          keyboardShouldPersistTaps="handled"
        />
      )}
    </View>
  );
}
