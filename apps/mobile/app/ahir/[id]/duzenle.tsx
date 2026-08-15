import { SEX_LABEL_TR } from '@only-horses/shared-types';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { Txt } from '@/components/Text';
import { Choice } from '@/components/Wizard';
import { BackButton, Card, Chip, Field, Loading } from '@/components/ui';
import { api } from '@/lib/api';
import { loadDisciplines, type ReferenceItem } from '@/lib/reference';
import { theme } from '@/theme/tokens';

/**
 * Editing a horse — not a wizard.
 *
 * A wizard is for the first time; editing is for changing one field, and
 * walking five steps to correct a height is punishment. One scroll, one save.
 *
 * Name and sex are editable but the record's history is not: §6's transfers,
 * health entries and competition results are appended, never rewritten, so
 * they do not appear on this screen at all.
 */
const SEXES = ['mare', 'stallion', 'gelding', 'filly', 'colt'] as const;

export default function EditHorseScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [sex, setSex] = useState<(typeof SEXES)[number] | null>(null);
  const [height, setHeight] = useState('');
  const [color, setColor] = useState('');
  const [about, setAbout] = useState('');
  const [disciplines, setDisciplines] = useState<string[]>([]);
  const [disciplineTable, setDisciplineTable] = useState<ReferenceItem[]>([]);

  useEffect(() => {
    let cancelled = false;

    void loadDisciplines().then((table) => {
      if (!cancelled) setDisciplineTable(table);
    });

    void (async () => {
      const result = await api<Record<string, unknown>>(`/horses/${id}`);
      if (cancelled) return;

      if (result.ok && result.data) {
        const horse = result.data;
        setName(String(horse.name ?? ''));
        setSex((horse.sex as (typeof SEXES)[number]) ?? null);
        setHeight(horse.height_cm ? String(Math.round(Number(horse.height_cm))) : '');
        setColor(String(horse.color ?? ''));
        setAbout(String(horse.about ?? ''));
        setDisciplines((horse.disciplines as string[] | null) ?? []);
      }

      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [id]);

  const save = async () => {
    setSaving(true);
    setError(null);

    const result = await api(`/horses/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        name: name.trim(),
        sex,
        heightCm: height ? Number(height) : null,
        color: color || null,
        about: about || null,
        disciplines,
      }),
    });

    setSaving(false);

    if (!result.ok) {
      setError(result.error.message);
      return;
    }

    router.back();
  };

  if (loading) return <Loading />;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.color.bg }}
      contentContainerStyle={{
        paddingTop: insets.top,
        paddingHorizontal: theme.screenPadding,
        paddingBottom: theme.space.xxxl,
        gap: theme.space.lg,
      }}
      keyboardShouldPersistTaps="handled"
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <BackButton onPress={() => router.back()} />
        <Txt variant="screenTitle" uppercase>
          Düzenle
        </Txt>
        <View style={{ width: theme.metric.minTouchTarget }} />
      </View>

      <Field label="Adı" value={name} onChangeText={setName} autoCapitalize="words" />

      <Choice
        label="Cinsiyet"
        options={SEXES}
        value={sex}
        onChange={setSex}
        render={(option) => SEX_LABEL_TR[option] ?? option}
      />

      <Field
        label="Cidago (cm)"
        value={height}
        onChangeText={(value) => setHeight(value.replace(/\D/g, '').slice(0, 3))}
        keyboardType="number-pad"
      />

      <Field label="Don" value={color} onChangeText={setColor} />

      <View style={{ gap: theme.space.md }}>
        <Txt variant="label" uppercase color={theme.color.textSecondary} display={false}>
          Disiplinler
        </Txt>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.sm }}>
          {disciplineTable.map((entry) => (
            <Chip
              key={entry.code}
              label={entry.name}
              selected={disciplines.includes(entry.code)}
              onPress={() =>
                setDisciplines((current) =>
                  current.includes(entry.code)
                    ? current.filter((value) => value !== entry.code)
                    : [...current, entry.code],
                )
              }
            />
          ))}
        </View>
      </View>

      <Field
        label="Hakkında"
        value={about}
        onChangeText={setAbout}
        multiline
        numberOfLines={5}
        style={{ minHeight: 140 }}
      />

      {error ? (
        <Txt variant="small" color={theme.color.danger} display={false}>
          {error}
        </Txt>
      ) : null}

      <Card>
        <Txt variant="small" color={theme.color.textSecondary} display={false}>
          Sağlık, yarışma ve sahiplik kayıtları buradan değiştirilemez — §6 gereği
          eklenir, silinmez. Kaydın değeri tam olarak budur.
        </Txt>
      </Card>

      <Button
        label="Kaydet"
        onPress={() => void save()}
        loading={saving}
        disabled={name.trim().length < 2 || !sex}
      />
    </ScrollView>
  );
}
