import { Ionicons } from '@expo/vector-icons';
import {
  PRODUCT_CONDITION_LABEL_TR,
  PRODUCT_DELIVERY_LABEL_TR,
  PRODUCT_PRICE_UNIT_LABEL_TR,
  VERIFICATION_LABEL_TR,
} from '@only-horses/shared-types';
import type { ProductDetail } from '@only-horses/shared-types';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Image, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Badge } from '@/components/ListingCard';
import { Button } from '@/components/Button';
import { Txt } from '@/components/Text';
import { Avatar, BackButton, Card, DataRow, EmptyState, Field, Loading } from '@/components/ui';
import { api } from '@/lib/api';
import { useSession } from '@/lib/session';
import { useAsync } from '@/lib/useAsync';
import { theme } from '@/theme/tokens';

/**
 * A product, and writing to whoever is selling it.
 *
 * The delivery line is given the same weight as the price. A trailer that is
 * collection-only in Kayseri and a bit that posts anywhere are different
 * propositions to a buyer in İzmir, and burying that under the description is
 * how both sides waste a message finding out.
 */
export default function ProductScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { me } = useSession();

  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [primed, setPrimed] = useState(false);

  const { data, loading } = useAsync(async () => {
    const result = await api<ProductDetail>(`/products/${encodeURIComponent(String(slug))}`, {
      auth: false,
    });
    return result.ok ? result.data : null;
  }, [slug]);

  if (loading) return <Loading />;

  if (!data) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.color.bg, paddingTop: insets.top + theme.space.xxxl }}>
        <EmptyState
          icon="cube-outline"
          title="Ürün bulunamadı"
          body="Satılmış ya da kaldırılmış olabilir."
          action={<Button label="Ekipmana dön" full={false} onPress={() => router.replace('/urunler')} />}
        />
      </View>
    );
  }

  if (!primed) {
    setPrimed(true);
    setMessage(`Merhaba, "${data.title}" hâlâ satılık mı? Durumu hakkında biraz bilgi verir misin?`);
  }

  const price =
    data.priceType === 'free'
      ? 'Ücretsiz'
      : data.priceAmount === null
        ? 'Fiyat sorunuz'
        : `${new Intl.NumberFormat('tr-TR', {
            style: 'currency',
            currency: data.priceCurrency,
            maximumFractionDigits: 0,
          }).format(data.priceAmount)}${
            data.priceUnit && data.priceUnit !== 'item'
              ? ` / ${PRODUCT_PRICE_UNIT_LABEL_TR[data.priceUnit] ?? data.priceUnit}`
              : ''
          }`;

  const send = async () => {
    if (!me) return router.push('/auth');

    setSending(true);
    setError(null);

    const result = await api<{ conversationId: string }>('/conversations', {
      method: 'POST',
      body: JSON.stringify({
        contextType: 'product',
        contextId: data.id,
        participantId: data.sellerProfileId,
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
          Ürün
        </Txt>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Bildir"
          onPress={() => router.push(`/bildir?type=listing&id=${data.id}`)}
          hitSlop={12}
          style={{ minHeight: theme.metric.minTouchTarget, justifyContent: 'center' }}
        >
          <Ionicons name="flag-outline" size={19} color={theme.color.textSecondary} />
        </Pressable>
      </View>

      {data.images.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: theme.space.sm }}>
          {data.images.map((uri) => (
            <Image
              key={uri}
              source={{ uri }}
              style={{
                width: 260,
                height: 195,
                borderRadius: theme.radius.md,
                backgroundColor: theme.color.surfaceRaised,
              }}
              resizeMode="cover"
              accessibilityLabel="Ürün fotoğrafı"
            />
          ))}
        </ScrollView>
      ) : null}

      <View style={{ gap: 4 }}>
        <Txt variant="display">{data.title}</Txt>
        <Txt variant="small" color={theme.color.textSecondary} display={false}>
          {[data.categoryName, data.city, data.region].filter(Boolean).join(' · ')}
        </Txt>
        <Txt variant="h1" display weight="semibold" color={theme.color.goldSoft} style={{ marginTop: theme.space.sm }}>
          {price}
        </Txt>
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.sm }}>
        <Badge label={PRODUCT_CONDITION_LABEL_TR[data.condition] ?? data.condition} />
        <Badge label={PRODUCT_DELIVERY_LABEL_TR[data.delivery] ?? data.delivery} />
        {data.quantity > 1 ? <Badge label={`${data.quantity} adet`} /> : null}
      </View>

      <Pressable
        accessibilityRole="link"
        accessibilityLabel={`${data.sellerName} profiline git`}
        onPress={() => router.push(`/profil/${data.sellerHandle}`)}
      >
        <Card style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space.md }}>
          <Avatar name={data.sellerName} size={44} />
          <View style={{ flex: 1, gap: 2 }}>
            <Txt variant="h3" numberOfLines={1}>
              {data.sellerName}
            </Txt>
            <Txt variant="caption" color={theme.color.textSecondary} display={false}>
              {VERIFICATION_LABEL_TR[data.sellerVerification] ?? data.sellerVerification}
              {' · güven '}
              {data.sellerTrustScore}
            </Txt>
          </View>
          <Ionicons name="chevron-forward" size={16} color={theme.color.textSecondary} />
        </Card>
      </Pressable>

      <Card>
        <Txt variant="h3" style={{ marginBottom: theme.space.sm }}>
          Künye
        </Txt>
        {data.brand ? <DataRow label="Marka" value={data.brand} /> : null}
        {data.model ? <DataRow label="Model" value={data.model} /> : null}
        {data.sizeLabel ? <DataRow label="Ölçü" value={data.sizeLabel} /> : null}
        {data.color ? <DataRow label="Renk" value={data.color} /> : null}
        <DataRow
          label="Durum"
          value={PRODUCT_CONDITION_LABEL_TR[data.condition] ?? data.condition}
        />
        <DataRow
          label="Teslimat"
          value={PRODUCT_DELIVERY_LABEL_TR[data.delivery] ?? data.delivery}
        />
        {data.shippingNote ? <DataRow label="Kargo notu" value={data.shippingNote} /> : null}
      </Card>

      <View style={{ gap: theme.space.sm }}>
        <Txt variant="h3">Açıklama</Txt>
        <Txt variant="body" color={theme.color.textSecondary} display={false}>
          {data.description}
        </Txt>
      </View>

      {/*
        Buying comes before writing, and only when there is a price to buy at.
        A "fiyat sorunuz" listing keeps the message box and nothing else —
        offering a checkout with no amount is offering a button that 400s.
      */}
      {data.priceAmount !== null && data.priceType !== 'on_request' ? (
        <Card style={{ gap: theme.space.md }}>
          <Txt variant="h3">Bu ürünü al</Txt>
          <Txt variant="small" color={theme.color.textSecondary} display={false}>
            Sipariş verdiğinde önce satıcı stoğu onaylar; ödeme ondan sonra alınır.
          </Txt>
          <Button
            label={me ? 'Satın al' : 'Almak için giriş yap'}
            onPress={() => router.push(me ? `/satin-al/${data.slug}` : '/auth')}
          />
        </Card>
      ) : null}

      <Card style={{ gap: theme.space.md }}>
        <Txt variant="h3">Satıcıya yaz</Txt>
        <Field
          label="Mesaj"
          value={message}
          onChangeText={setMessage}
          multiline
          numberOfLines={5}
          error={error}
          style={{ minHeight: 130 }}
          hint="§16 — atı görmeden, ürünü elden almadan kapora gönderme."
        />
        <Button
          label={me ? 'Gönder' : 'Yazmak için giriş yap'}
          onPress={() => void send()}
          loading={sending}
          disabled={me ? message.trim().length < 10 : false}
        />
      </Card>

      <Txt variant="caption" color={theme.color.textSecondary} display={false}>
        {data.viewCount} görüntülenme
      </Txt>
    </ScrollView>
  );
}
