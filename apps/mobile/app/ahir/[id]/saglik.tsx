import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { FlatList, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { Txt } from '@/components/Text';
import { BackButton, Card, DemoNotice, EmptyState, Loading } from '@/components/ui';
import { SAMPLE_HEALTH, type SampleHealthRecord } from '@/content/sample';
import { api } from '@/lib/api';
import { HEALTH_TYPES, type HealthRecord } from '@/lib/endpoints';
import { theme } from '@/theme/tokens';
import { useAsync } from '@/lib/useAsync';

/**
 * S12 — health records, and the reminders §9 hangs off them.
 *
 * Sorted by next-due rather than by date recorded, with anything overdue at
 * the top in `--warning`. A health log ordered by when it was typed is an
 * archive; ordered by what is due next it is the reason to open the app.
 *
 * §8's visibility is stated on the screen because owners routinely assume a
 * record they entered is private and are wrong, or assume it is shown to
 * buyers and are also wrong. The default is private.
 */
/**
 * §12 calls the column `type`, not `kind`, and §7's enum has `vet_exam` where
 * an English reading expects `vet_visit`. Both were wrong here and both fail
 * quietly: a mismatched key reads as undefined and every record renders under
 * the fallback label.
 */
function normalise(record: HealthRecord): SampleHealthRecord {
  return {
    id: record.id,
    kind: record.type,
    date: record.performed_on,
    title: record.title,
    detail: record.notes ?? '',
    nextDue: record.next_due_on,
  };
}

const LABEL: Record<string, string> = Object.fromEntries(
  HEALTH_TYPES.map((entry) => [entry.id, entry.label]),
);

const KIND_ICON: Record<string, keyof typeof Ionicons.glyphMap> = {
  vaccination: 'medkit-outline',
  deworming: 'bug-outline',
  farrier: 'hammer-outline',
  dental: 'happy-outline',
  vet_exam: 'pulse-outline',
  ppe: 'clipboard-outline',
  surgery: 'cut-outline',
  injury: 'bandage-outline',
  lameness: 'walk-outline',
  xray: 'scan-outline',
  lab_result: 'flask-outline',
  medication: 'eyedrop-outline',
  other: 'ellipse-outline',
};

export default function HealthScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const { data, loading } = useAsync(async () => {
    const result = await api<HealthRecord[]>(`/horses/${id}/health`);
    if (result.ok && Array.isArray(result.data)) {
      return { data: result.data.map(normalise), source: 'live' as const };
    }
    return { data: SAMPLE_HEALTH, source: 'demo' as const };
  }, [id]);

  const today = new Date().toISOString().slice(0, 10);

  const records = [...(data?.data ?? [])].sort((a, b) => {
    // Due first, oldest due at the top; undated records fall to the bottom.
    if (a.nextDue && b.nextDue) return a.nextDue.localeCompare(b.nextDue);
    if (a.nextDue) return -1;
    if (b.nextDue) return 1;
    return b.date.localeCompare(a.date);
  });

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
          Sağlık
        </Txt>
        <View style={{ width: theme.metric.minTouchTarget }} />
      </View>

      {loading ? (
        <Loading />
      ) : (
        <FlatList
          data={records}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{
            paddingHorizontal: theme.screenPadding,
            paddingBottom: theme.space.xxxl,
            gap: theme.space.md,
          }}
          ListHeaderComponent={
            <View style={{ gap: theme.space.md, paddingVertical: theme.space.lg }}>
              {data?.source === 'demo' ? <DemoNotice /> : null}
              <Txt variant="caption" color={theme.color.textSecondary} display={false}>
                §8 — sağlık kaydı varsayılan olarak gizlidir. Ne göstereceğini ilan
                başına sen seçersin.
              </Txt>
            </View>
          }
          ListEmptyComponent={
            <EmptyState
              icon="medkit-outline"
              title="Kayıt yok"
              body="Aşı, nal, diş ve parazit kayıtlarını gir; hatırlatmaları biz takip edelim."
              action={<Button label="Kayıt ekle" full={false} onPress={() => router.push(`/ahir/${id}/saglik-ekle`)} />}
            />
          }
          ListFooterComponent={
            records.length > 0 ? (
              <Button
                label="Kayıt ekle"
                variant="secondary"
                style={{ marginTop: theme.space.lg }}
                onPress={() => router.push(`/ahir/${id}/saglik-ekle`)}
              />
            ) : null
          }
          renderItem={({ item }) => {
            const overdue = !!item.nextDue && item.nextDue < today;

            return (
              <Card style={{ gap: theme.space.sm }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space.sm }}>
                  <Ionicons
                    name={KIND_ICON[item.kind] ?? 'pulse-outline'}
                    size={17}
                    color={theme.color.goldSoft}
                  />
                  <Txt variant="h3" style={{ flex: 1 }} numberOfLines={1}>
                    {item.title}
                  </Txt>
                  <Txt variant="caption" color={theme.color.textSecondary} display={false}>
                    {LABEL[item.kind] ?? item.kind}
                  </Txt>
                </View>

                {item.detail ? (
                  <Txt variant="small" color={theme.color.textSecondary} display={false}>
                    {item.detail}
                  </Txt>
                ) : null}

                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Txt variant="caption" color={theme.color.textSecondary} display={false}>
                    {formatDate(item.date)}
                  </Txt>
                  {item.nextDue ? (
                    <Txt
                      variant="caption"
                      display={false}
                      color={overdue ? theme.color.warning : theme.color.textSecondary}
                    >
                      {overdue ? 'Gecikti · ' : 'Sıradaki · '}
                      {formatDate(item.nextDue)}
                    </Txt>
                  ) : null}
                </View>
              </Card>
            );
          }}
        />
      )}
    </View>
  );
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' }).format(date);
}
