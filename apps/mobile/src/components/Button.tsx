import { ActivityIndicator, Pressable, View, type ViewStyle } from 'react-native';

import { Txt } from '@/components/Text';
import { theme } from '@/theme/tokens';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

/**
 * §20.5's buttons.
 *
 * Primary is `--gold-soft` with ink text — the one saturated thing on a screen,
 * so there is at most one per view. Secondary is a hairline outline; ghost is
 * text alone. Disabled drops to `--gold-muted` rather than fading the whole
 * control, because a 40 %-opacity gold on near-black falls below the contrast
 * floor §18.3 sets.
 */
export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled,
  loading,
  full = true,
  style,
}: {
  label: string;
  onPress?: () => void;
  variant?: Variant;
  disabled?: boolean;
  loading?: boolean;
  full?: boolean;
  style?: ViewStyle;
}) {
  const inactive = disabled || loading;

  // A disabled primary was ink on `--gold-muted`, which measures 4.24:1 —
  // under §18.3's 4.5:1 floor, and "disabled" is not an exemption: the label
  // on a blocked button is precisely the text a person needs to read to
  // understand why they are stuck. So it drops to the raised surface with
  // secondary text (7.2:1) and keeps the gold only as a hairline, which reads
  // as inactive without becoming unreadable.
  const background =
    variant === 'primary'
      ? inactive
        ? theme.color.surfaceRaised
        : theme.color.goldSoft
      : variant === 'danger'
        ? theme.color.danger
        : 'transparent';

  const label_color =
    variant === 'primary'
      ? inactive
        ? theme.color.textSecondary
        : theme.color.textOnGold
      : variant === 'danger'
        ? theme.color.textPrimary
        : inactive
          ? theme.color.textSecondary
          : theme.color.goldSoft;

  const borderColor =
    variant === 'primary' && inactive ? theme.color.goldMuted : theme.color.borderStrong;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!inactive }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [
        {
          minHeight: theme.metric.minTouchTarget + 8,
          alignSelf: full ? 'stretch' : 'flex-start',
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'row',
          gap: theme.space.sm,
          paddingHorizontal: theme.space.xl,
          borderRadius: theme.radius.md,
          backgroundColor: background,
          borderWidth: variant === 'secondary' || (variant === 'primary' && inactive) ? 1 : 0,
          borderColor,
          opacity: pressed ? 0.85 : 1,
        },
        style,
      ]}
    >
      {loading ? <ActivityIndicator size="small" color={label_color} /> : null}
      <Txt variant="body" weight="semibold" color={label_color} display={false}>
        {label}
      </Txt>
    </Pressable>
  );
}

/** A hairline rule at `--border`, used between rows and above the tab bar. */
export function Hairline({ style }: { style?: ViewStyle }) {
  return (
    <View style={[{ height: 1, backgroundColor: theme.color.border, width: '100%' }, style]} />
  );
}
