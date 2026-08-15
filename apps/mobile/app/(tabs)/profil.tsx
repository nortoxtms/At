import { Ionicons } from '@expo/vector-icons';
import { VERIFICATION_LABEL_TR } from '@only-horses/shared-types';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { TabHeader } from '@/components/TabHeader';
import { Txt } from '@/components/Text';
import { Avatar, Card, Loading } from '@/components/ui';
import { api } from '@/lib/api';
import { useSession } from '@/lib/session';
import { useAsync } from '@/lib/useAsync';
import { theme } from '@/theme/tokens';

/**
 * S23 — Profile, and §18.0's first resolved deviation.
 *
 * The mockup has no "My Stable" tab; the spec has one. Rather than adding a
 * sixth tab the drawing does not have, the stable is entered from here. That
 * is also the truer model: your horses are part of who you are on this
 * platform, not a separate destination.
 *
 * The stat row is §18.0's second resolved deviation — Listings · Horses ·
 * Reviews · Response rate. Response rate is in it because §16 makes it the
 * thing a buyer actually wants to know before writing to a stranger.
 */
interface Dashboard {
  horses: number;
  activeListings: number;
  draftListings: number;
  unreadNotifications: number;
  savedItems: number;
  pendingAccessRequests: number;
  dueReminders: number;
}

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { me, ready, demo, signOut, stopDemo, startDemo } = useSession();

  const { data: dashboard } = useAsync(async () => {
    if (!me) return null;
    const result = await api<Dashboard>('/me/dashboard');
    return result.ok ? result.data : null;
  }, [me?.id]);

  if (!ready) return <Loading />;

  if (!me) {
    return (
      <ScrollView
        style={{ flex: 1, backgroundColor: theme.color.bg }}
        contentContainerStyle={{
          paddingTop: insets.top,
          paddingHorizontal: theme.screenPadding,
          paddingBottom: theme.space.xxxl,
        }}
      >
        <TabHeader title="Profil" />

        <Card style={{ marginTop: theme.space.xl, gap: theme.space.lg, alignItems: 'center' }}>
          <Ionicons name="person-circle-outline" size={48} color={theme.color.goldMuted} />
          <Txt variant="h2" align="center">
            Giriş yap
          </Txt>
          <Txt variant="small" align="center" color={theme.color.textSecondary} display={false}>
            Atlarını kaydetmek, ilan vermek ve mesajlaşmak için hesabına gir.
          </Txt>
          <Button label="Giriş yap veya kaydol" onPress={() => router.push('/auth')} />
          <Button
            label="Demo olarak gir"
            variant="secondary"
            onPress={async () => {
              await startDemo();
              router.replace('/(tabs)');
            }}
          />
        </Card>

        <View style={{ marginTop: theme.space.xxl }}>
          <MenuList
            items={[
              { label: 'Hizmetler', icon: 'construct-outline', href: '/hizmetler' },
              { label: 'İş ilanları', icon: 'briefcase-outline', href: '/isler' },
              { label: 'Uzmanlar', icon: 'ribbon-outline', href: '/uzmanlar' },
              { label: 'Kaydedilenler', icon: 'bookmark-outline', href: '/kaydedilenler' },
              { label: 'Planlar', icon: 'card-outline', href: '/planlar' },
              { label: 'Hakkında', icon: 'information-circle-outline', href: '/hakkinda' },
            ]}
          />
        </View>
      </ScrollView>
    );
  }

  const verified =
    me.verificationLevel !== 'none' && me.verificationLevel !== 'email_verified';

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
      <TabHeader
        title="Profil"
        right={
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Ayarlar"
            onPress={() => router.push('/ayarlar')}
            hitSlop={12}
          >
            <Ionicons name="settings-outline" size={20} color={theme.color.textSecondary} />
          </Pressable>
        }
      />

      <View style={{ alignItems: 'center', gap: theme.space.md, paddingVertical: theme.space.xl }}>
        <Avatar name={me.displayName} size={theme.metric.avatarProfile} />
        <Txt variant="h1">{me.displayName}</Txt>
        <Txt variant="small" color={theme.color.textSecondary} display={false}>
          @{me.handle}
          {me.city ? ` · ${me.city}` : ''}
        </Txt>

        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            paddingHorizontal: theme.space.md,
            paddingVertical: 4,
            borderRadius: theme.radius.full,
            backgroundColor: theme.color.surfaceRaised,
            borderWidth: 1,
            borderColor: verified ? theme.color.goldMuted : theme.color.border,
          }}
        >
          <Ionicons
            name={verified ? 'shield-checkmark' : 'shield-outline'}
            size={13}
            color={verified ? theme.color.goldSoft : theme.color.textSecondary}
          />
          <Txt variant="caption" display={false} color={theme.color.textSecondary}>
            {VERIFICATION_LABEL_TR[me.verificationLevel] ?? me.verificationLevel}
          </Txt>
        </View>
      </View>

      {/* §18.0: Listings · Horses · Reviews · Response rate. */}
      <Card style={{ flexDirection: 'row', paddingVertical: theme.space.lg }}>
        <Stat label="İlan" value={String(dashboard?.activeListings ?? 0)} />
        <Stat label="At" value={String(dashboard?.horses ?? 0)} />
        <Stat label="Değerlendirme" value={String(me.trustScore)} />
        <Stat label="Yanıt" value="—" last />
      </Card>

      {!verified ? (
        <Card style={{ marginTop: theme.space.lg, gap: theme.space.md }}>
          <Txt variant="h3">Kimlik doğrulaması gerekli</Txt>
          <Txt variant="small" color={theme.color.textSecondary} display={false}>
            §3.3 — ilan yayınlamak için kimliğini doğrulaman gerekir. Bu hiçbir planla
            satın alınamaz; ücretsiz hesapta da, Business planda da aynı koşuldur.
          </Txt>
          <Button
            label="Doğrulamayı başlat"
            variant="secondary"
            onPress={() => router.push('/dogrulama')}
          />
        </Card>
      ) : null}

      <View style={{ marginTop: theme.space.xl }}>
        <MenuList
          items={[
            { label: 'Ahırım', icon: 'home-outline', href: '/ahir' },
            { label: 'İlanlarım', icon: 'list-outline', href: '/ilanlarim' },
            { label: 'Bildirimler', icon: 'notifications-outline', href: '/bildirimler' },
            { label: 'Kaydedilenler', icon: 'bookmark-outline', href: '/kaydedilenler' },
            { label: 'Aramalarım', icon: 'search-outline', href: '/aramalarim' },
            { label: 'Hizmetler', icon: 'construct-outline', href: '/hizmetler' },
            { label: 'İş ilanları', icon: 'briefcase-outline', href: '/isler' },
            { label: 'Uzmanlar', icon: 'ribbon-outline', href: '/uzmanlar' },
            { label: 'Planlar', icon: 'card-outline', href: '/planlar' },
            { label: 'Ayarlar', icon: 'settings-outline', href: '/ayarlar' },
          ]}
        />
      </View>

      <Button
        label={demo ? 'Demodan çık' : 'Çıkış yap'}
        variant="secondary"
        style={{ marginTop: theme.space.xl }}
        onPress={() => void (demo ? stopDemo() : signOut())}
      />
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

export function MenuList({
  items,
}: {
  items: { label: string; icon: keyof typeof Ionicons.glyphMap; href: string }[];
}) {
  const router = useRouter();

  return (
    <View
      style={{
        borderRadius: theme.radius.md,
        borderWidth: 1,
        borderColor: theme.color.border,
        backgroundColor: theme.color.surface,
        overflow: 'hidden',
      }}
    >
      {items.map((item, index) => (
        <Pressable
          key={item.href}
          accessibilityRole="button"
          accessibilityLabel={item.label}
          onPress={() => router.push(item.href as never)}
          style={({ pressed }) => ({
            flexDirection: 'row',
            alignItems: 'center',
            gap: theme.space.md,
            minHeight: 52,
            paddingHorizontal: theme.space.lg,
            borderTopWidth: index === 0 ? 0 : 1,
            borderTopColor: theme.color.border,
            backgroundColor: pressed ? theme.color.surfaceRaised : 'transparent',
          })}
        >
          <Ionicons name={item.icon} size={19} color={theme.color.goldSoft} />
          <Txt variant="body" display={false} style={{ flex: 1 }}>
            {item.label}
          </Txt>
          <Ionicons name="chevron-forward" size={16} color={theme.color.textSecondary} />
        </Pressable>
      ))}
    </View>
  );
}
