'use client';

import { useMemo, useState } from 'react';

import { ProductCard } from '@/components/ProductCard';
import { DEMO_PRODUCTS, DEMO_PRODUCT_CATEGORIES } from '@only-horses/demo-content';

/**
 * The equipment marketplace, filtering in the browser.
 *
 * The production page is a server component that reads the query string and
 * asks the API, because §19.2 needs a filtered view to be an indexable URL.
 * A static export has neither a server to read the query on nor an API to ask,
 * so the preview filters the exported catalogue in memory.
 *
 * The filters are real. What they are not is the search engine: the tsvector
 * ranking, the parent-category rollup and boosted placement all live in the
 * API, and none of them are reproduced here.
 */
export function DemoProductBrowser() {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');

  const groups = DEMO_PRODUCT_CATEGORIES.filter((entry) => !entry.parentCode);

  const results = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('tr');

    return DEMO_PRODUCTS.filter((product) => {
      // A group selects everything under it, the way the API's rollup does.
      if (category && product.category !== category && product.parentCategory !== category) {
        return false;
      }
      if (!needle) return true;

      return [product.title, product.brand, product.categoryName, product.region, product.city]
        .filter(Boolean)
        .some((field) => String(field).toLocaleLowerCase('tr').includes(needle));
    });
  }, [query, category]);

  return (
    <>
      <form
        className="mb-6 flex flex-wrap gap-3"
        onSubmit={(event) => event.preventDefault()}
        role="search"
      >
        <input
          className="min-w-[14rem] flex-1 rounded-md border border-border bg-surface px-3 py-2 text-body text-text-primary"
          placeholder="Eyer, çul, yem, çit"
          aria-label="Ürün ara"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </form>

      <nav className="mb-8 flex flex-wrap gap-2" aria-label="Kategori">
        <button
          type="button"
          onClick={() => setCategory('')}
          className={`rounded-full border px-4 py-2 text-small ${
            category ? 'border-border' : 'border-gold-soft bg-surface-raised'
          }`}
        >
          Hepsi
        </button>
        {groups.map((group) => (
          <button
            key={group.code}
            type="button"
            onClick={() => setCategory(group.code)}
            className={`rounded-full border px-4 py-2 text-small ${
              category === group.code ? 'border-gold-soft bg-surface-raised' : 'border-border'
            }`}
          >
            {group.name}
          </button>
        ))}
      </nav>

      <p className="text-caption text-text-secondary mb-4 tabular">{results.length} ürün</p>

      {results.length === 0 ? (
        <div className="rounded-lg border border-border bg-surface p-10 text-center">
          <p className="font-display text-h3">Bu filtreyle ürün yok</p>
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {results.map((product) => (
            <li key={product.id}>
              <ProductCard hit={product} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
