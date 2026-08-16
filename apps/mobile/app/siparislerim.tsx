import {
  ORDER_PAYMENT_LABEL_TR,
  ORDER_STATUS_LABEL_TR,
} from '@only-horses/shared-types';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { FlatList, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { Txt } from '@/components/Text';
import { BackButton, Card, Chip, EmptyState, Loading } from '@/components/ui';
import { api } from '@/lib/api';
import { ORDER_ACTIONS, type OrderRow } from '@/lib/endpoints';
import { relativeTime } from '@/lib/format';
import { useSession } from '@/lib/session';
import { useAsync, useReloadOnFocus } from '@/lib/useAsync';
import { theme } from '@/theme/tokens';

/**
 * Orders, both sides of them.
 *
 * One screen with a toggle rather than two, because most people here are both:
 * the yard that sells a spare rug also buys feed, and making them remember
 * which screen a given order lives on is making them remember which side of a
 * transaction they were on six weeks ago.
 *
 * The buttons come from `ORDER_ACTIONS`, keyed by side. A buyer never sees
 * "Kargoya verdim" — the API answers 403, and an offer the API refuses is a
 * bug the user gets blamed for.
 */
export default function MyOrdersScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { me, ready } = useSession();

  const [side, setSide] = useState<'buyer' | 'seller'>('buyer');
  const [working, setWorking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data, loading, reload } = useAsync(async () => {
    if (!me) return [];
    const result = await api<OrderRow[]>(`/orders/mine?side=${side}`);
    return result.ok && Array.isArray(result.data) ? result.data : [];
  }, [me?.id, side]);

  useReloadOnFocus(reload);

  const act = async (order: OrderRow, action: string) => {
    // Paying is a screen, not a button: it has an amount, a provider and a
    // confirmation, and doing it silently from a list is how somebody pays
    // twice.
    if (action === 'pay') {
      router.push(`/satin-al/${order.product_slug}?order=${order.id}`);
      return;
    }

    setWorking(`${order.id}:${action}`);
    setError(null);

    const result = await api(`/orders/${order.id}/${action}`, {
      method: 'POST',
      body: JSON.stringify(action === 'cancel' ? { reason: 'Vazgeçildi' } : {}),
    });

    setWorking(null);
    if (!result.ok) setError(result.error.message);
    reload();
  };

  if (!ready || loading) return <Loading />;

  const orders = data ?? [];

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
          Siparişler
        </Txt>
        <View style={{ width: theme.metric.minTouchTarget }} />
      </View>

      <View
        style={{
          flexDirection: 'row',
          gap: theme.space.sm,
          paddingHorizontal: theme.screenPadding,
          paddingTop: theme.space.lg,
        }}
      >
        <Chip label="Aldıklarım" selected={side === 'buyer'} onPress={() => setSide('buyer')} />
        <Chip label="Sattıklarım" selected={side === 'seller'} onPress={() => setSide('seller')} />
      </View>

      {error ? (
        <View style={{ paddingHorizontal: theme.screenPadding, paddingTop: theme.space.md }}>
          <Card style={{ borderColor: theme.color.danger }}>
            <Txt variant="small" display={false}>
              {error}
            </Txt>
          </Card>
        </View>
      ) : null}

      <FlatList
        data={orders}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{
          paddingHorizontal: theme.screenPadding,
          paddingVertical: theme.space.lg,
          gap: theme.space.md,
        }}
        ListEmptyComponent={
          <EmptyState
            icon="receipt-outline"
            title={side === 'buyer' ? 'Henüz bir şey almadın' : 'Henüz sipariş almadın'}
            body={
              side === 'buyer'
                ? 'Ekipman pazarından aldığın her şey buraya düşer.'
                : 'Ürünlerine sipariş geldiğinde önce buradan onaylıyorsun.'
            }
            action={
              <Button
                label={side === 'buyer' ? 'Ekipmana bak' : 'Ürünlerim'}
                full={false}
                onPress={() => router.push(side === 'buyer' ? '/urunler' : '/urunlerim')}
              />
            }
          />
        }
        renderItem={({ item }) => {
          const actions = ORDER_ACTIONS[side][item.status] ?? [];
          const money = new Intl.NumberFormat('tr-TR', {
            style: 'currency',
            currency: item.currency,
            maximumFractionDigits: 0,
          }).format(Number(item.total_amount));

          return (
            <Card style={{ gap: theme.space.sm }}>
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: theme.space.sm }}>
                <Txt variant="h3" style={{ flex: 1 }} numberOfLines={2}>
                  {item.title_snapshot}
                </Txt>
                <View
                  style={{
                    paddingHorizontal: theme.space.md,
                    paddingVertical: 3,
                    borderRadius: theme.radius.full,
                    backgroundColor: theme.color.surfaceRaised,
                  }}
                >
                  <Txt variant="caption" display={false} color={theme.color.textSecondary}>
                    {ORDER_STATUS_LABEL_TR[item.status] ?? item.status}
                  </Txt>
                </View>
              </View>

              <Txt variant="small" color={theme.color.textSecondary} display={false}>
                {item.reference} · {item.quantity} adet · {money}
              </Txt>

              <Txt variant="caption" color={theme.color.textSecondary} display={false}>
                {side === 'buyer' ? 'Satıcı' : 'Alıcı'}: {item.counterparty_name}
                {' · '}
                {relativeTime(item.created_at)}
                {item.payment_status !== 'none'
                  ? ` · ${ORDER_PAYMENT_LABEL_TR[item.payment_status] ?? item.payment_status}`
                  : ''}
              </Txt>

              {item.tracking_note ? (
                <Txt variant="caption" color={theme.color.textSecondary} display={false}>
                  Kargo: {item.tracking_note}
                </Txt>
              ) : null}

              {item.cancel_reason ? (
                <Txt variant="caption" color={theme.color.textSecondary} display={false}>
                  Sebep: {item.cancel_reason}
                </Txt>
              ) : null}

              {actions.length > 0 ? (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.sm }}>
                  {actions.map(({ action, label }) => (
                    <Button
                      key={action}
                      label={label}
                      variant={action === 'pay' ? 'primary' : 'secondary'}
                      full={false}
                      loading={working === `${item.id}:${action}`}
                      onPress={() => void act(item, action)}
                    />
                  ))}
                </View>
              ) : null}
            </Card>
          );
        }}
      />
    </View>
  );
}
