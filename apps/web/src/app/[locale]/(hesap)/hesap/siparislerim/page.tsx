import {
  ORDER_PAYMENT_LABEL_TR,
  ORDER_STATUS_LABEL_TR,
  type OrderSummary,
} from '@only-horses/shared-types';
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { apiAsOrNull } from '@/lib/authed';
import { readSession } from '@/lib/session';

/**
 * Orders, both sides.
 *
 * One page with a toggle rather than two, because most people here are both:
 * the yard selling a spare rug also buys feed, and splitting them means
 * remembering which side of a transaction you were on six weeks ago.
 *
 * The side is a query parameter rather than client state so each half is a URL
 * — linkable, and the thing a notification about an incoming order can point
 * at.
 */
export const metadata: Metadata = { title: 'Siparişlerim', robots: { index: false } };

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (!(await readSession())) redirect('/tr/giris');

  const query = await searchParams;
  const raw = Array.isArray(query.side) ? query.side[0] : query.side;
  const side = raw === 'seller' ? 'seller' : 'buyer';

  const orders = (await apiAsOrNull<OrderSummary[]>(`/orders/mine?side=${side}`)) ?? [];

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <header className="mb-8 flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="font-display text-h1">Siparişlerim</h1>
        <Link href="/tr/hesap" className="text-small text-text-secondary hover:text-gold-soft">
          ← Hesabım
        </Link>
      </header>

      <nav className="mb-6 flex gap-2" aria-label="Sipariş tarafı">
        {[
          ['buyer', 'Aldıklarım'],
          ['seller', 'Sattıklarım'],
        ].map(([value, label]) => (
          <Link
            key={value}
            href={`/tr/hesap/siparislerim?side=${value}`}
            aria-current={side === value ? 'page' : undefined}
            className={`rounded-full border px-4 py-2 text-small ${
              side === value ? 'border-gold-soft bg-surface-raised' : 'border-border'
            }`}
          >
            {label}
          </Link>
        ))}
      </nav>

      {orders.length === 0 ? (
        <div className="rounded-lg border border-border bg-surface p-10 text-center">
          <p className="font-display text-h3">
            {side === 'buyer' ? 'Henüz bir şey almadın' : 'Henüz sipariş almadın'}
          </p>
          <p className="text-small text-text-secondary mt-2">
            {side === 'buyer'
              ? 'Ekipman pazarından aldığın her şey buraya düşer.'
              : 'Ürünlerine sipariş geldiğinde önce buradan onaylıyorsun.'}
          </p>
          <Link
            href={side === 'buyer' ? '/tr/urunler' : '/tr/hesap/urunlerim'}
            className="mt-4 inline-block rounded-md border border-border px-5 py-2 text-small hover:bg-surface-raised/60"
          >
            {side === 'buyer' ? 'Ekipmana bak' : 'Ürünlerim'}
          </Link>
        </div>
      ) : (
        <ul className="space-y-3">
          {orders.map((order) => (
            <li key={order.id} className="rounded-lg border border-border bg-surface p-5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="font-display text-h3">
                  <Link
                    href={`/tr/hesap/siparislerim/${order.id}`}
                    className="hover:text-gold-soft"
                  >
                    {order.title_snapshot}
                  </Link>
                </h2>
                <span className="rounded-full bg-surface-raised px-3 py-1 text-caption">
                  {ORDER_STATUS_LABEL_TR[order.status] ?? order.status}
                </span>
              </div>

              <p className="text-small text-text-secondary mt-1 tabular">
                {order.reference} · {order.quantity} adet ·{' '}
                {new Intl.NumberFormat('tr-TR', {
                  style: 'currency',
                  currency: order.currency,
                  maximumFractionDigits: 0,
                }).format(Number(order.total_amount))}
              </p>

              <p className="text-caption text-text-secondary mt-2">
                {side === 'buyer' ? 'Satıcı' : 'Alıcı'}: {order.counterparty_name}
                {order.payment_status !== 'none'
                  ? ` · ${ORDER_PAYMENT_LABEL_TR[order.payment_status] ?? order.payment_status}`
                  : ''}
                {' · '}
                {new Date(order.created_at).toLocaleDateString('tr-TR')}
              </p>

              {order.tracking_note ? (
                <p className="text-caption text-text-secondary mt-1">
                  Kargo: {order.tracking_note}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
