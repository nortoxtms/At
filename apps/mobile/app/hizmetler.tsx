import { useRouter } from 'expo-router';
import { FlatList, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Badge } from '@/components/ListingCard';
import { Txt } from '@/components/Text';
import { BackButton, Card, DemoNotice, EmptyState, Loading } from '@/components/ui';
import { searchServices } from '@/lib/catalog';
import { useAsync } from '@/lib/useAsync';
import { theme } from '@/theme/tokens';

/**
 * S15 — the service directory (§13).
 *
 * Boarding, training, transport, farriery, veterinary. The price line is the
 * one thing the API can give and the card must show, because a directory
 * without prices is a phone book and people stop opening it.
 */
export default function ServicesScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const { data, loading } = useAsync(() => searchServices(), []);
  const services = data?.data ?? [];

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
          Hizmetler
        </Txt>
        <View style={{ width: theme.metric.minTouchTarget }} />
      </View>

      {loading ? (
        <Loading />
      ) : (
        <FlatList
          data={services}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{
            paddingHorizontal: theme.screenPadding,
            paddingVertical: theme.space.lg,
            gap: theme.space.md,
          }}
          ListHeaderComponent={data?.source === 'demo' ? <DemoNotice /> : null}
          ListEmptyComponent={
            <EmptyState
              icon="construct-outline"
              title="Hizmet ilanı yok"
              body="Nalbant, veteriner, nakliye ve pansiyon ilanları burada listelenir."
            />
          }
          renderItem={({ item }) => (
            <Card style={{ gap: 4 }}>
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: theme.space.sm }}>
                <Txt variant="h3" style={{ flex: 1 }} numberOfLines={2}>
                  {item.title}
                </Txt>
                <Badge label={SERVICE_CATEGORY_TR[item.category] ?? item.category} />
              </View>

              <Txt variant="small" color={theme.color.textSecondary} display={false}>
                {[item.providerName, item.city, item.region].filter(Boolean).join(' · ')}
                {item.isMobile ? ' · yerinde hizmet' : ''}
              </Txt>

              <Txt variant="body" display weight="semibold" color={theme.color.goldSoft}>
                {formatServicePrice(item)}
              </Txt>
            </Card>
          )}
        />
      )}
    </View>
  );
}

const SERVICE_CATEGORY_TR: Record<string, string> = {
  boarding: 'Pansiyon',
  training: 'Eğitim',
  transport: 'Nakliye',
  farrier: 'Nalbant',
  veterinary: 'Veteriner',
  physio: 'Fizyoterapi',
  saddle_fitting: 'Eyer uyumu',
  breaking: 'Alıştırma',
  breeding: 'Damızlık',
  photography: 'Fotoğraf',
  insurance: 'Sigorta',
};

/**
 * §13's services are priced as a range with a unit, not as a single number.
 * A stable that charges 8 000–12 000 ₺ per month and a farrier who charges
 * 900 ₺ per visit cannot share one price field, so the range and the unit
 * are both shown or the number is meaningless.
 */
const PRICE_UNIT_TR: Record<string, string> = {
  hour: 'saat',
  day: 'gün',
  week: 'hafta',
  month: 'ay',
  session: 'seans',
  visit: 'ziyaret',
  km: 'km',
  fixed: '',
};

function formatServicePrice(service: {
  priceMin: number | null;
  priceMax: number | null;
  priceUnit: string | null;
  currency: string;
}): string {
  const { priceMin, priceMax, priceUnit, currency } = service;
  if (priceMin === null && priceMax === null) return 'Fiyat sorunuz';

  const money = (value: number) =>
    new Intl.NumberFormat('tr-TR', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(value);

  const range =
    priceMin !== null && priceMax !== null && priceMin !== priceMax
      ? `${money(priceMin)} – ${money(priceMax)}`
      : money((priceMin ?? priceMax) as number);

  const unit = priceUnit ? PRICE_UNIT_TR[priceUnit] : '';
  return unit ? `${range} / ${unit}` : range;
}
