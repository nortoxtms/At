import { Ionicons } from '@expo/vector-icons';
import { VERIFICATION_LABEL_TR } from '@only-horses/shared-types';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Badge } from '@/components/ListingCard';
import { Button } from '@/components/Button';
import { Txt } from '@/components/Text';
import { Avatar, BackButton, Card, EmptyState, Field, Loading } from '@/components/ui';
import { api } from '@/lib/api';
import { useSession } from '@/lib/session';
import { useAsync } from '@/lib/useAsync';
import { theme } from '@/theme/tokens';

/**
 * S16 — a service, and writing to the provider (§13).
 *
 * §13's prices are a range with a unit, never a single number: a yard charging
 * 8 000–12 000 ₺ a month and a farrier charging 900 ₺ a visit cannot share one
 * field, and showing the figure without the unit makes both meaningless.
 *
 * The enquiry opens a conversation with `contextType: 'service'`, the same
 * §16 thread machinery the marketplace uses — so a service enquiry lands in
 * the same inbox rather than in a parallel one nobody checks.
 */
interface ServiceDetail {
  id: string;
  slug: string;
  title: string;
  description: string;
  category: string;
  category_name_tr: string | null;
  price_min: string | number | null;
  price_max: string | number | null;
  price_unit: string | null;
  currency: string;
  city: string | null;
  region: string | null;
  is_mobile: boolean;
  service_radius_km: number | null;
  availability_note: string | null;
  provider_id: string;
  provider_handle: string;
  provider_name: string;
  verification_level: string;
  trust_score: number;
  rating_average: string | number | null;
  rating_count: number;
  organization_name: string | null;
}

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

export default function ServiceScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { me } = useSession();

  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data, loading } = useAsync(async () => {
    const result = await api<ServiceDetail>(`/services/${encodeURIComponent(String(slug))}`, {
      auth: false,
    });
    return result.ok ? result.data : null;
  }, [slug]);

  if (loading) return <Loading />;

  if (!data) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.color.bg, paddingTop: insets.top + theme.space.xxxl }}>
        <EmptyState
          icon="construct-outline"
          title="Hizmet bulunamadı"
          action={
            <Button label="Hizmetler" full={false} onPress={() => router.replace('/hizmetler')} />
          }
        />
      </View>
    );
  }

  const send = async () => {
    setSending(true);
    setError(null);

    const result = await api<{ conversationId: string }>('/conversations', {
      method: 'POST',
      body: JSON.stringify({
        contextType: 'service',
        contextId: data.id,
        participantId: data.provider_id,
        firstMessage: message.trim(),
      }),
    });

    setSending(false);

    if (!result.ok) {
      setError(result.error.message);
      return;
    }

    router.push(`/mesajlar/${result.data.conversationId}`);
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.color.bg }}
      contentContainerStyle={{
        paddingTop: insets.top,
        paddingHorizontal: theme.screenPadding,
        paddingBottom: theme.space.xxxl,
        gap: theme.space.lg,
      }}
      keyboardShouldPersistTaps="handled"
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <BackButton onPress={() => router.back()} />
        <Txt variant="screenTitle" uppercase>
          Hizmet
        </Txt>
        <View style={{ width: theme.metric.minTouchTarget }} />
      </View>

      <View style={{ gap: 4 }}>
        <Txt variant="display">{data.title}</Txt>
        <Txt variant="small" color={theme.color.textSecondary} display={false}>
          {[data.city, data.region].filter(Boolean).join(', ')}
          {data.is_mobile ? ' · yerinde hizmet' : ''}
          {data.service_radius_km ? ` · ${data.service_radius_km} km` : ''}
        </Txt>
        <Txt variant="h2" display weight="semibold" color={theme.color.goldSoft} style={{ marginTop: theme.space.sm }}>
          {formatPrice(data)}
        </Txt>
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.sm }}>
        <Badge label={data.category_name_tr ?? data.category} />
        {data.rating_count > 0 ? (
          <Badge
            label={`${Number(data.rating_average ?? 0).toFixed(1)} · ${data.rating_count} değerlendirme`}
          />
        ) : null}
      </View>

      <Pressable
        accessibilityRole="link"
        accessibilityLabel={`${data.provider_name} profiline git`}
        onPress={() => router.push(`/profil/${data.provider_handle}`)}
      >
        <Card style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space.md }}>
          <Avatar name={data.organization_name ?? data.provider_name} size={44} />
          <View style={{ flex: 1, gap: 2 }}>
            <Txt variant="h3" numberOfLines={1}>
              {data.organization_name ?? data.provider_name}
            </Txt>
            <Txt variant="caption" color={theme.color.textSecondary} display={false}>
              {VERIFICATION_LABEL_TR[data.verification_level] ?? data.verification_level}
              {' · güven '}
              {data.trust_score}
            </Txt>
          </View>
          <Ionicons name="chevron-forward" size={16} color={theme.color.textSecondary} />
        </Card>
      </Pressable>

      <View style={{ gap: theme.space.sm }}>
        <Txt variant="h3">Açıklama</Txt>
        <Txt variant="body" color={theme.color.textSecondary} display={false}>
          {data.description}
        </Txt>
      </View>

      {data.availability_note ? (
        <Card style={{ gap: theme.space.sm }}>
          <Txt variant="h3">Uygunluk</Txt>
          <Txt variant="small" color={theme.color.textSecondary} display={false}>
            {data.availability_note}
          </Txt>
        </Card>
      ) : null}

      {me ? (
        <Card style={{ gap: theme.space.md }}>
          <Txt variant="h3">Mesaj gönder</Txt>
          <Field
            label="Mesaj"
            value={message}
            onChangeText={setMessage}
            multiline
            numberOfLines={5}
            placeholder="Ne zaman ve nerede ihtiyacın olduğunu yaz."
            error={error}
            style={{ minHeight: 140 }}
          />
          <Button
            label="Gönder"
            onPress={() => void send()}
            loading={sending}
            disabled={message.trim().length < 10}
          />
        </Card>
      ) : (
        <Card style={{ gap: theme.space.md }}>
          <Txt variant="h3">Yazmak için giriş yap</Txt>
          <Button label="Giriş yap" onPress={() => router.push('/auth')} />
        </Card>
      )}
    </ScrollView>
  );
}

function formatPrice(service: ServiceDetail): string {
  const min = service.price_min === null ? null : Number(service.price_min);
  const max = service.price_max === null ? null : Number(service.price_max);

  if (min === null && max === null) return 'Fiyat sorunuz';

  const money = (value: number) =>
    new Intl.NumberFormat('tr-TR', {
      style: 'currency',
      currency: service.currency,
      maximumFractionDigits: 0,
    }).format(value);

  const range =
    min !== null && max !== null && min !== max
      ? `${money(min)} – ${money(max)}`
      : money((min ?? max) as number);

  const unit = service.price_unit ? PRICE_UNIT_TR[service.price_unit] : '';
  return unit ? `${range} / ${unit}` : range;
}
