import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, View } from 'react-native';

import { Txt } from '@/components/Text';
import { useSession } from '@/lib/session';
import { theme } from '@/theme/tokens';

/**
 * The line that says this is a demo.
 *
 * Rendered above every screen rather than on the ones that happen to remember
 * it. The failure it prevents is specific and has happened to other people:
 * someone lists a horse in a demo, expects enquiries, and gets none — because
 * nothing ever left the phone. One persistent line is cheap; that
 * misunderstanding is not.
 *
 * It is a strip, not a modal. A demo you have to dismiss a dialog to use is a
 * demo people close.
 */
export function DemoBar() {
  const { demo } = useSession();
  const router = useRouter();

  if (!demo) return null;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Demo modu — ayrıntılar"
      onPress={() => router.push('/demo')}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.space.sm,
        paddingHorizontal: theme.screenPadding,
        paddingVertical: 6,
        backgroundColor: theme.color.goldMuted,
      }}
    >
      <Ionicons name="flask-outline" size={13} color={theme.color.textOnGold} />
      <Txt variant="caption" display={false} color={theme.color.textOnGold} style={{ flex: 1 }}>
        Demo modu — her şey telefonunda, sunucuya hiçbir şey gitmiyor
      </Txt>
      <Ionicons name="chevron-forward" size={13} color={theme.color.textOnGold} />
    </Pressable>
  );
}
