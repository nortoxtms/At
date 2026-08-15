import { Ionicons } from "@expo/vector-icons";
import { LISTING_TYPE_LABEL_TR } from "@only-horses/shared-types";
import type { ListingSearchHit } from "@only-horses/shared-types";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { Pressable, View } from "react-native";

import { Txt } from "@/components/Text";
import { describeHorse, formatPrice, washFromBlurhash } from "@/lib/format";
import { theme } from "@/theme/tokens";

/**
 * The listing card — §20.6 and screens 5–6 of the mockup.
 *
 * Two shapes, one component. `feed` is the full-bleed card the Home screen
 * stacks: a 4:3 photograph with the scrim over its lower half and the name and
 * price sitting on the image. `row` is the 96 pt list row the search results
 * use, with an 88 pt square thumbnail on the left.
 *
 * The price is on the image in the feed shape and in the row in the list
 * shape, but it is always present — §20.6 is explicit that a card without a
 * price is a card a buyer has to tap to evaluate.
 *
 * Navigation is `router.push` on a Pressable rather than `<Link asChild>`.
 * `asChild` clones the child and drops a function-form `style` — the row
 * silently lost `flexDirection: 'row'` and rendered as a column, thumbnail
 * stacked above the text, on every search result. A style that disappears
 * without an error is worth avoiding even at the cost of a real anchor.
 */
export function ListingCard({
  hit,
  shape = "feed",
}: {
  hit: ListingSearchHit;
  shape?: "feed" | "row";
}) {
  const router = useRouter();
  const wash = washFromBlurhash(hit.coverBlurhash);
  const price = formatPrice(hit.priceAmount, hit.priceCurrency, hit.priceType);

  if (shape === "row") {
    return (
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={`${hit.horseName}, ${price}`}
        onPress={() => router.push(`/ilan/${hit.slug}`)}
        style={({ pressed }) => ({
          flexDirection: "row",
          alignItems: "center",
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
            backgroundColor: wash,
            overflow: "hidden",
          }}
        >
          {hit.coverImage ? (
            <Image
              source={{ uri: hit.coverImage }}
              style={{ flex: 1 }}
              contentFit="cover"
            />
          ) : null}
        </View>

        <View style={{ flex: 1, gap: 2 }}>
          <Txt variant="h3" numberOfLines={1}>
            {hit.horseName}
          </Txt>
          <Txt
            variant="small"
            color={theme.color.textSecondary}
            numberOfLines={1}
          >
            {describeHorse(hit)}
          </Txt>
          <Txt
            variant="small"
            color={theme.color.textSecondary}
            numberOfLines={1}
          >
            {[hit.city, hit.region].filter(Boolean).join(", ")}
          </Txt>
          <Txt
            variant="body"
            display
            weight="semibold"
            color={theme.color.goldSoft}
          >
            {price}
          </Txt>
        </View>

        {hit.isBoosted ? (
          <Ionicons
            name="flash"
            size={16}
            color={theme.color.gold}
            accessibilityLabel="Öne çıkarıldı"
          />
        ) : null}
      </Pressable>
    );
  }

  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`${hit.horseName}, ${price}`}
      onPress={() => router.push(`/ilan/${hit.slug}`)}
      style={({ pressed }) => ({
        borderRadius: theme.radius.lg,
        overflow: "hidden",
        backgroundColor: theme.color.surface,
        borderWidth: 1,
        borderColor: theme.color.border,
        opacity: pressed ? 0.9 : 1,
      })}
    >
      <View style={{ aspectRatio: 4 / 3, backgroundColor: wash }}>
        {hit.coverImage ? (
          <Image
            source={{ uri: hit.coverImage }}
            style={{ flex: 1 }}
            contentFit="cover"
          />
        ) : null}

        <View
          style={{
            position: "absolute",
            top: theme.space.md,
            left: theme.space.md,
            flexDirection: "row",
            gap: theme.space.sm,
          }}
        >
          <Badge
            label={LISTING_TYPE_LABEL_TR[hit.listingType] ?? hit.listingType}
          />
          {hit.hasVideo ? <Badge label="Video" /> : null}
          {hit.hasXray ? <Badge label="Röntgen" /> : null}
        </View>
      </View>

      <View style={{ padding: theme.space.lg, gap: 2 }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "baseline",
            justifyContent: "space-between",
            gap: theme.space.sm,
          }}
        >
          <Txt variant="h2" numberOfLines={1} style={{ flex: 1 }}>
            {hit.horseName}
          </Txt>
          <Txt
            variant="h3"
            display
            weight="semibold"
            color={theme.color.goldSoft}
          >
            {price}
          </Txt>
        </View>

        <Txt
          variant="small"
          color={theme.color.textSecondary}
          numberOfLines={1}
        >
          {describeHorse(hit)}
        </Txt>
        <Txt
          variant="small"
          color={theme.color.textSecondary}
          numberOfLines={1}
        >
          {[hit.city, hit.region].filter(Boolean).join(", ")}
        </Txt>
      </View>
    </Pressable>
  );
}

/**
 * A chip on the photograph. `--surface-raised` at full opacity rather than a
 * translucent wash, because a badge over an unpredictable photograph is the
 * one place where a contrast ratio cannot be computed in advance.
 */
export function Badge({ label }: { label: string }) {
  return (
    <View
      style={{
        paddingHorizontal: theme.space.md,
        paddingVertical: 4,
        borderRadius: theme.radius.full,
        backgroundColor: theme.color.surfaceRaised,
      }}
    >
      <Txt variant="caption" color={theme.color.textPrimary} display={false}>
        {label}
      </Txt>
    </View>
  );
}
