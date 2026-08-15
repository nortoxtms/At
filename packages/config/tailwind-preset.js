/**
 * Shared Tailwind preset — spec §20.
 *
 * Consumed by both apps/web (Tailwind) and mobile (NativeWind), so the
 * palette, type scale and radii cannot drift between platforms. The values
 * come from packages/shared-types/src/tokens.ts; this file only maps them
 * onto Tailwind's config shape.
 */
const { spacing } = require('@only-horses/shared-types/tokens');

/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        /*
         * Spec v2.1 §20.1. Every colour resolves to a CSS variable so a utility
         * cannot drift from the token — mapping them to literal hex is what
         * shipped 1.27:1 text under the previous palette, because the
         * utilities never read the theme.
         *
         * `<alpha-value>` is what keeps `bg-surface/60` and `border-border/50`
         * working; a hex behind a variable cannot carry an opacity modifier.
         */
        bg: 'rgb(var(--bg-rgb) / <alpha-value>)',
        surface: {
          DEFAULT: 'rgb(var(--surface-rgb) / <alpha-value>)',
          raised: 'rgb(var(--surface-raised-rgb) / <alpha-value>)',
          input: 'rgb(var(--surface-input-rgb) / <alpha-value>)',
        },

        // §20.1: one accent. `gold` is the saturated mark, `soft` carries
        // actions, `muted` is for hairlines and disabled states.
        gold: {
          DEFAULT: 'rgb(var(--gold-rgb) / <alpha-value>)',
          soft: 'rgb(var(--gold-soft-rgb) / <alpha-value>)',
          muted: 'rgb(var(--gold-muted-rgb) / <alpha-value>)',
        },

        text: {
          primary: 'rgb(var(--text-primary-rgb) / <alpha-value>)',
          secondary: 'rgb(var(--text-secondary-rgb) / <alpha-value>)',
          muted: 'rgb(var(--text-muted-rgb) / <alpha-value>)',
          'on-gold': 'rgb(var(--text-on-gold-rgb) / <alpha-value>)',
        },

        border: {
          DEFAULT: 'rgba(var(--border-rgb) / 0.10)',
          strong: 'rgba(var(--border-rgb) / 0.18)',
        },

        success: 'rgb(var(--success-rgb) / <alpha-value>)',
        warning: 'rgb(var(--warning-rgb) / <alpha-value>)',
        danger: 'rgb(var(--danger-rgb) / <alpha-value>)',
        info: 'rgb(var(--info-rgb) / <alpha-value>)',

        // §20.1's light surfaces, for web long-form only.
        paper: {
          DEFAULT: 'rgb(var(--paper-rgb) / <alpha-value>)',
          text: 'rgb(var(--paper-text-rgb) / <alpha-value>)',
        },
      },
      fontFamily: {
        /*
         * §20.2. Cormorant Garamond carries the wordmark, screen titles, horse
         * names and prices; Inter carries every control and every line of body
         * copy. The variables are set by `next/font` in the root layout, which
         * self-hosts both faces and generates its own family names — the
         * literal names stay behind them so a surface that does not define the
         * variables still resolves something close.
         */
        display: ['var(--font-display)', 'Cormorant Garamond', 'Georgia', 'serif'],
        sans: ['var(--font-sans)', 'Inter', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        // §20.2's mobile scale, verbatim. `wordmark` and `screen-title` are
        // the two that carry tracking as part of their identity rather than as
        // a decision made at each call site.
        wordmark: ['1.5rem', { lineHeight: '1.75rem', letterSpacing: '0.18em' }],
        'screen-title': ['1.0625rem', { lineHeight: '1.375rem', letterSpacing: '0.12em' }],
        display: ['1.875rem', { lineHeight: '2.25rem' }],
        h1: ['1.5rem', { lineHeight: '1.875rem' }],
        h2: ['1.25rem', { lineHeight: '1.625rem' }],
        h3: ['1.0625rem', { lineHeight: '1.375rem' }],
        body: ['0.9375rem', { lineHeight: '1.375rem' }],
        small: ['0.8125rem', { lineHeight: '1.125rem' }],
        caption: ['0.75rem', { lineHeight: '1rem' }],
        label: ['0.6875rem', { lineHeight: '0.875rem', letterSpacing: '0.08em' }],
      },
      spacing: Object.fromEntries(
        Object.entries(spacing).map(([key, value]) => [key, `${value / 16}rem`]),
      ),
      // §20.3's radii, verbatim.
      borderRadius: {
        sm: '8px',
        md: '12px',
        lg: '16px',
        xl: '24px',
        full: '9999px',
      },
      /*
       * §20.3: on a dark ground, elevation comes from surface lightness, not
       * shadow. The only shadow in the system is the one a sheet casts over
       * the content it covers.
       */
      boxShadow: { sheet: '0 -8px 32px rgba(0,0,0,.45)' },
      aspectRatio: { card: '3 / 2', portrait: '4 / 5', hero: '16 / 9' },
    },
  },
  plugins: [],
};
