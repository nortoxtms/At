import type { PurchasableProduct } from '@only-horses/shared-types';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { theme } from '../src/core/theme';
import { usePlans, useCheckout } from '../src/features/billing/use-billing';

/**
 * S27 — Paywall (spec §18.2).
 *
 * "Three plan columns, current plan highlighted, feature comparison,
 * monthly/yearly toggle showing savings, restore purchases, small print.
 * Context-aware header ('4. ilanını yayınlamak için Pro'ya geç')."
 *
 * The header is passed in by whoever hit the limit, because a paywall that
 * cannot say what was blocked is just a price list. And the small print says
 * the one thing users get wrong: identity verification is not purchasable
 * (§3.3), so upgrading will not unblock someone who has not verified.
 */
export default function PaywallScreen() {
  const { reason } = useLocalSearchParams<{ reason?: string }>();
  const { catalogue, subscription, isPending } = usePlans();
  const { checkout, isPending: isBuying } = useCheckout();
  const [yearly, setYearly] = useState(false);

  if (isPending || !catalogue) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={theme.colors.brass} />
      </View>
    );
  }

  const plans = catalogue.plans.filter((plan) => (yearly ? plan.interval === 'year' : plan.interval === 'month'));

  const buy = async (product: PurchasableProduct) => {
    const session = await checkout(product);
    // Opened outside the app: §16.2 puts the card form at Stripe, and the
    // return deep link brings the user back.
    await Linking.openURL(session.url);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.body}>
      <Stack.Screen options={{ title: 'Planlar' }} />

      <Text style={styles.title}>{reason ?? 'Planını yükselt'}</Text>
      <Text style={styles.subtitle}>
        Şu anki planın: {subscription?.tier === 'free' ? 'Ücretsiz' : subscription?.tier}
      </Text>

      <View style={styles.toggle}>
        <Pressable
          onPress={() => setYearly(false)}
          style={[styles.toggleOption, !yearly && styles.toggleActive]}
          accessibilityRole="button"
          accessibilityState={{ selected: !yearly }}
        >
          <Text style={!yearly ? styles.toggleLabelActive : styles.toggleLabel}>Aylık</Text>
        </Pressable>
        <Pressable
          onPress={() => setYearly(true)}
          style={[styles.toggleOption, yearly && styles.toggleActive]}
          accessibilityRole="button"
          accessibilityState={{ selected: yearly }}
        >
          <Text style={yearly ? styles.toggleLabelActive : styles.toggleLabel}>Yıllık</Text>
        </Pressable>
      </View>

      {plans.map((plan) => (
        <View
          key={plan.product}
          style={[styles.card, subscription?.tier === plan.tier && styles.cardCurrent]}
        >
          <Text style={styles.planName}>{plan.tier === 'pro' ? 'Pro' : 'Business'}</Text>
          <Text style={styles.price}>
            {plan.amountEur} € <Text style={styles.per}>/{plan.interval === 'year' ? 'yıl' : 'ay'}</Text>
          </Text>
          {plan.savingPercent ? (
            <Text style={styles.saving}>
              Ayda {plan.perMonthEur} € — %{plan.savingPercent} tasarruf
            </Text>
          ) : null}

          <Pressable
            onPress={() => void buy(plan.product as PurchasableProduct)}
            disabled={isBuying || subscription?.tier === plan.tier}
            style={[
              styles.buy,
              (isBuying || subscription?.tier === plan.tier) && styles.buyDisabled,
            ]}
            accessibilityRole="button"
          >
            <Text style={styles.buyLabel}>
              {subscription?.tier === plan.tier ? 'Mevcut planın' : 'Bu plana geç'}
            </Text>
          </Pressable>
        </View>
      ))}

      <View style={styles.table}>
        {catalogue.features.map((feature) => (
          <View key={feature.labelEn} style={styles.row}>
            <Text style={styles.rowLabel}>{feature.labelTr}</Text>
            <Text style={styles.rowValue}>{feature.free}</Text>
            <Text style={styles.rowValue}>{feature.pro}</Text>
            <Text style={styles.rowValue}>{feature.business}</Text>
          </View>
        ))}
      </View>

      <Text style={styles.smallPrint}>
        İlan yayınlamak için kimlik doğrulaması gerekir ve bu doğrulama satın alınamaz — plan
        yükseltmek tek başına yayınlamanı sağlamaz. Abonelik istediğin zaman iptal edilebilir;
        iptal ettiğinde ilanların silinmez, plan sınırının üzerindekiler duraklatılır.
      </Text>
    </ScrollView>
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
  body: { padding: theme.spacing[4], gap: theme.spacing[3], paddingBottom: theme.spacing[12] },
  title: { ...theme.type.h1, color: theme.colors.textPrimary },
  subtitle: { ...theme.type.small, color: theme.colors.textSecondary },
  toggle: {
    flexDirection: 'row',
    alignSelf: 'flex-start',
    borderRadius: theme.radius.full,
    borderWidth: 1,
    borderColor: theme.colors.border,
    overflow: 'hidden',
  },
  toggleOption: {
    minHeight: theme.minTouchTarget,
    justifyContent: 'center',
    paddingHorizontal: theme.spacing[4],
  },
  toggleActive: { backgroundColor: theme.colors.ink },
  toggleLabel: { ...theme.type.small, color: theme.colors.textPrimary },
  toggleLabelActive: { ...theme.type.small, color: theme.colors.paper },
  card: {
    backgroundColor: theme.colors.paper,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing[4],
    gap: theme.spacing[1],
  },
  cardCurrent: { borderColor: theme.colors.brass },
  planName: { ...theme.type.h2, color: theme.colors.textPrimary },
  price: { ...theme.type.h1, color: theme.colors.textPrimary },
  per: { ...theme.type.small, color: theme.colors.textSecondary },
  saving: { ...theme.type.small, color: theme.colors.success },
  buy: {
    minHeight: theme.minTouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.ink,
    marginTop: theme.spacing[3],
  },
  buyDisabled: { opacity: 0.4 },
  buyLabel: { ...theme.type.h3, color: theme.colors.paper },
  table: { marginTop: theme.spacing[4], gap: theme.spacing[2] },
  row: { flexDirection: 'row', alignItems: 'center' },
  rowLabel: { ...theme.type.small, color: theme.colors.textSecondary, flex: 3 },
  rowValue: { ...theme.type.small, color: theme.colors.textPrimary, flex: 1, textAlign: 'center' },
  smallPrint: {
    ...theme.type.caption,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing[4],
  },
});
