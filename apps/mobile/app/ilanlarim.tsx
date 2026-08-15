import { LISTING_STATUS_LABEL_TR } from '@only-horses/shared-types';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { FlatList, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { Txt } from '@/components/Text';
import { BackButton, Card, EmptyState, Loading } from '@/components/ui';
import { api } from '@/lib/api';
import { formatPrice } from '@/lib/format';
import { useSession } from '@/lib/session';
import { useAsync } from '@/lib/useAsync';
import { theme } from '@/theme/tokens';

/**
 * S14 — your listings, and the state transitions §5 allows from each one.
 *
 * The buttons are derived from the status rather than being a fixed row: a
 * draft publishes, an active listing pauses or closes, a paused one resumes,
 * an expired one renews. Offering "kapat" on a draft is offering a transition
 * the API will refuse — and the web had exactly that bug until the transitions
 * were driven from this table.
 */
interface MyListing {
  id: string;
  slug: string;
  title: string;
  status: string;
  type: string;
  price_amount: string | null;
  price_currency: string;
  price_type: string;
  view_count: number;
  save_count: number;
  inquiry_count: number;
  is_boosted: boolean;
  horse_name: string;
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

export default function MyListingsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { me } = useSession();
  const [working, setWorking] = useState<string | null>(null);

  const { data, loading, reload } = useAsync(async () => {
    const result = await api<MyListing[]>('/me/listings');
    return result.ok && Array.isArray(result.data) ? result.data : [];
  }, [me?.id]);

  const listings = data ?? [];

  const transition = async (id: string, action: string) => {
    setWorking(`${id}:${action}`);
    await api(`/listings/${id}/${action}`, { method: 'POST' });
    setWorking(null);
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
          İlanlarım
        </Txt>
        <View style={{ width: theme.metric.minTouchTarget }} />
      </View>

      {loading ? (
        <Loading />
      ) : (
        <FlatList
          data={listings}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{
            paddingHorizontal: theme.screenPadding,
            paddingVertical: theme.space.lg,
            gap: theme.space.md,
          }}
          ListEmptyComponent={
            <EmptyState
              icon="list-outline"
              title="Henüz ilanın yok"
              body="İlan bir attan türer. Önce atı kaydet, sonra satılığa çıkar."
              action={<Button label="Ahırıma git" full={false} onPress={() => router.push('/ahir')} />}
            />
          }
          renderItem={({ item }) => (
            <Card style={{ gap: theme.space.sm }}>
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
                {item.horse_name} ·{' '}
                {formatPrice(item.price_amount, item.price_currency, item.price_type)}
              </Txt>

              <Txt variant="caption" color={theme.color.textSecondary} display={false}>
                {item.view_count} görüntülenme · {item.save_count} kayıt · {item.inquiry_count} mesaj
                {item.is_boosted ? ' · öne çıkarıldı' : ''}
              </Txt>

              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.sm, marginTop: theme.space.sm }}>
                {item.status === 'active' ? (
                  <Button
                    label="İlanı gör"
                    variant="secondary"
                    full={false}
                    onPress={() => router.push(`/ilan/${item.slug}`)}
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
          )}
        />
      )}
    </View>
  );
}
