import type { ReactNode } from 'react';
import { ScrollView, View, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { theme } from '@/theme/tokens';

/**
 * The ground every screen stands on.
 *
 * Two jobs. First, the §20.1 background — set here rather than per screen so a
 * screen that forgets it cannot show white. Second, safe-area insets applied
 * as padding rather than as a `SafeAreaView` wrapper, because a scroll view
 * inside a safe-area view clips its content at the notch instead of letting it
 * pass under; the content should scroll behind the status bar and stop short
 * of the home indicator.
 */
export function Screen({
  children,
  scroll = false,
  padded = true,
  edges = { top: true, bottom: true },
  style,
  contentContainerStyle,
}: {
  children: ReactNode;
  scroll?: boolean;
  padded?: boolean;
  edges?: { top?: boolean; bottom?: boolean };
  style?: ViewStyle;
  contentContainerStyle?: ViewStyle;
}) {
  const insets = useSafeAreaInsets();

  const padding: ViewStyle = {
    paddingTop: edges.top ? insets.top : 0,
    paddingBottom: edges.bottom ? insets.bottom : 0,
    paddingHorizontal: padded ? theme.screenPadding : 0,
  };

  if (scroll) {
    return (
      <ScrollView
        style={[{ flex: 1, backgroundColor: theme.color.bg }, style]}
        contentContainerStyle={[padding, contentContainerStyle]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {children}
      </ScrollView>
    );
  }

  return (
    <View style={[{ flex: 1, backgroundColor: theme.color.bg }, padding, style]}>{children}</View>
  );
}
