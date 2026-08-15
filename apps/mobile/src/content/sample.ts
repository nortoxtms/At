import { DEMO_LISTINGS } from '@only-horses/demo-content';

/**
 * Sample threads, stable and health records for the signed-out preview.
 *
 * Everything here is reachable only when the API is unreachable, and every
 * screen that renders it also renders the "örnek veri" banner. It exists
 * because §18.2's messaging, stable and health screens are unreviewable while
 * empty: an empty inbox and a broken inbox look identical.
 *
 * The listings these hang off are the real exported ones, so a sample thread
 * points at a horse that actually renders.
 */
export interface SampleMessage {
  id: string;
  fromMe: boolean;
  body: string;
  sentAt: string;
}

export interface SampleThread {
  id: string;
  counterparty: string;
  counterpartyHandle: string;
  listingSlug: string;
  listingTitle: string;
  horseName: string;
  unread: number;
  lastAt: string;
  messages: SampleMessage[];
}

const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();

export const SAMPLE_THREADS: SampleThread[] = [
  {
    id: 'thread-1',
    counterparty: 'Ege Atlı Spor Kulübü',
    counterpartyHandle: 'ege-atli-spor',
    listingSlug: DEMO_LISTINGS[0]?.slug ?? '',
    listingTitle: DEMO_LISTINGS[0]?.title ?? '',
    horseName: DEMO_LISTINGS[0]?.horseName ?? '',
    unread: 2,
    lastAt: ago(14),
    messages: [
      {
        id: 'm1',
        fromMe: true,
        body: 'Merhaba, ilandaki atı hafta sonu görebilir miyim?',
        sentAt: ago(180),
      },
      {
        id: 'm2',
        fromMe: false,
        body: 'Merhaba, tabii. Cumartesi 11:00 uygun olur mu?',
        sentAt: ago(120),
      },
      {
        id: 'm3',
        fromMe: false,
        body: 'PPE için kendi veterinerinizi getirebilirsiniz, sorun değil.',
        sentAt: ago(14),
      },
    ],
  },
  {
    id: 'thread-2',
    counterparty: 'Kapadokya Hara',
    counterpartyHandle: 'kapadokya-hara',
    listingSlug: DEMO_LISTINGS[1]?.slug ?? '',
    listingTitle: DEMO_LISTINGS[1]?.title ?? '',
    horseName: DEMO_LISTINGS[1]?.horseName ?? '',
    unread: 0,
    lastAt: ago(1560),
    messages: [
      {
        id: 'm1',
        fromMe: false,
        body: 'İlanla ilgilendiğiniz için teşekkürler. Röntgenleri paylaşabilirim.',
        sentAt: ago(1600),
      },
      { id: 'm2', fromMe: true, body: 'Harika olur, teşekkürler.', sentAt: ago(1560) },
    ],
  },
];

export interface SampleHorse {
  id: string;
  name: string;
  slug: string;
  sex: string;
  ageYears: number;
  heightCm: number;
  breed: string;
  color: string;
  disciplines: string[];
  blurhash: string | null;
  listedAs: string | null;
}

export const SAMPLE_STABLE: SampleHorse[] = DEMO_LISTINGS.slice(0, 3).map((hit, index) => ({
  id: hit.id,
  name: hit.horseName,
  slug: hit.slug,
  sex: hit.sex,
  ageYears: hit.ageYears ?? 0,
  heightCm: Math.round(hit.heightCm ?? 0),
  breed: hit.breed ?? '',
  color: hit.color ?? '',
  disciplines: hit.disciplines,
  blurhash: hit.coverBlurhash,
  listedAs: index === 2 ? null : hit.listingType,
}));

export interface SampleHealthRecord {
  id: string;
  kind: 'vaccination' | 'farrier' | 'dental' | 'vet_visit' | 'deworming';
  date: string;
  title: string;
  detail: string;
  nextDue: string | null;
}

export const SAMPLE_HEALTH: SampleHealthRecord[] = [
  {
    id: 'h1',
    kind: 'vaccination',
    date: '2026-05-12',
    title: 'İnfluenza aşısı',
    detail: 'Yıllık rapel — Vet. Dr. A. Yılmaz',
    nextDue: '2027-05-12',
  },
  {
    id: 'h2',
    kind: 'farrier',
    date: '2026-07-30',
    title: 'Nal değişimi',
    detail: 'Ön çift nal, arka çıplak',
    nextDue: '2026-09-24',
  },
  {
    id: 'h3',
    kind: 'dental',
    date: '2026-03-04',
    title: 'Diş bakımı',
    detail: 'Rutin törpüleme',
    nextDue: '2027-03-04',
  },
  {
    id: 'h4',
    kind: 'deworming',
    date: '2026-06-18',
    title: 'Paraziter tedavi',
    detail: 'İvermektin',
    nextDue: '2026-09-18',
  },
];

export const HEALTH_KIND_LABEL_TR: Record<SampleHealthRecord['kind'], string> = {
  vaccination: 'Aşı',
  farrier: 'Nalbant',
  dental: 'Diş',
  vet_visit: 'Veteriner',
  deworming: 'Parazit',
};
