import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { Txt } from '@/components/Text';
import { BackButton, Card, Field } from '@/components/ui';
import { api } from '@/lib/api';
import { theme } from '@/theme/tokens';

/**
 * §6's transfer — the one screen the whole premise rests on.
 *
 * §1.3 P1 is that the record follows the horse. Without a way to hand it over,
 * that is a slogan: every sale ends with the buyer starting a new record and
 * the history dying with the seller's account. This is the screen that keeps
 * the promise.
 *
 * Two rules make it safe. Transferring by e-mail is allowed because the buyer
 * usually has no account yet, and refusing until they sign up is how the
 * record gets abandoned at exactly the moment it matters. And the price is
 * private by default — §6 records it for provenance, not for publication, and
 * a sale price on a public timeline is a thing sellers would rather lie about
 * than disclose.
 */
export default function TransferHorseScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [email, setEmail] = useState('');
  const [price, setPrice] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [pricePublic, setPricePublic] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const dateValid = /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(new Date(date).getTime());
  const valid = email.includes('@') && dateValid;

  const transfer = async () => {
    setBusy(true);
    setError(null);

    const result = await api(`/horses/${id}/transfer`, {
      method: 'POST',
      body: JSON.stringify({
        toEmail: email.trim(),
        ...(price ? { price: Number(price), currency: 'TRY' } : {}),
        date,
        pricePublic,
      }),
    });

    setBusy(false);

    if (!result.ok) {
      setError(result.error.message);
      return;
    }

    setDone(true);
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
          Devret
        </Txt>
        <View style={{ width: theme.metric.minTouchTarget }} />
      </View>

      {done ? (
        <Card style={{ gap: theme.space.md }}>
          <Txt variant="h3">Devir başlatıldı</Txt>
          <Txt variant="small" color={theme.color.textSecondary} display={false}>
            Yeni sahibe bildirildi. Kabul ettiğinde at senin ahırından çıkar ve
            kaydı — sağlık, yarışma, sahiplik — onunla birlikte gider. Sahiplik
            satırında adın kalır.
          </Txt>
          <Button label="Ahırıma dön" onPress={() => router.replace('/ahir')} />
        </Card>
      ) : (
        <>
          <Card style={{ gap: theme.space.sm }}>
            <Txt variant="h3">Kayıt atla birlikte gider</Txt>
            <Txt variant="small" color={theme.color.textSecondary} display={false}>
              §6 — devirde geçmiş silinmez, devrolur. Yeni sahip sağlık ve
              yarışma kayıtlarını olduğu gibi devralır; senin girdiğin satırlar
              senin adınla kalır.
            </Txt>
          </Card>

          <Field
            label="Yeni sahibin e-postası"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            placeholder="alici@eposta.com"
            hint="Hesabı yoksa da olur — kaydolduğunda devir onu bekliyor olur."
          />

          <Field
            label="Devir tarihi"
            value={date}
            onChangeText={setDate}
            placeholder="2026-08-15"
            error={dateValid ? null : 'YYYY-AA-GG biçiminde yaz.'}
          />

          <Field
            label="Satış bedeli (TRY)"
            value={price}
            onChangeText={(value) => setPrice(value.replace(/\D/g, ''))}
            keyboardType="number-pad"
            placeholder="İsteğe bağlı"
            hint={
              pricePublic
                ? 'Bedel geçmişte herkese görünür olacak.'
                : 'Bedel gizli tutulur — yalnızca sen ve yeni sahip görür.'
            }
          />

          <Button
            label={pricePublic ? 'Bedeli gizle' : 'Bedeli herkese göster'}
            variant="ghost"
            onPress={() => setPricePublic((value) => !value)}
          />

          {error ? (
            <Txt variant="small" color={theme.color.danger} display={false}>
              {error}
            </Txt>
          ) : null}

          {confirming ? (
            <Card style={{ gap: theme.space.md, borderColor: theme.color.warning }}>
              <Txt variant="h3">Emin misin?</Txt>
              <Txt variant="small" color={theme.color.textSecondary} display={false}>
                Devir kabul edildiğinde bu at ahırından çıkar ve düzenleme hakkın
                sona erer. Geri almak yeni sahibin seni geri devretmesini gerektirir.
              </Txt>
              <View style={{ flexDirection: 'row', gap: theme.space.md }}>
                <Button
                  label="Vazgeç"
                  variant="secondary"
                  full={false}
                  style={{ flex: 1 }}
                  onPress={() => setConfirming(false)}
                />
                <Button
                  label="Devret"
                  variant="danger"
                  full={false}
                  style={{ flex: 1 }}
                  loading={busy}
                  onPress={() => void transfer()}
                />
              </View>
            </Card>
          ) : (
            <Button label="Devri başlat" onPress={() => setConfirming(true)} disabled={!valid} />
          )}
        </>
      )}
    </ScrollView>
  );
}
