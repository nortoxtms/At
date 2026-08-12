import { tokens } from '@only-horses/shared-types';

/**
 * Mobile theme — spec §20.
 *
 * Derived from the shared token file rather than restated, which is one of
 * the reasons ADR-0002 chose React Native: on Flutter this would be a
 * hand-mirrored Dart file that drifts the first time a colour changes.
 */
export const theme = {
  colors: tokens.colors,
  darkColors: tokens.darkColors,
  spacing: tokens.spacing,
  radius: tokens.radius,

  // §20.2 mobile scale, as [fontSize, lineHeight] pairs.
  type: {
    display: { fontSize: 32, lineHeight: 38, fontFamily: 'Fraunces', letterSpacing: -0.64 },
    h1: { fontSize: 26, lineHeight: 32, fontFamily: 'Fraunces', letterSpacing: -0.52 },
    h2: { fontSize: 21, lineHeight: 28, fontFamily: 'Fraunces', letterSpacing: -0.42 },
    h3: { fontSize: 18, lineHeight: 24, fontFamily: 'Inter-SemiBold' },
    body: { fontSize: 16, lineHeight: 24, fontFamily: 'Inter' },
    small: { fontSize: 14, lineHeight: 20, fontFamily: 'Inter' },
    caption: { fontSize: 12, lineHeight: 16, fontFamily: 'Inter' },
    label: {
      fontSize: 11,
      lineHeight: 14,
      fontFamily: 'Inter-Medium',
      letterSpacing: 0.88,
      textTransform: 'uppercase' as const,
    },
  },

  // §20.3: one soft shadow only.
  shadow: {
    card: {
      shadowColor: tokens.colors.ink,
      shadowOpacity: 0.08,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 2 },
      elevation: 2,
    },
    sheet: {
      shadowColor: tokens.colors.ink,
      shadowOpacity: 0.12,
      shadowRadius: 24,
      shadowOffset: { width: 0, height: 8 },
      elevation: 8,
    },
  },

  /** §18.3: minimum touch target is 44×44. */
  minTouchTarget: 44,
} as const;

export type Theme = typeof theme;
