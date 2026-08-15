import { useRouter } from 'expo-router';
import { View } from 'react-native';

import { Button } from '@/components/Button';
import { EmptyState } from '@/components/ui';
import { theme } from '@/theme/tokens';

/**
 * A link that went nowhere.
 *
 * Deep links from e-mail and from the web survive listings being closed
 * (§5), so this is reached in normal use rather than only in error — hence
 * a way onward rather than an apology.
 */
export default function NotFound() {
  const router = useRouter();

  return (
    <View style={{ flex: 1, backgroundColor: theme.color.bg, justifyContent: 'center', padding: theme.screenPadding }}>
      <EmptyState
        icon="compass-outline"
        title="Burada bir şey yok"
        body="Bağlantı eski olabilir ya da ilan kaldırılmış olabilir."
        action={<Button label="Ana ekrana dön" full={false} onPress={() => router.replace('/(tabs)')} />}
      />
    </View>
  );
}
