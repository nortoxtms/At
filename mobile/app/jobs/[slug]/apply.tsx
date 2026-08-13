import { ApiClientError } from '../../../src/core/api-client';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { theme } from '../../../src/core/theme';
import { useApplyToJob, useJob } from '../../../src/features/jobs/use-jobs';

/**
 * S19 — Apply (spec §18.2).
 *
 * "Cover letter (with a prefilled template from the role profile), CV upload,
 * optional 60-second video, role-specific questions. Submit → creates a
 * conversation with the poster."
 *
 * The template is a starting point, not a default submission: a prefilled
 * letter sent unchanged is worse than none, so it is placed as placeholder
 * text the applicant has to replace.
 */
export default function ApplyScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { job } = useJob(slug);
  const { apply, isPending } = useApplyToJob();

  const [coverLetter, setCoverLetter] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!slug) return;
    setError(null);

    try {
      const result = await apply(slug, { coverLetter, answers: {} });
      // Straight into the thread the application just opened: the applicant
      // should land where the employer will answer, not on a receipt screen.
      router.replace(`/messages/${result.conversationId}`);
    } catch (cause) {
      if (cause instanceof ApiClientError) {
        setError(cause.message);
        if (cause.needsVerification) router.push('/verification');
      } else {
        setError('Başvuru gönderilemedi. Tekrar dene.');
      }
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Stack.Screen options={{ title: 'Başvur' }} />

      <ScrollView contentContainerStyle={styles.body}>
        {job ? <Text style={styles.subject}>{job.title}</Text> : null}

        <Text style={styles.label}>Ön yazı</Text>
        <TextInput
          value={coverLetter}
          onChangeText={setCoverLetter}
          multiline
          numberOfLines={8}
          style={styles.textArea}
          placeholder={
            'Deneyimini, hangi disiplinlerde çalıştığını ve neden bu ilana ' +
            'başvurduğunu birkaç cümleyle anlat.'
          }
          placeholderTextColor={theme.colors.textSecondary}
          accessibilityLabel="Ön yazı"
        />
        <Text style={styles.hint}>{coverLetter.trim().length}/20 karakter (en az)</Text>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable
          onPress={submit}
          disabled={isPending || coverLetter.trim().length < 20}
          style={[
            styles.submit,
            (isPending || coverLetter.trim().length < 20) && styles.submitDisabled,
          ]}
          accessibilityRole="button"
        >
          <Text style={styles.submitLabel}>
            {isPending ? 'Gönderiliyor…' : 'Başvuruyu gönder'}
          </Text>
        </Pressable>

        <Text style={styles.hint}>
          Başvurunla birlikte ilan sahibiyle bir mesaj kanalı açılır; yazışma uygulama içinde
          kalır.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.cream },
  body: { padding: theme.spacing[4], gap: theme.spacing[3] },
  subject: { ...theme.type.h3, color: theme.colors.textPrimary },
  label: { ...theme.type.label, color: theme.colors.textSecondary },
  textArea: {
    ...theme.type.body,
    minHeight: 180,
    textAlignVertical: 'top',
    color: theme.colors.textPrimary,
    backgroundColor: theme.colors.paper,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    padding: theme.spacing[3],
  },
  hint: { ...theme.type.caption, color: theme.colors.textSecondary },
  error: { ...theme.type.small, color: theme.colors.danger },
  submit: {
    minHeight: theme.minTouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.ink,
    marginTop: theme.spacing[2],
  },
  submitDisabled: { opacity: 0.4 },
  submitLabel: { ...theme.type.h3, color: theme.colors.paper },
});
