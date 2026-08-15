import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { Txt } from '@/components/Text';
import { api } from '@/lib/api';
import { useSession } from '@/lib/session';
import { theme } from '@/theme/tokens';

/**
 * S04 — What do you do with horses?
 *
 * Multi-select, because §3.1's roles are not exclusive and the common case is
 * two: an owner who also rides, a trainer who also sells. A radio list here
 * would force a false answer on the majority of the market.
 *
 * Nothing is gated on the answer — §3.3's permissions come from verification,
 * not from a self-declared role. This shapes what the app shows first, and it
 * is skippable for exactly that reason.
 */
const ROLES: { id: string; label: string; body: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { id: 'owner', label: 'At sahibi', body: 'Bir ya da daha fazla atım var', icon: 'ribbon-outline' },
  { id: 'rider', label: 'Binici', body: 'Biniyorum, yarışıyorum', icon: 'walk-outline' },
  { id: 'trainer', label: 'Eğitmen', body: 'At ve binici eğitiyorum', icon: 'school-outline' },
  { id: 'breeder', label: 'Yetiştirici', body: 'Damızlık ve tay yetiştiriyorum', icon: 'leaf-outline' },
  { id: 'vet', label: 'Veteriner', body: 'Sağlık hizmeti veriyorum', icon: 'medkit-outline' },
  { id: 'farrier', label: 'Nalbant', body: 'Nal ve tırnak bakımı', icon: 'hammer-outline' },
  { id: 'stable', label: 'İşletme', body: 'Ahır, tesis ya da kulüp', icon: 'business-outline' },
  { id: 'buyer', label: 'Alıcı', body: 'At arıyorum', icon: 'search-outline' },
];

export default function RolePicker() {
  const router = useRouter();
  const { refreshMe } = useSession();
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const toggle = (id: string) =>
    setSelected((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
    );

  const save = async () => {
    setBusy(true);
    // A failure here is not worth blocking on: the roles are a hint, and the
    // account is already created. Log the person in either way.
    await api('/me/roles', { method: 'PUT', body: JSON.stringify({ roles: selected }) });
    await refreshMe();
    setBusy(false);
    router.replace('/(tabs)');
  };

  return (
    <Screen scroll>
      <View style={{ paddingTop: theme.space.xxl, gap: theme.space.sm }}>
        <Txt variant="display">Atlarla ne yapıyorsun?</Txt>
        <Txt variant="body" color={theme.color.textSecondary} display={false}>
          Birden fazla seçebilirsin. Bu, uygulamanın sana ne göstereceğini belirler —
          ne yapabileceğini değil.
        </Txt>
      </View>

      <View style={{ gap: theme.space.md, marginTop: theme.space.xl }}>
        {ROLES.map((role) => {
          const on = selected.includes(role.id);

          return (
            <Pressable
              key={role.id}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on }}
              accessibilityLabel={role.label}
              onPress={() => toggle(role.id)}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: theme.space.lg,
                padding: theme.space.lg,
                borderRadius: theme.radius.md,
                backgroundColor: on ? theme.color.surfaceRaised : theme.color.surface,
                borderWidth: 1,
                borderColor: on ? theme.color.goldSoft : theme.color.border,
                opacity: pressed ? 0.85 : 1,
              })}
            >
              <Ionicons
                name={role.icon}
                size={22}
                color={on ? theme.color.goldSoft : theme.color.textSecondary}
              />

              <View style={{ flex: 1, gap: 2 }}>
                <Txt variant="h3">{role.label}</Txt>
                <Txt variant="small" color={theme.color.textSecondary} display={false}>
                  {role.body}
                </Txt>
              </View>

              <Ionicons
                name={on ? 'checkmark-circle' : 'ellipse-outline'}
                size={22}
                color={on ? theme.color.goldSoft : theme.color.textSecondary}
              />
            </Pressable>
          );
        })}
      </View>

      <View style={{ gap: theme.space.md, marginVertical: theme.space.xxl }}>
        <Button
          label="Devam"
          onPress={() => void save()}
          disabled={selected.length === 0}
          loading={busy}
        />
        <Button label="Şimdilik geç" variant="ghost" onPress={() => router.replace('/(tabs)')} />
      </View>
    </Screen>
  );
}
