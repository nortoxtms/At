import type { JobType } from '@only-horses/shared-types';
import { Link, Stack } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { theme } from '../../src/core/theme';
import { useJobSearch } from '../../src/features/jobs/use-jobs';

/**
 * S17 — Jobs hub (spec §18.2).
 *
 * "Filter bar: konum, iş türü, konaklama, deneyim, maaş. Card: title, org name
 * + logo, city/country flag, job type chip, salary (or 'Maaş görüşülür'),
 * 'Konaklama dahil' chip, posted-ago."
 */
const JOB_TYPES: { value: JobType; label: string }[] = [
  { value: 'full_time', label: 'Tam zamanlı' },
  { value: 'part_time', label: 'Yarı zamanlı' },
  { value: 'seasonal', label: 'Sezonluk' },
  { value: 'working_student', label: 'Çalışan öğrenci' },
];

export default function JobsScreen() {
  const [jobType, setJobType] = useState<JobType | null>(null);
  const [withAccommodation, setWithAccommodation] = useState(false);

  const { hits, total, isPending } = useJobSearch({
    jobTypes: jobType ? [jobType] : undefined,
    accommodation: withAccommodation ? ['shared', 'private'] : undefined,
    sort: 'recommended',
    page: 1,
    limit: 20,
  });

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: 'İşler' }} />

      <View style={styles.filters}>
        {JOB_TYPES.map((option) => (
          <Chip
            key={option.value}
            label={option.label}
            active={jobType === option.value}
            onPress={() => setJobType(jobType === option.value ? null : option.value)}
          />
        ))}
        <Chip
          label="Konaklama dahil"
          active={withAccommodation}
          onPress={() => setWithAccommodation(!withAccommodation)}
        />
      </View>

      <FlatList
        data={hits}
        keyExtractor={(job) => job.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <Text style={styles.count}>{isPending ? 'Aranıyor…' : `${total} açık pozisyon`}</Text>
        }
        ListEmptyComponent={
          isPending ? null : (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>Bu filtrelerle ilan yok</Text>
              <Text style={styles.emptyBody}>
                Filtreleri kaldır ya da yakındaki şehirlere de bak.
              </Text>
            </View>
          )
        }
        renderItem={({ item }) => (
          <Link href={`/jobs/${item.slug}`} asChild>
            <Pressable style={styles.card}>
              <Text style={styles.cardTitle}>{item.title}</Text>
              <Text style={styles.cardMeta}>
                {item.organizationName ?? item.posterName ?? 'Bireysel ilan'}
                {item.city ? ` · ${item.city}` : ''}
              </Text>

              <View style={styles.chipRow}>
                <Text style={styles.chip}>
                  {JOB_TYPES.find((option) => option.value === item.jobType)?.label ?? item.jobType}
                </Text>
                <Text style={styles.chip}>{formatSalary(item)}</Text>
                {item.accommodation && item.accommodation !== 'none' ? (
                  <Text style={styles.chip}>Konaklama dahil</Text>
                ) : null}
                {item.visaSupport ? <Text style={styles.chip}>Vize desteği</Text> : null}
              </View>
            </Pressable>
          </Link>
        )}
      />
    </View>
  );
}

function Chip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      style={[styles.filterChip, active && styles.filterChipActive]}
    >
      <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>{label}</Text>
    </Pressable>
  );
}

/** §18.2 S17: a job with no published salary reads "Maaş görüşülür". */
function formatSalary(job: {
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string | null;
  salaryPeriod: string | null;
}): string {
  if (job.salaryMin === null && job.salaryMax === null) return 'Maaş görüşülür';

  const amount = job.salaryMin ?? job.salaryMax!;
  const period = { hour: 'saat', day: 'gün', week: 'hafta', month: 'ay', year: 'yıl' }[
    job.salaryPeriod ?? 'month'
  ];

  return `${amount.toLocaleString('tr-TR')} ${job.salaryCurrency ?? ''}/${period}`;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.cream },
  filters: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing[2],
    paddingHorizontal: theme.spacing[4],
    paddingTop: theme.spacing[3],
  },
  filterChip: {
    minHeight: theme.minTouchTarget,
    justifyContent: 'center',
    paddingHorizontal: theme.spacing[4],
    borderRadius: theme.radius.full,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  filterChipActive: { backgroundColor: theme.colors.ink, borderColor: theme.colors.ink },
  filterChipText: { ...theme.type.small, color: theme.colors.textPrimary },
  filterChipTextActive: { color: theme.colors.paper },
  list: { padding: theme.spacing[4], gap: theme.spacing[3] },
  count: { ...theme.type.small, color: theme.colors.textSecondary, marginBottom: theme.spacing[2] },
  card: {
    backgroundColor: theme.colors.paper,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing[4],
    gap: theme.spacing[2],
  },
  cardTitle: { ...theme.type.h3, color: theme.colors.textPrimary },
  cardMeta: { ...theme.type.small, color: theme.colors.textSecondary },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing[2] },
  chip: {
    ...theme.type.caption,
    color: theme.colors.textSecondary,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.full,
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[1],
  },
  empty: { alignItems: 'center', padding: theme.spacing[8] },
  emptyTitle: { ...theme.type.h3, color: theme.colors.textPrimary },
  emptyBody: {
    ...theme.type.small,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing[2],
    textAlign: 'center',
  },
});
