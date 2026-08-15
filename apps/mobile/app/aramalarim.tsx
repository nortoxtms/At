import { Ionicons } from '@expo/vector-icons';
import { LISTING_TYPE_LABEL_TR, SEX_LABEL_TR } from '@only-horses/shared-types';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { Txt } from '@/components/Text';
import { BackButton, Card, EmptyState, Loading } from '@/components/ui';
import { api } from '@/lib/api';
import { useSession } from '@/lib/session';
import { useAsync, useReloadOnFocus } from '@/lib/useAsync';
import { theme } from '@/theme/tokens';

/**
 * S29 — saved searches, and the alerts §24.5 hangs off them.
 *
 * Saving the search *is* subscribing to the alert — there is no second switch
 * — so the frequency is on the row and changing it is one tap. A saved search
 * that quietly never notifies is the version of this feature people delete the
 * app over.
 *
 * "Instant" is labelled honestly: §24.5's sweep runs every five minutes, so it
 * means "next sweep", not "the moment it is published". Promising instant and
 * delivering five minutes later is how a working alert reads as broken.
 */
interface SavedSearch {
  id: string;
  name: string;
  entity: string;
  query: Record<string, unknown>;
  alert_channel: string[];
  alert_frequency: string;
  last_run_at: string | null;
  created_at: string;
}

const FREQUENCY_LABEL: Record<string, string> = {
  instant: 'Her taramada',
  daily: 'Günlük',
  weekly: 'Haftalık',
  off: 'Kapalı',
};

const FREQUENCIES = ['instant', 'daily', 'weekly', 'off'];

/** Turn the stored query back into something a person recognises. */
function describe(query: Record<string, unknown>): string {
  const parts: string[] = [];

  if (typeof query.q === 'string' && query.q) parts.push(`“${query.q}”`);
  if (typeof query.type === 'string') parts.push(LISTING_TYPE_LABEL_TR[query.type] ?? query.type);
  if (typeof query.sex === 'string') parts.push(SEX_LABEL_TR[query.sex] ?? query.sex);
  if (typeof query.region === 'string') parts.push(query.region);
  if (query.maxPriceEur) parts.push(`≤ ${query.maxPriceEur} €`);

  return parts.length ? parts.join(' · ') : 'Tüm ilanlar';
}

export default function SavedSearchesScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { me, ready } = useSession();
  const [working, setWorking] = useState<string | null>(null);

  const { data, loading, reload } = useAsync(async () => {
    if (!me) return [];
    const result = await api<SavedSearch[]>('/saved-searches');
    return result.ok && Array.isArray(result.data) ? result.data : [];
  }, [me?.id]);

  // Coming back from a screen that added something must show it.
  useReloadOnFocus(reload);

  const searches = data ?? [];

  const setFrequency = async (id: string, alertFrequency: string) => {
    setWorking(id);
    await api(`/saved-searches/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ alertFrequency }),
    });
    setWorking(null);
    reload();
  };

  const remove = async (id: string) => {
    setWorking(id);
    await api(`/saved-searches/${id}`, { method: 'DELETE' });
    setWorking(null);
    reload();
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.color.bg, paddingTop: insets.top }}>
      <View
        style={{
          paddingHorizontal: theme.screenPadding,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <BackButton onPress={() => router.back()} />
        <Txt variant="screenTitle" uppercase>
          Aramalarım
        </Txt>
        <View style={{ width: theme.metric.minTouchTarget }} />
      </View>

      {!ready || loading ? (
        <Loading />
      ) : (
        <FlatList
          data={searches}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{
            paddingHorizontal: theme.screenPadding,
            paddingVertical: theme.space.lg,
            gap: theme.space.md,
          }}
          ListEmptyComponent={
            me ? (
              <EmptyState
                icon="search-outline"
                title="Kayıtlı araman yok"
                body="Bir aramayı kaydettiğinde, eşleşen yeni ilan çıktığında haber veririz."
                action={
                  <Button label="Aramaya git" full={false} onPress={() => router.push('/(tabs)/ara')} />
                }
              />
            ) : (
              <EmptyState
                icon="search-outline"
                title="Aramalar hesabına bağlı"
                body="Giriş yaptığında kaydettiğin aramalar her cihazda seninle gelir."
                action={<Button label="Giriş yap" full={false} onPress={() => router.push('/auth')} />}
              />
            )
          }
          renderItem={({ item }) => (
            <Card style={{ gap: theme.space.md }}>
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: theme.space.sm }}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Txt variant="h3" numberOfLines={1}>
                    {item.name}
                  </Txt>
                  <Txt variant="small" color={theme.color.textSecondary} display={false}>
                    {describe(item.query ?? {})}
                  </Txt>
                </View>

                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${item.name} aramasını sil`}
                  onPress={() => void remove(item.id)}
                  hitSlop={10}
                  style={{ minHeight: theme.metric.minTouchTarget, justifyContent: 'center' }}
                >
                  <Ionicons name="trash-outline" size={17} color={theme.color.textSecondary} />
                </Pressable>
              </View>

              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.sm }}>
                {FREQUENCIES.map((frequency) => {
                  const on = item.alert_frequency === frequency;

                  return (
                    <Pressable
                      key={frequency}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: on, disabled: working === item.id }}
                      accessibilityLabel={FREQUENCY_LABEL[frequency] ?? frequency}
                      disabled={working === item.id}
                      onPress={() => void setFrequency(item.id, frequency)}
                      style={{
                        minHeight: 34,
                        paddingHorizontal: theme.space.md,
                        justifyContent: 'center',
                        borderRadius: theme.radius.full,
                        backgroundColor: on ? theme.color.goldSoft : theme.color.surfaceRaised,
                        borderWidth: 1,
                        borderColor: on ? theme.color.goldSoft : theme.color.border,
                      }}
                    >
                      <Txt
                        variant="caption"
                        display={false}
                        color={on ? theme.color.textOnGold : theme.color.textPrimary}
                      >
                        {FREQUENCY_LABEL[frequency] ?? frequency}
                      </Txt>
                    </Pressable>
                  );
                })}
              </View>

              <Txt variant="caption" color={theme.color.textSecondary} display={false}>
                §24.5 — &quot;her taramada&quot; beş dakikada bir çalışan taramayı
                anlatır, anında değil.
              </Txt>
            </Card>
          )}
        />
      )}
    </View>
  );
}
