import { LISTING_STATUS_LABEL_TR, PRODUCT_PRICE_UNIT_LABEL_TR } from '@only-horses/shared-types';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { FlatList, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { PhotoGrid } from '@/components/PhotoGrid';
import { Txt } from '@/components/Text';
import { BackButton, Card, EmptyState, Loading } from '@/components/ui';
import { api } from '@/lib/api';
import { listProductMedia, type HorseMedia } from '@/lib/media';
import { useSession } from '@/lib/session';
import { useAsync, useReloadOnFocus } from '@/lib/useAsync';
import { theme } from '@/theme/tokens';

/**
 * Your products, their photos, and §5's transitions.
 *
 * Photos live on this screen rather than in the wizard for the same reason the
 * horse's do: there is nothing to attach them to until the row exists. And a
 * product with no photograph does not sell, so the grid is on the card itself
 * rather than one tap away — the prompt has to be where the omission is.
 *
 * §3.3's identity gate is on publishing, not on composing — unlike the horse
 * composer, which blocks at step one. That is the API's shape: a draft costs
 * nobody anything, and a seller who has written one has a reason to finish
 * verification. So the rule is stated here, next to the button it applies to,
 * and the button routes to the ladder rather than to a refusal.
 */
interface MyProduct {
  id: string;
  slug: string;
  title: string;
  status: string;
  category: string;
  category_name: string;
  price_amount: string | null;
  price_currency: string;
  price_type: string;
  price_unit: string | null;
  quantity: number;
  view_count: number;
  save_count: number;
  inquiry_count: number;
}

const ACTIONS: Record<string, { action: string; label: string }[]> = {
  draft: [{ action: 'publish', label: 'Yayınla' }],
  active: [
    { action: 'pause', label: 'Duraklat' },
    { action: 'close', label: 'Kapat' },
  ],
  paused: [{ action: 'resume', label: 'Yeniden yayınla' }],
  expired: [{ action: 'renew', label: 'Yenile' }],
};

export default function MyProductsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { me } = useSession();
  const [working, setWorking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const verified =
    !!me && me.verificationLevel !== 'none' && me.verificationLevel !== 'email_verified';

  const { data, loading, reload } = useAsync(async () => {
    const result = await api<MyProduct[]>('/me/products');
    const products = result.ok && Array.isArray(result.data) ? result.data : [];

    const media = await Promise.all(
      products.map(async (product) => [product.id, await listProductMedia(product.id)] as const),
    );

    return { products, media: new Map<string, HorseMedia[]>(media) };
  }, [me?.id]);

  useReloadOnFocus(reload);

  const products = data?.products ?? [];

  const transition = async (id: string, action: string) => {
    // Publishing is the one transition §3.3 gates, and the ladder is where an
    // unverified seller has to go — not into a request that comes back 403.
    if (action === 'publish' && !verified) {
      router.push('/dogrulama');
      return;
    }

    setWorking(`${id}:${action}`);
    setError(null);

    // The result was being thrown away, so a refused transition looked exactly
    // like a successful one: the spinner stopped, the list reloaded, and the
    // row was still a draft with no explanation anywhere on screen.
    const result = await api(`/products/${id}/${action}`, { method: 'POST' });

    setWorking(null);
    if (!result.ok) setError(result.error.message);
    reload();
  };

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
          Ürünlerim
        </Txt>
        <View style={{ width: theme.metric.minTouchTarget }} />
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

      {loading ? (
        <Loading />
      ) : (
        <FlatList
          data={products}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{
            paddingHorizontal: theme.screenPadding,
            paddingVertical: theme.space.lg,
            gap: theme.space.md,
          }}
          ListEmptyComponent={
            <EmptyState
              icon="cube-outline"
              title="Henüz ürünün yok"
              body="Eyerinden çitine, yeminden kaskına — kullanmadığın ne varsa satabilirsin."
              action={<Button label="Ürün sat" full={false} onPress={() => router.push('/urunler/yeni')} />}
            />
          }
          ListHeaderComponent={
            // Only when it can actually bite: a seller with nothing to publish
            // does not need to be told about verification.
            !verified && products.some((product) => product.status === 'draft') ? (
              <Card style={{ gap: theme.space.sm, borderColor: theme.color.goldMuted }}>
                <Txt variant="h3">Yayınlamak için kimlik doğrulaması gerekiyor</Txt>
                <Txt variant="small" color={theme.color.textSecondary} display={false}>
                  Taslak biriktirebilirsin, ama yayına almak kimliğini doğrulamanı ister —
                  atlarda olduğu gibi. Bu hiçbir planla satın alınamaz.
                </Txt>
                <Button
                  label="Doğrulamaya bak"
                  variant="secondary"
                  full={false}
                  onPress={() => router.push('/dogrulama')}
                />
              </Card>
            ) : null
          }
          ListFooterComponent={
            products.length > 0 ? (
              <Button
                label="Yeni ürün"
                variant="secondary"
                style={{ marginTop: theme.space.lg }}
                onPress={() => router.push('/urunler/yeni')}
              />
            ) : null
          }
          renderItem={({ item }) => {
            const media = data?.media.get(item.id) ?? [];

            return (
              <Card style={{ gap: theme.space.md }}>
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: theme.space.sm }}>
                  <Txt variant="h3" style={{ flex: 1 }} numberOfLines={2}>
                    {item.title}
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
                      {LISTING_STATUS_LABEL_TR[item.status] ?? item.status}
                    </Txt>
                  </View>
                </View>

                <Txt variant="small" color={theme.color.textSecondary} display={false}>
                  {item.category_name}
                  {' · '}
                  {item.price_amount
                    ? `${new Intl.NumberFormat('tr-TR', {
                        style: 'currency',
                        currency: item.price_currency,
                        maximumFractionDigits: 0,
                      }).format(Number(item.price_amount))}${
                        item.price_unit && item.price_unit !== 'item'
                          ? ` / ${PRODUCT_PRICE_UNIT_LABEL_TR[item.price_unit] ?? item.price_unit}`
                          : ''
                      }`
                    : 'Fiyat sorunuz'}
                </Txt>

                <PhotoGrid
                  ownerId={item.id}
                  kind="product"
                  media={media}
                  editable
                  onChange={reload}
                />

                <Txt variant="caption" color={theme.color.textSecondary} display={false}>
                  {item.view_count} görüntülenme · {item.save_count} kayıt · {item.inquiry_count} mesaj
                </Txt>

                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.sm }}>
                  {item.status === 'active' ? (
                    <Button
                      label="Ürünü gör"
                      variant="secondary"
                      full={false}
                      onPress={() => router.push(`/urunler/${item.slug}`)}
                    />
                  ) : null}

                  {(ACTIONS[item.status] ?? []).map(({ action, label }) => (
                    <Button
                      key={action}
                      label={label}
                      variant="secondary"
                      full={false}
                      loading={working === `${item.id}:${action}`}
                      onPress={() => void transition(item.id, action)}
                    />
                  ))}
                </View>
              </Card>
            );
          }}
        />
      )}
    </View>
  );
}
