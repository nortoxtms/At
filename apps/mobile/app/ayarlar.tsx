import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { Txt } from '@/components/Text';
import { BackButton, Card, Field } from '@/components/ui';
import { api, API_URL } from '@/lib/api';
import { useSession } from '@/lib/session';
import { theme } from '@/theme/tokens';

/**
 * S25 — settings.
 *
 * §21's notification switches, §15's language, and the two destructive actions
 * kept apart from everything else: sign out is ordinary, deleting the account
 * is not, and putting them in the same list is how people press the wrong one.
 *
 * Deletion says what happens to the horse records, because §6 does not delete
 * them — the identity record survives the account that created it, and a
 * person deserves to know that before pressing rather than after.
 */
const NOTIFICATIONS: { id: string; label: string; body: string }[] = [
  { id: 'messages', label: 'Mesajlar', body: 'Biri sana yazdığında' },
  { id: 'listing', label: 'İlan hareketleri', body: 'İlanın yayına girdi, süresi doluyor' },
  { id: 'reminders', label: 'Bakım hatırlatmaları', body: 'Aşı, nal, diş zamanı geldiğinde' },
  { id: 'matches', label: 'Yeni eşleşmeler', body: 'Aramanla eşleşen yeni ilan çıktığında' },
];

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { me, signOut, refreshMe } = useSession();

  const [enabled, setEnabled] = useState<string[]>(['messages', 'listing', 'reminders']);
  const [displayName, setDisplayName] = useState(me?.displayName ?? '');
  const [city, setCity] = useState(me?.city ?? '');
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const save = async () => {
    setSaving(true);
    await api('/me', {
      method: 'PATCH',
      body: JSON.stringify({ displayName: displayName.trim(), city: city.trim() || null }),
    });
    await refreshMe();
    setSaving(false);
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.color.bg }}
      contentContainerStyle={{
        paddingTop: insets.top,
        paddingHorizontal: theme.screenPadding,
        paddingBottom: theme.space.xxxl,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <BackButton onPress={() => router.back()} />
        <Txt variant="screenTitle" uppercase>
          Ayarlar
        </Txt>
        <View style={{ width: theme.metric.minTouchTarget }} />
      </View>

      {me ? (
        <View style={{ gap: theme.space.lg, marginTop: theme.space.xl }}>
          <Txt variant="h2">Profil</Txt>
          <Field label="Görünen ad" value={displayName} onChangeText={setDisplayName} />
          <Field label="Şehir" value={city} onChangeText={setCity} placeholder="İstanbul" />
          <Button label="Kaydet" onPress={() => void save()} loading={saving} />
        </View>
      ) : null}

      <View style={{ gap: theme.space.md, marginTop: theme.space.xxl }}>
        <Txt variant="h2">Bildirimler</Txt>
        {NOTIFICATIONS.map((item) => {
          const on = enabled.includes(item.id);

          return (
            <Pressable
              key={item.id}
              accessibilityRole="switch"
              accessibilityState={{ checked: on }}
              accessibilityLabel={item.label}
              onPress={() =>
                setEnabled((current) =>
                  on ? current.filter((value) => value !== item.id) : [...current, item.id],
                )
              }
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: theme.space.md,
                paddingVertical: theme.space.md,
                minHeight: theme.metric.minTouchTarget,
              }}
            >
              <View style={{ flex: 1, gap: 2 }}>
                <Txt variant="body" display={false}>
                  {item.label}
                </Txt>
                <Txt variant="caption" color={theme.color.textSecondary} display={false}>
                  {item.body}
                </Txt>
              </View>

              <View
                style={{
                  width: 46,
                  height: 28,
                  borderRadius: 14,
                  padding: 3,
                  backgroundColor: on ? theme.color.goldSoft : theme.color.surfaceRaised,
                  borderWidth: 1,
                  borderColor: on ? theme.color.goldSoft : theme.color.border,
                  alignItems: on ? 'flex-end' : 'flex-start',
                }}
              >
                <View
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: 10,
                    backgroundColor: on ? theme.color.textOnGold : theme.color.textSecondary,
                  }}
                />
              </View>
            </Pressable>
          );
        })}
      </View>

      <View style={{ gap: theme.space.md, marginTop: theme.space.xxl }}>
        <Txt variant="h2">Uygulama</Txt>
        <Card>
          <Txt variant="small" color={theme.color.textSecondary} display={false}>
            Sunucu: {API_URL}
          </Txt>
          <Txt variant="small" color={theme.color.textSecondary} display={false}>
            Dil: Türkçe (§15 — İngilizce yakında)
          </Txt>
        </Card>
      </View>

      {me ? (
        <View style={{ gap: theme.space.md, marginTop: theme.space.xxl }}>
          <Button label="Çıkış yap" variant="secondary" onPress={() => void signOut()} />

          {confirming ? (
            <Card style={{ gap: theme.space.md, borderColor: theme.color.danger }}>
              <Txt variant="h3">Hesabı silmek üzeresin</Txt>
              <Txt variant="small" color={theme.color.textSecondary} display={false}>
                İlanların kapatılır ve profilin kaldırılır. Atların kaydı silinmez —
                §6 gereği kimlik kaydı onu oluşturan hesaptan bağımsızdır ve at el
                değiştirse bile geçmişi korunur. Sahiplik satırında adın kalır.
              </Txt>
              <View style={{ flexDirection: 'row', gap: theme.space.md }}>
                <Button
                  label="Vazgeç"
                  variant="secondary"
                  full={false}
                  style={{ flex: 1 }}
                  onPress={() => setConfirming(false)}
                />
                <Button
                  label="Sil"
                  variant="danger"
                  full={false}
                  style={{ flex: 1 }}
                  onPress={async () => {
                    await api('/me', { method: 'DELETE' });
                    await signOut();
                    router.replace('/(tabs)');
                  }}
                />
              </View>
            </Card>
          ) : (
            <Pressable
              accessibilityRole="button"
              onPress={() => setConfirming(true)}
              style={{ minHeight: theme.metric.minTouchTarget, justifyContent: 'center', alignItems: 'center' }}
            >
              <Txt variant="small" color={theme.color.danger} display={false}>
                Hesabımı sil
              </Txt>
            </Pressable>
          )}
        </View>
      ) : null}
    </ScrollView>
  );
}
