import type { Metadata } from 'next';
import Link from 'next/link';

import { ProductCard } from '@/components/ProductCard';
import { getProductCategories, searchProducts } from '@/lib/api';

/**
 * The equipment marketplace (§13, extended) — everything equestrian that is
 * not a horse.
 *
 * Server-rendered, like the horse listings and for the same §19.2 reason: the
 * people who buy a used saddle start on Google, and a client-rendered grid is
 * a page a crawler sees as empty. The filters are query parameters so a
 * filtered view is a URL that can be linked, shared and indexed.
 */
export const metadata: Metadata = {
  title: 'Ekipman ve malzeme',
  description:
    'Eyer, başlık, kask, çul, yem, altlık, çit, boks, engel, römork — atla ilgili her şey, sahibinden.',
};

export const revalidate = 300;

interface Props {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const first = (value: string | string[] | undefined): string | undefined =>
  Array.isArray(value) ? value[0] : value;

export default async function ProductsPage({ searchParams }: Props) {
  const query = await searchParams;
  const category = first(query.category);
  const q = first(query.q);

  const [{ hits, total }, categories] = await Promise.all([
    searchProducts({ q, category, limit: 48 }),
    getProductCategories(),
  ]);

  const groups = categories.filter((entry) => !entry.parent_code);
  const children = category
    ? categories.filter((entry) => entry.parent_code === category)
    : [];
  const active = categories.find((entry) => entry.code === category);

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <header className="mb-8">
        <h1 className="font-display text-h1">Ekipman ve malzeme</h1>
        <p className="text-small text-text-secondary mt-2 max-w-2xl">
          Eyerden çite, yemden kaska. Atla ilgili ne satıyorsan buraya koyabilirsin —
          ve aradığın ne varsa burada.
        </p>
      </header>

      {/* Search is a GET form, so the result is a URL. */}
      <form className="mb-8 flex flex-wrap gap-3" role="search">
        {category ? <input type="hidden" name="category" value={category} /> : null}
        <input
          name="q"
          defaultValue={q ?? ''}
          placeholder="Eyer, çit, yem, kask…"
          aria-label="Ürün ara"
          className="min-w-64 flex-1 rounded-md border border-border bg-surface px-4 py-3 text-small text-text-primary"
        />
        <button
          type="submit"
          className="rounded-md bg-gold-soft px-6 py-3 text-small font-semibold text-text-on-gold"
        >
          Ara
        </button>
      </form>

      <nav aria-label="Kategoriler" className="mb-8">
        <ul className="flex flex-wrap gap-2">
          <li>
            <Link
              href="/tr/urunler"
              className={`inline-block rounded-full border px-4 py-2 text-small ${
                category
                  ? 'border-border bg-surface-raised text-text-primary'
                  : 'border-gold-soft bg-gold-soft text-text-on-gold'
              }`}
            >
              Tümü
            </Link>
          </li>
          {(children.length > 0 ? [active!, ...children] : groups).map((entry) => (
            <li key={entry.code}>
              <Link
                href={`/tr/urunler?category=${entry.code}`}
                className={`inline-block rounded-full border px-4 py-2 text-small ${
                  entry.code === category
                    ? 'border-gold-soft bg-gold-soft text-text-on-gold'
                    : 'border-border bg-surface-raised text-text-primary'
                }`}
              >
                {entry.name_tr}
                <span className="text-text-secondary"> ({entry.active_count})</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <p className="text-small text-text-secondary mb-6 tabular">{total} ürün</p>

      {hits.length === 0 ? (
        <div className="rounded-lg border border-border bg-surface p-10 text-center">
          <p className="font-display text-h3">Bu filtrelerle ürün yok</p>
          <p className="text-small text-text-secondary mt-2">
            Aramayı sadeleştir ya da kategoriyi genişlet.
          </p>
        </div>
      ) : (
        <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {hits.map((hit) => (
            <li key={hit.id}>
              <ProductCard hit={hit} />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
