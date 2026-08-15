'use client';

import { useMemo, useState } from 'react';

import { ListingCard } from '@/components/ListingCard';
import {
  DEMO_LISTINGS,
  DEMO_LISTING_TYPES,
  DEMO_REGIONS,
} from '@/content/demo';
import { LISTING_TYPE_LABEL_TR } from '@/lib/api';

/**
 * §18.2 S06's browse screen, filtering in the browser.
 *
 * The production page is a server component that reads the query string and
 * asks the search API, because §19.2 needs a filtered view to be an indexable
 * URL. Neither half of that exists in a static export — there is no server to
 * read the query on, and no API to ask.
 *
 * So the preview filters twelve listings in memory. The filters are real and
 * they work; what they are not is the search engine. Sorting by relevance,
 * geo radius, boosted placement and facet counts all live in the API (§11),
 * and none of them are reproduced here.
 */
export function DemoListingBrowser() {
  const [query, setQuery] = useState('');
  const [type, setType] = useState('');
  const [region, setRegion] = useState('');
  const [maxPrice, setMaxPrice] = useState('');

  const results = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('tr');

    return DEMO_LISTINGS.filter((listing) => {
      if (type && listing.listingType !== type) return false;
      if (region && listing.region !== region) return false;
      if (maxPrice && (listing.priceEur ?? Infinity) > Number(maxPrice)) return false;
      if (!needle) return true;

      return [listing.title, listing.horseName, listing.breed, listing.city, listing.region]
        .filter(Boolean)
        .some((field) => String(field).toLocaleLowerCase('tr').includes(needle));
    });
  }, [query, type, region, maxPrice]);

  const field =
    'w-full rounded-md border border-border bg-surface px-3 py-2 text-small text-text-primary';

  return (
    <>
      <form
        className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
        onSubmit={(event) => event.preventDefault()}
        role="search"
      >
        <label className="block">
          <span className="text-label text-text-secondary uppercase">Ara</span>
          <input
            className={`${field} mt-1`}
            placeholder="İsim, ırk, şehir"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>

        <label className="block">
          <span className="text-label text-text-secondary uppercase">İlan türü</span>
          <select
            className={`${field} mt-1`}
            value={type}
            onChange={(event) => setType(event.target.value)}
          >
            <option value="">Hepsi</option>
            {DEMO_LISTING_TYPES.map((option) => (
              <option key={option} value={option}>
                {LISTING_TYPE_LABEL_TR[option] ?? option}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-label text-text-secondary uppercase">Bölge</span>
          <select
            className={`${field} mt-1`}
            value={region}
            onChange={(event) => setRegion(event.target.value)}
          >
            <option value="">Hepsi</option>
            {DEMO_REGIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-label text-text-secondary uppercase">En fazla (€)</span>
          <input
            className={`${field} mt-1 tabular`}
            inputMode="numeric"
            placeholder="örn. 40000"
            value={maxPrice}
            onChange={(event) => setMaxPrice(event.target.value.replace(/\D/g, ''))}
          />
        </label>
      </form>

      <p className="text-small text-text-secondary mb-6 tabular">{results.length} ilan</p>

      {results.length === 0 ? (
        // §20.7: empty states invite action rather than apologising.
        <div className="rounded-lg border border-border bg-surface p-10 text-center">
          <p className="font-display text-h3">Bu filtrelerle ilan bulunamadı</p>
          <p className="text-small text-text-secondary mt-2">
            Filtreleri genişlet — bu önizlemede on iki ilan var.
          </p>
        </div>
      ) : (
        <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {results.map((listing) => (
            <li key={listing.id}>
              <ListingCard hit={listing} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
