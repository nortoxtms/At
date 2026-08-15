import { useRouter } from 'expo-router';
import { FlatList, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Badge } from '@/components/ListingCard';
import { Txt } from '@/components/Text';
import { Avatar, BackButton, Card, EmptyState, Loading } from '@/components/ui';
import type { ProfessionalSearchHit } from '@only-horses/shared-types';
import { api } from '@/lib/api';
import { useAsync } from '@/lib/useAsync';
import { theme } from '@/theme/tokens';

/**
 * S16 — the professional directory (§13.3).
 *
 * No demo fallback here, deliberately. Services and jobs can be shown as
 * samples because a sample listing is obviously a listing; a sample
 * *professional* is a fabricated veterinarian with a fabricated verification
 * badge, and there is no banner that makes that acceptable to put on screen.
 */
const ROLE_LABEL_TR: Record<string, string> = {
  vet: 'Veteriner',
  farrier: 'Nalbant',
  trainer: 'Eğitmen',
  instructor: 'Antrenör',
  physio: 'Fizyoterapist',
  dentist: 'Diş uzmanı',
  saddler: 'Saraç',
  nutritionist: 'Besleme uzmanı',
  transporter: 'Nakliyeci',
  photographer: 'Fotoğrafçı',
};

export default function ProfessionalsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const { data, loading } = useAsync(async () => {
    const result = await api<ProfessionalSearchHit[]>('/professionals/search', { auth: false });
    return result.ok && Array.isArray(result.data) ? result.data : [];
  }, []);

  const professionals = data ?? [];

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
          Uzmanlar
        </Txt>
        <View style={{ width: theme.metric.minTouchTarget }} />
      </View>

      {loading ? (
        <Loading />
      ) : (
        <FlatList
          data={professionals}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{
            paddingHorizontal: theme.screenPadding,
            paddingVertical: theme.space.lg,
            gap: theme.space.md,
          }}
          ListEmptyComponent={
            <EmptyState
              icon="ribbon-outline"
              title="Uzman listesi sunucudan gelir"
              body="Veteriner, nalbant ve eğitmen kayıtları doğrulanmış profillerdir — örnek veriyle gösterilmez."
            />
          }
          renderItem={({ item }) => (
            <Card style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space.md }}>
              <Avatar name={item.displayName} size={48} />
              <View style={{ flex: 1, gap: 4 }}>
                <Txt variant="h3" numberOfLines={1}>
                  {item.displayName}
                </Txt>
                <Txt variant="small" color={theme.color.textSecondary} display={false}>
                  {[item.city, item.region].filter(Boolean).join(', ')}
                </Txt>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.sm }}>
                  {(item.roles ?? []).slice(0, 3).map((role) => (
                    <Badge key={role} label={ROLE_LABEL_TR[role] ?? role} />
                  ))}
                </View>
              </View>
            </Card>
          )}
        />
      )}
    </View>
  );
}
