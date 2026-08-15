import { Ionicons } from '@expo/vector-icons';
import { VERIFICATION_LABEL_TR } from '@only-horses/shared-types';
import type { ListingSearchHit } from '@only-horses/shared-types';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ListingCard } from '@/components/ListingCard';
import { Button } from '@/components/Button';
import { Txt } from '@/components/Text';
import { Avatar, BackButton, Card, DemoNotice, EmptyState, Loading } from '@/components/ui';
import { api } from '@/lib/api';
import { searchListings } from '@/lib/catalog';
import { useAsync } from '@/lib/useAsync';
import { theme } from '@/theme/tokens';

/**
 * S24 — someone else's profile.
 *
 * The same stat row as your own (§18.0), because a buyer comparing two sellers
 * needs the two rows to line up. Trust score gets a sentence explaining what
 * it is: a number nobody can interpret is worse than no number, since it looks
 * authoritative.
 */
interface PublicProfile {
  handle: string;
  displayName: string;
  verificationLevel: string;
  trustScore: number;
  city: string | null;
  region: string | null;
  about: string | null;
  memberSince: string | null;
  responseRate: number | null;
  reviewCount: number;
  listingCount: number;
  horseCount: number;
}

export default function PublicProfileScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { handle } = useLocalSearchParams<{ handle: string }>();

  const { data, loading } = useAsync(async () => {
    const [profile, listings] = await Promise.all([
      api<PublicProfile>(`/users/${handle}`, { auth: false }),
      api<ListingSearchHit[]>(`/listings/search?seller=${encodeURIComponent(String(handle))}`, {
        auth: false,
      }),
    ]);

    if (profile.ok && profile.data) {
      return {
        profile: profile.data,
        listings: listings.ok && Array.isArray(listings.data) ? listings.data : [],
        source: 'live' as const,
      };
    }

    // Without the API there is no such person; the demo dataset has listings
    // but no seller records behind them, and inventing one would put a
    // fabricated trust score on screen.
    const fallback = await searchListings();
    return {
      profile: null,
      listings: fallback.data.slice(0, 3),
      source: 'demo' as const,
    };
  }, [handle]);

  if (loading) return <Loading />;

  const profile = data?.profile ?? null;

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

      {data?.source === 'demo' ? <DemoNotice style={{ marginTop: theme.space.lg }} /> : null}

      {profile ? (
        <>
          <View style={{ alignItems: 'center', gap: theme.space.md, paddingVertical: theme.space.xl }}>
            <Avatar name={profile.displayName} size={theme.metric.avatarProfile} />
            <Txt variant="h1">{profile.displayName}</Txt>
            <Txt variant="small" color={theme.color.textSecondary} display={false}>
              @{profile.handle}
              {profile.city ? ` · ${profile.city}` : ''}
            </Txt>

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <Ionicons name="shield-checkmark" size={13} color={theme.color.goldSoft} />
              <Txt variant="caption" color={theme.color.textSecondary} display={false}>
                {VERIFICATION_LABEL_TR[profile.verificationLevel] ?? profile.verificationLevel}
              </Txt>
            </View>
          </View>

          <Card style={{ flexDirection: 'row', paddingVertical: theme.space.lg }}>
            <Stat label="İlan" value={String(profile.listingCount)} />
            <Stat label="At" value={String(profile.horseCount)} />
            <Stat label="Değerlendirme" value={String(profile.reviewCount)} />
            <Stat
              label="Yanıt"
              value={profile.responseRate === null ? '—' : `%${Math.round(profile.responseRate)}`}
              last
            />
          </Card>

          <Card style={{ marginTop: theme.space.md, gap: theme.space.sm }}>
            <Txt variant="h3">Güven puanı {profile.trustScore}</Txt>
            <Txt variant="small" color={theme.color.textSecondary} display={false}>
              §18.4 — doğrulama seviyesi, tamamlanan işlemler, yanıt hızı ve
              değerlendirmelerden hesaplanır. Satın alınamaz, hediye edilemez.
            </Txt>
          </Card>

          {profile.about ? (
            <View style={{ marginTop: theme.space.lg, gap: theme.space.sm }}>
              <Txt variant="h3">Hakkında</Txt>
              <Txt variant="body" color={theme.color.textSecondary} display={false}>
                {profile.about}
              </Txt>
            </View>
          ) : null}

          <Button
            label="Mesaj gönder"
            style={{ marginTop: theme.space.xl }}
            onPress={() => router.push('/mesajlar/yeni')}
          />
        </>
      ) : (
        <EmptyState
          icon="person-outline"
          title="Profil yüklenemedi"
          body="Bu profil sunucudan geliyor; şu anda ulaşılamıyor. Aşağıda örnek ilanlar var."
        />
      )}

      <View style={{ marginTop: theme.space.xxl, gap: theme.space.lg }}>
        <Txt variant="h2">İlanları</Txt>
        {(data?.listings ?? []).length === 0 ? (
          <EmptyState icon="list-outline" title="Yayında ilan yok" />
        ) : (
          (data?.listings ?? []).map((hit) => <ListingCard key={hit.id} hit={hit} />)
        )}
      </View>
    </ScrollView>
  );
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
