import { Ionicons } from '@expo/vector-icons';
import {
  PRODUCT_DELIVERY_LABEL_TR,
  PRODUCT_PRICE_UNIT_LABEL_TR,
} from '@only-horses/shared-types';
import type { ProductDetail } from '@only-horses/shared-types';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { Txt } from '@/components/Text';
import { BackButton, Card, DataRow, EmptyState, Field, Loading } from '@/components/ui';
import { api } from '@/lib/api';
import { useSession } from '@/lib/session';
import { useAsync } from '@/lib/useAsync';
import { theme } from '@/theme/tokens';

/**
 * Buying a product — summary, payment, done.
 *
 * Three steps in one screen rather than three routes, because a checkout the
 * user can back out of halfway is a checkout that leaves an order in
 * `pending_seller` with nobody coming back for it. The order is not created
 * until "Siparişi ver"; before that this is a form.
 *
 * The money is not the first thing that happens. §5's order lifecycle puts the
 * seller's confirmation before the payment, and the copy says so, because a
 * buyer who expects to be charged now and is not will read the screen as
 * broken and order twice.
 */
type Step = 'summary' | 'payment' | 'done';

export default function BuyProductScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { me } = useSession();

  const [step, setStep] = useState<Step>('summary');
  const [quantity, setQuantity] = useState('1');
  const [name, setName] = useState(me?.displayName ?? '');
  const [phone, setPhone] = useState('');
  const [line1, setLine1] = useState('');
  const [city, setCity] = useState('');
  const [note, setNote] = useState('');

  const [order, setOrder] = useState<{ id: string; reference: string; total: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  // "Fiyat sorunuz" has no number to charge, so there is nothing to buy — the
  // detail screen keeps the message button and this route says why.
  if (data.priceAmount === null) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.color.bg, paddingTop: insets.top + theme.space.xxxl }}>
        <EmptyState
          icon="chatbubble-ellipses-outline"
          title="Bu üründe fiyat yok"
          body="Satıcı “fiyat sorunuz” olarak yayınlamış. Anlaşmak için mesaj yazman gerekiyor."
          action={
            <Button
              label="Satıcıya yaz"
              full={false}
              onPress={() => router.replace(`/urunler/${slug}`)}
            />
          }
        />
      </View>
    );
  }

  const units = Math.max(1, Math.min(Number(quantity) || 1, data.quantity));
  const total = data.priceAmount * units;
  const money = (value: number) =>
    new Intl.NumberFormat('tr-TR', {
      style: 'currency',
      currency: data.priceCurrency,
      maximumFractionDigits: 0,
    }).format(value);

  const needsAddress = data.delivery !== 'pickup';
  const addressValid = !needsAddress || (line1.trim().length > 4 && city.trim().length > 1);
  const canOrder = !!me && addressValid && units >= 1;

  const place = async () => {
    setBusy(true);
    setError(null);

    const result = await api<{ id: string; reference: string; total: number }>('/orders', {
      method: 'POST',
      body: JSON.stringify({
        productId: data.id,
        quantity: units,
        ...(needsAddress
          ? {
              shipToName: name.trim() || undefined,
              shipToPhone: phone.trim() || undefined,
              shipToLine1: line1.trim(),
              shipToCity: city.trim(),
            }
          : {}),
        ...(note.trim() ? { note: note.trim() } : {}),
      }),
    });

    setBusy(false);

    if (!result.ok) {
      setError(result.error.message);
      return;
    }

    setOrder(result.data);
    setStep('payment');
  };

  const pay = async () => {
    if (!order) return;
    setBusy(true);
    setError(null);

    const result = await api<{ status: string }>(`/orders/${order.id}/pay`, {
      method: 'POST',
      body: JSON.stringify({}),
    });

    setBusy(false);

    if (!result.ok) {
      setError(result.error.message);
      return;
    }

    setStep('done');
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
        <BackButton onPress={() => (step === 'done' ? router.replace('/urunler') : router.back())} />
        <Txt variant="screenTitle" uppercase>
          {step === 'done' ? 'Sipariş alındı' : 'Satın al'}
        </Txt>
        <View style={{ width: theme.metric.minTouchTarget }} />
      </View>

      <Card style={{ gap: theme.space.xs }}>
        <Txt variant="h3" numberOfLines={2}>
          {data.title}
        </Txt>
        <Txt variant="small" color={theme.color.textSecondary} display={false}>
          {money(data.priceAmount)}
          {data.priceUnit && data.priceUnit !== 'item'
            ? ` / ${PRODUCT_PRICE_UNIT_LABEL_TR[data.priceUnit] ?? data.priceUnit}`
            : ''}
          {' · '}
          {PRODUCT_DELIVERY_LABEL_TR[data.delivery] ?? data.delivery}
        </Txt>
      </Card>

      {step === 'summary' ? (
        <>
          <Card style={{ gap: theme.space.md }}>
            <Txt variant="h3">Adet</Txt>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space.lg }}>
              <Stepper
                label="Azalt"
                icon="remove"
                onPress={() => setQuantity(String(Math.max(1, units - 1)))}
                disabled={units <= 1}
              />
              <Txt variant="h2" style={{ minWidth: 48, textAlign: 'center' }}>
                {units}
              </Txt>
              <Stepper
                label="Artır"
                icon="add"
                onPress={() => setQuantity(String(Math.min(data.quantity, units + 1)))}
                disabled={units >= data.quantity}
              />
              <Txt variant="small" color={theme.color.textSecondary} display={false}>
                stokta {data.quantity}
              </Txt>
            </View>
          </Card>

          {needsAddress ? (
            <Card style={{ gap: theme.space.md }}>
              <Txt variant="h3">Teslimat adresi</Txt>
              <Field label="Ad soyad" value={name} onChangeText={setName} />
              <Field label="Telefon" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
              <Field label="Adres" value={line1} onChangeText={setLine1} multiline />
              <Field label="Şehir" value={city} onChangeText={setCity} />
            </Card>
          ) : (
            <Card style={{ gap: theme.space.sm }}>
              <Txt variant="h3">Elden teslim</Txt>
              <Txt variant="small" color={theme.color.textSecondary} display={false}>
                Bu ürün elden teslim. Satıcı onayladıktan sonra buluşma yerini mesajdan
                konuşacaksınız — adres istemiyoruz.
              </Txt>
            </Card>
          )}

          <Card style={{ gap: theme.space.md }}>
            <Field
              label="Satıcıya not"
              value={note}
              onChangeText={setNote}
              multiline
              hint="Zorunlu değil."
            />
          </Card>

          <Card style={{ gap: theme.space.sm }}>
            <DataRow label={`${units} × ${money(data.priceAmount)}`} value={money(total)} />
            <DataRow label="Kargo" value="Satıcıyla" />
            <View style={{ height: 1, backgroundColor: theme.color.border, marginVertical: theme.space.xs }} />
            <DataRow label="Toplam" value={money(total)} />
          </Card>

          {error ? (
            <Txt variant="small" color={theme.color.danger} display={false}>
              {error}
            </Txt>
          ) : null}

          <View style={{ gap: theme.space.sm }}>
            <Button
              label={me ? 'Siparişi ver' : 'Giriş yap'}
              loading={busy}
              disabled={me ? !canOrder : false}
              onPress={() => (me ? void place() : router.push('/auth'))}
            />
            <Txt variant="caption" color={theme.color.textSecondary} display={false}>
              Şimdi ödeme alınmıyor. Önce satıcı stoğu onaylıyor, ödeme ondan sonra.
            </Txt>
          </View>
        </>
      ) : null}

      {step === 'payment' && order ? (
        <>
          <Card style={{ gap: theme.space.sm }}>
            <Txt variant="h3">Sipariş oluşturuldu</Txt>
            <Txt variant="small" color={theme.color.textSecondary} display={false}>
              Sipariş no {order.reference}. Satıcıya bildirim gitti.
            </Txt>
          </Card>

          <Card style={{ gap: theme.space.md }}>
            <Txt variant="h3">Ödeme</Txt>
            <DataRow label="Tutar" value={money(order.total)} />

            {/*
              Said plainly, because the alternative is somebody demonstrating
              this and a person in the room believing money moved.
            */}
            <View
              style={{
                flexDirection: 'row',
                gap: theme.space.sm,
                padding: theme.space.md,
                borderRadius: theme.radius.md,
                borderWidth: 1,
                borderColor: theme.color.goldMuted,
              }}
            >
              <Ionicons name="information-circle-outline" size={18} color={theme.color.goldSoft} />
              <Txt variant="small" color={theme.color.textSecondary} display={false} style={{ flex: 1 }}>
                Ödeme sağlayıcısı henüz bağlı değil. Bu adım şimdilik simülasyon: sipariş
                gerçekten “ödendi” olarak işaretlenir ve stok düşer, ama para hareket etmez.
              </Txt>
            </View>

            {error ? (
              <Txt variant="small" color={theme.color.danger} display={false}>
                {error}
              </Txt>
            ) : null}

            <Button label="Ödemeyi tamamla" loading={busy} onPress={() => void pay()} />
            <Button
              label="Sonra öderim"
              variant="ghost"
              onPress={() => router.replace('/siparislerim')}
            />
          </Card>
        </>
      ) : null}

      {step === 'done' && order ? (
        <>
          <Card style={{ gap: theme.space.md, alignItems: 'center', paddingVertical: theme.space.xl }}>
            <Ionicons name="checkmark-circle" size={56} color={theme.color.goldSoft} />
            <Txt variant="h2">Ödeme tamamlandı</Txt>
            <Txt
              variant="small"
              color={theme.color.textSecondary}
              display={false}
              style={{ textAlign: 'center' }}
            >
              {order.reference} — satıcı kargoya verdiğinde haber vereceğiz. Teslim
              aldığında siparişi onaylaman gerekiyor.
            </Txt>
          </Card>

          <View style={{ gap: theme.space.sm }}>
            {/*
              Back to the marketplace, not to the product just bought: the
              buyer has finished with it, and its stock is one lower or gone.
            */}
            <Button label="Ekipmana dön" onPress={() => router.replace('/urunler')} />
            <Button
              label="Siparişlerim"
              variant="secondary"
              onPress={() => router.replace('/siparislerim')}
            />
          </View>
        </>
      ) : null}
    </ScrollView>
  );
}

function Stepper({
  label,
  icon,
  onPress,
  disabled,
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      onPress={onPress}
      disabled={disabled}
      style={{
        width: theme.metric.minTouchTarget,
        height: theme.metric.minTouchTarget,
        borderRadius: theme.radius.full,
        borderWidth: 1,
        borderColor: disabled ? theme.color.border : theme.color.goldMuted,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <Ionicons
        name={icon}
        size={20}
        color={disabled ? theme.color.textSecondary : theme.color.goldSoft}
      />
    </Pressable>
  );
}
