import {
  ACCOMMODATION_LABEL_TR,
  JOB_TYPE_LABEL_TR,
  SALARY_PERIOD_LABEL_TR,
} from '@only-horses/shared-types';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Badge } from '@/components/ListingCard';
import { Button } from '@/components/Button';
import { Txt } from '@/components/Text';
import { BackButton, Card, EmptyState, Field, Loading } from '@/components/ui';
import { api } from '@/lib/api';
import { ROLE_OPTIONS } from '@/lib/endpoints';
import { useSession } from '@/lib/session';
import { useAsync } from '@/lib/useAsync';
import { theme } from '@/theme/tokens';

/**
 * S18 — a job, and applying to it (§13.6).
 *
 * The application is on this screen rather than behind a second one. §13.6's
 * form is a cover letter and nothing else that can be filled offline, and a
 * separate screen for one text field is a screen whose only effect is a place
 * to give up.
 *
 * Accommodation and visa support sit above the description because for a groom
 * moving regions they decide whether the job is possible at all; a salary
 * alone does not answer "can I take this".
 */
interface JobDetail {
  id: string;
  slug: string;
  title: string;
  description: string;
  responsibilities: string | null;
  requirements: string | null;
  job_type: string;
  roles_needed: string[];
  country_code: string;
  region: string | null;
  city: string | null;
  salary_min: string | number | null;
  salary_max: string | number | null;
  salary_currency: string | null;
  salary_period: string | null;
  accommodation: string | null;
  meals_included: boolean;
  visa_support: boolean;
  experience_years_min: number | null;
  start_date: string | null;
  organization_name: string | null;
  poster_name: string | null;
  application_count: number;
}

export default function JobScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { me } = useSession();

  const [letter, setLetter] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data, loading } = useAsync(async () => {
    const result = await api<JobDetail>(`/jobs/${encodeURIComponent(String(slug))}`, {
      auth: false,
    });
    return result.ok ? result.data : null;
  }, [slug]);

  if (loading) return <Loading />;

  if (!data) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.color.bg, paddingTop: insets.top + theme.space.xxxl }}>
        <EmptyState
          icon="briefcase-outline"
          title="İlan bulunamadı"
          body="Bu iş ilanı kapanmış olabilir."
          action={<Button label="İş ilanları" full={false} onPress={() => router.replace('/isler')} />}
        />
      </View>
    );
  }

  const apply = async () => {
    setSending(true);
    setError(null);

    const result = await api(`/jobs/${data.slug}/apply`, {
      method: 'POST',
      body: JSON.stringify({ coverLetter: letter.trim() }),
    });

    setSending(false);

    if (!result.ok) {
      setError(result.error.message);
      return;
    }

    setSent(true);
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.color.bg }}
      contentContainerStyle={{
        paddingTop: insets.top,
        paddingHorizontal: theme.screenPadding,
        paddingBottom: theme.space.xxxl,
        gap: theme.space.lg,
      }}
      keyboardShouldPersistTaps="handled"
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <BackButton onPress={() => router.back()} />
        <Txt variant="screenTitle" uppercase>
          İş ilanı
        </Txt>
        <View style={{ width: theme.metric.minTouchTarget }} />
      </View>

      <View style={{ gap: 4 }}>
        <Txt variant="display">{data.title}</Txt>
        <Txt variant="small" color={theme.color.textSecondary} display={false}>
          {[data.organization_name ?? data.poster_name, data.city, data.region]
            .filter(Boolean)
            .join(' · ')}
        </Txt>
        <Txt variant="h2" display weight="semibold" color={theme.color.goldSoft} style={{ marginTop: theme.space.sm }}>
          {formatSalary(data)}
        </Txt>
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.sm }}>
        <Badge label={JOB_TYPE_LABEL_TR[data.job_type] ?? data.job_type} />
        {data.accommodation ? (
          <Badge label={ACCOMMODATION_LABEL_TR[data.accommodation] ?? data.accommodation} />
        ) : null}
        {data.meals_included ? <Badge label="Yemek dahil" /> : null}
        {data.visa_support ? <Badge label="Vize desteği" /> : null}
        {data.experience_years_min ? <Badge label={`${data.experience_years_min}+ yıl`} /> : null}
      </View>

      {(data.roles_needed ?? []).length > 0 ? (
        <View style={{ gap: theme.space.sm }}>
          <Txt variant="h3">Aranan roller</Txt>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.sm }}>
            {data.roles_needed.map((role) => (
              <Badge
                key={role}
                label={ROLE_OPTIONS.find((entry) => entry.id === role)?.label ?? role}
              />
            ))}
          </View>
        </View>
      ) : null}

      <View style={{ gap: theme.space.sm }}>
        <Txt variant="h3">İş tanımı</Txt>
        <Txt variant="body" color={theme.color.textSecondary} display={false}>
          {data.description}
        </Txt>
      </View>

      {data.responsibilities ? (
        <View style={{ gap: theme.space.sm }}>
          <Txt variant="h3">Sorumluluklar</Txt>
          <Txt variant="body" color={theme.color.textSecondary} display={false}>
            {data.responsibilities}
          </Txt>
        </View>
      ) : null}

      {data.requirements ? (
        <View style={{ gap: theme.space.sm }}>
          <Txt variant="h3">Aranan nitelikler</Txt>
          <Txt variant="body" color={theme.color.textSecondary} display={false}>
            {data.requirements}
          </Txt>
        </View>
      ) : null}

      {sent ? (
        <Card style={{ gap: theme.space.sm }}>
          <Txt variant="h3">Başvurun gönderildi</Txt>
          <Txt variant="small" color={theme.color.textSecondary} display={false}>
            İşveren yanıtladığında mesajlarında göreceksin — §13.6, başvurunun
            durumu açtığı konuşmada duyurulur.
          </Txt>
          <Button label="Mesajlarım" variant="secondary" onPress={() => router.push('/mesajlar')} />
        </Card>
      ) : me ? (
        <Card style={{ gap: theme.space.md }}>
          <Txt variant="h3">Başvur</Txt>
          <Field
            label="Ön yazı"
            value={letter}
            onChangeText={setLetter}
            multiline
            numberOfLines={6}
            placeholder="Deneyimin, ne zaman başlayabileceğin, neden bu iş…"
            hint={`${letter.trim().length} / en az 20 karakter`}
            error={error}
            style={{ minHeight: 160 }}
          />
          <Button
            label="Başvuruyu gönder"
            onPress={() => void apply()}
            loading={sending}
            disabled={letter.trim().length < 20}
          />
        </Card>
      ) : (
        <Card style={{ gap: theme.space.md }}>
          <Txt variant="h3">Başvurmak için giriş yap</Txt>
          <Button label="Giriş yap" onPress={() => router.push('/auth')} />
        </Card>
      )}

      <Txt variant="caption" color={theme.color.textSecondary} display={false}>
        {data.application_count} başvuru
      </Txt>
    </ScrollView>
  );
}

function formatSalary(job: JobDetail): string {
  if (job.salary_min === null && job.salary_max === null) return 'Maaş görüşülür';

  const currency = job.salary_currency ?? 'TRY';
  const money = (value: number) =>
    new Intl.NumberFormat('tr-TR', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(value);

  const min = job.salary_min === null ? null : Number(job.salary_min);
  const max = job.salary_max === null ? null : Number(job.salary_max);

  const range =
    min !== null && max !== null && min !== max
      ? `${money(min)} – ${money(max)}`
      : money((min ?? max) as number);

  const period = job.salary_period
    ? `/${SALARY_PERIOD_LABEL_TR[job.salary_period] ?? job.salary_period}`
    : '';

  return `${range}${period}`;
}
