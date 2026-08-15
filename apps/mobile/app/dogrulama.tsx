import { Ionicons } from '@expo/vector-icons';
import { VERIFICATION_LABEL_TR } from '@only-horses/shared-types';
import { useRouter } from 'expo-router';
import { View } from 'react-native';

import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { Txt } from '@/components/Text';
import { BackButton, Card } from '@/components/ui';
import { useSession } from '@/lib/session';
import { theme } from '@/theme/tokens';

/**
 * S27 — verification (§3.3).
 *
 * The ladder is shown whole, with your current rung marked, because the rule
 * people get wrong is that a paid plan buys a level. It does not, and saying
 * so once here saves the support conversation that otherwise happens after
 * someone upgrades in order to publish.
 *
 * The provider is not wired: §17 needs a KYC provider with credentials this
 * repository must not carry. The screen says that instead of opening a flow
 * that dead-ends.
 */
const LADDER: { id: string; body: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { id: 'email_verified', body: 'E-postanı doğrula — kaydolurken yapılır.', icon: 'mail-outline' },
  {
    id: 'identity_verified',
    body: 'Kimliğini doğrula — ilan yayınlamak için gerekli olan seviye.',
    icon: 'card-outline',
  },
  {
    id: 'professional_verified',
    body: 'Meslek belgesi — veteriner, nalbant, eğitmen için.',
    icon: 'ribbon-outline',
  },
  {
    id: 'business_verified',
    body: 'İşletme kaydı — ahır, kulüp ve hara hesapları için.',
    icon: 'business-outline',
  },
];

const ORDER = ['none', 'email_verified', 'identity_verified', 'professional_verified', 'business_verified'];

export default function VerificationScreen() {
  const router = useRouter();
  const { me } = useSession();

  const current = ORDER.indexOf(me?.verificationLevel ?? 'none');

  return (
    <Screen scroll>
      <View style={{ paddingTop: theme.space.sm }}>
        <BackButton onPress={() => router.back()} />
      </View>

      <View style={{ paddingTop: theme.space.xl, gap: theme.space.sm }}>
        <Txt variant="display">Doğrulama</Txt>
        <Txt variant="body" color={theme.color.textSecondary} display={false}>
          Şu anki seviyen:{' '}
          {VERIFICATION_LABEL_TR[me?.verificationLevel ?? 'none'] ?? 'Doğrulanmamış'}
        </Txt>
      </View>

      <View style={{ gap: theme.space.md, marginTop: theme.space.xl }}>
        {LADDER.map((rung) => {
          const index = ORDER.indexOf(rung.id);
          const done = current >= index;

          return (
            <Card
              key={rung.id}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: theme.space.md,
                borderColor: done ? theme.color.goldMuted : theme.color.border,
              }}
            >
              <Ionicons
                name={done ? 'checkmark-circle' : rung.icon}
                size={22}
                color={done ? theme.color.goldSoft : theme.color.textSecondary}
              />
              <View style={{ flex: 1, gap: 2 }}>
                <Txt variant="h3">{VERIFICATION_LABEL_TR[rung.id] ?? rung.id}</Txt>
                <Txt variant="small" color={theme.color.textSecondary} display={false}>
                  {rung.body}
                </Txt>
              </View>
            </Card>
          );
        })}
      </View>

      <Card style={{ marginTop: theme.space.xl, gap: theme.space.sm }}>
        <Txt variant="h3">Satın alınamaz</Txt>
        <Txt variant="small" color={theme.color.textSecondary} display={false}>
          §3.3 — hiçbir plan doğrulama seviyesi kazandırmaz. Ücretsiz hesapta da,
          Business planda da kimlik doğrulaması aynı şekilde yapılır.
        </Txt>
      </Card>

      <Card style={{ marginTop: theme.space.md, gap: theme.space.sm }}>
        <Txt variant="h3">Henüz açık değil</Txt>
        <Txt variant="small" color={theme.color.textSecondary} display={false}>
          Kimlik doğrulama sağlayıcısı bu sürümde bağlı değil (§17). Bağlandığında
          bu ekrandan başlatabileceksin.
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
