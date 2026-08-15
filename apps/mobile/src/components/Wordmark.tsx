import { View } from 'react-native';

import { Txt } from '@/components/Text';
import { theme } from '@/theme/tokens';

/**
 * The wordmark — §20.2, and screen 1 of the approved mockup.
 *
 * Stacked, not inline: "ONLY" over "HORSES", uppercase, Cormorant Garamond,
 * +0.18em tracking. The stacking is the mark; setting it on one line reads as
 * a page heading rather than an identity.
 */
export function Wordmark({
  size = 'medium',
  color = theme.color.textPrimary,
}: {
  size?: 'small' | 'medium' | 'large';
  color?: string;
}) {
  const fontSize = size === 'large' ? 40 : size === 'medium' ? 24 : 17;

  return (
    <View style={{ alignItems: 'center' }}>
      {['ONLY', 'HORSES'].map((word) => (
        <Txt
          key={word}
          variant="wordmark"
          color={color}
          style={{
            fontSize,
            lineHeight: fontSize * 1.15,
            letterSpacing: fontSize * 0.18,
            // Tracking is applied to the right of every glyph including the
            // last, which pushes a centred word off-centre by half a step.
            marginLeft: fontSize * 0.18,
          }}
        >
          {word}
        </Txt>
      ))}
    </View>
  );
}
