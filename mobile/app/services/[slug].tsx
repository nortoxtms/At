import { Stack, router, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { theme } from '../../src/core/theme';
import { useService } from '../../src/features/services/use-services';

/**
 * S16 — Service detail (spec §18.2).
 *
 * "Provider card, description, price range, coverage radius map, gallery,
 * reviews, Mesaj gönder / Kaydet."
 *
 * The coverage radius is stated in kilometres rather than drawn: a map tile
 * needs a provider key this build does not have, and a circle drawn around a
 * provider's home would publish an address they only agreed to share as a
 * service area.
 */
export default function ServiceDetailScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { service, isPending } = useService(slug);

  if (isPending) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={theme.colors.brass} />
      </View>
    );
  }

  if (!service) {
    return (
      <View style={styles.centered}>
        <Text style={styles.title}>Hizmet bulunamadı</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: service.title }} />

      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.category}>{service.category_name_tr}</Text>
        <Text style={styles.title}>{service.title}</Text>
        <Text style={styles.meta}>
          {service.provider_name}
          {service.city ? ` · ${service.city}` : ''}
        </Text>

        <View style={styles.chipRow}>
          {service.is_mobile ? <Text style={styles.chip}>Mobil hizmet</Text> : null}
          {service.service_radius_km ? (
            <Text style={styles.chip}>{service.service_radius_km} km hizmet yarıçapı</Text>
          ) : null}
          {service.rating_average ? (
            <Text style={styles.chip}>
              ★ {Number(service.rating_average).toFixed(1)} ({service.rating_count})
            </Text>
          ) : null}
        </View>

        <Text style={styles.paragraph}>{service.description}</Text>

        {service.price_min ? (
          <Text style={styles.price}>
            {service.price_min}
            {service.price_max && service.price_max !== service.price_min
              ? `–${service.price_max}`
              : ''}{' '}
            {service.currency}
            {service.price_unit ? `/${service.price_unit}` : ''}
          </Text>
        ) : null}

        {service.availability_note ? (
          <Text style={styles.meta}>{service.availability_note}</Text>
        ) : null}

        {/* §26: transport listings carry a regulatory notice. It arrives from
            the API, so this screen shows it without knowing the rule. */}
        {service.notice ? (
          <View style={styles.notice}>
            <Text style={styles.noticeText}>{service.notice.tr}</Text>
          </View>
        ) : null}
      </ScrollView>

      <View style={styles.footer}>
        <Pressable
          style={styles.messageButton}
          accessibilityRole="button"
          onPress={() => router.push(`/messages/new?contextType=service&contextId=${service.id}`)}
        >
          <Text style={styles.messageLabel}>Mesaj gönder</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.cream },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.cream,
  },
  body: { padding: theme.spacing[4], gap: theme.spacing[2], paddingBottom: theme.spacing[12] },
  category: { ...theme.type.label, color: theme.colors.textSecondary },
  title: { ...theme.type.h1, color: theme.colors.textPrimary },
  meta: { ...theme.type.small, color: theme.colors.textSecondary },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing[2],
    marginVertical: theme.spacing[2],
  },
  chip: {
    ...theme.type.caption,
    color: theme.colors.textSecondary,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.full,
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[1],
  },
  paragraph: { ...theme.type.body, color: theme.colors.textPrimary },
  price: { ...theme.type.h3, color: theme.colors.textPrimary, marginTop: theme.spacing[3] },
  notice: {
    marginTop: theme.spacing[6],
    padding: theme.spacing[4],
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.sand,
  },
  noticeText: { ...theme.type.small, color: theme.colors.textSecondary },
  footer: {
    padding: theme.spacing[4],
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    backgroundColor: theme.colors.paper,
  },
  messageButton: {
    minHeight: theme.minTouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.ink,
  },
  messageLabel: { ...theme.type.h3, color: theme.colors.paper },
});
