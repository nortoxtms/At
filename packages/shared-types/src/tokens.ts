/**
 * Design tokens — spec §20.
 *
 * One file, consumed by the Tailwind preset (web) and the NativeWind preset
 * (mobile). §20 is emphatic that the accent is burnished brass, not
 * terracotta: "that is where the premium, not cheap classifieds read comes
 * from". Keeping the palette in code rather than duplicated per platform is
 * what stops that drifting.
 */

export const colors = {
  // Core
  ink: '#17130F', // near-black brown — hero/nav surface
  leather: '#4A2F1D', // saddle leather — primary brand
  leatherDeep: '#33200F',
  brass: '#B4832F', // accent: buckles, bits, stirrup hardware
  brassLight: '#D9AD5C',
  sand: '#E4D7C2', // arena footing
  cream: '#F7F2E8', // page background
  paper: '#FFFFFF',

  // Semantic
  success: '#4A6B45', // pasture green
  warning: '#C2761E',
  danger: '#9B2C1F',
  info: '#3C5A6B',

  // Text
  textPrimary: '#17130F',
  textSecondary: '#5C5147',
  textMuted: '#8A7D70',
  textInverse: '#F7F2E8',

  // Lines
  border: '#DCD0BC',
  borderStrong: '#B9A88E',
} as const;

/** §20.1: dark mode is ink ground, cream text, brass-light accent, 12% white borders. */
export const darkColors = {
  ...colors,
  background: colors.ink,
  paper: '#221C17',
  textPrimary: colors.cream,
  textSecondary: '#C4B8A8',
  textMuted: '#8A7D70',
  textInverse: colors.ink,
  brass: colors.brassLight,
  border: 'rgba(255,255,255,0.12)',
  borderStrong: 'rgba(255,255,255,0.20)',
} as const;

/** §20.2 — Fraunces is reserved for H1/H2, prices and horse names. */
export const fonts = {
  display: 'Fraunces',
  body: 'Inter',
} as const;

/** §20.2 mobile scale: [fontSize, lineHeight] in px. */
export const typeScale = {
  display: [32, 38],
  h1: [26, 32],
  h2: [21, 28],
  h3: [18, 24],
  body: [16, 24],
  small: [14, 20],
  caption: [12, 16],
  label: [11, 14],
} as const;

export const letterSpacing = {
  display: '-0.02em', // §20.2 tight tracking on Fraunces
  label: '0.08em', // §20.2 uppercase labels
} as const;

/** §20.3 — 4-pt base. */
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
