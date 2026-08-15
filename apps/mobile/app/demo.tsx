import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { Txt } from '@/components/Text';
import { BackButton, Card } from '@/components/ui';
import { resetDemo } from '@/lib/demo';
import { useSession } from '@/lib/session';
import { theme } from '@/theme/tokens';

/**
 * What the demo is, and what it is not.
 *
 * The second list is the important one. Everything on the phone works, which
 * makes it easy to assume everything works — and the parts that are missing
 * are exactly the parts a marketplace is judged on: whether anyone else can
 * see your listing, whether search ranks it, whether a stranger is who they
 * say they are. Saying so here is cheaper than being misunderstood later.
 */
const WORKS = [
  'At kaydetme, düzenleme, fotoğraf ekleme',
  'Sağlık kayıtları ve hatırlatmalar',
  'Yarışma sonuçları ve at geçmişi',
  'İlan verme, yayına alma, duraklatma, kapatma',
  'Arama, filtreler, kaydedilen aramalar',
  'Mesajlaşma (karşı taraf otomatik yanıtlar)',
  'Kaydedilenler, bildirimler, iş başvurusu',
  'Sahiplik devri',
];

const DOES_NOT = [
  'Hiçbir veri telefondan çıkmaz — ilanını kimse göremez',
  '§11’in arama sıralaması ve öne çıkarma sunucuda',
  '§18.4’ün güven puanı gerçek işlemlerden hesaplanır',
  'Moderasyon, mükerrer fotoğraf tespiti ve kimlik doğrulama yok',
  'Ödeme ve plan yükseltme kapalı',
];

export default function DemoScreen() {
  const router = useRouter();
  const { demo, stopDemo } = useSession();
  const [busy, setBusy] = useState(false);

  return (
    <Screen scroll>
      <View style={{ paddingTop: theme.space.sm }}>
        <BackButton onPress={() => router.back()} />
      </View>

      <View style={{ paddingTop: theme.space.xl, gap: theme.space.sm }}>
        <Txt variant="display">Demo modu</Txt>
        <Txt variant="body" color={theme.color.textSecondary} display={false}>
          Uygulama kendi kendine cevap veriyor. Sunucu yok, hesap yok, internet
          gerekmiyor — ve yaptığın her şey kalıcı: eklediğin at yarın da burada.
        </Txt>
      </View>

      <Card style={{ marginTop: theme.space.xl, gap: theme.space.sm }}>
        <Txt variant="h3">Çalışan her şey</Txt>
        {WORKS.map((line) => (
          <View key={line} style={{ flexDirection: 'row', gap: theme.space.sm, alignItems: 'center' }}>
            <Ionicons name="checkmark" size={14} color={theme.color.goldSoft} />
            <Txt variant="small" display={false} style={{ flex: 1 }}>
              {line}
            </Txt>
          </View>
        ))}
      </Card>

      <Card style={{ marginTop: theme.space.md, gap: theme.space.sm }}>
        <Txt variant="h3">Demoda olmayanlar</Txt>
        {DOES_NOT.map((line) => (
          <View key={line} style={{ flexDirection: 'row', gap: theme.space.sm, alignItems: 'center' }}>
            <Ionicons name="remove" size={14} color={theme.color.textSecondary} />
            <Txt variant="small" color={theme.color.textSecondary} display={false} style={{ flex: 1 }}>
              {line}
            </Txt>
          </View>
        ))}
      </Card>

      {demo ? (
        <View style={{ gap: theme.space.md, marginTop: theme.space.xl, marginBottom: theme.space.xxl }}>
          <Button
            label="Demoyu sıfırla"
            variant="secondary"
            loading={busy}
            onPress={async () => {
              setBusy(true);
              await resetDemo();
              setBusy(false);
              router.replace('/(tabs)');
            }}
          />
          <Button
            label="Demodan çık"
            variant="ghost"
            onPress={async () => {
              await stopDemo();
              router.replace('/(tabs)');
            }}
          />
        </View>
      ) : null}
    </Screen>
  );
}
