import {
  ACCOMMODATION_LABEL_TR,
  JOB_TYPE_LABEL_TR,
  SALARY_PERIOD_LABEL_TR,
} from '@only-horses/shared-types';
import type { JobSearchHit } from '@only-horses/shared-types';
import { useRouter } from 'expo-router';
import { FlatList, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Badge } from '@/components/ListingCard';
import { Txt } from '@/components/Text';
import { BackButton, Card, DemoNotice, EmptyState, Loading } from '@/components/ui';
import { searchJobs } from '@/lib/catalog';
import { useAsync } from '@/lib/useAsync';
import { theme } from '@/theme/tokens';

/**
 * S17 — the job board (§14).
 *
 * Accommodation and visa support are on the card rather than buried in the
 * detail, because for a groom moving regions they decide whether the job is
 * possible at all. A salary alone does not answer "can I take this".
 */
export default function JobsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const { data, loading } = useAsync(() => searchJobs(), []);
  const jobs = data?.data ?? [];

  return (
    <View style={{ flex: 1, backgroundColor: theme.color.bg, paddingTop: insets.top }}>
      <View
        style={{
          paddingHorizontal: theme.screenPadding,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <BackButton onPress={() => router.back()} />
        <Txt variant="screenTitle" uppercase>
          İş ilanları
        </Txt>
        <View style={{ width: theme.metric.minTouchTarget }} />
      </View>

      {loading ? (
        <Loading />
      ) : (
        <FlatList
          data={jobs}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{
            paddingHorizontal: theme.screenPadding,
            paddingVertical: theme.space.lg,
            gap: theme.space.md,
          }}
          ListHeaderComponent={data?.source === 'demo' ? <DemoNotice /> : null}
          ListEmptyComponent={
            <EmptyState
              icon="briefcase-outline"
              title="Açık ilan yok"
              body="Seyis, eğitmen ve nalbant ilanları burada listelenir."
            />
          }
          renderItem={({ item }) => (
            <Card style={{ gap: 6 }}>
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: theme.space.sm }}>
                <Txt variant="h3" style={{ flex: 1 }} numberOfLines={2}>
                  {item.title}
                </Txt>
                <Badge label={JOB_TYPE_LABEL_TR[item.jobType] ?? item.jobType} />
              </View>

              <Txt variant="small" color={theme.color.textSecondary} display={false}>
                {[item.organizationName ?? item.posterName, item.city, item.region]
                  .filter(Boolean)
                  .join(' · ')}
              </Txt>

              <Txt variant="body" display weight="semibold" color={theme.color.goldSoft}>
                {formatSalary(item)}
              </Txt>

              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.sm, marginTop: 2 }}>
                {item.accommodation ? (
                  <Badge label={ACCOMMODATION_LABEL_TR[item.accommodation] ?? item.accommodation} />
                ) : null}
                {item.mealsIncluded ? <Badge label="Yemek dahil" /> : null}
                {item.visaSupport ? <Badge label="Vize desteği" /> : null}
                {item.experienceYearsMin ? (
                  <Badge label={`${item.experienceYearsMin}+ yıl deneyim`} />
                ) : null}
              </View>
            </Card>
          )}
        />
      )}
    </View>
  );
}

/** §18.2 S17: a job with no published salary reads "Maaş görüşülür". */
function formatSalary(job: JobSearchHit): string {
  if (job.salaryMin === null && job.salaryMax === null) return 'Maaş görüşülür';

  const currency = job.salaryCurrency ?? 'TRY';
  const money = (value: number) =>
    new Intl.NumberFormat('tr-TR', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(value);

  const range =
    job.salaryMin !== null && job.salaryMax !== null && job.salaryMin !== job.salaryMax
      ? `${money(job.salaryMin)} – ${money(job.salaryMax)}`
      : money((job.salaryMin ?? job.salaryMax) as number);

  const period = job.salaryPeriod ? `/${SALARY_PERIOD_LABEL_TR[job.salaryPeriod] ?? job.salaryPeriod}` : '';
  return `${range}${period}`;
}
