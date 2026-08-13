import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { ApiClientError } from '../../../src/core/api-client';
import { theme } from '../../../src/core/theme';
import { useBoostEstimate, useCheckout } from '../../../src/features/billing/use-billing';

/**
 * S28 — Boost purchase (spec §18.2).
 *
 * "Before/after position illustration, 7-day vs 30-day, expected extra views
 * (from historical median, labeled as an estimate, never a guarantee)."
 *
 * The illustration is drawn from §11.2's actual rule — a boosted listing
 * enters the top tier of the recommended sort, capped at two per page — rather
 * than from an invented "3× more views" claim. The estimate is whatever the
 * API measured, and it renders its own disclaimer; when there is not enough
 * history the API returns no number and the screen shows none.
 */
const OPTIONS = [
  { product: 'boost_7d' as const, days: 7, labelTr: '7 gün' },
  { product: 'boost_30d' as const, days: 30, labelTr: '30 gün' },
];

export default function BoostScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [days, setDays] = useState(7);
  const [error, setError] = useState<string | null>(null);
  const { checkout, isPending } = useCheckout();
  const estimate = useBoostEstimate(days);

  const selected = OPTIONS.find((option) => option.days === days)!;

  const buy = async () => {
    setError(null);
    try {
      const session = await checkout(selected.product, id);
      await Linking.openURL(session.url);
    } catch (cause) {
      if (cause instanceof ApiClientError) {
        setError(cause.message);
      } else {
        setError('Ödeme başlatılamadı. Tekrar dene.');
      }
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.body}>
      <Stack.Screen options={{ title: 'Öne çıkar' }} />

      <Text style={styles.title}>İlanını öne çıkar</Text>

      {/* §11.2's rule, drawn: the boosted tier sits above the organic results
          and is labelled, and at most two boosted results share a page. */}
      <View style={styles.illustration}>
        <View style={styles.rowBoosted}>
          <Text style={styles.badge}>Öne çıkarılan</Text>
          <Text style={styles.rowLabel}>Senin ilanın</Text>
        </View>
        {[1, 2, 3].map((position) => (
          <View key={position} style={styles.rowOrganic}>
            <Text style={styles.rowLabel}>Diğer ilanlar</Text>
          </View>
        ))}
      </View>

      <View style={styles.options}>
        {OPTIONS.map((option) => (
          <Pressable
            key={option.product}
            onPress={() => setDays(option.days)}
            style={[styles.option, days === option.days && styles.optionActive]}
            accessibilityRole="button"
            accessibilityState={{ selected: days === option.days }}
          >
            <Text style={styles.optionLabel}>{option.labelTr}</Text>
          </Pressable>
        ))}
      </View>

      {estimate?.medianExtraViews ? (
        <Text style={styles.estimate}>
          Benzer ilanların ortancası: {estimate.medianExtraViews} görüntülenme.{' '}
          {estimate.noticeTr}
        </Text>
      ) : (
        <Text style={styles.estimate}>{estimate?.noticeTr ?? ''}</Text>
      )}

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Pressable
        onPress={buy}
        disabled={isPending}
        style={[styles.buy, isPending && styles.buyDisabled]}
        accessibilityRole="button"
      >
        <Text style={styles.buyLabel}>{isPending ? 'Açılıyor…' : 'Satın al'}</Text>
      </Pressable>

      <Text style={styles.smallPrint}>
        Öne çıkarma, ilanı yalnızca “Önerilen” sıralamasında üste taşır; fiyata veya mesafeye göre
        sıralayan alıcılarda sıralamayı değiştirmez. Süre dolduğunda ilan normal sırasına döner.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.cream },
  body: { padding: theme.spacing[4], gap: theme.spacing[3] },
  title: { ...theme.type.h1, color: theme.colors.textPrimary },
  illustration: {
    gap: theme.spacing[2],
    padding: theme.spacing[3],
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.paper,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  rowBoosted: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[2],
    padding: theme.spacing[3],
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.sand,
    borderWidth: 1,
    borderColor: theme.colors.brass,
  },
  rowOrganic: {
    padding: theme.spacing[3],
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.cream,
  },
  rowLabel: { ...theme.type.small, color: theme.colors.textPrimary },
  badge: {
    ...theme.type.caption,
    color: theme.colors.leatherDeep,
    borderWidth: 1,
    borderColor: theme.colors.brass,
    borderRadius: theme.radius.full,
    paddingHorizontal: theme.spacing[2],
    paddingVertical: theme.spacing[1],
  },
  options: { flexDirection: 'row', gap: theme.spacing[2] },
  option: {
    flex: 1,
    minHeight: theme.minTouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  optionActive: { borderColor: theme.colors.brass, backgroundColor: theme.colors.sand },
  optionLabel: { ...theme.type.body, color: theme.colors.textPrimary },
  estimate: { ...theme.type.small, color: theme.colors.textSecondary },
  error: { ...theme.type.small, color: theme.colors.danger },
  buy: {
    minHeight: theme.minTouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.ink,
  },
  buyDisabled: { opacity: 0.4 },
  buyLabel: { ...theme.type.h3, color: theme.colors.paper },
  smallPrint: { ...theme.type.caption, color: theme.colors.textSecondary },
});
