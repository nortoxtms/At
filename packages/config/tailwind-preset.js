/**
 * Shared Tailwind preset — spec §20.
 *
 * Consumed by both apps/web (Tailwind) and mobile (NativeWind), so the
 * palette, type scale and radii cannot drift between platforms. The values
 * come from packages/shared-types/src/tokens.ts; this file only maps them
 * onto Tailwind's config shape.
 */
const { colors, radius, spacing, shadows, letterSpacing } = require('@only-horses/shared-types/tokens');

/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        ink: colors.ink,
        leather: { DEFAULT: colors.leather, deep: colors.leatherDeep },
        // §20: the accent is burnished brass. Not terracotta — that
        // substitution is what makes an equestrian product read as a generic
        // warm-neutral template.
        brass: { DEFAULT: colors.brass, light: colors.brassLight },
        sand: colors.sand,
        cream: colors.cream,
        paper: colors.paper,
        success: colors.success,
        warning: colors.warning,
        danger: colors.danger,
        info: colors.info,
        border: { DEFAULT: colors.border, strong: colors.borderStrong },
        text: {
          primary: colors.textPrimary,
          secondary: colors.textSecondary,
          muted: colors.textMuted,
          inverse: colors.textInverse,
        },
      },
      fontFamily: {
        // §20.2: Fraunces is reserved for H1/H2, prices and horse names.
        display: ['Fraunces', 'Georgia', 'serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        display: ['2rem', { lineHeight: '2.375rem', letterSpacing: letterSpacing.display }],
        h1: ['1.625rem', { lineHeight: '2rem', letterSpacing: letterSpacing.display }],
        h2: ['1.3125rem', { lineHeight: '1.75rem', letterSpacing: letterSpacing.display }],
        h3: ['1.125rem', { lineHeight: '1.5rem' }],
        body: ['1rem', { lineHeight: '1.5rem' }],
        small: ['0.875rem', { lineHeight: '1.25rem' }],
        caption: ['0.75rem', { lineHeight: '1rem' }],
        label: ['0.6875rem', { lineHeight: '0.875rem', letterSpacing: letterSpacing.label }],
      },
      spacing: Object.fromEntries(
        Object.entries(spacing).map(([key, value]) => [key, `${value / 16}rem`]),
      ),
      borderRadius: {
        sm: `${radius.sm}px`,
        md: `${radius.md}px`,
        lg: `${radius.lg}px`,
        xl: `${radius.xl}px`,
        full: '9999px',
      },
      // §20.3: one soft shadow only. No neumorphism, no glow.
      boxShadow: { card: shadows.card, sheet: shadows.sheet },
      aspectRatio: { card: '3 / 2', portrait: '4 / 5', hero: '16 / 9' },
    },
  },
  plugins: [],
};
