import { Ionicons } from '@expo/vector-icons';
import {
  PRODUCT_CONDITION_LABEL_TR,
  PRODUCT_PRICE_UNIT_LABEL_TR,
} from '@only-horses/shared-types';
import type { ProductSearchHit } from '@only-horses/shared-types';
import { useRouter } from 'expo-router';
import { Image, Pressable, View } from 'react-native';

import { Txt } from '@/components/Text';
import { theme } from '@/theme/tokens';

/**
 * A product in a list.
 *
 * Brand, size and condition are on the card, not behind a tap. For a horse the
 * photograph does the selling; for a saddle the three facts that decide
 * whether it is even worth opening are "Wintec", "17.5 inch" and "like new" —
 * and a grid of pretty photos with none of them is a grid nobody can shop
 * from.
 */
export function ProductCard({ hit }: { hit: ProductSearchHit }) {
  const router = useRouter();

  const price =
    hit.priceType === 'free'
      ? 'Ücretsiz'
      : hit.priceAmount === null
        ? 'Fiyat sorunuz'
        : `${new Intl.NumberFormat('tr-TR', {
            style: 'currency',
            currency: hit.priceCurrency,
            maximumFractionDigits: 0,
          }).format(hit.priceAmount)}${
            // The unit only earns its space when it is not "per item" — hay
            // per ton must say so, a bridle need not say "per bridle".
            hit.priceUnit && hit.priceUnit !== 'item'
              ? ` / ${PRODUCT_PRICE_UNIT_LABEL_TR[hit.priceUnit] ?? hit.priceUnit}`
              : ''
          }`;

  const facts = [
    hit.brand,
    hit.sizeLabel,
    PRODUCT_CONDITION_LABEL_TR[hit.condition] ?? hit.condition,
  ].filter(Boolean);

  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`${hit.title}, ${price}`}
      onPress={() => router.push(`/urunler/${hit.slug}`)}
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
          backgroundColor: theme.color.surfaceRaised,
          borderWidth: 1,
          borderColor: theme.color.border,
          overflow: 'hidden',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {hit.coverImage ? (
          <Image
            source={{ uri: hit.coverImage }}
            style={{ width: '100%', height: '100%' }}
            resizeMode="cover"
            accessibilityLabel="Ürün fotoğrafı"
          />
        ) : (
          <Ionicons name="cube-outline" size={22} color={theme.color.textSecondary} />
        )}
      </View>

      <View style={{ flex: 1, gap: 2 }}>
        <Txt variant="h3" numberOfLines={2}>
          {hit.title}
        </Txt>
        <Txt variant="small" color={theme.color.textSecondary} numberOfLines={1}>
          {facts.join(' · ')}
        </Txt>
        <Txt variant="small" color={theme.color.textSecondary} numberOfLines={1}>
          {[hit.categoryName, hit.city].filter(Boolean).join(' · ')}
        </Txt>
        <Txt variant="body" display weight="semibold" color={theme.color.goldSoft}>
          {price}
        </Txt>
      </View>

      {hit.delivery !== 'pickup' ? (
        <Ionicons
          name="cube-outline"
          size={16}
          color={theme.color.textSecondary}
          accessibilityLabel="Kargo var"
        />
      ) : null}
    </Pressable>
  );
}
