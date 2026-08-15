import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { Txt } from '@/components/Text';
import { Choice } from '@/components/Wizard';
import { BackButton, Card, Field } from '@/components/ui';
import { api } from '@/lib/api';
import { HEALTH_TYPES, REMINDER_INTERVALS } from '@/lib/endpoints';
import { theme } from '@/theme/tokens';

/**
 * Adding a health record (§9).
 *
 * The next-due date is offered as an interval rather than a date picker,
 * because that is how the knowledge exists: a farrier says "six weeks", not
 * "24 September". Converting the interval to a date here means the reminder
 * §9 fires is exact while the thing the owner typed stays natural.
 */
const KIND_IDS = HEALTH_TYPES.map((entry) => entry.id);
const KIND_LABEL: Record<string, string> = Object.fromEntries(
  HEALTH_TYPES.map((entry) => [entry.id, entry.label]),
);

export default function AddHealthRecordScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [kind, setKind] = useState<(typeof KIND_IDS)[number] | null>('vaccination');
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [interval, setInterval] = useState<string>('Yok');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dateValid = /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(new Date(date).getTime());

  const nextDue = (() => {
    const days = REMINDER_INTERVALS.find((entry) => entry.label === interval)?.days ?? null;
    if (days === null || !dateValid) return null;
    const due = new Date(date);
    due.setDate(due.getDate() + days);
    return due.toISOString().slice(0, 10);
  })();

  const save = async () => {
    setSaving(true);
    setError(null);

    const result = await api(`/horses/${id}/health`, {
      method: 'POST',
      body: JSON.stringify({
        type: kind,
        title: title.trim(),
        // The schema takes `notes` as optional, not nullable — sending null
        // fails validation where omitting the key succeeds.
        ...(notes.trim() ? { notes: notes.trim() } : {}),
        performedOn: date,
        nextDueOn: nextDue,
      }),
    });

    setSaving(false);

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
          Kayıt ekle
        </Txt>
        <View style={{ width: theme.metric.minTouchTarget }} />
      </View>

      <Choice
        label="Tür"
        options={KIND_IDS}
        value={kind}
        onChange={setKind}
        render={(option) => KIND_LABEL[option] ?? option}
      />

      <Field label="Başlık" value={title} onChangeText={setTitle} placeholder="İnfluenza aşısı" />

      <Field
        label="Tarih"
        value={date}
        onChangeText={setDate}
        placeholder="2026-08-15"
        keyboardType="numbers-and-punctuation"
        error={dateValid ? null : 'YYYY-AA-GG biçiminde yaz.'}
      />

      <Choice
        label="Sıradaki ne zaman?"
        options={REMINDER_INTERVALS.map((entry) => entry.label)}
        value={interval}
        onChange={setInterval}
      />

      {nextDue ? (
        <Card>
          <Txt variant="small" color={theme.color.textSecondary} display={false}>
            Hatırlatma {new Intl.DateTimeFormat('tr-TR', { dateStyle: 'long' }).format(new Date(nextDue))}{' '}
            için kurulur.
          </Txt>
        </Card>
      ) : null}

      <Field
        label="Not"
        value={notes}
        onChangeText={setNotes}
        multiline
        numberOfLines={4}
        placeholder="Veteriner, ürün, doz…"
        style={{ minHeight: 120 }}
      />

      {error ? (
        <Txt variant="small" color={theme.color.danger} display={false}>
          {error}
        </Txt>
      ) : null}

      <Button
        label="Kaydet"
        onPress={() => void save()}
        loading={saving}
        disabled={!kind || title.trim().length < 3 || !dateValid}
      />
    </ScrollView>
  );
}
