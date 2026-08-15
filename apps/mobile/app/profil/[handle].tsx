import { Ionicons } from '@expo/vector-icons';
import { VERIFICATION_LABEL_TR } from '@only-horses/shared-types';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Badge } from '@/components/ListingCard';
import { Txt } from '@/components/Text';
import { Avatar, BackButton, Card, EmptyState, Loading } from '@/components/ui';
import { api } from '@/lib/api';
import { ROLE_OPTIONS } from '@/lib/endpoints';
import { useAsync } from '@/lib/useAsync';
import { theme } from '@/theme/tokens';

/**
 * S24 — someone else's profile.
 *
 * §13.3's rule is the shape of this screen: never show the bare trust number.
 * The API computes `trustChips` alongside the score for exactly that reason —
 * short Turkish phrases naming what the score is made of — so they are what
 * the screen leads with, and the number sits under them as a footnote.
 *
 * There is no seller filter on §11's search, so this does not pretend to list
 * their horses. Showing an empty "İlanları" section on every profile would
 * read as "this seller has nothing", which is a claim about them rather than
 * about the API.
 */
interface PublicProfile {
  id: string;
  handle: string;
  displayName: string;
  bio: string | null;
  city: string | null;
  region: string | null;
  verificationLevel: string;
  trustScore: number;
  responseRate: number | null;
  responseTimeMins: number | null;
  reviewCount: number | string;
  reviewAverage: number | string | null;
  roles: { role: string }[];
  trustChips: string[];
  createdAt: string;
}

export default function PublicProfileScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { handle } = useLocalSearchParams<{ handle: string }>();

  const { data, loading } = useAsync(async () => {
    const result = await api<PublicProfile>(`/profiles/${encodeURIComponent(String(handle))}`, {
      auth: false,
    });
    return result.ok ? result.data : null;
  }, [handle]);

  if (loading) return <Loading />;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.color.bg }}
      contentContainerStyle={{
        paddingTop: insets.top,
        paddingHorizontal: theme.screenPadding,
        paddingBottom: theme.space.xxxl,
      }}
      showsVerticalScrollIndicator={false}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <BackButton onPress={() => router.back()} />
        <Txt variant="screenTitle" uppercase>
          Profil
        </Txt>
        <View style={{ width: theme.metric.minTouchTarget }} />
      </View>

      {!data ? (
        <EmptyState
          icon="person-outline"
          title="Profil bulunamadı"
          body="Bu hesap kaldırılmış ya da askıya alınmış olabilir."
        />
      ) : (
        <>
          <View style={{ alignItems: 'center', gap: theme.space.md, paddingVertical: theme.space.xl }}>
            <Avatar name={data.displayName} size={theme.metric.avatarProfile} />
            <Txt variant="h1">{data.displayName}</Txt>
            <Txt variant="small" color={theme.color.textSecondary} display={false}>
              @{data.handle}
              {data.city ? ` · ${data.city}` : ''}
            </Txt>

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <Ionicons name="shield-checkmark" size={13} color={theme.color.goldSoft} />
              <Txt variant="caption" color={theme.color.textSecondary} display={false}>
                {VERIFICATION_LABEL_TR[data.verificationLevel] ?? data.verificationLevel}
              </Txt>
            </View>
          </View>

          {(data.roles ?? []).length > 0 ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.sm, justifyContent: 'center' }}>
              {data.roles.map((entry) => (
                <Badge
                  key={entry.role}
                  label={ROLE_OPTIONS.find((role) => role.id === entry.role)?.label ?? entry.role}
                />
              ))}
            </View>
          ) : null}

          {/* §18.0's stat row, with the two numbers the API actually knows. */}
          <Card style={{ flexDirection: 'row', paddingVertical: theme.space.lg, marginTop: theme.space.xl }}>
            <Stat label="Değerlendirme" value={String(Number(data.reviewCount ?? 0))} />
            <Stat
              label="Puan"
              value={
                data.reviewAverage === null || data.reviewAverage === undefined
                  ? '—'
                  : Number(data.reviewAverage).toFixed(1)
              }
            />
            <Stat
              label="Yanıt"
              value={data.responseRate === null ? '—' : `%${Math.round(Number(data.responseRate))}`}
            />
            <Stat
              label="Yanıt süresi"
              value={data.responseTimeMins === null ? '—' : formatMinutes(Number(data.responseTimeMins))}
              last
            />
          </Card>

          {/* §13.3 / P4: the chips are the score. */}
          {(data.trustChips ?? []).length > 0 ? (
            <View style={{ marginTop: theme.space.lg, gap: theme.space.md }}>
              <Txt variant="h3">Neden güvenilir</Txt>
              <View style={{ gap: theme.space.sm }}>
                {data.trustChips.map((chip) => (
                  <View key={chip} style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space.sm }}>
                    <Ionicons name="checkmark-circle-outline" size={15} color={theme.color.goldSoft} />
                    <Txt variant="small" display={false} style={{ flex: 1 }}>
                      {chip}
                    </Txt>
                  </View>
                ))}
              </View>
              <Txt variant="caption" color={theme.color.textSecondary} display={false}>
                Güven puanı {data.trustScore}. Satın alınamaz, hediye edilemez.
              </Txt>
            </View>
          ) : null}

          {data.bio ? (
            <View style={{ marginTop: theme.space.xl, gap: theme.space.sm }}>
              <Txt variant="h3">Hakkında</Txt>
              <Txt variant="body" color={theme.color.textSecondary} display={false}>
                {data.bio}
              </Txt>
            </View>
          ) : null}
        </>
      )}
    </ScrollView>
  );
}

function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${Math.round(minutes)} dk`;
  if (minutes < 1440) return `${Math.round(minutes / 60)} sa`;
  return `${Math.round(minutes / 1440)} gün`;
}

function Stat({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        gap: 2,
        borderRightWidth: last ? 0 : 1,
        borderRightColor: theme.color.border,
      }}
    >
      <Txt variant="h3" display weight="semibold">
        {value}
      </Txt>
      <Txt variant="caption" color={theme.color.textSecondary} display={false} align="center">
        {label}
      </Txt>
    </View>
  );
}
