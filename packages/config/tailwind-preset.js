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
        // Pigments — the same colour in both themes.
        ink: colors.ink,
        leather: { DEFAULT: colors.leather, deep: colors.leatherDeep },
        cream: colors.cream,
        success: colors.success,
        warning: colors.warning,
        danger: colors.danger,
        info: colors.info,

        /*
         * Roles — resolved from the CSS variables in apps/web's globals.css so
         * they follow the theme.
         *
         * These used to be literal hex values from tokens.ts, which meant
         * `bg-sand` compiled to a fixed light colour while the dark theme
         * switched body text to cream. Every sand-backed block rendered
         * invisible text, and no amount of editing the CSS variables could fix
         * it, because the utilities never read them.
         *
         * The `<alpha-value>` placeholder is what keeps `bg-sand/40` and
         * `border-border/60` working; a hex value cannot carry an opacity
         * modifier through a variable.
         */
        // §20: the accent is burnished brass. Not terracotta — that
        // substitution is what makes an equestrian product read as a generic
        // warm-neutral template.
        brass: {
          DEFAULT: 'rgb(var(--brass-rgb) / <alpha-value>)',
          light: colors.brassLight,
          // For words rather than rules: brass is too light to read on paper.
          text: 'rgb(var(--brass-text-rgb) / <alpha-value>)',
        },
        sand: 'rgb(var(--sand-rgb) / <alpha-value>)',
        paper: 'rgb(var(--paper-rgb) / <alpha-value>)',
        surface: 'rgb(var(--surface-rgb) / <alpha-value>)',
        border: {
          DEFAULT: 'rgb(var(--border-rgb) / <alpha-value>)',
          strong: 'rgb(var(--border-strong-rgb) / <alpha-value>)',
        },
        text: {
          primary: 'rgb(var(--text-primary-rgb) / <alpha-value>)',
          secondary: 'rgb(var(--text-secondary-rgb) / <alpha-value>)',
          muted: 'rgb(var(--text-muted-rgb) / <alpha-value>)',
          inverse: 'rgb(var(--text-inverse-rgb) / <alpha-value>)',
          // The status hues, legible as words in both themes. The pigments
          // above stay available for fills and rules.
          success: 'rgb(var(--success-text-rgb) / <alpha-value>)',
          warning: 'rgb(var(--warning-text-rgb) / <alpha-value>)',
          danger: 'rgb(var(--danger-text-rgb) / <alpha-value>)',
          info: 'rgb(var(--info-text-rgb) / <alpha-value>)',
          leather: 'rgb(var(--leather-text-rgb) / <alpha-value>)',
        },
      },
      fontFamily: {
        // §20.2: Fraunces is reserved for H1/H2, prices and horse names.
        //
        // The variables are set by `next/font` in the web app's root layout,
        // which self-hosts the files and generates its own family names. The
        // literal names stay behind them so any surface that does not define
        // the variables — a plain HTML template, an OG image — still resolves
        // the right face.
        display: ['var(--font-display)', 'Fraunces', 'Georgia', 'serif'],
        sans: ['var(--font-sans)', 'Inter', 'system-ui', 'sans-serif'],
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
