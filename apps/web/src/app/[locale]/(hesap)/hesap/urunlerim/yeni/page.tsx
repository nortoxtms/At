import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { createProduct } from '../../../actions-products';
import { ProductForm } from '@/components/ProductForm';
import { getProductCategories } from '@/lib/api';
import { readSession } from '@/lib/session';

/**
 * "Ürün ekle" — the sell flow for everything that is not a horse.
 *
 * No horse record required, which is the whole point of a separate table
 * (§1.3 P1 makes a listing a view of a horse; a bit has no pedigree). The
 * categories are read here rather than in the client component so the select
 * is populated in the first paint and works before hydration.
 */
export const metadata: Metadata = { title: 'Ürün ekle', robots: { index: false } };

export default async function NewProductPage() {
  if (!(await readSession())) redirect('/tr/giris');

  const categories = await getProductCategories();

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <header className="mb-8">
        <Link
          href="/tr/hesap/urunlerim"
          className="text-small text-text-secondary hover:text-gold-soft"
        >
          ← Ürünlerim
        </Link>
        <h1 className="font-display text-h1 mt-3">Ürün ekle</h1>
        <p className="text-small text-text-secondary mt-2">
          Eyerden çite, yemden kaska. Ne kadar doğru anlatırsan o kadar az mesaj
          cevaplarsın.
        </p>
      </header>

      <ProductForm categories={categories} action={createProduct} />
    </main>
  );
}
