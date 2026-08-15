import type { Metadata } from 'next';

import { ListingCard } from '@/components/ListingCard';
import { searchListings } from '@/lib/api';

/**
 * Listing index — spec §19.1 `/[locale]/atlar`, §18.2 S06.
 *
 * Server-rendered with the filters read from the query string, so a filtered
 * view is a shareable, indexable URL rather than client state. §1.3 P6 again:
 * the long tail of "Ankara satılık arap atı" searches lands here.
 */
export const revalidate = 300;

interface PageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({ searchParams }: PageProps): Promise<Metadata> {
  const params = await searchParams;
  const region = typeof params.region === 'string' ? params.region : undefined;
  const breed = typeof params.breeds === 'string' ? params.breeds : undefined;

  const title = [breed, region, 'satılık atlar'].filter(Boolean).join(' ');

  return {
    title: title.charAt(0).toUpperCase() + title.slice(1),
    description:
      'Doğrulanmış satıcılardan satılık ve kiralık atlar. Sağlık geçmişi, ' +
      'soy bilgisi ve gerçek videolarla.',
  };
}

export default async function ListingsIndexPage({ searchParams }: PageProps) {
  const params = await searchParams;

  const first = (key: string): string | undefined => {
    const value = params[key];
    return Array.isArray(value) ? value[0] : value;
  };

  const page = Number(first('page') ?? 1);

  const { hits, total } = await searchListings({
    q: first('q'),
    types: first('types'),
    breeds: first('breeds'),
    sexes: first('sexes'),
    countryCode: first('countryCode'),
    region: first('region'),
    city: first('city'),
    priceMinEur: first('priceMinEur'),
    priceMaxEur: first('priceMaxEur'),
    ageMin: first('ageMin'),
    ageMax: first('ageMax'),
    hasVideo: first('hasVideo'),
    sort: first('sort') ?? 'recommended',
    page,
    limit: 20,
  });

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <header className="mb-8">
        <h1 className="font-display text-h1 md:text-display">Satılık atlar</h1>
        <p className="text-small text-text-secondary mt-2 tabular">{total} ilan</p>
      </header>

      {hits.length === 0 ? (
        // §20.7: empty states invite action rather than apologising.
        <div className="rounded-lg border border-border bg-surface p-10 text-center">
          <p className="font-display text-h3">Bu filtrelerle ilan bulunamadı</p>
          <p className="text-small text-text-secondary mt-2">
            Filtreleri genişlet veya aramanı kaydet — eşleşen bir ilan yayınlandığında haber verelim.
          </p>
        </div>
      ) : (
        <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {hits.map((hit) => (
            <li key={hit.id}>
              <ListingCard hit={hit} />
            </li>
          ))}
        </ul>
      )}

      {total > page * 20 ? (
        <nav className="mt-10 flex justify-center">
          <a
            href={`?${new URLSearchParams({ ...(params as Record<string, string>), page: String(page + 1) })}`}
            className="rounded-md border border-border px-6 py-3 text-small hover:bg-surface-raised/60"
          >
            Sonraki sayfa
          </a>
        </nav>
      ) : null}
    </main>
  );
}
