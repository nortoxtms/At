import { useRouter } from 'expo-router';
import { View } from 'react-native';

import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { Txt } from '@/components/Text';
import { Wordmark } from '@/components/Wordmark';
import { BackButton, Card } from '@/components/ui';
import { theme } from '@/theme/tokens';

/**
 * About — §1.3's principles, in the words a user would use.
 *
 * Worth a screen because the product's shape is unusual: people arrive
 * expecting a classifieds app and find a registry that happens to have a
 * marketplace on it. Saying why, once, is cheaper than being misunderstood
 * every time someone wonders where the "sell" button is.
 */
const PRINCIPLES: { title: string; body: string }[] = [
  {
    title: 'Kayıt önce gelir',
    body: 'Her at bir kimliktir. İlan, o kimliğin bir görünümüdür — tersi değil. Bu yüzden ilan vermeden önce atı kaydediyorsun.',
  },
  {
    title: 'Geçmiş atla kalır',
    body: 'Sağlık, yarışma ve sahiplik kayıtları silinmez; eklenir. At el değiştirdiğinde geçmişi de devreder.',
  },
  {
    title: 'Kim olduğun belli',
    body: 'İlan yayınlamak kimlik doğrulaması ister. Bu satın alınamaz — ücretsiz hesapta da, en pahalı planda da aynı koşul.',
  },
  {
    title: 'Refah pazarlık konusu değil',
    body: 'Refah bildirimleri sıraya girmez, önceliklendirilir.',
  },
];

export default function AboutScreen() {
  const router = useRouter();

  return (
    <Screen scroll>
      <View style={{ paddingTop: theme.space.sm }}>
        <BackButton onPress={() => router.back()} />
      </View>

      <View style={{ alignItems: 'center', paddingVertical: theme.space.xxl, gap: theme.space.md }}>
        <Wordmark size="medium" />
        <Txt variant="label" uppercase color={theme.color.goldMuted} display={false}>
          CONNECT. TRAIN. TRUST.
        </Txt>
      </View>

      <View style={{ gap: theme.space.md }}>
        {PRINCIPLES.map((principle) => (
          <Card key={principle.title} style={{ gap: theme.space.sm }}>
            <Txt variant="h3">{principle.title}</Txt>
            <Txt variant="small" color={theme.color.textSecondary} display={false}>
              {principle.body}
            </Txt>
          </Card>
        ))}
      </View>

      <Button
        label="Geri dön"
        variant="secondary"
        style={{ marginTop: theme.space.xl, marginBottom: theme.space.xxl }}
        onPress={() => router.back()}
      />
    </Screen>
  );
}
