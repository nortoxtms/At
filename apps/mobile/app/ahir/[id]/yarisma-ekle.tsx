import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { Txt } from '@/components/Text';
import { Choice } from '@/components/Wizard';
import { BackButton, Card, Field } from '@/components/ui';
import { api } from '@/lib/api';
import { loadDisciplines } from '@/lib/reference';
import { useAsync } from '@/lib/useAsync';
import { theme } from '@/theme/tokens';

/**
 * §18.2 S11's results section — adding a competition result.
 *
 * Only the date and the event name are required. §7 is explicit that most
 * results predate the platform and arrive as "the horse placed at a show in
 * 2019": a form demanding class, level, score and a registered rider would
 * record none of them, and an empty results section is what makes a
 * five-year-old horse look untried.
 *
 * The rider is free text for the same reason — the person who rode it usually
 * has no account here, and refusing the record until they do loses the record.
 */
export default function AddCompetitionScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const { data: disciplineTable } = useAsync(() => loadDisciplines(), []);

  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [event, setEvent] = useState('');
  const [discipline, setDiscipline] = useState<string | null>(null);
  const [className, setClassName] = useState('');
  const [placing, setPlacing] = useState('');
  const [location, setLocation] = useState('');
  const [riderName, setRiderName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dateValid = /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(new Date(date).getTime());
  const valid = dateValid && event.trim().length >= 2;

  const save = async () => {
    setBusy(true);
    setError(null);

    const result = await api(`/horses/${id}/competitions`, {
      method: 'POST',
      body: JSON.stringify({
        eventDate: date,
        eventName: event.trim(),
        ...(discipline ? { discipline } : {}),
        ...(className.trim() ? { className: className.trim() } : {}),
        ...(placing ? { placing: Number(placing) } : {}),
        ...(location.trim() ? { location: location.trim() } : {}),
        ...(riderName.trim() ? { riderName: riderName.trim() } : {}),
      }),
    });

    setBusy(false);

    if (!result.ok) {
      setError(result.error.message);
      return;
    }

    router.back();
  };

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
          Yarışma ekle
        </Txt>
        <View style={{ width: theme.metric.minTouchTarget }} />
      </View>

      <Field
        label="Yarışma"
        value={event}
        onChangeText={setEvent}
        placeholder="Bölgesel Engel Atlama"
      />

      <Field
        label="Tarih"
        value={date}
        onChangeText={setDate}
        placeholder="2026-04-19"
        error={dateValid ? null : 'YYYY-AA-GG biçiminde yaz.'}
      />

      {(disciplineTable ?? []).length > 0 ? (
        <Choice
          label="Disiplin"
          options={(disciplineTable ?? []).map((entry) => entry.code)}
          value={discipline}
          onChange={setDiscipline}
          render={(code) =>
            (disciplineTable ?? []).find((entry) => entry.code === code)?.name ?? code
          }
        />
      ) : null}

      <Field label="Kategori" value={className} onChangeText={setClassName} placeholder="1.10 m" />

      <Field
        label="Derece"
        value={placing}
        onChangeText={(value) => setPlacing(value.replace(/\D/g, '').slice(0, 3))}
        keyboardType="number-pad"
        placeholder="3"
        hint="Derece almadıysa boş bırak — katılım da kayıttır."
      />

      <Field label="Yer" value={location} onChangeText={setLocation} placeholder="İstanbul" />

      <Field
        label="Binici"
        value={riderName}
        onChangeText={setRiderName}
        placeholder="Ad soyad"
        hint="Uygulamada hesabı olmasa da yazabilirsin."
      />

      {error ? (
        <Txt variant="small" color={theme.color.danger} display={false}>
          {error}
        </Txt>
      ) : null}

      <Card>
        <Txt variant="small" color={theme.color.textSecondary} display={false}>
          Sonuç geçmişe eklenir ve silinmez (§6). Yanlış girdiysen düzeltmek için
          destekle iletişime geç.
        </Txt>
      </Card>

      <Button label="Kaydet" onPress={() => void save()} loading={busy} disabled={!valid} />
    </ScrollView>
  );
}
