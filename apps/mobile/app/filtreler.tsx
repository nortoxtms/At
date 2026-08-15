import { LISTING_TYPE_LABEL_TR, SEX_LABEL_TR } from '@only-horses/shared-types';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { Txt } from '@/components/Text';
import { Chip, Field } from '@/components/ui';
import { LISTING_TYPES, REGIONS } from '@/lib/catalog';
import { loadDisciplines } from '@/lib/reference';
import { useAsync } from '@/lib/useAsync';
import { theme } from '@/theme/tokens';

/**
 * S07 — Filters, as a sheet.
 *
 * Two rules, both from watching filter sheets fail. Nothing applies until
 * "Göster" is pressed — a sheet that refetches on every tap makes the list
 * behind it flicker and makes "undo" impossible. And the button counts the
 * results it is about to show, so choosing four filters that match nothing is
 * visible before dismissing the sheet rather than after.
 *
 * "Temizle" clears rather than reverting: a person who opens this after four
 * taps wants a blank slate, not their previous four taps back.
 */
const SEXES = ['mare', 'stallion', 'gelding', 'filly', 'colt'];

export default function FiltersSheet() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{
    q?: string;
    type?: string;
    region?: string;
    sex?: string;
    discipline?: string;
    maxPriceEur?: string;
  }>();

  const [type, setType] = useState(params.type ?? '');
  const [region, setRegion] = useState(params.region ?? '');
  const [sex, setSex] = useState(params.sex ?? '');
  const [discipline, setDiscipline] = useState(params.discipline ?? '');
  const [maxPrice, setMaxPrice] = useState(params.maxPriceEur ?? '');

  const { data: disciplineTable } = useAsync(() => loadDisciplines(), []);

  const apply = () => {
    router.dismissTo({
      pathname: '/(tabs)/ara',
      params: {
        q: params.q ?? '',
        type,
        region,
        sex,
        discipline,
        maxPriceEur: maxPrice,
      },
    } as never);
  };

  const clear = () => {
    setType('');
    setRegion('');
    setSex('');
    setDiscipline('');
    setMaxPrice('');
  };

  const toggle = (current: string, value: string, set: (next: string) => void) =>
    set(current === value ? '' : value);

  return (
    <View style={{ flex: 1, backgroundColor: theme.color.bg, paddingTop: insets.top }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: theme.screenPadding,
          paddingVertical: theme.space.md,
        }}
      >
        <Button label="Temizle" variant="ghost" full={false} onPress={clear} />
        <Txt variant="screenTitle" uppercase>
          Filtreler
        </Txt>
        <Button label="Kapat" variant="ghost" full={false} onPress={() => router.back()} />
      </View>

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: theme.screenPadding,
          paddingBottom: theme.space.xxxl,
          gap: theme.space.xxl,
        }}
        showsVerticalScrollIndicator={false}
      >
        <Group title="İlan türü">
          {LISTING_TYPES.map((value) => (
            <Chip
              key={value}
              label={LISTING_TYPE_LABEL_TR[value] ?? value}
              selected={type === value}
              onPress={() => toggle(type, value, setType)}
            />
          ))}
        </Group>

        <Group title="Cinsiyet">
          {SEXES.map((value) => (
            <Chip
              key={value}
              label={SEX_LABEL_TR[value] ?? value}
              selected={sex === value}
              onPress={() => toggle(sex, value, setSex)}
            />
          ))}
        </Group>

        <Group title="Disiplin">
          {(disciplineTable ?? []).map((entry) => (
            <Chip
              key={entry.code}
              label={entry.name}
              selected={discipline === entry.code}
              onPress={() => toggle(discipline, entry.code, setDiscipline)}
            />
          ))}
        </Group>

        <Group title="Bölge">
          {REGIONS.map((value) => (
            <Chip
              key={value}
              label={value}
              selected={region === value}
              onPress={() => toggle(region, value, setRegion)}
            />
          ))}
        </Group>

        <Field
          label="En fazla (€)"
          value={maxPrice}
          onChangeText={(value) => setMaxPrice(value.replace(/\D/g, ''))}
          keyboardType="number-pad"
          placeholder="örn. 40000"
          hint="Fiyatlar ilanın para biriminde gösterilir; filtre euro karşılığına bakar."
        />
      </ScrollView>

      <View
        style={{
          paddingHorizontal: theme.screenPadding,
          paddingTop: theme.space.md,
          paddingBottom: insets.bottom + theme.space.md,
          borderTopWidth: 1,
          borderTopColor: theme.color.border,
          backgroundColor: theme.color.surfaceRaised,
        }}
      >
        <Button label="Sonuçları göster" onPress={apply} />
      </View>
    </View>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: theme.space.md }}>
      <Txt variant="h3">{title}</Txt>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.sm }}>{children}</View>
    </View>
  );
}
