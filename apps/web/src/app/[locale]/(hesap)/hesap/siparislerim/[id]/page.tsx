import {
  ORDER_PAYMENT_LABEL_TR,
  ORDER_STATUS_LABEL_TR,
  PRODUCT_DELIVERY_LABEL_TR,
} from '@only-horses/shared-types';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { orderAction, payOrder } from '../../../actions-orders';
import { ActionForm } from '@/components/ActionForm';
import { apiAsOrNull } from '@/lib/authed';
import { readSession } from '@/lib/session';

/**
 * One order: what it is, where it is, and the one thing to do next.
 *
 * This is where payment lives, not the checkout. §5 puts the seller's
 * confirmation between the order and the money, so a buyer arriving here after
 * ordering sees "waiting for the seller" — and comes back to the same URL to
 * pay once it turns. A checkout that charged immediately could not express
 * that state at all.
 *
 * The buttons come from a table keyed by side. Offering the seller's verbs to
 * a buyer would offer four actions the API answers 403 to, and a refusal the
 * user did not provoke reads as the product being broken.
 */
export const metadata: Metadata = { title: 'Sipariş', robots: { index: false } };

interface OrderDetail {
  id: string;
  reference: string;
  status: string;
  payment_status: string;
  quantity: number;
  title_snapshot: string;
  unit_price_amount: string;
  total_amount: string;
  currency: string;
  delivery: string;
  ship_to_name: string | null;
  ship_to_phone: string | null;
  ship_to_line1: string | null;
  ship_to_city: string | null;
  buyer_note: string | null;
  tracking_note: string | null;
  cancel_reason: string | null;
  created_at: string;
  paid_at: string | null;
  shipped_at: string | null;
  completed_at: string | null;
  product_slug: string;
  seller_name: string;
  seller_handle: string;
  buyer_name: string;
  buyer_handle: string;
  buyer_profile_id: string;
  seller_profile_id: string;
}

const ACTIONS: Record<'buyer' | 'seller', Record<string, { action: string; label: string }[]>> = {
  buyer: {
    pending_seller: [{ action: 'cancel', label: 'Vazgeç' }],
    awaiting_payment: [{ action: 'cancel', label: 'Vazgeç' }],
    paid: [{ action: 'cancel', label: 'İptal et ve iade al' }],
    shipped: [{ action: 'confirm', label: 'Teslim aldım' }],
  },
  seller: {
    pending_seller: [
      { action: 'accept', label: 'Onayla' },
      { action: 'reject', label: 'Reddet' },
    ],
    paid: [{ action: 'ship', label: 'Kargoya verdim' }],
  },
};

/** The order's own progress, as the four moments that actually happened. */
function timeline(order: OrderDetail): [string, string | null][] {
  return [
    ['Sipariş verildi', order.created_at],
    ['Ödeme alındı', order.paid_at],
    ['Kargoya verildi', order.shipped_at],
    ['Teslim alındı', order.completed_at],
  ];
}

export default async function OrderDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (!(await readSession())) redirect('/tr/giris');

  const [{ id }, query] = await Promise.all([params, searchParams]);

  const [order, me] = await Promise.all([
    apiAsOrNull<OrderDetail>(`/orders/${encodeURIComponent(id)}`),
    apiAsOrNull<{ id: string }>('/me'),
  ]);

  if (!order) notFound();

  const side: 'buyer' | 'seller' = order.seller_profile_id === me?.id ? 'seller' : 'buyer';
  const actions = ACTIONS[side][order.status] ?? [];
  const money = (value: string) =>
    new Intl.NumberFormat('tr-TR', {
      style: 'currency',
      currency: order.currency,
      maximumFractionDigits: 0,
    }).format(Number(value));

  const justOrdered = query.yeni === '1';
  const justPaid = query.odendi === '1';

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <header className="mb-8">
        <Link
          href={`/tr/hesap/siparislerim?side=${side}`}
          className="text-small text-text-secondary hover:text-gold-soft"
        >
          ← Siparişlerim
        </Link>
        <h1 className="font-display text-h1 mt-3">{order.title_snapshot}</h1>
        <p className="text-small text-text-secondary mt-1 tabular">
          {order.reference} · {ORDER_STATUS_LABEL_TR[order.status] ?? order.status}
        </p>
      </header>

      {justPaid ? (
        <div className="mb-6 rounded-lg border border-gold-soft bg-surface p-5">
          <p className="font-display text-h3">Ödeme tamamlandı</p>
          <p className="text-small text-text-secondary mt-2">
            Satıcı kargoya verdiğinde haber vereceğiz. Teslim aldığında bu sayfadan
            onaylaman gerekiyor.
          </p>
          <Link
            href="/tr/urunler"
            className="mt-4 inline-block rounded-md bg-gold-soft px-5 py-2 text-small font-medium text-text-on-gold"
          >
            Ekipmana dön
          </Link>
        </div>
      ) : justOrdered ? (
        <div className="mb-6 rounded-lg border border-gold-muted bg-surface p-5">
          <p className="font-display text-h3">Siparişin alındı</p>
          <p className="text-small text-text-secondary mt-2">
            Satıcıya bildirim gitti. Stoğu onayladığında ödeme adımı burada açılacak.
          </p>
        </div>
      ) : null}

      <section className="mb-6 rounded-lg border border-border bg-surface p-5">
        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
          {(
            [
              ['Adet', String(order.quantity)],
              ['Birim fiyat', money(order.unit_price_amount)],
              ['Toplam', money(order.total_amount)],
              ['Teslimat', PRODUCT_DELIVERY_LABEL_TR[order.delivery] ?? order.delivery],
              ['Ödeme', ORDER_PAYMENT_LABEL_TR[order.payment_status] ?? order.payment_status],
              [side === 'buyer' ? 'Satıcı' : 'Alıcı', side === 'buyer' ? order.seller_name : order.buyer_name],
            ] as [string, string][]
          ).map(([label, value]) => (
            <div key={label} className="flex items-baseline justify-between gap-3">
              <dt className="text-small text-text-secondary">{label}</dt>
              <dd className="text-small text-text-primary">{value}</dd>
            </div>
          ))}
        </dl>

        {order.ship_to_line1 ? (
          <p className="text-small text-text-secondary mt-5 border-t border-border pt-5">
            {[order.ship_to_name, order.ship_to_phone, order.ship_to_line1, order.ship_to_city]
              .filter(Boolean)
              .join(' · ')}
          </p>
        ) : null}

        {order.buyer_note ? (
          <p className="text-small text-text-primary mt-3 border-l-2 border-gold-muted pl-3">
            {order.buyer_note}
          </p>
        ) : null}

        {order.tracking_note ? (
          <p className="text-small text-text-secondary mt-3">Kargo: {order.tracking_note}</p>
        ) : null}

        {order.cancel_reason ? (
          <p className="text-small text-text-secondary mt-3">Sebep: {order.cancel_reason}</p>
        ) : null}
      </section>

      {/* The payment step, only when it is actually the buyer's move. */}
      {side === 'buyer' && order.status === 'awaiting_payment' ? (
        <section className="mb-6 rounded-lg border border-gold-muted bg-surface p-5">
          <h2 className="font-display text-h3">Ödeme</h2>
          <p className="text-small text-text-secondary mt-2">
            Satıcı siparişini onayladı. Tutar {money(order.total_amount)}.
          </p>
          <p className="text-caption text-text-secondary mt-3">
            Ödeme sağlayıcısı henüz bağlı değil. Bu adım şimdilik simülasyon: sipariş
            gerçekten &ldquo;ödendi&rdquo; olarak işaretlenir ve stok düşer, ama para
            hareket etmez.
          </p>

          <div className="mt-4">
            <ActionForm action={payOrder} submitLabel="Ödemeyi tamamla">
              <input type="hidden" name="id" value={order.id} />
            </ActionForm>
          </div>
        </section>
      ) : null}

      {actions.length > 0 ? (
        <section className="mb-6 flex flex-wrap gap-2">
          {actions.map(({ action, label }) => (
            <form key={action} action={orderAction}>
              <input type="hidden" name="id" value={order.id} />
              <input type="hidden" name="action" value={action} />
              {action === 'ship' ? (
                <input
                  name="trackingNote"
                  placeholder="Kargo firması ve takip no"
                  className="mr-2 rounded-md border border-border bg-surface px-3 py-2 text-small"
                />
              ) : null}
              <button
                type="submit"
                className="rounded-md border border-border px-4 py-2 text-small hover:bg-surface-raised/60"
              >
                {label}
              </button>
            </form>
          ))}
        </section>
      ) : null}

      <section>
        <h2 className="font-display text-h2 mb-3">Geçmiş</h2>
        <ol className="divide-y divide-border rounded-lg border border-border bg-surface">
          {timeline(order)
            .filter(([, when]) => when)
            .map(([label, when]) => (
              <li key={label} className="flex items-baseline justify-between gap-3 px-5 py-4">
                <span className="text-small text-text-primary">{label}</span>
                <span className="text-caption text-text-secondary tabular">
                  {new Date(when as string).toLocaleString('tr-TR')}
                </span>
              </li>
            ))}
        </ol>
      </section>

      <footer className="mt-8">
        <Link
          href={`/tr/urunler/${order.product_slug}`}
          className="text-small text-text-secondary hover:text-gold-soft"
        >
          Ürünü gör →
        </Link>
      </footer>
    </main>
  );
}
