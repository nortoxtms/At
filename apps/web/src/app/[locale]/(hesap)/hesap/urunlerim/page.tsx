import {
  PRODUCT_PRICE_UNIT_LABEL_TR,
  type ProductPriceUnit,
} from '@only-horses/shared-types';
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { deleteProduct, productAction } from '../../actions-products';
import { apiAsOrNull } from '@/lib/authed';
import { readSession } from '@/lib/session';

/**
 * "Ürünlerim" — the seller's side of the equipment marketplace.
 *
 * Same shape as "İlanlarım" and deliberately so: one lifecycle (§5), one set
 * of buttons per state, and no verb offered from a state the API would refuse
 * it in. The one difference is `close`, which is a plain button here — see
 * the note in actions-products.ts.
 *
 * A draft can also be deleted. A published one cannot: §5 makes closing the
 * end of a live listing's life, and a row someone has messaged about is not
 * the seller's alone to erase.
 */
export const metadata: Metadata = { title: 'Ürünlerim', robots: { index: false } };

interface MyProduct {
  id: string;
  slug: string;
  title: string;
  status: string;
  category: string;
  category_name: string;
  price_amount: string | null;
  price_currency: string;
  price_type: string;
  price_unit: string | null;
  quantity: number;
  view_count: number;
  save_count: number;
  inquiry_count: number;
  is_boosted: boolean;
}

const STATUS_LABEL: Record<string, string> = {
  draft: 'Taslak',
  active: 'Yayında',
  paused: 'Duraklatıldı',
  sold: 'Satıldı',
  expired: 'Süresi doldu',
  closed: 'Kapatıldı',
};

/** §5's transitions, as the buttons a seller may press from each state. */
const ACTIONS: Record<string, { action: string; label: string }[]> = {
  draft: [{ action: 'publish', label: 'Yayınla' }],
  active: [
    { action: 'pause', label: 'Duraklat' },
    { action: 'close', label: 'Kapat' },
  ],
  paused: [
    { action: 'resume', label: 'Yeniden yayınla' },
    { action: 'close', label: 'Kapat' },
  ],
  expired: [{ action: 'renew', label: 'Yenile' }],
};

function price(product: MyProduct): string {
  if (product.price_amount === null) return 'Fiyat sorunuz';

  const amount = new Intl.NumberFormat('tr-TR', {
    style: 'currency',
    currency: product.price_currency,
    maximumFractionDigits: 0,
  }).format(Number(product.price_amount));

  const unit = product.price_unit as ProductPriceUnit | null;
  return unit && unit !== 'item'
    ? `${amount} / ${PRODUCT_PRICE_UNIT_LABEL_TR[unit] ?? unit}`
    : amount;
}

export default async function MyProductsPage() {
  if (!(await readSession())) redirect('/tr/giris');

  const products = (await apiAsOrNull<MyProduct[]>('/me/products')) ?? [];

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <header className="mb-8 flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="font-display text-h1">Ürünlerim</h1>
        <Link href="/tr/hesap" className="text-small text-text-secondary hover:text-gold-soft">
          ← Hesabım
        </Link>
      </header>

      <Link
        href="/tr/hesap/urunlerim/yeni"
        className="mb-6 inline-block rounded-md bg-gold-soft px-5 py-2 text-small font-medium text-text-on-gold"
      >
        Ürün ekle
      </Link>

      {products.length === 0 ? (
        <div className="rounded-lg border border-border bg-surface p-10 text-center">
          <p className="font-display text-h3">Henüz ürün eklemedin</p>
          <p className="text-small text-text-secondary mt-2">
            Eyer, başlık, çul, yem, çit, römork — atla ilgili ne satıyorsan buraya
            koyabilirsin. At kaydı gerekmez.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {products.map((product) => (
            <li key={product.id} className="rounded-lg border border-border bg-surface p-5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="font-display text-h3">{product.title}</h2>
                <span className="rounded-full bg-surface-raised px-3 py-1 text-caption">
                  {STATUS_LABEL[product.status] ?? product.status}
                </span>
              </div>

              <p className="text-small text-text-secondary mt-1">
                {product.category_name} · {price(product)}
                {product.quantity > 1 ? ` · ${product.quantity} adet` : ''}
              </p>

              <p className="text-caption text-text-secondary mt-3 tabular">
                {product.view_count} görüntülenme · {product.save_count} kayıt ·{' '}
                {product.inquiry_count} mesaj
                {product.is_boosted ? ' · öne çıkarıldı' : ''}
              </p>

              <div className="mt-4 flex flex-wrap gap-2">
                {product.status === 'active' ? (
                  <Link
                    href={`/tr/urunler/${product.slug}`}
                    className="rounded-md border border-border px-4 py-2 text-small hover:bg-surface-raised/60"
                  >
                    İlanı gör
                  </Link>
                ) : null}

                {(ACTIONS[product.status] ?? []).map(({ action, label }) => (
                  <form key={action} action={productAction}>
                    <input type="hidden" name="id" value={product.id} />
                    <input type="hidden" name="action" value={action} />
                    <button
                      type="submit"
                      className="rounded-md border border-border px-4 py-2 text-small hover:bg-surface-raised/60"
                    >
                      {label}
                    </button>
                  </form>
                ))}

                {product.status === 'draft' ? (
                  <form action={deleteProduct}>
                    <input type="hidden" name="id" value={product.id} />
                    <button
                      type="submit"
                      className="rounded-md border border-border px-4 py-2 text-small text-text-secondary hover:bg-surface-raised/60"
                    >
                      Sil
                    </button>
                  </form>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
