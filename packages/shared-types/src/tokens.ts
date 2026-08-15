/**
 * Design tokens — spec v2.1 §20.1.
 *
 * One file, consumed by the Tailwind preset (web) and by mobile. The app is
 * dark-first: a near-black warm charcoal ground with a single sand-gold
 * accent, so that photographs of horses are the brightest thing on screen.
 * That only holds if nothing else competes — hence exactly one accent hue,
 * with the status colours semantic rather than decorative.
 *
 * There is no light theme on mobile in v1. `paper` and `paperText` exist for
 * web long-form pages only (ADR-0009).
 */

export const colors = {
  // Surfaces
  bg: '#0E0C0A', // app background
  surface: '#17140F', // cards, sheets, inputs
  surfaceRaised: '#221D17', // elevated cards, chips, tab bar
  surfaceInput: '#1C1814',

  // Accent — sand gold, the only accent
  gold: '#C9A227', // saturated: small marks and focus
  goldSoft: '#D7B37E', // primary buttons, active tab, links
  goldMuted: '#8F7645', // disabled gold, hairlines

  // Text on dark
  textPrimary: '#F4EFE6',
  textSecondary: '#B9AE9E',
  textMuted: '#7E7466',
  textOnGold: '#17140F',

  // Lines
  border: 'rgba(244,239,230,.10)',
  borderStrong: 'rgba(244,239,230,.18)',

  // Semantic
  success: '#6E9A5F',
  warning: '#D9A441',
  danger: '#C2503F',
  info: '#6D8FA3',

  // Light surfaces — web long-form only
  paper: '#F7F2E8',
  paperText: '#17140F',
} as const;

/**
 * §20.1: photography always sits under this before text is placed on it.
 * Because the theme is dark, an image whose lower third is bright must be
 * rejected rather than dimmed further.
 */
export const overlayScrim =
  'linear-gradient(180deg, rgba(14,12,10,0) 0%, rgba(14,12,10,.92) 100%)';

export const spacing = {
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  6: 24,
  8: 32,
  12: 48,
  16: 64,
} as const;

export const radius = {
  sm: 6,
  md: 10, // images inside cards
  lg: 16, // cards
  xl: 24,
  full: 999,
} as const;

/** §20.3: one soft shadow only. No neumorphism, no glow. */
export const shadows = {
  card: '0 2px 8px rgba(23,19,15,.08)',
  sheet: '0 8px 24px rgba(23,19,15,.12)',
} as const;

/** §20.6 photography crops. */
export const aspectRatios = {
  portrait: 4 / 5,
  card: 3 / 2,
  hero: 16 / 9,
} as const;

/** Emitted into the web stylesheet as CSS custom properties (§20.1). */
export function cssVariables(palette: Record<string, string> = colors): string {
  const kebab = (key: string) => key.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
  return Object.entries(palette)
    .map(([key, value]) => `  --${kebab(key)}: ${value};`)
    .join('\n');
}
