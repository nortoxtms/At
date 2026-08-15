import type { ReactNode } from 'react';
import { View } from 'react-native';

import { Txt } from '@/components/Text';
import { theme } from '@/theme/tokens';

/**
 * The screen title bar.
 *
 * Hand-rolled rather than the navigator's, because §20.2 asks for Cormorant
 * Garamond at 17/22 with +0.12em tracking and the stock header cannot be given
 * that without fighting it.
 */
export function TabHeader({ title, right }: { title: string; right?: ReactNode }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        minHeight: theme.metric.minTouchTarget,
        paddingVertical: theme.space.md,
      }}
    >
      <Txt variant="screenTitle" uppercase>
        {title}
      </Txt>
      {right}
    </View>
  );
}
