import { useRouter } from 'expo-router';
import { View } from 'react-native';

import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { Txt } from '@/components/Text';
import { BackButton, Card } from '@/components/ui';
import { theme } from '@/theme/tokens';

/**
 * Password reset.
 *
 * There is no reset endpoint. §12 has `/auth/register`, `/auth/login`,
 * `/auth/refresh` and `/auth/logout` and nothing else, and a reset needs a
 * mail sender this build does not have credentials for — the same class of
 * missing dependency as the OAuth providers and the payment processor.
 *
 * So this says so, rather than POSTing into a 404 and showing "gönderildi".
 * A confirmation for a mail nobody sent is worse than no feature: someone
 * locked out waits for it instead of asking for help.
 */
export default function ForgotPassword() {
  const router = useRouter();

  return (
    <Screen scroll>
      <View style={{ paddingTop: theme.space.sm }}>
        <BackButton onPress={() => router.back()} label="Giriş" />
      </View>

      <View style={{ paddingTop: theme.space.xxl, gap: theme.space.sm }}>
        <Txt variant="display">Parolanı sıfırla</Txt>
        <Txt variant="body" color={theme.color.textSecondary} display={false}>
          Parola sıfırlama bu sürümde açık değil.
        </Txt>
      </View>

      <Card style={{ marginTop: theme.space.xl, gap: theme.space.md }}>
        <Txt variant="h3">Henüz bağlı değil</Txt>
        <Txt variant="small" color={theme.color.textSecondary} display={false}>
          Sıfırlama bağlantısı e-posta ile gönderilir ve bu yapıda e-posta
          sağlayıcısı tanımlı değil (§17). Bağlandığında bu ekrandan
          yapabileceksin.
        </Txt>
        <Txt variant="small" color={theme.color.textSecondary} display={false}>
          Şimdilik hesabına erişemiyorsan destek ile iletişime geç.
        </Txt>
        <Button label="Girişe dön" onPress={() => router.replace('/auth')} />
      </Card>

    </Screen>
  );
}
