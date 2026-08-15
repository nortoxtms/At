import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { Txt } from '@/components/Text';
import { BackButton, Chip } from '@/components/ui';
import { theme } from '@/theme/tokens';

/**
 * The shell both wizards run in (§18.2 S10, S13).
 *
 * Progress is a filled bar with "adım n / m" beside it, not dots. Dots stop
 * being countable past four, and both of these wizards have five steps.
 *
 * "Devam" is disabled rather than hidden when the step is incomplete, and the
 * step says what is missing. A button that vanishes leaves the person hunting
 * for what they did wrong on a form they believe they filled in.
 */
export function Wizard({
  title,
  step,
  total,
  stepTitle,
  stepBody,
  canContinue,
  continueLabel = 'Devam',
  busy,
  onBack,
  onContinue,
  children,
}: {
  title: string;
  step: number;
  total: number;
  stepTitle: string;
  stepBody?: string;
  canContinue: boolean;
  continueLabel?: string;
  busy?: boolean;
  onBack: () => void;
  onContinue: () => void;
  children: ReactNode;
}) {
  const insets = useSafeAreaInsets();

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1, backgroundColor: theme.color.bg, paddingTop: insets.top }}
    >
      <View
        style={{
          paddingHorizontal: theme.screenPadding,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <BackButton onPress={onBack} />
        <Txt variant="screenTitle" uppercase>
          {title}
        </Txt>
        <View style={{ width: theme.metric.minTouchTarget }} />
      </View>

      <View
        style={{
          paddingHorizontal: theme.screenPadding,
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.space.md,
          paddingVertical: theme.space.md,
        }}
      >
        <View
          style={{
            flex: 1,
            height: 3,
            borderRadius: 2,
            backgroundColor: theme.color.surfaceRaised,
            overflow: 'hidden',
          }}
        >
          <View
            style={{
              width: `${(step / total) * 100}%`,
              height: '100%',
              backgroundColor: theme.color.goldSoft,
            }}
          />
        </View>
        <Txt variant="caption" color={theme.color.textSecondary} display={false}>
          adım {step} / {total}
        </Txt>
      </View>

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: theme.screenPadding,
          paddingBottom: theme.space.xxxl,
          gap: theme.space.lg,
        }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={{ gap: 4, paddingTop: theme.space.lg }}>
          <Txt variant="h1">{stepTitle}</Txt>
          {stepBody ? (
            <Txt variant="small" color={theme.color.textSecondary} display={false}>
              {stepBody}
            </Txt>
          ) : null}
        </View>

        {children}
      </ScrollView>

      <View
        style={{
          paddingHorizontal: theme.screenPadding,
          paddingTop: theme.space.md,
          paddingBottom: insets.bottom + theme.space.md,
          borderTopWidth: 1,
          borderTopColor: theme.color.border,
          backgroundColor: theme.color.surfaceRaised,
        }}
      >
        <Button
          label={continueLabel}
          onPress={onContinue}
          disabled={!canContinue}
          loading={busy}
        />
      </View>
    </KeyboardAvoidingView>
  );
}

/** A group of chips that behaves like a radio set. */
export function Choice<T extends string>({
  label,
  options,
  value,
  onChange,
  render,
}: {
  label: string;
  options: readonly T[];
  value: T | null;
  onChange: (next: T) => void;
  render?: (option: T) => string;
}) {
  return (
    <View style={{ gap: theme.space.md }}>
      <Txt variant="label" uppercase color={theme.color.textSecondary} display={false}>
        {label}
      </Txt>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.sm }}>
        {options.map((option) => (
          <Chip
            key={option}
            label={render?.(option) ?? option}
            selected={value === option}
            onPress={() => onChange(option)}
          />
        ))}
      </View>
    </View>
  );
}
