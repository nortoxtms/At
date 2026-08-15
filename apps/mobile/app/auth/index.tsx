import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, View } from 'react-native';

import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { Txt } from '@/components/Text';
import { Wordmark } from '@/components/Wordmark';
import { BackButton, Field } from '@/components/ui';
import { api } from '@/lib/api';
import type { AuthResponse } from '@/lib/endpoints';
import { useSession } from '@/lib/session';
import { theme } from '@/theme/tokens';

/**
 * S03 — Sign in and sign up, on one screen.
 *
 * Two screens for this is two screens of the same four fields, and the usual
 * result is a person who cannot remember which one they have and bounces
 * between them. One screen, one toggle.
 *
 * §18.0's fourth resolved deviation: Apple and Google only. The mockup shows a
 * third provider; §17 does not permit an identity provider we cannot verify
 * against a legal identity, and adding one for symmetry is adding a login path
 * that cannot reach `identity_verified`.
 */
type Mode = 'signIn' | 'signUp';

export default function AuthScreen() {
  const router = useRouter();
  const { signIn } = useSession();

  const [mode, setMode] = useState<Mode>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    setBusy(true);

    const path = mode === 'signIn' ? '/auth/login' : '/auth/register';
    const body =
      mode === 'signIn' ? { email, password } : { email, password, displayName };

    // §12 answers with `{ profile, tokens }`. Reading the tokens off the top
    // level yields undefined, which stores an empty session and then signs the
    // person straight back out on the next screen.
    const result = await api<AuthResponse>(path, {
      method: 'POST',
      body: JSON.stringify(body),
      auth: false,
    });

    setBusy(false);

    if (!result.ok) {
      setError(result.error.message);
      return;
    }

    await signIn(result.data.tokens);
    // A new account has no role yet, and §3.1's permissions hang off it.
    router.replace(mode === 'signUp' ? '/auth/rol' : '/(tabs)');
  };

  const valid =
    email.includes('@') && password.length >= 8 && (mode === 'signIn' || displayName.trim().length >= 2);

  return (
    <Screen scroll>
      <View style={{ paddingTop: theme.space.sm }}>
        <BackButton onPress={() => router.back()} />
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={{ alignItems: 'center', paddingVertical: theme.space.xxl }}>
          <Wordmark size="medium" />
        </View>

        <View style={{ flexDirection: 'row', gap: theme.space.sm, marginBottom: theme.space.xl }}>
          {(['signIn', 'signUp'] as Mode[]).map((option) => (
            <Pressable
              key={option}
              accessibilityRole="tab"
              accessibilityState={{ selected: mode === option }}
              onPress={() => {
                setMode(option);
                setError(null);
              }}
              style={{
                flex: 1,
                minHeight: theme.metric.minTouchTarget,
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: theme.radius.md,
                backgroundColor:
                  mode === option ? theme.color.surfaceRaised : 'transparent',
                borderWidth: 1,
                borderColor: mode === option ? theme.color.goldMuted : theme.color.border,
              }}
            >
              <Txt
                variant="body"
                display={false}
                color={mode === option ? theme.color.textPrimary : theme.color.textSecondary}
              >
                {option === 'signIn' ? 'Giriş yap' : 'Kaydol'}
              </Txt>
            </Pressable>
          ))}
        </View>

        <View style={{ gap: theme.space.lg }}>
          {mode === 'signUp' ? (
            <Field
              label="Ad soyad"
              value={displayName}
              onChangeText={setDisplayName}
              autoCapitalize="words"
              textContentType="name"
              placeholder="Ayşe Yılmaz"
            />
          ) : null}

          <Field
            label="E-posta"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            textContentType="emailAddress"
            placeholder="ornek@eposta.com"
          />

          <Field
            label="Parola"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
            textContentType={mode === 'signIn' ? 'password' : 'newPassword'}
            placeholder="En az 8 karakter"
            hint={mode === 'signUp' ? 'En az 8 karakter olmalı.' : undefined}
            error={error}
          />

          <Button
            label={mode === 'signIn' ? 'Giriş yap' : 'Hesap oluştur'}
            onPress={() => void submit()}
            disabled={!valid}
            loading={busy}
          />

          {mode === 'signIn' ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push('/auth/parola')}
              style={{ alignSelf: 'center', minHeight: theme.metric.minTouchTarget, justifyContent: 'center' }}
            >
              <Txt variant="small" color={theme.color.goldSoft} display={false}>
                Parolamı unuttum
              </Txt>
            </Pressable>
          ) : null}
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space.md, marginVertical: theme.space.xl }}>
          <View style={{ flex: 1, height: 1, backgroundColor: theme.color.border }} />
          <Txt variant="caption" color={theme.color.textSecondary} display={false}>
            veya
          </Txt>
          <View style={{ flex: 1, height: 1, backgroundColor: theme.color.border }} />
        </View>

        <View style={{ gap: theme.space.md }}>
          <SocialButton icon="logo-apple" label="Apple ile devam et" />
          <SocialButton icon="logo-google" label="Google ile devam et" />
        </View>

        <Txt
          variant="caption"
          align="center"
          color={theme.color.textSecondary}
          display={false}
          style={{ marginTop: theme.space.xl, marginBottom: theme.space.xxl }}
        >
          Devam ederek Kullanım Şartları ve Gizlilik Politikası&apos;nı kabul etmiş olursun.
        </Txt>
      </KeyboardAvoidingView>
    </Screen>
  );
}

/**
 * §18.0: Apple and Google, and nothing else.
 *
 * Disabled rather than hidden. The native OAuth flows need a build with the
 * provider credentials configured (§17), which this repository does not carry
 * and must not — so the buttons say plainly that they are not wired yet
 * instead of failing on tap or pretending the option does not exist.
 */
function SocialButton({
  icon,
  label,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
}) {
  return (
    <View
      accessibilityRole="button"
      accessibilityState={{ disabled: true }}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: theme.space.md,
        minHeight: theme.metric.minTouchTarget + 8,
        borderRadius: theme.radius.md,
        borderWidth: 1,
        borderColor: theme.color.border,
        backgroundColor: theme.color.surface,
      }}
    >
      <Ionicons name={icon} size={18} color={theme.color.textSecondary} />
      <Txt variant="body" display={false} color={theme.color.textSecondary}>
        {label}
      </Txt>
    </View>
  );
}
