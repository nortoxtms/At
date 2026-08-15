import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Alert, Image, Pressable, ScrollView, View } from 'react-native';

import { Txt } from '@/components/Text';
import { washFromBlurhash } from '@/lib/format';
import {
  attachMedia,
  pickImage,
  removeMedia,
  uploadImage,
  type HorseMedia,
  type MediaOwner,
} from '@/lib/media';
import { theme } from '@/theme/tokens';

/**
 * §18.2 S10's photo step, and the gallery on the horse record.
 *
 * Uploads run one at a time with the tile already on screen in its uploading
 * state. Firing them in parallel looks faster and is worse: the presign is
 * rate limited (100/hour), a phone on a rural connection drops half of them,
 * and a grid that reorders as each one lands makes it impossible to tell which
 * photo failed.
 *
 * The first photo is the cover — said on the screen rather than implied,
 * because "the first one" is only obvious to whoever wrote it.
 *
 * Frames use React Native's `Image` rather than `expo-image`. expo-image is
 * the better component on device, but its web renderer drew nothing here, and
 * an image pipeline that cannot be rendered in the one environment where it
 * can be checked is a pipeline nobody has watched work. The blurhash-derived
 * wash behind each frame already does the job its placeholder would.
 */
type Tile =
  | { kind: 'saved'; media: HorseMedia }
  | { kind: 'pending'; id: string; uri: string; error?: string };

export function PhotoGrid({
  ownerId,
  kind = 'horse',
  media,
  editable,
  onChange,
}: {
  ownerId: string;
  kind?: MediaOwner;
  media: HorseMedia[];
  editable?: boolean;
  onChange?: () => void;
}) {
  const [pending, setPending] = useState<Tile[]>([]);
  const [busy, setBusy] = useState(false);

  const tiles: Tile[] = [
    ...media.map<Tile>((entry) => ({ kind: 'saved', media: entry })),
    ...pending,
  ];

  const add = async (source: 'library' | 'camera') => {
    const picked = await pickImage(source);

    if (picked.cancelled) {
      if (picked.denied) {
        Alert.alert(
          'İzin gerekli',
          source === 'camera'
            ? 'Fotoğraf çekmek için kamera izni ver.'
            : 'Fotoğraf seçmek için galeri izni ver.',
        );
      }
      return;
    }

    const id = `pending-${picked.asset.uri}`;
    setPending((current) => [...current, { kind: 'pending', id, uri: picked.asset.uri }]);
    setBusy(true);

    const uploaded = await uploadImage(picked.asset);

    if (!uploaded.ok) {
      setPending((current) =>
        current.map((tile) =>
          tile.kind === 'pending' && tile.id === id ? { ...tile, error: uploaded.message } : tile,
        ),
      );
      setBusy(false);
      return;
    }

    const attached = await attachMedia(kind, ownerId, uploaded.mediaId);
    setBusy(false);

    if (!attached.ok) {
      setPending((current) =>
        current.map((tile) =>
          tile.kind === 'pending' && tile.id === id
            ? { ...tile, error: attached.message ?? 'Ata eklenemedi.' }
            : tile,
        ),
      );
      return;
    }

    setPending((current) => current.filter((tile) => !(tile.kind === 'pending' && tile.id === id)));
    onChange?.();
  };

  const remove = async (mediaId: string) => {
    if (await removeMedia(kind, ownerId, mediaId)) onChange?.();
  };

  if (!editable && media.length === 0) return null;

  return (
    <View style={{ gap: theme.space.md }}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: theme.space.sm }}
      >
        {tiles.map((tile) => {
          const key = tile.kind === 'saved' ? tile.media.mediaId : tile.id;
          const uri = tile.kind === 'saved' ? tile.media.url : tile.uri;
          const wash =
            tile.kind === 'saved' ? washFromBlurhash(tile.media.blurhash) : theme.color.surfaceRaised;

          return (
            <View
              key={key}
              style={{
                width: 112,
                height: 112,
                borderRadius: theme.radius.md,
                overflow: 'hidden',
                backgroundColor: wash,
                borderWidth: 1,
                borderColor: tile.kind === 'pending' && tile.error ? theme.color.danger : theme.color.border,
              }}
            >
              {uri ? (
                <Image
                  source={{ uri }}
                  style={{ flex: 1, opacity: tile.kind === 'pending' && !tile.error ? 0.45 : 1 }}
                  resizeMode="cover"
                  accessibilityLabel="At fotoğrafı"
                />
              ) : null}

              {tile.kind === 'pending' ? (
                <View
                  style={{
                    position: 'absolute',
                    left: 0,
                    right: 0,
                    bottom: 0,
                    paddingHorizontal: 6,
                    paddingVertical: 4,
                    backgroundColor: theme.color.surfaceRaised,
                  }}
                >
                  <Txt
                    variant="caption"
                    display={false}
                    numberOfLines={2}
                    color={tile.error ? theme.color.danger : theme.color.textSecondary}
                  >
                    {tile.error ?? 'Yükleniyor…'}
                  </Txt>
                </View>
              ) : null}

              {editable && tile.kind === 'saved' ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Fotoğrafı kaldır"
                  onPress={() => void remove(tile.media.mediaId)}
                  hitSlop={8}
                  style={{
                    position: 'absolute',
                    top: 6,
                    right: 6,
                    width: 26,
                    height: 26,
                    borderRadius: 13,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: theme.color.surfaceRaised,
                  }}
                >
                  <Ionicons name="close" size={15} color={theme.color.textPrimary} />
                </Pressable>
              ) : null}
            </View>
          );
        })}

        {editable ? (
          <>
            <AddTile icon="images-outline" label="Galeri" onPress={() => void add('library')} disabled={busy} />
            <AddTile icon="camera-outline" label="Çek" onPress={() => void add('camera')} disabled={busy} />
          </>
        ) : null}
      </ScrollView>

      {editable ? (
        <Txt variant="caption" color={theme.color.textSecondary} display={false}>
          {kind === 'product'
            ? 'İlk fotoğraf kapak olur. Kusuru da çek — sürprizi mesajda değil ilanda ver.'
            : 'İlk fotoğraf kapak olur. §20.1 — alt üçte biri parlak olan kareler ilanda okunmaz, doğal ışıkta ve sade zeminde çek.'}
        </Txt>
      ) : null}
    </View>
  );
}

function AddTile({
  icon,
  label,
  onPress,
  disabled,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        width: 112,
        height: 112,
        borderRadius: theme.radius.md,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        backgroundColor: theme.color.surface,
        borderWidth: 1,
        borderStyle: 'dashed',
        borderColor: theme.color.borderStrong,
        opacity: disabled ? 0.5 : pressed ? 0.8 : 1,
      })}
    >
      <Ionicons name={icon} size={22} color={theme.color.goldSoft} />
      <Txt variant="caption" color={theme.color.textSecondary} display={false}>
        {label}
      </Txt>
    </Pressable>
  );
}
