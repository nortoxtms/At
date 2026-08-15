import { Ionicons } from '@expo/vector-icons';
import { LISTING_TYPE_LABEL_TR } from '@only-horses/shared-types';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { Button } from '@/components/Button';
import { Txt } from '@/components/Text';
import { Choice, Wizard } from '@/components/Wizard';
import { Card, DataRow, EmptyState, Field, Loading } from '@/components/ui';
import { SAMPLE_STABLE, type SampleHorse } from '@/content/sample';
import { api } from '@/lib/api';
import type { MyHorse } from '@/lib/endpoints';
import { formatPrice, washFromBlurhash } from '@/lib/format';
import { useSession } from '@/lib/session';
import { useAsync } from '@/lib/useAsync';
import { theme } from '@/theme/tokens';

/**
 * S13 — the listing composer, opened by the [+] in the tab bar.
 *
 * It starts by asking which horse, and there is no "enter a horse instead"
 * escape. §1.3's P1 is that the listing is a view of a registry record; a
 * listing typed straight into a form is a classified ad with no horse behind
 * it, and one of those in the database undoes the premise for all of them.
 *
 * §3.3's gate is checked here rather than at publish. Filling five steps and
 * being told at the end that you cannot publish is the single worst place to
 * put that message.
 */
const TYPES = ['sale', 'lease', 'half_lease', 'share', 'stud', 'loan'] as const;
const PRICE_TYPES = ['fixed', 'negotiable', 'on_request'] as const;

const PRICE_TYPE_LABEL: Record<string, string> = {
  fixed: 'Sabit',
  negotiable: 'Pazarlıklı',
  on_request: 'Sorunuz',
};



export default function ListingComposer() {
  const router = useRouter();
  const { me, ready } = useSession();
  const params = useLocalSearchParams<{ horse?: string }>();

  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [horseId, setHorseId] = useState<string | null>(params.horse ?? null);
  const [type, setType] = useState<(typeof TYPES)[number] | null>('sale');
  const [priceType, setPriceType] = useState<(typeof PRICE_TYPES)[number] | null>('fixed');
  const [price, setPrice] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [city, setCity] = useState('');
  const [trial, setTrial] = useState(true);
  const [ppe, setPpe] = useState(true);

  const { data: stable, loading } = useAsync(async () => {
    const result = await api<MyHorse[]>('/me/horses');
    if (result.ok && Array.isArray(result.data)) {
      return result.data.map<SampleHorse>((horse) => ({
        id: horse.id,
        name: horse.name,
        slug: horse.id,
        sex: horse.sex,
        ageYears: 0,
        heightCm: 0,
        breed: '',
        color: '',
        disciplines: [],
        blurhash: horse.coverBlurhash,
        listedAs: null,
      }));
    }
    return me ? [] : SAMPLE_STABLE;
  }, [me?.id]);

  const horses = stable ?? [];
  const verified = !!me && me.verificationLevel !== 'none' && me.verificationLevel !== 'email_verified';

  if (!ready || loading) return <Loading />;

  // §3.3, checked before the first step rather than after the last.
  if (!me || !verified) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.color.bg, justifyContent: 'center', padding: theme.screenPadding }}>
        <EmptyState
          icon="shield-outline"
          title={me ? 'Önce kimliğini doğrula' : 'Önce giriş yap'}
          body={
            me
              ? 'İlan yayınlamak kimlik doğrulaması ister (§3.3). Bu hiçbir planla satın alınamaz — ücretsiz hesapta da, Business planda da aynı koşuldur.'
              : 'İlan vermek için hesabına girmen gerekiyor.'
          }
          action={
            <Button
              label={me ? 'Doğrulamayı başlat' : 'Giriş yap'}
              full={false}
              onPress={() => router.replace(me ? '/dogrulama' : '/auth')}
            />
          }
        />
        <Button label="Vazgeç" variant="ghost" onPress={() => router.back()} />
      </View>
    );
  }

  const priceValid = priceType === 'on_request' || (!!price && Number(price) > 0);

  const canContinue = [
    horseId !== null,
    type !== null,
    priceValid,
    title.trim().length >= 8 && description.trim().length >= 40,
    true,
  ][step - 1];

  const submit = async () => {
    setBusy(true);
    setError(null);

    const result = await api<{ id: string; slug: string }>('/listings', {
      method: 'POST',
      // `countryCode` is required by `createListingSchema` and the launch
      // region is TR (§1.2); `priceAmount` is `.optional()`, so "fiyat
      // sorunuz" omits the key rather than sending null.
      body: JSON.stringify({
        horseId,
        type,
        title: title.trim(),
        description: description.trim(),
        priceType,
        ...(priceType === 'on_request' ? {} : { priceAmount: Number(price) }),
        priceCurrency: 'TRY',
        countryCode: 'TR',
        ...(city.trim() ? { city: city.trim() } : {}),
        trialAllowed: trial,
        ppeWelcome: ppe,
      }),
    });

    setBusy(false);

    if (!result.ok) {
      setError(result.error.message);
      return;
    }

    router.replace('/ilanlarim');
  };

  const horse = horses.find((entry) => entry.id === horseId) ?? null;

  return (
    <Wizard
      title="İlan ver"
      step={step}
      total={5}
      busy={busy}
      canContinue={!!canContinue}
      continueLabel={step === 5 ? 'Taslağı kaydet' : 'Devam'}
      onBack={() => (step === 1 ? router.back() : setStep(step - 1))}
      onContinue={() => (step === 5 ? void submit() : setStep(step + 1))}
      stepTitle={['Hangi at?', 'İlan türü', 'Fiyat', 'Anlat', 'Gözden geçir'][step - 1] ?? ''}
      stepBody={
        [
          'İlan bir attan türer. Kaydı olmayan bir atı satışa çıkaramazsın.',
          'Satış, kiralama ve aygır hizmeti farklı kurallara tabidir.',
          'Fiyat vermemeyi seçebilirsin — ama boş bırakamazsın.',
          'Başlık ve açıklama alıcının ilk okuduğu şey. Kısa geçme.',
          'Taslak olarak kaydedilir. Yayına almak ayrı bir adım.',
        ][step - 1]
      }
    >
      {step === 1 ? (
        horses.length === 0 ? (
          <EmptyState
            icon="add-circle-outline"
            title="Ahırında at yok"
            body="Önce atı kaydet, sonra ilana çıkar."
            action={<Button label="At ekle" full={false} onPress={() => router.replace('/ahir/yeni')} />}
          />
        ) : (
          <View style={{ gap: theme.space.md }}>
            {horses.map((entry) => (
              <Pressable
                key={entry.id}
                accessibilityRole="radio"
                accessibilityState={{ selected: horseId === entry.id }}
                onPress={() => setHorseId(entry.id)}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: theme.space.md,
                  padding: theme.space.md,
                  borderRadius: theme.radius.md,
                  backgroundColor: theme.color.surface,
                  borderWidth: 1,
                  borderColor: horseId === entry.id ? theme.color.goldSoft : theme.color.border,
                }}
              >
                <View
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: theme.radius.sm,
                    backgroundColor: washFromBlurhash(entry.blurhash),
                  }}
                />
                <Txt variant="h3" style={{ flex: 1 }}>
                  {entry.name}
                </Txt>
                <Ionicons
                  name={horseId === entry.id ? 'checkmark-circle' : 'ellipse-outline'}
                  size={22}
                  color={horseId === entry.id ? theme.color.goldSoft : theme.color.textSecondary}
                />
              </Pressable>
            ))}
          </View>
        )
      ) : null}

      {step === 2 ? (
        <Choice
          label="Tür"
          options={TYPES}
          value={type}
          onChange={setType}
          render={(option) => LISTING_TYPE_LABEL_TR[option] ?? option}
        />
      ) : null}

      {step === 3 ? (
        <View style={{ gap: theme.space.lg }}>
          <Choice
            label="Fiyat tipi"
            options={PRICE_TYPES}
            value={priceType}
            onChange={setPriceType}
            render={(option) => PRICE_TYPE_LABEL[option] ?? option}
          />
          {priceType === 'on_request' ? (
            <Txt variant="small" color={theme.color.textSecondary} display={false}>
              İlanda &quot;Fiyat sorunuz&quot; görünür. Aramada fiyat filtresine takılmazsın —
              bu, daha az kişiye görünmek demek.
            </Txt>
          ) : (
            <Field
              label="Fiyat (TRY)"
              value={price}
              onChangeText={(value) => setPrice(value.replace(/\D/g, ''))}
              keyboardType="number-pad"
              placeholder="450000"
            />
          )}
        </View>
      ) : null}

      {step === 4 ? (
        <View style={{ gap: theme.space.lg }}>
          <Field
            label="Başlık"
            value={title}
            onChangeText={setTitle}
            placeholder="Efsane — 8 yaşında iğdiş"
            hint={`${title.trim().length} / en az 8 karakter`}
          />
          <Field
            label="Açıklama"
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={6}
            placeholder="Eğitim seviyesi, karakteri, kime uygun, neden satılıyor…"
            hint={`${description.trim().length} / en az 40 karakter`}
            style={{ minHeight: 160 }}
          />
          <Field label="Şehir" value={city} onChangeText={setCity} placeholder="İstanbul" />

          <Toggle label="Deneme binişi mümkün" value={trial} onChange={setTrial} />
          <Toggle label="Satın alma öncesi muayeneye (PPE) açığım" value={ppe} onChange={setPpe} />
        </View>
      ) : null}

      {step === 5 ? (
        <View style={{ gap: theme.space.lg }}>
          <Card>
            <DataRow label="At" value={horse?.name ?? '—'} />
            <DataRow label="Tür" value={type ? (LISTING_TYPE_LABEL_TR[type] ?? type) : '—'} />
            <DataRow
              label="Fiyat"
              value={
                priceType === 'on_request'
                  ? 'Fiyat sorunuz'
                  : formatPrice(price || null, 'TRY', priceType ?? undefined)
              }
            />
            <DataRow label="Başlık" value={title || '—'} />
            <DataRow label="Şehir" value={city || '—'} />
            <DataRow label="Deneme" value={trial ? 'Var' : 'Yok'} />
            <DataRow label="PPE" value={ppe ? 'Açık' : 'Kapalı'} />
          </Card>

          {error ? (
            <Txt variant="small" color={theme.color.danger} display={false}>
              {error}
            </Txt>
          ) : null}

          <Txt variant="caption" color={theme.color.textSecondary} display={false}>
            Taslak olarak kaydedilir. İlanlarım ekranından yayına alabilirsin.
          </Txt>
        </View>
      ) : null}
    </Wizard>
  );
}

function Toggle({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      accessibilityLabel={label}
      onPress={() => onChange(!value)}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: theme.space.md,
        minHeight: theme.metric.minTouchTarget,
      }}
    >
      <Txt variant="body" display={false} style={{ flex: 1 }}>
        {label}
      </Txt>
      <View
        style={{
          width: 46,
          height: 28,
          borderRadius: 14,
          padding: 3,
          backgroundColor: value ? theme.color.goldSoft : theme.color.surfaceRaised,
          borderWidth: 1,
          borderColor: value ? theme.color.goldSoft : theme.color.border,
          alignItems: value ? 'flex-end' : 'flex-start',
        }}
      >
        <View
          style={{
            width: 20,
            height: 20,
            borderRadius: 10,
            backgroundColor: value ? theme.color.textOnGold : theme.color.textSecondary,
          }}
        />
      </View>
    </Pressable>
  );
}
