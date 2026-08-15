import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { View } from 'react-native';

import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { Txt } from '@/components/Text';
import { BackButton, Card } from '@/components/ui';
import { theme } from '@/theme/tokens';

/**
 * S28 — plans (§2).
 *
 * Checkout is not in this build and the screen says so rather than opening a
 * payment sheet that cannot take a payment. What it does do is state the one
 * thing §3.3 makes non-negotiable: no plan buys verification. That sentence
 * belongs on the pricing screen more than anywhere else, because this is where
 * someone blocked from publishing goes looking for a way around it.
 */
const PLANS: {
  name: string;
  price: string;
  body: string;
  features: string[];
  highlight?: boolean;
}[] = [
  {
    name: 'Ücretsiz',
    price: '₺0',
    body: 'Kayıt ve tek ilan',
    features: [
      '3 ata kadar kayıt',
      '1 aktif ilan',
      'Sağlık kaydı ve hatırlatmalar',
      'Mesajlaşma',
    ],
  },
  {
    name: 'Plus',
    price: '₺249 / ay',
    body: 'Düzenli satış yapanlar için',
    highlight: true,
    features: [
      '15 ata kadar kayıt',
      '10 aktif ilan',
      'Ayda 1 öne çıkarma',
      'İlan istatistikleri',
      'Video yükleme',
    ],
  },
  {
    name: 'Business',
    price: '₺899 / ay',
    body: 'Hara, kulüp ve tesisler',
    features: [
      'Sınırsız kayıt ve ilan',
      'Ekip hesapları',
      'İşletme profili',
      'Öncelikli destek',
      'Toplu içe aktarma',
    ],
  },
];

export default function PlansScreen() {
  const router = useRouter();

  return (
    <Screen scroll>
      <View style={{ paddingTop: theme.space.sm }}>
        <BackButton onPress={() => router.back()} />
      </View>

      <View style={{ paddingTop: theme.space.xl, gap: theme.space.sm }}>
        <Txt variant="display">Planlar</Txt>
        <Txt variant="body" color={theme.color.textSecondary} display={false}>
          Kayıt tutmak her zaman ücretsizdir. Planlar ne kadar ilan verebileceğini
          ve görünürlüğü belirler.
        </Txt>
      </View>

      <View style={{ gap: theme.space.lg, marginTop: theme.space.xl }}>
        {PLANS.map((plan) => (
          <Card
            key={plan.name}
            style={{
              gap: theme.space.md,
              borderColor: plan.highlight ? theme.color.goldSoft : theme.color.border,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
              <Txt variant="h2">{plan.name}</Txt>
              <Txt variant="h3" display weight="semibold" color={theme.color.goldSoft}>
                {plan.price}
              </Txt>
            </View>

            <Txt variant="small" color={theme.color.textSecondary} display={false}>
              {plan.body}
            </Txt>

            <View style={{ gap: theme.space.sm }}>
              {plan.features.map((feature) => (
                <View key={feature} style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space.sm }}>
                  <Ionicons name="checkmark" size={15} color={theme.color.goldSoft} />
                  <Txt variant="small" display={false} style={{ flex: 1 }}>
                    {feature}
                  </Txt>
                </View>
              ))}
            </View>
          </Card>
        ))}
      </View>

      <Card style={{ marginTop: theme.space.xl, gap: theme.space.sm }}>
        <Txt variant="h3">Doğrulama satılık değil</Txt>
        <Txt variant="small" color={theme.color.textSecondary} display={false}>
          §3.3 — hiçbir plan kimlik doğrulaması kazandırmaz. İlan yayınlamak için
          doğrulama gerekir ve bu koşul her planda aynıdır.
        </Txt>
      </Card>

      <Card style={{ marginTop: theme.space.md, gap: theme.space.sm }}>
        <Txt variant="h3">Ödeme bu sürümde kapalı</Txt>
        <Txt variant="small" color={theme.color.textSecondary} display={false}>
          Ödeme sağlayıcısı bağlanmadı. Plan yükseltme açıldığında buradan
          yapılabilecek.
        </Txt>
      </Card>

      <Button
        label="Geri dön"
        variant="secondary"
        style={{ marginTop: theme.space.xl, marginBottom: theme.space.xxl }}
        onPress={() => router.back()}
      />
    </Screen>
  );
}
