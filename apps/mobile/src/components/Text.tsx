import { Text as RNText, type TextProps, type TextStyle } from 'react-native';

import { fonts, theme } from '@/theme/tokens';

type Variant = keyof typeof theme.type;

/**
 * Every piece of text in the app goes through here.
 *
 * React Native has no cascade: a bare `<Text>` is 14 pt system font in black,
 * which on a #0E0C0A ground is invisible. That is not a hypothetical — it is
 * exactly the failure the web side shipped and had to be caught by a contrast
 * audit. So the app has no bare `<Text>`; picking a §20.2 variant is the only
 * way to render a glyph, and the variant carries its family, size, tracking
 * and a legible default colour together.
 */
export interface TxtProps extends TextProps {
  variant?: Variant;
  color?: string;
  /** §20.2: Cormorant Garamond for horse names, prices and titles. */
  display?: boolean;
  weight?: 'regular' | 'medium' | 'semibold';
  uppercase?: boolean;
  align?: TextStyle['textAlign'];
}

const DISPLAY_VARIANTS: Variant[] = ['wordmark', 'screenTitle', 'display', 'h1', 'h2'];

export function Txt({
  variant = 'body',
  color,
  display,
  weight = 'regular',
  uppercase,
  align,
  style,
  children,
  ...rest
}: TxtProps) {
  const scale = theme.type[variant];
  const isDisplay = display ?? DISPLAY_VARIANTS.includes(variant);

  const family = isDisplay
    ? weight === 'regular'
      ? fonts.display
      : fonts.displaySemibold
    : weight === 'semibold'
      ? fonts.bodySemibold
      : weight === 'medium'
        ? fonts.bodyMedium
        : fonts.body;

  return (
    <RNText
      style={[
        {
          fontFamily: family,
          fontSize: scale.fontSize,
          lineHeight: scale.lineHeight,
          letterSpacing: scale.tracking,
          color: color ?? theme.color.textPrimary,
          textAlign: align,
          textTransform: uppercase ? 'uppercase' : undefined,
        },
        style,
      ]}
      {...rest}
    >
      {children}
    </RNText>
  );
}
