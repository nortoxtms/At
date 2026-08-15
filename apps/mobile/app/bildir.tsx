import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { Txt } from '@/components/Text';
import { BackButton, Card, Field } from '@/components/ui';
import { Choice } from '@/components/Wizard';
import { api } from '@/lib/api';
import { theme } from '@/theme/tokens';

/**
 * Reporting a listing or a person (§18.5).
 *
 * The reasons are the ones moderation can act on, and welfare is first. §18.5
 * treats a welfare report as a different class of thing from a scam report —
 * it is escalated rather than queued — so it is not buried under "diğer".
 *
 * The confirmation does not promise an outcome. A report that says "bu ilan
 * kaldırılacak" and then does not is worse than one that says what actually
 * happens next.
 */
const REASONS = ['welfare', 'scam', 'misleading', 'duplicate', 'offensive', 'other'] as const;

const REASON_LABEL: Record<string, string> = {
  welfare: 'At refahı',
  scam: 'Dolandırıcılık',
  misleading: 'Yanıltıcı bilgi',
  duplicate: 'Mükerrer ilan',
  offensive: 'Uygunsuz içerik',
  other: 'Diğer',
};

export default function ReportScreen() {
  const router = useRouter();
  const [reason, setReason] = useState<(typeof REASONS)[number] | null>(null);
  const [detail, setDetail] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    await api('/reports', {
      method: 'POST',
      body: JSON.stringify({ reason, detail: detail.trim() || null }),
    });
    setBusy(false);
    setSent(true);
  };

  return (
    <Screen scroll>
      <View style={{ paddingTop: theme.space.sm }}>
        <BackButton onPress={() => router.back()} />
      </View>

      {sent ? (
        <Card style={{ marginTop: theme.space.xxl, gap: theme.space.md }}>
          <Txt variant="h2">Bildirimin alındı</Txt>
          <Txt variant="small" color={theme.color.textSecondary} display={false}>
            Moderasyon ekibi inceleyecek. Refah bildirimleri sıraya girmez, doğrudan
            önceliklendirilir (§18.5). Sonucu sana bildirmeyebiliriz — ama her
            bildirim okunur.
          </Txt>
          <Button label="Kapat" onPress={() => router.back()} />
        </Card>
      ) : (
        <View style={{ gap: theme.space.xl, paddingTop: theme.space.xl }}>
          <View style={{ gap: theme.space.sm }}>
            <Txt variant="display">Bildir</Txt>
            <Txt variant="body" color={theme.color.textSecondary} display={false}>
              Neyin yanlış olduğunu seç. Acil bir refah durumu varsa yerel yetkiliye
              de haber ver — biz kolluk kuvveti değiliz.
            </Txt>
          </View>

          <Choice
            label="Sebep"
            options={REASONS}
            value={reason}
            onChange={setReason}
            render={(option) => REASON_LABEL[option] ?? option}
          />

          <Field
            label="Ayrıntı"
            value={detail}
            onChangeText={setDetail}
            multiline
            numberOfLines={6}
            placeholder="Gördüğünü olabildiğince somut yaz."
            style={{ minHeight: 160 }}
          />

          <Button
            label="Gönder"
            onPress={() => void submit()}
            disabled={!reason}
            loading={busy}
          />
        </View>
      )}
    </Screen>
  );
}
