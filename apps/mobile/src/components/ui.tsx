import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  TextInput,
  View,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';

import { Txt } from '@/components/Text';
import { theme } from '@/theme/tokens';

/** A surface card — §20.3's 12 pt radius on `--surface` with a hairline. */
export function Card({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return (
    <View
      style={[
        {
          backgroundColor: theme.color.surface,
          borderRadius: theme.radius.md,
          borderWidth: 1,
          borderColor: theme.color.border,
          padding: theme.space.lg,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

/**
 * A selectable chip — filters, disciplines, roles.
 *
 * Selected is a filled `--gold-soft` with ink text rather than a gold outline:
 * an outline-only selected state is a 1 pt difference, which on a phone in
 * daylight is not a difference at all.
 */
export function Chip({
  label,
  selected,
  onPress,
  icon,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  icon?: keyof typeof Ionicons.glyphMap;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        minHeight: 36,
        paddingHorizontal: theme.space.lg,
        borderRadius: theme.radius.full,
        backgroundColor: selected ? theme.color.goldSoft : theme.color.surfaceRaised,
        borderWidth: 1,
        borderColor: selected ? theme.color.goldSoft : theme.color.border,
        opacity: pressed ? 0.8 : 1,
      })}
    >
      {icon ? (
        <Ionicons
          name={icon}
          size={14}
          color={selected ? theme.color.textOnGold : theme.color.textSecondary}
        />
      ) : null}
      <Txt
        variant="small"
        display={false}
        color={selected ? theme.color.textOnGold : theme.color.textPrimary}
      >
        {label}
      </Txt>
    </Pressable>
  );
}

/**
 * A labelled text input on `--surface-input`.
 *
 * The label is passed to the control as well as drawn above it. React Native
 * has no `<label for>`, so a visual label is invisible to assistive tech —
 * every field in the app announced only its placeholder, which §18.3 does not
 * allow and which is also why an automated walk of the forms could not find
 * them by name. The error, when there is one, is announced with the field
 * rather than after it.
 */
export function Field({
  label,
  hint,
  error,
  style,
  ...rest
}: TextInputProps & { label: string; hint?: string; error?: string | null; style?: ViewStyle }) {
  return (
    <View style={[{ gap: 6 }, style]}>
      <Txt variant="label" uppercase color={theme.color.textSecondary} display={false}>
        {label}
      </Txt>
      <TextInput
        accessibilityLabel={label}
        accessibilityHint={error ?? hint}
        aria-label={label}
        aria-invalid={!!error}
        placeholderTextColor={theme.color.textMuted}
        {...rest}
        style={{
          minHeight: theme.metric.minTouchTarget,
          paddingHorizontal: theme.space.lg,
          paddingVertical: theme.space.md,
          borderRadius: theme.radius.md,
          backgroundColor: theme.color.surfaceInput,
          borderWidth: 1,
          borderColor: error ? theme.color.danger : theme.color.border,
          color: theme.color.textPrimary,
          fontFamily: 'Inter',
          fontSize: theme.type.body.fontSize,
        }}
      />
      {error ? (
        <Txt variant="caption" color={theme.color.danger} display={false}>
          {error}
        </Txt>
      ) : hint ? (
        <Txt variant="caption" color={theme.color.textSecondary} display={false}>
          {hint}
        </Txt>
      ) : null}
    </View>
  );
}

/**
 * §20.7: an empty state names what would go here and offers the action that
 * puts it there. It does not apologise, and it never says "no data".
 */
export function EmptyState({
  icon = 'sparkles-outline',
  title,
  body,
  action,
}: {
  icon?: keyof typeof Ionicons.glyphMap;
  title: string;
  body?: string;
  action?: ReactNode;
}) {
  return (
    <View style={{ alignItems: 'center', paddingVertical: theme.space.xxxl, gap: theme.space.md }}>
      <Ionicons name={icon} size={32} color={theme.color.goldMuted} />
      <Txt variant="h3" align="center">
        {title}
      </Txt>
      {body ? (
        <Txt variant="small" align="center" color={theme.color.textSecondary} display={false}>
          {body}
        </Txt>
      ) : null}
      {action}
    </View>
  );
}

export function Loading({ label = 'Yükleniyor' }: { label?: string }) {
  return (
    <View style={{ paddingVertical: theme.space.xxxl, alignItems: 'center', gap: theme.space.md }}>
      <ActivityIndicator color={theme.color.goldSoft} />
      <Txt variant="small" color={theme.color.textSecondary} display={false}>
        {label}
      </Txt>
    </View>
  );
}

/**
 * The banner that says the content on screen is a sample.
 *
 * §18.2 does not ask for this; honesty does. The app falls back to a bundled
 * dataset whenever the API is out of reach, and a fallback nobody can see is
 * one that will eventually be read as real inventory.
 */
export function DemoNotice({ style }: { style?: ViewStyle }) {
  return (
    <View
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.space.sm,
          paddingHorizontal: theme.space.md,
          paddingVertical: theme.space.sm,
          borderRadius: theme.radius.sm,
          backgroundColor: theme.color.surfaceRaised,
          borderWidth: 1,
          borderColor: theme.color.border,
        },
        style,
      ]}
    >
      <Ionicons name="information-circle-outline" size={16} color={theme.color.goldSoft} />
      <Txt variant="caption" color={theme.color.textSecondary} display={false} style={{ flex: 1 }}>
        Sunucuya ulaşılamadı — örnek veri gösteriliyor.
      </Txt>
    </View>
  );
}

/** A row with a label on the left and a value on the right. */
export function DataRow({ label, value }: { label: string; value: string }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: theme.space.lg,
        paddingVertical: theme.space.md,
      }}
    >
      <Txt variant="small" color={theme.color.textSecondary} display={false}>
        {label}
      </Txt>
      <Txt variant="small" display={false} style={{ flexShrink: 1, textAlign: 'right' }}>
        {value}
      </Txt>
    </View>
  );
}

/** A circular avatar with the initials fallback §18.2 asks for. */
export function Avatar({ name, size = 40 }: { name: string; size?: number }) {
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toLocaleUpperCase('tr'))
    .join('');

  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: theme.color.surfaceRaised,
        borderWidth: 1,
        borderColor: theme.color.borderStrong,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Txt variant="body" display color={theme.color.goldSoft} style={{ fontSize: size * 0.36 }}>
        {initials}
      </Txt>
    </View>
  );
}

/** A back chevron for stack screens, matching §20.3's 44 pt touch target. */
export function BackButton({ onPress, label }: { onPress: () => void; label?: string }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label ?? 'Geri'}
      onPress={onPress}
      hitSlop={12}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        minHeight: theme.metric.minTouchTarget,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <Ionicons name="chevron-back" size={22} color={theme.color.goldSoft} />
      {label ? (
        <Txt variant="small" color={theme.color.goldSoft} display={false}>
          {label}
        </Txt>
      ) : null}
    </Pressable>
  );
}
