import { Ionicons } from '@expo/vector-icons';
import {
  DISCIPLINE_LABEL_TR,
  LISTING_TYPE_LABEL_TR,
  SEX_LABEL_TR,
  VERIFICATION_LABEL_TR,
} from '@only-horses/shared-types';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Badge } from '@/components/ListingCard';
import { Button } from '@/components/Button';
import { Txt } from '@/components/Text';
import { Avatar, Card, DataRow, DemoNotice, EmptyState, Loading } from '@/components/ui';
import { api } from '@/lib/api';
import { getListing } from '@/lib/catalog';
import { formatPrice, washFromBlurhash } from '@/lib/format';
import { useAsync } from '@/lib/useAsync';
import { useSession } from '@/lib/session';
import { theme } from '@/theme/tokens';

/**
 * S08 — the listing.
 *
 * The order is §20.6's and it is an argument, not a layout: photograph, name,
 * price, then the seller and their verification level, then the horse's facts,
 * then the description. A buyer decides whether to write to a stranger before
 * they finish reading the prose, and putting the seller below the description
 * hides the thing the decision actually turns on.
 *
 * The action bar is pinned. Scrolling away from the only way to contact the
 * seller is the most common way a marketplace loses an enquiry.
 */
export default function ListingScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { me } = useSession();
  const [saved, setSaved] = useState(false);
  const [savingItem, setSavingItem] = useState(false);

  const { data, loading } = useAsync(() => getListing(String(slug)), [slug]);
  const listing = data?.data ?? null;

  if (loading) return <Loading />;

  if (!listing) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.color.bg, paddingTop: insets.top + theme.space.xxxl }}>
        <EmptyState
          icon="alert-circle-outline"
          title="İlan bulunamadı"
          body="Bu ilan kaldırılmış ya da bağlantı hatalı olabilir."
          action={<Button label="Geri dön" variant="secondary" full={false} onPress={() => router.back()} />}
        />
      </View>
    );
  }

  const wash = washFromBlurhash(listing.slug);
  const price = formatPrice(listing.price_amount, listing.price_currency, listing.price_type);
  const sellerVerified =
    listing.seller_verification !== 'none' && listing.seller_verification !== 'email_verified';

  /**
   * §10's saved items live on the account, so this is a request, not a local
   * toggle. The optimistic flip is reverted when the request fails — a
   * bookmark that appears to stick and is gone tomorrow is worse than one
   * that visibly refuses.
   */
  const toggleSave = async () => {
    if (!me) return router.push('/auth');
    if (savingItem) return;

    const next = !saved;
    setSaved(next);
    setSavingItem(true);

    const result = next
      ? await api('/saved', {
          method: 'POST',
          body: JSON.stringify({ itemType: 'listing', itemId: listing.id }),
        })
      : await api(`/saved/listing/${listing.id}`, { method: 'DELETE' });

    setSavingItem(false);
    if (!result.ok) setSaved(!next);
  };

  const age = listing.date_of_birth
    ? Math.max(0, new Date().getFullYear() - new Date(listing.date_of_birth).getFullYear())
    : null;

  return (
    <View style={{ flex: 1, backgroundColor: theme.color.bg }}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ height: 320, backgroundColor: wash }}>
          <View
            style={{
              position: 'absolute',
              top: insets.top + theme.space.sm,
              left: theme.screenPadding,
              right: theme.screenPadding,
              flexDirection: 'row',
              justifyContent: 'space-between',
            }}
          >
            <RoundButton icon="chevron-back" label="Geri" onPress={() => router.back()} />
            <View style={{ flexDirection: 'row', gap: theme.space.sm }}>
              <RoundButton
                icon={saved ? 'bookmark' : 'bookmark-outline'}
                label={saved ? 'Kaydedildi' : 'Kaydet'}
                onPress={() => void toggleSave()}
                active={saved}
              />
              <RoundButton
                icon="flag-outline"
                label="Bildir"
                onPress={() => router.push(`/bildir?type=listing&id=${listing.id}`)}
              />
            </View>
          </View>

          <View
            style={{
              position: 'absolute',
              bottom: theme.space.lg,
              left: theme.screenPadding,
              flexDirection: 'row',
              gap: theme.space.sm,
            }}
          >
            <Badge label={LISTING_TYPE_LABEL_TR[listing.type] ?? listing.type} />
            {listing.trial_allowed ? <Badge label="Deneme var" /> : null}
            {listing.ppe_welcome ? <Badge label="PPE olur" /> : null}
          </View>
        </View>

        <View style={{ padding: theme.screenPadding, gap: theme.space.lg }}>
          {data?.source === 'demo' ? <DemoNotice /> : null}

          <View style={{ gap: 4 }}>
            <Txt variant="display">{listing.horse_name}</Txt>
            <Txt variant="small" color={theme.color.textSecondary} display={false}>
              {[SEX_LABEL_TR[listing.sex] ?? listing.sex, age !== null ? `${age} yaş` : null, listing.breed_name_tr]
                .filter(Boolean)
                .join(' · ')}
            </Txt>
            <Txt variant="h1" display weight="semibold" color={theme.color.goldSoft} style={{ marginTop: theme.space.sm }}>
              {price}
            </Txt>
            <Txt variant="small" color={theme.color.textSecondary} display={false}>
              {[listing.city, listing.region].filter(Boolean).join(', ')}
            </Txt>
          </View>

          {/* The seller, above the prose, because that is where the decision is. */}
          <Pressable
            accessibilityRole="link"
            accessibilityLabel={`${listing.seller_name} profiline git`}
            onPress={() => router.push(`/profil/${listing.seller_handle}`)}
          >
            <Card style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space.md }}>
              <Avatar name={listing.seller_name} size={44} />
              <View style={{ flex: 1, gap: 2 }}>
                <Txt variant="h3" numberOfLines={1}>
                  {listing.seller_name}
                </Txt>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Ionicons
                    name={sellerVerified ? 'shield-checkmark' : 'shield-outline'}
                    size={13}
                    color={sellerVerified ? theme.color.goldSoft : theme.color.textSecondary}
                  />
                  <Txt variant="caption" color={theme.color.textSecondary} display={false}>
                    {VERIFICATION_LABEL_TR[listing.seller_verification] ?? listing.seller_verification}
                    {' · güven '}
                    {listing.seller_trust_score}
                  </Txt>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={16} color={theme.color.textSecondary} />
            </Card>
          </Pressable>

          <Card>
            <Txt variant="h3" style={{ marginBottom: theme.space.sm }}>
              Künye
            </Txt>
            <DataRow label="Cinsiyet" value={SEX_LABEL_TR[listing.sex] ?? listing.sex} />
            {listing.height_cm ? (
              <DataRow label="Cidago" value={`${Math.round(Number(listing.height_cm))} cm`} />
            ) : null}
            {listing.color ? <DataRow label="Don" value={listing.color} /> : null}
            {listing.breed_name_tr ? <DataRow label="Irk" value={listing.breed_name_tr} /> : null}
            {listing.training_level ? (
              <DataRow label="Eğitim seviyesi" value={listing.training_level} />
            ) : null}
            {listing.rider_level_min ? (
              <DataRow label="Binici seviyesi" value={listing.rider_level_min} />
            ) : null}
            <DataRow
              label="Doğum"
              value={
                listing.date_of_birth
                  ? `${new Date(listing.date_of_birth).getFullYear()}${listing.birth_year_estimated ? ' (tahmini)' : ''}`
                  : 'Bilinmiyor'
              }
            />
          </Card>

          {listing.disciplines.length > 0 ? (
            <View style={{ gap: theme.space.md }}>
              <Txt variant="h3">Disiplinler</Txt>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.sm }}>
                {listing.disciplines.map((discipline) => (
                  <Badge key={discipline} label={DISCIPLINE_LABEL_TR[discipline] ?? discipline} />
                ))}
              </View>
            </View>
          ) : null}

          {listing.description ? (
            <View style={{ gap: theme.space.sm }}>
              <Txt variant="h3">Açıklama</Txt>
              <Txt variant="body" color={theme.color.textSecondary} display={false}>
                {listing.description}
              </Txt>
            </View>
          ) : null}

          {/*
            §8's visibility rules, said out loud rather than by omission. A
            buyer who cannot see the health record should know it exists and is
            restricted — otherwise "no records" and "records you may not see"
            look the same, and only one of them is a reason to walk away.
          */}
          <Card style={{ gap: theme.space.sm }}>
            <Txt variant="h3">Sağlık ve soy kaydı</Txt>
            <Txt variant="small" color={theme.color.textSecondary} display={false}>
              {listing.visibility_health === 'public'
                ? 'Sağlık kaydı herkese açık.'
                : listing.visibility_health === 'on_request'
                  ? 'Sağlık kaydı istek üzerine paylaşılıyor — satıcıya yazabilirsin.'
                  : 'Sağlık kaydı gizli.'}
            </Txt>
            <Txt variant="small" color={theme.color.textSecondary} display={false}>
              {listing.visibility_pedigree === 'public'
                ? 'Soy kaydı herkese açık.'
                : listing.visibility_pedigree === 'on_request'
                  ? 'Soy kaydı istek üzerine paylaşılıyor.'
                  : 'Soy kaydı gizli.'}
            </Txt>
          </Card>

          <Txt variant="caption" color={theme.color.textSecondary} display={false}>
            {listing.view_count} görüntülenme
          </Txt>
        </View>
      </ScrollView>

      <View
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          paddingHorizontal: theme.screenPadding,
          paddingTop: theme.space.md,
          paddingBottom: insets.bottom + theme.space.md,
          backgroundColor: theme.color.surfaceRaised,
          borderTopWidth: 1,
          borderTopColor: theme.color.border,
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.space.md,
        }}
      >
        <View style={{ flex: 1 }}>
          <Txt variant="caption" color={theme.color.textSecondary} display={false}>
            {LISTING_TYPE_LABEL_TR[listing.type] ?? listing.type}
          </Txt>
          <Txt variant="h3" display weight="semibold">
            {price}
          </Txt>
        </View>

        <Button
          label={me ? 'Satıcıya yaz' : 'Yazmak için giriş yap'}
          full={false}
          onPress={() =>
            me
              ? router.push(`/mesajlar/yeni?listing=${listing.slug}`)
              : router.push('/auth')
          }
        />
      </View>
    </View>
  );
}

function RoundButton({
  icon,
  label,
  onPress,
  active,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  active?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => ({
        width: theme.metric.minTouchTarget,
        height: theme.metric.minTouchTarget,
        borderRadius: theme.metric.minTouchTarget / 2,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.color.surfaceRaised,
        borderWidth: 1,
        borderColor: theme.color.border,
        opacity: pressed ? 0.8 : 1,
      })}
    >
      <Ionicons name={icon} size={20} color={active ? theme.color.goldSoft : theme.color.textPrimary} />
    </Pressable>
  );
}
