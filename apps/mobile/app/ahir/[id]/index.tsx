import { Ionicons } from '@expo/vector-icons';
import { DISCIPLINE_LABEL_TR, SEX_LABEL_TR } from '@only-horses/shared-types';
import type { TimelineEntry } from '@only-horses/shared-types';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Image, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Badge } from '@/components/ListingCard';
import { Button } from '@/components/Button';
import { PhotoGrid } from '@/components/PhotoGrid';
import { Timeline } from '@/components/Timeline';
import { Txt } from '@/components/Text';
import { Card, DataRow, DemoNotice, EmptyState, Loading } from '@/components/ui';
import { SAMPLE_HEALTH, SAMPLE_STABLE } from '@/content/sample';
import { api } from '@/lib/api';
import { washFromBlurhash } from '@/lib/format';
import { listHorseMedia } from '@/lib/media';
import { useAsync, useReloadOnFocus } from '@/lib/useAsync';
import { theme } from '@/theme/tokens';

/**
 * S11 — the horse record, with §20.4's timeline on it.
 *
 * Not "the listing for a horse". A horse exists here with no listing, no
 * price and no buyer, and everything a listing needs is derived from this
 * record — which is why "İlan ver" on this screen goes to the composer
 * pre-filled rather than to an empty form.
 */
export default function HorseScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id, yeni } = useLocalSearchParams<{ id: string; yeni?: string }>();

  const { data, loading, reload } = useAsync(async () => {
    const [horse, timeline, media] = await Promise.all([
      api<Record<string, unknown>>(`/horses/${id}`),
      api<TimelineEntry[]>(`/horses/${id}/timeline`),
      listHorseMedia(String(id)),
    ]);

    if (horse.ok && horse.data) {
      return {
        horse: horse.data,
        timeline: timeline.ok && Array.isArray(timeline.data) ? timeline.data : [],
        media,
        source: 'live' as const,
      };
    }

    const sample = SAMPLE_STABLE.find((entry) => entry.id === id) ?? SAMPLE_STABLE[0];
    if (!sample) return null;

    return {
      horse: {
        id: sample.id,
        name: sample.name,
        sex: sample.sex,
        height_cm: sample.heightCm,
        color: sample.color,
        breed_name_tr: sample.breed,
        disciplines: sample.disciplines,
        cover_blurhash: sample.blurhash,
        date_of_birth: `${new Date().getFullYear() - sample.ageYears}-04-01`,
      } as Record<string, unknown>,
      timeline: sampleTimeline(sample.name, sample.ageYears),
      media: [],
      source: 'demo' as const,
    };
  }, [id]);

  // Coming back from a screen that added something must show it.
  useReloadOnFocus(reload);

  if (loading) return <Loading />;

  if (!data) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.color.bg, paddingTop: insets.top + theme.space.xxxl }}>
        <EmptyState
          icon="alert-circle-outline"
          title="At bulunamadı"
          action={<Button label="Geri" variant="secondary" full={false} onPress={() => router.back()} />}
        />
      </View>
    );
  }

  const horse = data.horse;
  const name = String(horse.name ?? '');
  const sex = String(horse.sex ?? '');
  const disciplines = (horse.disciplines as string[] | null) ?? [];
  const birth = horse.date_of_birth ? String(horse.date_of_birth) : null;
  const cover = data.media.find((entry) => entry.url)?.url ?? null;
  const age = birth ? Math.max(0, new Date().getFullYear() - new Date(birth).getFullYear()) : null;

  return (
    <View style={{ flex: 1, backgroundColor: theme.color.bg }}>
      <ScrollView contentContainerStyle={{ paddingBottom: theme.space.xxxl }} showsVerticalScrollIndicator={false}>
        <View style={{ height: 260, backgroundColor: washFromBlurhash(String(horse.cover_blurhash ?? '')) }}>
          {cover ? (
            <Image
              source={{ uri: cover }}
              style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
              resizeMode="cover"
              accessibilityLabel={`${name} kapak fotoğrafı`}
            />
          ) : null}
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
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Geri"
              onPress={() => router.back()}
              style={roundStyle}
            >
              <Ionicons name="chevron-back" size={20} color={theme.color.textPrimary} />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Düzenle"
              onPress={() => router.push(`/ahir/${id}/duzenle`)}
              style={roundStyle}
            >
              <Ionicons name="create-outline" size={19} color={theme.color.textPrimary} />
            </Pressable>
          </View>
        </View>

        <View style={{ padding: theme.screenPadding, gap: theme.space.lg }}>
          {data.source === 'demo' ? <DemoNotice /> : null}

          <View style={{ gap: 4 }}>
            <Txt variant="display">{name}</Txt>
            <Txt variant="small" color={theme.color.textSecondary} display={false}>
              {[SEX_LABEL_TR[sex] ?? sex, age !== null ? `${age} yaş` : null, horse.breed_name_tr]
                .filter(Boolean)
                .join(' · ')}
            </Txt>
          </View>

          {disciplines.length > 0 ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.sm }}>
              {disciplines.map((discipline) => (
                <Badge key={discipline} label={DISCIPLINE_LABEL_TR[discipline] ?? discipline} />
              ))}
            </View>
          ) : null}

          {yeni ? (
            <Card style={{ gap: theme.space.sm }}>
              <Txt variant="h3">Kayıt açıldı</Txt>
              <Txt variant="small" color={theme.color.textSecondary} display={false}>
                Şimdi fotoğraf ekle. §11 — fotoğrafsız bir ilan aramada da,
                alıcının gözünde de en sona düşer.
              </Txt>
            </Card>
          ) : null}

          <View style={{ gap: theme.space.md }}>
            <Txt variant="h3">Fotoğraflar</Txt>
            <PhotoGrid
              ownerId={String(id)}
              media={data.media}
              editable={data.source === 'live'}
              onChange={reload}
            />
          </View>

          <View style={{ flexDirection: 'row', gap: theme.space.md }}>
            <Button
              label="İlan ver"
              full={false}
              style={{ flex: 1 }}
              onPress={() => router.push(`/ilan-ver?horse=${id}`)}
            />
            <Button
              label="Sağlık kaydı"
              variant="secondary"
              full={false}
              style={{ flex: 1 }}
              onPress={() => router.push(`/ahir/${id}/saglik`)}
            />
          </View>

          {/*
            §6's transfer, at the bottom and on its own. It is the action that
            hands the record away — grouping it with "add a photo" is how it
            gets pressed by accident.
          */}
          <Button
            label="Yeni sahibine devret"
            variant="secondary"
            onPress={() => router.push(`/ahir/${id}/devret`)}
          />

          <Card>
            <Txt variant="h3" style={{ marginBottom: theme.space.sm }}>
              Künye
            </Txt>
            <DataRow label="Cinsiyet" value={SEX_LABEL_TR[sex] ?? sex} />
            {horse.height_cm ? (
              <DataRow label="Cidago" value={`${Math.round(Number(horse.height_cm))} cm`} />
            ) : null}
            {horse.color ? <DataRow label="Don" value={String(horse.color)} /> : null}
            {horse.breed_name_tr ? <DataRow label="Irk" value={String(horse.breed_name_tr)} /> : null}
            <DataRow label="Doğum" value={birth ? new Date(birth).getFullYear().toString() : 'Bilinmiyor'} />
          </Card>

          <View>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: theme.space.sm,
              }}
            >
              <Txt variant="h2">Geçmiş</Txt>
              <Button
                label="Yarışma ekle"
                variant="ghost"
                full={false}
                onPress={() => router.push(`/ahir/${id}/yarisma-ekle`)}
              />
            </View>
            <Txt variant="small" color={theme.color.textSecondary} display={false}>
              Kayıt atla birlikte gider. Sahiplik değişse de bu satırlar kalır.
            </Txt>
            {data.timeline.length === 0 ? (
              <EmptyState
                icon="time-outline"
                title="Henüz kayıt yok"
                body="Aşı, nal, yarışma ya da sahiplik girdikçe geçmiş burada birikir."
              />
            ) : (
              <Timeline entries={data.timeline} />
            )}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const roundStyle = {
  width: theme.metric.minTouchTarget,
  height: theme.metric.minTouchTarget,
  borderRadius: theme.metric.minTouchTarget / 2,
  alignItems: 'center' as const,
  justifyContent: 'center' as const,
  backgroundColor: theme.color.surfaceRaised,
  borderWidth: 1,
  borderColor: theme.color.border,
};

/** A plausible life, built from the sample health records plus registration. */
function sampleTimeline(name: string, ageYears: number): TimelineEntry[] {
  const born = new Date().getFullYear() - ageYears;

  return [
    {
      kind: 'registered',
      date: `${born}-04-01`,
      title: `${name} doğdu`,
      detail: 'Kayıt açıldı',
      referenceId: null,
    },
    ...SAMPLE_HEALTH.map<TimelineEntry>((record) => ({
      kind: 'health',
      date: record.date,
      title: record.title,
      detail: record.detail,
      referenceId: record.id,
    })),
    {
      kind: 'competition',
      date: `${new Date().getFullYear()}-04-19`,
      title: 'Bölgesel engel atlama — 3.',
      detail: '1.10 m kategorisi',
      referenceId: null,
    },
  ];
}
