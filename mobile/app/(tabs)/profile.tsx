import { StyleSheet, Text, View } from 'react-native';

import { theme } from '../../src/core/theme';

/**
 * Profil — spec §18.2. The screen itself lands in M1/M2; M0 establishes the
 * navigation shell, the theme and the API client.
 */
export default function ProfileScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Profil</Text>
      <Text style={styles.body}>Bu ekran M1'de geliyor.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.cream,
    padding: theme.spacing[6],
  },
  title: { ...theme.type.h1, color: theme.colors.textPrimary },
  body: { ...theme.type.small, color: theme.colors.textSecondary, marginTop: theme.spacing[2] },
});
