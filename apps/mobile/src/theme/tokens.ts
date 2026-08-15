import { colors, overlayScrim } from '@only-horses/shared-types/tokens';

/**
 * §20's tokens, as React Native values.
 *
 * Imported from `packages/shared-types` rather than restated here, which is
 * the whole reason that package exists: web and mobile must not be able to
 * drift on the palette. When §20.1 changes, both platforms change with it.
 *
 * React Native has no CSS variables and no media queries, so the dark-first
 * decision in §20 arrives here as a simple fact — there is one theme, and
 * these are its values.
 */
export const theme = {
  color: colors,
  scrim: overlayScrim,

  /** §20.3: 4-pt base. Screen horizontal padding is 16. */
  space: { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48, huge: 64 },
  screenPadding: 16,

  /** §20.3's radii. */
  radius: { sm: 8, md: 12, lg: 16, xl: 24, full: 999 },

  /**
   * §20.2's mobile scale, verbatim. `tracking` is letter-spacing in points,
   * because React Native takes an absolute value rather than an em.
   */
  type: {
    wordmark: { fontSize: 24, lineHeight: 28, tracking: 24 * 0.18 },
    screenTitle: { fontSize: 17, lineHeight: 22, tracking: 17 * 0.12 },
    display: { fontSize: 30, lineHeight: 36, tracking: 0 },
    h1: { fontSize: 24, lineHeight: 30, tracking: 0 },
    h2: { fontSize: 20, lineHeight: 26, tracking: 0 },
    h3: { fontSize: 17, lineHeight: 22, tracking: 0 },
    body: { fontSize: 15, lineHeight: 22, tracking: 0 },
    small: { fontSize: 13, lineHeight: 18, tracking: 0 },
    caption: { fontSize: 12, lineHeight: 16, tracking: 0 },
    label: { fontSize: 11, lineHeight: 14, tracking: 11 * 0.08 },
  },

  /**
   * §20.3a's measurements, taken from the approved mockup so a component
   * cannot quietly drift from the drawing.
   */
  metric: {
    tabBarHeight: 64,
    tabPlusSize: 52,
    tabPlusLift: 12,
    listRowHeight: 96,
    listRowThumb: 88,
    avatarProfile: 88,
    categoryTile: 64,
    filterRowHeight: 56,
    minTouchTarget: 44,
  },
} as const;

/**
 * §20.2: Cormorant Garamond for the wordmark, screen titles, horse names and
 * prices; Inter everywhere else. The families are loaded in the root layout;
 * these are the names they are registered under.
 */
export const fonts = {
  display: 'CormorantGaramond',
  displaySemibold: 'CormorantGaramond-SemiBold',
  body: 'Inter',
  bodyMedium: 'Inter-Medium',
  bodySemibold: 'Inter-SemiBold',
} as const;
