import { SEX_LABEL_TR } from '@only-horses/shared-types';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { Txt } from '@/components/Text';
import { Choice, Wizard } from '@/components/Wizard';
import { Card, Chip, DataRow, Field } from '@/components/ui';
import { api } from '@/lib/api';
import { loadBreeds, loadDisciplines } from '@/lib/reference';
import { useAsync } from '@/lib/useAsync';
import { useSession } from '@/lib/session';
import { theme } from '@/theme/tokens';

/**
 * S10 — add a horse.
 *
 * Five steps, and the order is deliberate: identity, then physical, then
 * discipline, then paperwork, then review. Paperwork is fourth rather than
 * first because a passport number is the field people leave to look up, and a
 * wizard that opens on it is a wizard people close.
 *
 * Only name and sex are required. §6 lets a horse exist with almost nothing
 * known — a rescue with no papers is still a horse, and a registry that
 * refuses to record it is a registry with a hole exactly where the welfare
 * case is.
 */
const SEXES = ['mare', 'stallion', 'gelding', 'filly', 'colt'] as const;
const COLORS = ['doru', 'yağız', 'kır', 'al', 'demirkır', 'kula', 'alaca'] as const;

export default function NewHorseWizard() {
  const router = useRouter();
  const { me } = useSession();

  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [sex, setSex] = useState<(typeof SEXES)[number] | null>(null);
  const [birthYear, setBirthYear] = useState('');
  const [height, setHeight] = useState('');
  const [color, setColor] = useState<(typeof COLORS)[number] | null>(null);
  const [breed, setBreed] = useState<string | null>(null);
  const [breedQuery, setBreedQuery] = useState('');
  const [disciplines, setDisciplines] = useState<string[]>([]);
  const [passport, setPassport] = useState('');
  const [microchip, setMicrochip] = useState('');
  const [about, setAbout] = useState('');

  const { data: breedTable } = useAsync(() => loadBreeds(), []);
  const { data: disciplineTable } = useAsync(() => loadDisciplines(), []);

  // §7's breed table is ~120 rows. A chip wall is unusable and a dropdown on a
  // phone is worse, so it filters as you type and shows the first dozen.
  const breedMatches = useMemo(() => {
    const table = breedTable ?? [];
    const needle = breedQuery.trim().toLocaleLowerCase('tr');
    const matched = needle
      ? table.filter((entry) => entry.name.toLocaleLowerCase('tr').includes(needle))
      : table;
    return matched.slice(0, 12);
  }, [breedTable, breedQuery]);

  const year = Number(birthYear);
  const yearValid =
    birthYear === '' || (Number.isInteger(year) && year >= 1980 && year <= new Date().getFullYear());

  const canContinue = [
    name.trim().length >= 2,
    sex !== null,
    yearValid,
    true,
    true,
  ][step - 1];

  const submit = async () => {
    setBusy(true);
    setError(null);

    const result = await api<{ id: string }>('/horses', {
      method: 'POST',
      // Every optional field in `createHorseSchema` is `.optional()`, not
      // `.nullish()` — sending null where the key could be omitted fails
      // validation, and the wizard shows the 400 as "Bir şeyler ters gitti".
      body: JSON.stringify({
        name: name.trim(),
        sex,
        ...(birthYear
          ? { dateOfBirth: `${birthYear}-01-01`, birthYearEstimated: true }
          : {}),
        ...(height ? { heightCm: Number(height) } : {}),
        ...(color ? { color } : {}),
        ...(breed ? { breedId: breed } : {}),
        disciplines,
        ...(passport.trim() ? { passportNumber: passport.trim() } : {}),
        ...(microchip.trim() ? { microchipNumber: microchip.trim() } : {}),
        ...(about.trim() ? { about: about.trim() } : {}),
        currentCountry: 'TR',
      }),
    });

    setBusy(false);

    if (!result.ok) {
      setError(
        me
          ? result.error.message
          : 'Kaydetmek için giriş yapman gerekiyor. Girdiklerin burada duruyor.',
      );
      return;
    }

    router.replace(`/ahir/${result.data.id}`);
  };

  const back = () => (step === 1 ? router.back() : setStep(step - 1));
  const next = () => (step === 5 ? void submit() : setStep(step + 1));

  const toggleDiscipline = (value: string) =>
    setDisciplines((current) =>
      current.includes(value) ? current.filter((entry) => entry !== value) : [...current, value],
    );

  return (
    <Wizard
      title="At ekle"
      step={step}
      total={5}
      busy={busy}
      canContinue={!!canContinue}
      continueLabel={step === 5 ? 'Kaydet' : 'Devam'}
      onBack={back}
      onContinue={next}
      stepTitle={
        ['Kimlik', 'Fiziksel', 'Disiplin', 'Belgeler', 'Gözden geçir'][step - 1] ?? ''
      }
      stepBody={
        [
          'Adı ve cinsiyeti zorunlu. Gerisi sonradan da eklenebilir.',
          'Bilmediğin alanı boş bırak — tahmin girme.',
          'Bu at neyle uğraşıyor? Birden fazla seçebilirsin.',
          'Pasaport ve çip numarası kimseye gösterilmez; eşleştirme için tutulur.',
          'Kaydetmeden önce son bir bakış.',
        ][step - 1]
      }
    >
      {step === 1 ? (
        <View style={{ gap: theme.space.lg }}>
          <Field
            label="Adı"
            value={name}
            onChangeText={setName}
            placeholder="Efsane"
            autoCapitalize="words"
          />
          <Choice
            label="Cinsiyet"
            options={SEXES}
            value={sex}
            onChange={setSex}
            render={(option) => SEX_LABEL_TR[option] ?? option}
          />
        </View>
      ) : null}

      {step === 2 ? (
        <View style={{ gap: theme.space.lg }}>
          <Field
            label="Doğum yılı"
            value={birthYear}
            onChangeText={(value) => setBirthYear(value.replace(/\D/g, '').slice(0, 4))}
            keyboardType="number-pad"
            placeholder="2018"
            error={yearValid ? null : `1980 ile ${new Date().getFullYear()} arasında olmalı.`}
            hint="Kesin tarihi bilmiyorsan yıl yeter — tahmini olarak işaretlenir."
          />
          <Field
            label="Cidago (cm)"
            value={height}
            onChangeText={(value) => setHeight(value.replace(/\D/g, '').slice(0, 3))}
            keyboardType="number-pad"
            placeholder="165"
          />
          <Choice label="Don" options={COLORS} value={color} onChange={setColor} />

          <View style={{ gap: theme.space.md }}>
            <Field
              label="Irk"
              value={breedQuery}
              onChangeText={(value) => {
                setBreedQuery(value);
                setBreed(null);
              }}
              placeholder="Ara: Arap, Haflinger, Uzunyayla…"
              hint={
                breed
                  ? `Seçili: ${breedTable?.find((entry) => entry.code === breed)?.name ?? breed}`
                  : 'Listeden seç — serbest yazı kaydedilmez.'
              }
            />
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.sm }}>
              {breedMatches.map((entry) => (
                <Chip
                  key={entry.code}
                  label={entry.name}
                  selected={breed === entry.code}
                  onPress={() => {
                    setBreed(entry.code);
                    setBreedQuery(entry.name);
                  }}
                />
              ))}
            </View>
          </View>
        </View>
      ) : null}

      {step === 3 ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.sm }}>
          {(disciplineTable ?? []).map((entry) => (
            <Chip
              key={entry.code}
              label={entry.name}
              selected={disciplines.includes(entry.code)}
              onPress={() => toggleDiscipline(entry.code)}
            />
          ))}
        </View>
      ) : null}

      {step === 4 ? (
        <View style={{ gap: theme.space.lg }}>
          <Field
            label="Pasaport no"
            value={passport}
            onChangeText={setPassport}
            autoCapitalize="characters"
            placeholder="TR-000000"
          />
          <Field
            label="Mikroçip no"
            value={microchip}
            onChangeText={(value) => setMicrochip(value.replace(/\D/g, '').slice(0, 15))}
            keyboardType="number-pad"
            placeholder="15 haneli"
          />
          <Field
            label="Hakkında"
            value={about}
            onChangeText={setAbout}
            multiline
            numberOfLines={4}
            placeholder="Karakteri, alışkanlıkları, eğitim geçmişi…"
            style={{ minHeight: 120 }}
          />
        </View>
      ) : null}

      {step === 5 ? (
        <View style={{ gap: theme.space.lg }}>
          <Card>
            <DataRow label="Adı" value={name || '—'} />
            <DataRow label="Cinsiyet" value={sex ? (SEX_LABEL_TR[sex] ?? sex) : '—'} />
            <DataRow label="Doğum yılı" value={birthYear || 'Bilinmiyor'} />
            <DataRow label="Cidago" value={height ? `${height} cm` : '—'} />
            <DataRow label="Don" value={color ?? '—'} />
            <DataRow
              label="Irk"
              value={breedTable?.find((entry) => entry.code === breed)?.name ?? '—'}
            />
            <DataRow
              label="Disiplinler"
              value={
                disciplines.length
                  ? disciplines
                      .map(
                        (code) =>
                          (disciplineTable ?? []).find((entry) => entry.code === code)?.name ?? code,
                      )
                      .join(', ')
                  : '—'
              }
            />
            <DataRow label="Pasaport" value={passport || '—'} />
            <DataRow label="Mikroçip" value={microchip || '—'} />
          </Card>

          {error ? (
            <Txt variant="small" color={theme.color.danger} display={false}>
              {error}
            </Txt>
          ) : null}

          <Txt variant="caption" color={theme.color.textSecondary} display={false}>
            Kaydettiğinde bu at senin ahırına eklenir. İlan vermek ayrı bir adım —
            kayıt satış demek değil.
          </Txt>
        </View>
      ) : null}
    </Wizard>
  );
}
