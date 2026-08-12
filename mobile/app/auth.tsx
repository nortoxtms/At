import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { ApiClientError } from '../src/core/api-client';
import { useAuth } from '../src/features/auth/use-auth';
import { theme } from '../src/core/theme';

type Mode = 'register' | 'login';

/**
 * S03 — Auth (spec §18.2).
 *
 * "Segmented: Kayıt ol / Giriş yap. […] Errors inline, never as toast."
 * The API returns a VALIDATION_ERROR with a `details` array of
 * `{ field, message }` (§12), which maps straight onto per-field errors, so a
 * user fixing a form sees every problem at once instead of one per attempt.
 *
 * Apple and Google sign-in sit above the divider per the spec; they arrive
 * with the Firebase client SDK in M1.
 */
export default function AuthScreen() {
  const router = useRouter();
  const { register, login, isPending } = useAuth();

  const [mode, setMode] = useState<Mode>('register');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  async function submit() {
    setFieldErrors({});
    setFormError(null);

    try {
      if (mode === 'register') {
        await register({ email, password, displayName, locale: 'tr' });
      } else {
        await login({ email, password });
      }
      router.replace('/');
    } catch (error) {
      if (error instanceof ApiClientError) {
        if (error.code === 'VALIDATION_ERROR' && Array.isArray(error.details)) {
          const mapped: Record<string, string> = {};
          for (const issue of error.details as { field: string; message: string }[]) {
            mapped[issue.field] = issue.message;
          }
          setFieldErrors(mapped);
          return;
        }
        setFormError(error.message);
        return;
      }
      setFormError('Bağlantı kurulamadı. İnternetini kontrol edip tekrar dene.');
    }
  }

  // §18.2 S03: minimum 8 characters, with a strength meter.
  const passwordStrength = scorePassword(password);

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.segment}>
          {(['register', 'login'] as const).map((option) => (
            <Pressable
              key={option}
              onPress={() => setMode(option)}
              accessibilityRole="tab"
              accessibilityState={{ selected: mode === option }}
              style={[styles.segmentItem, mode === option && styles.segmentItemActive]}
            >
              <Text style={[styles.segmentLabel, mode === option && styles.segmentLabelActive]}>
                {option === 'register' ? 'Kayıt ol' : 'Giriş yap'}
              </Text>
            </Pressable>
          ))}
        </View>

        {mode === 'register' ? (
          <Field
            label="Adın"
            value={displayName}
            onChangeText={setDisplayName}
            autoCapitalize="words"
            textContentType="name"
            error={fieldErrors.displayName}
          />
        ) : null}

        <Field
          label="E-posta"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          textContentType="emailAddress"
          error={fieldErrors.email}
        />

        <Field
          label="Şifre"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          textContentType={mode === 'register' ? 'newPassword' : 'password'}
          error={fieldErrors.password}
        />

        {mode === 'register' && password.length > 0 ? (
          <View style={styles.strengthRow} accessibilityRole="progressbar">
            {[0, 1, 2, 3].map((index) => (
              <View
                key={index}
                style={[
                  styles.strengthBar,
                  index < passwordStrength.score && { backgroundColor: passwordStrength.color },
                ]}
              />
            ))}
            <Text style={styles.strengthLabel}>{passwordStrength.label}</Text>
          </View>
        ) : null}

        {formError ? <Text style={styles.formError}>{formError}</Text> : null}

        <Pressable
          onPress={submit}
          disabled={isPending}
          accessibilityRole="button"
          style={[styles.primaryButton, isPending && styles.primaryButtonDisabled]}
        >
          {isPending ? (
            <ActivityIndicator color={theme.colors.ink} />
          ) : (
            <Text style={styles.primaryButtonLabel}>
              {mode === 'register' ? 'Hesap oluştur' : 'Giriş yap'}
            </Text>
          )}
        </Pressable>

        <Text style={styles.legal}>
          Devam ederek Kullanım Koşulları ve Gizlilik Politikası&apos;nı kabul etmiş olursun.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Field({
  label,
  error,
  ...input
}: React.ComponentProps<typeof TextInput> & { label: string; error?: string }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        {...input}
        accessibilityLabel={label}
        style={[styles.input, error ? styles.inputError : null]}
        placeholderTextColor={theme.colors.textMuted}
      />
      {error ? <Text style={styles.fieldError}>{error}</Text> : null}
    </View>
  );
}

function scorePassword(password: string): { score: number; label: string; color: string } {
  let score = 0;
  if (password.length >= 8) score += 1;
  if (password.length >= 12) score += 1;
  if (/[^a-zA-Z]/.test(password)) score += 1;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score += 1;

  if (score <= 1) return { score, label: 'Zayıf', color: theme.colors.danger };
  if (score === 2) return { score, label: 'Orta', color: theme.colors.warning };
  if (score === 3) return { score, label: 'İyi', color: theme.colors.brass };
  return { score, label: 'Güçlü', color: theme.colors.success };
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: theme.colors.cream },
  container: { padding: theme.spacing[6], gap: theme.spacing[4] },

  segment: {
    flexDirection: 'row',
    backgroundColor: theme.colors.sand,
    borderRadius: theme.radius.md,
    padding: theme.spacing[1],
    marginBottom: theme.spacing[2],
  },
  segmentItem: {
    flex: 1,
    minHeight: theme.minTouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.radius.sm,
  },
  segmentItemActive: { backgroundColor: theme.colors.paper },
  segmentLabel: { ...theme.type.small, color: theme.colors.textSecondary },
  segmentLabelActive: { color: theme.colors.textPrimary, fontFamily: 'Inter-SemiBold' },

  field: { gap: theme.spacing[1] },
  fieldLabel: { ...theme.type.label, color: theme.colors.textMuted },
  input: {
    minHeight: theme.minTouchTarget,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.paper,
    paddingHorizontal: theme.spacing[3],
    ...theme.type.body,
    color: theme.colors.textPrimary,
  },
  inputError: { borderColor: theme.colors.danger },
  fieldError: { ...theme.type.caption, color: theme.colors.danger },

  strengthRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing[1] },
  strengthBar: {
    flex: 1,
    height: 3,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.border,
  },
  strengthLabel: { ...theme.type.caption, color: theme.colors.textSecondary, marginLeft: 4 },

  formError: { ...theme.type.small, color: theme.colors.danger },

  primaryButton: {
    minHeight: theme.minTouchTarget,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.brass,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: theme.spacing[2],
  },
  primaryButtonDisabled: { opacity: 0.6 },
  primaryButtonLabel: { ...theme.type.body, color: theme.colors.ink, fontFamily: 'Inter-SemiBold' },

  legal: { ...theme.type.caption, color: theme.colors.textMuted, textAlign: 'center' },
});
