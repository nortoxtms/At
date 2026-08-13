import { Link, Stack, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { theme } from '../../../src/core/theme';
import { useJob } from '../../../src/features/jobs/use-jobs';

/**
 * S18 — Job detail (spec §18.2).
 *
 * "Full description, requirements, org card, similar jobs, sticky Başvur."
 *
 * The §26 employment-terms notice sits directly above the apply button rather
 * than in a footer: it is the last thing read before applying, which is the
 * only place a disclaimer does any work.
 */
export default function JobDetailScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { job, isPending } = useJob(slug);

  if (isPending) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={theme.colors.brass} />
      </View>
    );
  }

  if (!job) {
    return (
      <View style={styles.centered}>
        <Text style={styles.title}>İlan bulunamadı</Text>
        <Text style={styles.meta}>İlan kapanmış ya da kaldırılmış olabilir.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: job.title }} />

      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.title}>{job.title}</Text>
        <Text style={styles.meta}>
          {job.organization_name ?? job.poster_name}
          {job.city ? ` · ${job.city}` : ''}
        </Text>

        <View style={styles.chipRow}>
          <Text style={styles.chip}>{job.job_type}</Text>
          {job.accommodation && job.accommodation !== 'none' ? (
            <Text style={styles.chip}>Konaklama dahil</Text>
          ) : null}
          {job.meals_included ? <Text style={styles.chip}>Yemek dahil</Text> : null}
          {job.visa_support ? <Text style={styles.chip}>Vize desteği</Text> : null}
        </View>

        <Text style={styles.section}>İlan detayı</Text>
        <Text style={styles.paragraph}>{job.description}</Text>

        {job.responsibilities ? (
          <>
            <Text style={styles.section}>Sorumluluklar</Text>
            <Text style={styles.paragraph}>{job.responsibilities}</Text>
          </>
        ) : null}

        {job.requirements ? (
          <>
            <Text style={styles.section}>Aranan nitelikler</Text>
            <Text style={styles.paragraph}>{job.requirements}</Text>
          </>
        ) : null}

        <View style={styles.notice}>
          <Text style={styles.noticeText}>{job.notice.tr}</Text>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <Text style={styles.applicationCount}>{job.application_count} başvuru</Text>
        <Link href={`/jobs/${job.slug}/apply`} asChild>
          <Pressable style={styles.applyButton} accessibilityRole="button">
            <Text style={styles.applyLabel}>Başvur</Text>
          </Pressable>
        </Link>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.cream },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.cream,
    padding: theme.spacing[6],
  },
  body: { padding: theme.spacing[4], paddingBottom: theme.spacing[12], gap: theme.spacing[2] },
  title: { ...theme.type.h1, color: theme.colors.textPrimary },
  meta: { ...theme.type.small, color: theme.colors.textSecondary },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing[2],
    marginTop: theme.spacing[2],
  },
  chip: {
    ...theme.type.caption,
    color: theme.colors.textSecondary,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.full,
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[1],
  },
  section: { ...theme.type.h3, color: theme.colors.textPrimary, marginTop: theme.spacing[6] },
  paragraph: { ...theme.type.body, color: theme.colors.textPrimary },
  notice: {
    marginTop: theme.spacing[6],
    padding: theme.spacing[4],
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.sand,
  },
  noticeText: { ...theme.type.small, color: theme.colors.textSecondary },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: theme.spacing[4],
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    backgroundColor: theme.colors.paper,
  },
  applicationCount: { ...theme.type.small, color: theme.colors.textSecondary },
  applyButton: {
    minHeight: theme.minTouchTarget,
    justifyContent: 'center',
    paddingHorizontal: theme.spacing[6],
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.ink,
  },
  applyLabel: { ...theme.type.h3, color: theme.colors.paper },
});
