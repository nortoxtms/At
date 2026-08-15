import { Ionicons } from '@expo/vector-icons';
import type { RoleType } from '@only-horses/shared-types';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { Txt } from '@/components/Text';
import { api } from '@/lib/api';
import { ROLE_OPTIONS } from '@/lib/endpoints';
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
 *
 * The API takes one role per POST rather than a list, so this sends N requests
 * and does not stop at the first failure: a role that collides with one the
 * account already has must not silently discard the four after it.
 */
const ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  horse_owner: 'ribbon-outline',
  rider: 'walk-outline',
  trainer: 'school-outline',
  instructor: 'megaphone-outline',
  breeder: 'leaf-outline',
  veterinarian: 'medkit-outline',
  farrier: 'hammer-outline',
  groom: 'basket-outline',
  transporter: 'bus-outline',
  equine_therapist: 'fitness-outline',
  ranch_manager: 'business-outline',
  agent: 'briefcase-outline',
};

export default function RolePicker() {
  const router = useRouter();
  const { refreshMe } = useSession();
  const [selected, setSelected] = useState<RoleType[]>([]);
  const [busy, setBusy] = useState(false);

  const toggle = (id: RoleType) =>
    setSelected((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
    );

  const save = async () => {
    setBusy(true);

    await Promise.all(
      selected.map((role) => api('/me/roles', { method: 'POST', body: JSON.stringify({ role }) })),
    );

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
        {ROLE_OPTIONS.map((role) => {
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
                name={ICONS[role.id] ?? 'ellipse-outline'}
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
