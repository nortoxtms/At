import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { Txt } from '@/components/Text';
import { BackButton, Field } from '@/components/ui';
import { api } from '@/lib/api';
import { theme } from '@/theme/tokens';

/**
 * Password reset request.
 *
 * The confirmation is identical whether or not the address exists. §17 treats
 * "is this person registered" as information, and a reset form that answers it
 * is an account enumeration oracle.
 */
export default function ForgotPassword() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    await api('/auth/password/forgot', {
      method: 'POST',
      body: JSON.stringify({ email }),
      auth: false,
    });
    setBusy(false);
    setSent(true);
  };

  return (
    <Screen scroll>
      <View style={{ paddingTop: theme.space.sm }}>
        <BackButton onPress={() => router.back()} label="Giriş" />
      </View>

      <View style={{ paddingTop: theme.space.xxl, gap: theme.space.sm }}>
        <Txt variant="display">Parolanı sıfırla</Txt>
        <Txt variant="body" color={theme.color.textSecondary} display={false}>
          E-posta adresini yaz, sıfırlama bağlantısı gönderelim.
        </Txt>
      </View>

      {sent ? (
        <View
          style={{
            marginTop: theme.space.xl,
            padding: theme.space.lg,
            borderRadius: theme.radius.md,
            backgroundColor: theme.color.surface,
            borderWidth: 1,
            borderColor: theme.color.border,
            gap: theme.space.sm,
          }}
        >
          <Txt variant="h3">Gönderildi</Txt>
          <Txt variant="small" color={theme.color.textSecondary} display={false}>
            Bu adrese kayıtlı bir hesap varsa sıfırlama bağlantısı gönderildi.
            Gelen kutunu kontrol et.
          </Txt>
          <Button
            label="Girişe dön"
            variant="secondary"
            style={{ marginTop: theme.space.sm }}
            onPress={() => router.replace('/auth')}
          />
        </View>
      ) : (
        <View style={{ gap: theme.space.lg, marginTop: theme.space.xl }}>
          <Field
            label="E-posta"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
            placeholder="ornek@eposta.com"
          />
          <Button
            label="Bağlantı gönder"
            onPress={() => void submit()}
            disabled={!email.includes('@')}
            loading={busy}
          />
        </View>
      )}
    </Screen>
  );
}
