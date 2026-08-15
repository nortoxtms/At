import {
  PRODUCT_CONDITION_LABEL_TR,
  PRODUCT_DELIVERY_LABEL_TR,
  PRODUCT_PRICE_UNIT_LABEL_TR,
} from '@only-horses/shared-types';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { Txt } from '@/components/Text';
import { Choice, Wizard } from '@/components/Wizard';
import { Card, Chip, DataRow, Field } from '@/components/ui';
import { api } from '@/lib/api';
import { useAsync } from '@/lib/useAsync';
import { useSession } from '@/lib/session';
import { theme } from '@/theme/tokens';

/**
 * Selling a piece of equipment.
 *
 * Four steps, not five, and no identity gate. §3.3 requires verification to
 * publish a *horse* because the harm it prevents is someone selling an animal
 * they do not own. A second-hand girth carries no such risk, and putting the
 * same wall in front of it would empty the marketplace this exists to fill.
 * Moderation and reporting still apply.
 *
 * The category picker is search-first: thirty-six categories is a wall of
 * chips, and the seller already knows the word for what they are holding.
 */
interface Category {
  code: string;
  parent_code: string | null;
  name_tr: string;
}

const CONDITIONS = ['new', 'like_new', 'good', 'used', 'for_parts'] as const;
const DELIVERIES = ['pickup', 'shipping', 'both'] as const;
const UNITS = ['item', 'kg', 'ton', 'bale', 'sack', 'metre', 'set', 'pair'] as const;

export default function NewProductWizard() {
  const router = useRouter();
  const { me } = useSession();

  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [categoryQuery, setCategoryQuery] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [brand, setBrand] = useState('');
  const [model, setModel] = useState('');
  const [sizeLabel, setSizeLabel] = useState('');
  const [color, setColor] = useState('');
  const [condition, setCondition] = useState<(typeof CONDITIONS)[number] | null>('good');
  const [price, setPrice] = useState('');
  const [unit, setUnit] = useState<(typeof UNITS)[number] | null>('item');
  const [quantity, setQuantity] = useState('1');
  const [delivery, setDelivery] = useState<(typeof DELIVERIES)[number] | null>('pickup');
  const [shippingNote, setShippingNote] = useState('');
  const [city, setCity] = useState('');

  const { data: categories } = useAsync(async () => {
    const result = await api<Category[]>('/products/categories', { auth: false });
    return result.ok && Array.isArray(result.data) ? result.data : [];
  }, []);

  // Only leaves are selectable. Filing a saddle under "Koşum ve saraciye"
  // instead of "Eyer" makes it invisible to anyone browsing saddles.
  const leaves = useMemo(
    () => (categories ?? []).filter((entry) => entry.parent_code),
    [categories],
  );

  const matches = useMemo(() => {
    const needle = categoryQuery.trim().toLocaleLowerCase('tr');
    const filtered = needle
      ? leaves.filter((entry) => entry.name_tr.toLocaleLowerCase('tr').includes(needle))
      : leaves;
    return filtered.slice(0, 14);
  }, [leaves, categoryQuery]);

  const canContinue = [
    category !== null,
    title.trim().length >= 4 && description.trim().length >= 20,
    !!condition && !!delivery,
    true,
  ][step - 1];

  const submit = async () => {
    setBusy(true);
    setError(null);

    const result = await api<{ id: string; slug: string }>('/products', {
      method: 'POST',
      body: JSON.stringify({
        category,
        title: title.trim(),
        description: description.trim(),
        ...(brand.trim() ? { brand: brand.trim() } : {}),
        ...(model.trim() ? { model: model.trim() } : {}),
        ...(sizeLabel.trim() ? { sizeLabel: sizeLabel.trim() } : {}),
        ...(color.trim() ? { color: color.trim() } : {}),
        condition,
        ...(price ? { priceAmount: Number(price) } : { priceType: 'on_request' }),
        priceCurrency: 'TRY',
        priceUnit: unit,
        quantity: Number(quantity) || 1,
        delivery,
        ...(shippingNote.trim() ? { shippingNote: shippingNote.trim() } : {}),
        countryCode: 'TR',
        ...(city.trim() ? { city: city.trim() } : {}),
      }),
    });

    setBusy(false);

    if (!result.ok) {
      setError(
        me ? result.error.message : 'Ürün koymak için giriş yapman gerekiyor.',
      );
      return;
    }

    router.replace('/urunlerim');
  };

  const chosen = leaves.find((entry) => entry.code === category);

  return (
    <Wizard
      title="Ürün sat"
      step={step}
      total={4}
      busy={busy}
      canContinue={!!canContinue}
      continueLabel={step === 4 ? 'Taslağı kaydet' : 'Devam'}
      onBack={() => (step === 1 ? router.back() : setStep(step - 1))}
      onContinue={() => (step === 4 ? void submit() : setStep(step + 1))}
      stepTitle={['Ne satıyorsun?', 'Anlat', 'Durum ve teslimat', 'Gözden geçir'][step - 1] ?? ''}
      stepBody={
        [
          'Kategoriyi ara ve seç. Eyerden çite, yemden kaska.',
          'Başlık ve açıklama alıcının ilk okuduğu şey.',
          'Durumu ve nasıl teslim edeceğini net yaz — mesaj trafiğinin yarısı bu yüzden.',
          'Taslak olarak kaydedilir. Yayına almak ayrı bir adım.',
        ][step - 1]
      }
    >
      {step === 1 ? (
        <View style={{ gap: theme.space.lg }}>
          <Field
            label="Kategori"
            value={categoryQuery}
            onChangeText={(value) => {
              setCategoryQuery(value);
              setCategory(null);
            }}
            placeholder="Ara: eyer, çit, yem, kask…"
            hint={chosen ? `Seçili: ${chosen.name_tr}` : 'Listeden seç.'}
          />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.sm }}>
            {matches.map((entry) => (
              <Chip
                key={entry.code}
                label={entry.name_tr}
                selected={category === entry.code}
                onPress={() => {
                  setCategory(entry.code);
                  setCategoryQuery(entry.name_tr);
                }}
              />
            ))}
          </View>
        </View>
      ) : null}

      {step === 2 ? (
        <View style={{ gap: theme.space.lg }}>
          <Field
            label="Başlık"
            value={title}
            onChangeText={setTitle}
            placeholder="Wintec 500 All Purpose 17.5 inç"
            hint={`${title.trim().length} / en az 4 karakter`}
          />
          <Field
            label="Açıklama"
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={6}
            placeholder="Ne kadar kullanıldı, kusuru var mı, neler dahil…"
            hint={`${description.trim().length} / en az 20 karakter`}
            style={{ minHeight: 150 }}
          />
          <Field label="Marka" value={brand} onChangeText={setBrand} placeholder="Wintec" />
          <Field label="Model" value={model} onChangeText={setModel} placeholder="500 AP" />
          <Field
            label="Ölçü"
            value={sizeLabel}
            onChangeText={setSizeLabel}
            placeholder="17.5 inç / 145 cm / 41 numara"
          />
          <Field label="Renk" value={color} onChangeText={setColor} placeholder="Siyah" />
        </View>
      ) : null}

      {step === 3 ? (
        <View style={{ gap: theme.space.lg }}>
          <Choice
            label="Durum"
            options={CONDITIONS}
            value={condition}
            onChange={setCondition}
            render={(option) => PRODUCT_CONDITION_LABEL_TR[option] ?? option}
          />
          <Field
            label="Fiyat (TRY)"
            value={price}
            onChangeText={(value) => setPrice(value.replace(/\D/g, ''))}
            keyboardType="number-pad"
            placeholder="Boş bırakırsan “fiyat sorunuz” görünür"
          />
          <Choice
            label="Birim"
            options={UNITS}
            value={unit}
            onChange={setUnit}
            render={(option) => PRODUCT_PRICE_UNIT_LABEL_TR[option] ?? option}
          />
          <Field
            label="Adet"
            value={quantity}
            onChangeText={(value) => setQuantity(value.replace(/\D/g, '').slice(0, 5))}
            keyboardType="number-pad"
          />
          <Choice
            label="Teslimat"
            options={DELIVERIES}
            value={delivery}
            onChange={setDelivery}
            render={(option) => PRODUCT_DELIVERY_LABEL_TR[option] ?? option}
          />
          {delivery !== 'pickup' ? (
            <Field
              label="Kargo notu"
              value={shippingNote}
              onChangeText={setShippingNote}
              placeholder="Alıcı öder / anlaşmalı kargo…"
            />
          ) : null}
          <Field label="Şehir" value={city} onChangeText={setCity} placeholder="İstanbul" />
        </View>
      ) : null}

      {step === 4 ? (
        <View style={{ gap: theme.space.lg }}>
          <Card>
            <DataRow label="Kategori" value={chosen?.name_tr ?? '—'} />
            <DataRow label="Başlık" value={title || '—'} />
            <DataRow label="Marka" value={brand || '—'} />
            <DataRow label="Ölçü" value={sizeLabel || '—'} />
            <DataRow
              label="Durum"
              value={condition ? (PRODUCT_CONDITION_LABEL_TR[condition] ?? condition) : '—'}
            />
            <DataRow
              label="Fiyat"
              value={
                price
                  ? `${new Intl.NumberFormat('tr-TR', {
                      style: 'currency',
                      currency: 'TRY',
                      maximumFractionDigits: 0,
                    }).format(Number(price))}${
                      unit && unit !== 'item'
                        ? ` / ${PRODUCT_PRICE_UNIT_LABEL_TR[unit] ?? unit}`
                        : ''
                    }`
                  : 'Fiyat sorunuz'
              }
            />
            <DataRow label="Adet" value={quantity || '1'} />
            <DataRow
              label="Teslimat"
              value={delivery ? (PRODUCT_DELIVERY_LABEL_TR[delivery] ?? delivery) : '—'}
            />
            <DataRow label="Şehir" value={city || '—'} />
          </Card>

          {error ? (
            <Txt variant="small" color={theme.color.danger} display={false}>
              {error}
            </Txt>
          ) : null}

          <Txt variant="caption" color={theme.color.textSecondary} display={false}>
            Taslak olarak kaydedilir; fotoğraf ekleyip yayına almak için
            Ürünlerim ekranına gideceksin.
          </Txt>
        </View>
      ) : null}
    </Wizard>
  );
}
