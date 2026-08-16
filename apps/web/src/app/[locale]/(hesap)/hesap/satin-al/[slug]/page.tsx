import {
  PRODUCT_DELIVERY_LABEL_TR,
  PRODUCT_PRICE_UNIT_LABEL_TR,
} from '@only-horses/shared-types';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { placeOrder } from '../../../actions-orders';
import { ActionForm } from '@/components/ActionForm';
import { getProduct } from '@/lib/api';
import { readSession } from '@/lib/session';

/**
 * Checkout — what you are buying, where it goes, what it costs.
 *
 * Signed-in only, and not because of the money: an order has two parties who
 * have to reach each other afterwards, and a guest order is a dispute with
 * nobody on one side of it.
 *
 * The payment is not here. §5 puts the seller's confirmation between the order
 * and the money, so this page ends at "Siparişi ver" and the order page picks
 * it up — telling the buyer which of the two they are waiting on, which a
 * checkout that charged immediately could not.
 */
export const metadata: Metadata = { title: 'Satın al', robots: { index: false } };

const FIELD =
  'w-full rounded-md border border-border bg-surface px-3 py-2 text-body text-text-primary';

export default async function CheckoutPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  if (!(await readSession())) redirect(`/tr/giris?next=/tr/hesap/satin-al/${slug}`);

  const product = await getProduct(slug);
  if (!product) notFound();

  const money = (value: number) =>
    new Intl.NumberFormat('tr-TR', {
      style: 'currency',
      currency: product.priceCurrency,
      maximumFractionDigits: 0,
    }).format(value);

  // "Fiyat sorunuz" has no number to charge, so there is nothing to check out.
  if (product.priceAmount === null || product.priceType === 'on_request') {
    return (
      <main className="mx-auto max-w-xl px-6 py-16">
        <h1 className="font-display text-h1">Bu üründe fiyat yok</h1>
        <p className="text-small text-text-secondary mt-3">
          Satıcı &ldquo;fiyat sorunuz&rdquo; olarak yayınlamış. Anlaşmak için mesaj yazman
          gerekiyor.
        </p>
        <Link
          href={`/tr/urunler/${slug}`}
          className="mt-6 inline-block rounded-md bg-gold-soft px-5 py-2 text-small font-medium text-text-on-gold"
        >
          Ürüne dön
        </Link>
      </main>
    );
  }

  const shipping = product.delivery !== 'pickup';

  return (
    <main className="mx-auto max-w-xl px-6 py-10">
      <header className="mb-8">
        <Link
          href={`/tr/urunler/${slug}`}
          className="text-small text-text-secondary hover:text-gold-soft"
        >
          ← Ürüne dön
        </Link>
        <h1 className="font-display text-h1 mt-3">Satın al</h1>
      </header>

      <section className="mb-8 rounded-lg border border-border bg-surface p-5">
        <h2 className="font-display text-h3">{product.title}</h2>
        <p className="text-small text-text-secondary mt-1">
          {money(product.priceAmount)}
          {product.priceUnit && product.priceUnit !== 'item'
            ? ` / ${PRODUCT_PRICE_UNIT_LABEL_TR[product.priceUnit] ?? product.priceUnit}`
            : ''}
          {' · '}
          {PRODUCT_DELIVERY_LABEL_TR[product.delivery] ?? product.delivery}
          {' · '}
          stokta {product.quantity}
        </p>
        <p className="text-caption text-text-secondary mt-2">
          Satıcı: {product.sellerName}
        </p>
      </section>

      <ActionForm
        action={placeOrder}
        submitLabel="Siparişi ver"
        note="Şimdi ödeme alınmıyor. Önce satıcı stoğu onaylıyor, ödeme ondan sonra."
      >
        <input type="hidden" name="productId" value={product.id} />
        <input type="hidden" name="delivery" value={product.delivery} />

        <label className="block sm:max-w-[10rem]">
          <span className="text-label text-text-secondary uppercase">Adet</span>
          <input
            name="quantity"
            type="number"
            min={1}
            max={product.quantity}
            defaultValue={1}
            inputMode="numeric"
            className={`${FIELD} mt-1 tabular`}
          />
        </label>

        {shipping ? (
          <fieldset className="space-y-4 rounded-lg border border-border bg-surface p-4">
            <legend className="text-label text-text-secondary uppercase px-1">
              Teslimat adresi
            </legend>

            <label className="block">
              <span className="text-label text-text-secondary uppercase">Ad soyad</span>
              <input name="shipToName" maxLength={160} className={`${FIELD} mt-1`} />
            </label>

            <label className="block">
              <span className="text-label text-text-secondary uppercase">Telefon</span>
              <input
                name="shipToPhone"
                type="tel"
                maxLength={32}
                className={`${FIELD} mt-1`}
              />
            </label>

            <label className="block">
              <span className="text-label text-text-secondary uppercase">Adres</span>
              <textarea name="shipToLine1" rows={3} maxLength={240} className={`${FIELD} mt-1`} />
            </label>

            <label className="block">
              <span className="text-label text-text-secondary uppercase">Şehir</span>
              <input name="shipToCity" maxLength={120} className={`${FIELD} mt-1`} />
            </label>
          </fieldset>
        ) : (
          <div className="rounded-lg border border-border bg-surface p-4">
            <p className="text-small text-text-primary">Elden teslim</p>
            <p className="text-caption text-text-secondary mt-1">
              Bu ürün elden teslim. Satıcı onayladıktan sonra buluşma yerini mesajdan
              konuşacaksınız — adres istemiyoruz.
            </p>
          </div>
        )}

        <label className="block">
          <span className="text-label text-text-secondary uppercase">Satıcıya not</span>
          <textarea name="note" rows={3} maxLength={1000} className={`${FIELD} mt-1`} />
        </label>
      </ActionForm>
    </main>
  );
}
