import {
  PRODUCT_CONDITION_LABEL_TR,
  PRODUCT_DELIVERY_LABEL_TR,
  PRODUCT_PRICE_UNIT_LABEL_TR,
  VERIFICATION_LABEL_TR,
} from '@only-horses/shared-types';
import type { ProductDetail } from '@only-horses/shared-types';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { getProduct } from '@/lib/api';

/**
 * A product page (§19.2).
 *
 * Indexable and server-rendered, with schema.org Product/Offer so a search
 * engine can read the price and the condition rather than guess them. That
 * markup is the difference between appearing in a shopping result and
 * appearing nowhere — and it is why this page exists on the web at all rather
 * than only in the app.
 */
export const revalidate = 300;

interface Props {
  params: Promise<{ locale: string; slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProduct(slug);

  if (!product) return { title: 'Ürün bulunamadı' };

  const price =
    product.priceAmount === null
      ? 'Fiyat sorunuz'
      : new Intl.NumberFormat('tr-TR', {
          style: 'currency',
          currency: product.priceCurrency,
          maximumFractionDigits: 0,
        }).format(product.priceAmount);

  return {
    title: `${product.title} — ${price}`,
    description: product.description.slice(0, 160),
    openGraph: {
      title: product.title,
      description: product.description.slice(0, 200),
      images: product.images.slice(0, 1),
    },
  };
}

/** schema.org's `itemCondition` vocabulary, from §13's enum. */
const CONDITION_SCHEMA: Record<string, string> = {
  new: 'https://schema.org/NewCondition',
  like_new: 'https://schema.org/UsedCondition',
  good: 'https://schema.org/UsedCondition',
  used: 'https://schema.org/UsedCondition',
  for_parts: 'https://schema.org/DamagedCondition',
};

export default async function ProductPage({ params }: Props) {
  const { slug } = await params;
  const product = await getProduct(slug);

  if (!product) notFound();

  const price =
    product.priceType === 'free'
      ? 'Ücretsiz'
      : product.priceAmount === null
        ? 'Fiyat sorunuz'
        : `${new Intl.NumberFormat('tr-TR', {
            style: 'currency',
            currency: product.priceCurrency,
            maximumFractionDigits: 0,
          }).format(product.priceAmount)}${
            product.priceUnit && product.priceUnit !== 'item'
              ? ` / ${PRODUCT_PRICE_UNIT_LABEL_TR[product.priceUnit] ?? product.priceUnit}`
              : ''
          }`;

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(buildProductJsonLd(product)),
        }}
      />

      <nav className="text-caption text-text-secondary mb-6">
        <Link href="/tr/urunler" className="hover:text-gold-soft">
          Ekipman
        </Link>
        {product.parentCategory ? (
          <>
            {' / '}
            <Link
              href={`/tr/urunler?category=${product.parentCategory}`}
              className="hover:text-gold-soft"
            >
              {product.categoryName}
            </Link>
          </>
        ) : null}
      </nav>

      {product.images.length > 0 ? (
        <ul className="mb-8 flex gap-3 overflow-x-auto">
          {product.images.map((image) => (
            <li key={image} className="shrink-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={image}
                alt={product.title}
                className="h-64 w-80 rounded-lg object-cover"
              />
            </li>
          ))}
        </ul>
      ) : null}

      <header>
        <h1 className="font-display text-h1">{product.title}</h1>
        <p className="text-small text-text-secondary mt-1">
          {/*
            A Set, not a filter: in Türkiye the province and the city share a
            name for most of the country, and "Kayseri · Kayseri" reads like a
            bug because it is one.
          */}
          {[...new Set([product.categoryName, product.city, product.region].filter(Boolean))].join(
            ' · ',
          )}
        </p>
        <p className="font-display text-display text-gold-soft mt-4">{price}</p>
      </header>

      <ul className="mt-6 flex flex-wrap gap-2">
        {[
          PRODUCT_CONDITION_LABEL_TR[product.condition] ?? product.condition,
          PRODUCT_DELIVERY_LABEL_TR[product.delivery] ?? product.delivery,
          product.quantity > 1 ? `${product.quantity} adet` : null,
        ]
          .filter(Boolean)
          .map((chip) => (
            <li
              key={chip as string}
              className="rounded-full bg-surface-raised px-3 py-1 text-caption"
            >
              {chip}
            </li>
          ))}
      </ul>

      <section className="mt-8 rounded-lg border border-border bg-surface p-5">
        <h2 className="font-display text-h3 mb-3">Satıcı</h2>
        <Link href={`/tr/profil/${product.sellerHandle}`} className="hover:text-gold-soft">
          {product.sellerName}
        </Link>
        <p className="text-caption text-text-secondary mt-1">
          {VERIFICATION_LABEL_TR[product.sellerVerification] ?? product.sellerVerification} · güven{' '}
          {product.sellerTrustScore}
        </p>
      </section>

      <section className="mt-8">
        <h2 className="font-display text-h2 mb-3">Künye</h2>
        <dl className="divide-y divide-border rounded-lg border border-border bg-surface">
          {(
            [
              ['Marka', product.brand],
              ['Model', product.model],
              ['Ölçü', product.sizeLabel],
              ['Renk', product.color],
              ['Durum', PRODUCT_CONDITION_LABEL_TR[product.condition] ?? product.condition],
              ['Teslimat', PRODUCT_DELIVERY_LABEL_TR[product.delivery] ?? product.delivery],
              ['Kargo notu', product.shippingNote],
            ] as [string, string | null][]
          )
            .filter(([, value]) => value)
            .map(([label, value]) => (
              <div key={label} className="flex justify-between gap-4 px-5 py-3">
                <dt className="text-small text-text-secondary">{label}</dt>
                <dd className="text-small text-right">{value}</dd>
              </div>
            ))}
        </dl>
      </section>

      <section className="mt-8">
        <h2 className="font-display text-h2 mb-3">Açıklama</h2>
        <p className="text-body text-text-secondary whitespace-pre-line">{product.description}</p>
      </section>

      {/*
        Buying comes before writing, and only when there is a price to buy at.
        A "fiyat sorunuz" listing keeps the message box and nothing else —
        a checkout with no amount is a button that 400s.
      */}
      {product.priceAmount !== null && product.priceType !== 'on_request' ? (
        <section className="mt-8 rounded-lg border border-gold-muted bg-surface p-5">
          <h2 className="font-display text-h3">Bu ürünü al</h2>
          <p className="text-small text-text-secondary mt-2">
            Sipariş verdiğinde önce satıcı stoğu onaylar; ödeme ondan sonra alınır.
          </p>
          <Link
            href={`/tr/hesap/satin-al/${product.slug}`}
            className="mt-4 inline-block rounded-md bg-gold-soft px-6 py-3 text-body font-medium text-text-on-gold"
          >
            Satın al
          </Link>
        </section>
      ) : null}

      <section className="mt-8 rounded-lg border border-border bg-surface p-5">
        <h2 className="font-display text-h3">Satıcıya yaz</h2>
        <p className="text-small text-text-secondary mt-2">
          §16 — mesajlaşma hesaba bağlıdır. Ürünü elden almadan, görmeden kapora
          gönderme.
        </p>
        <Link
          href="/tr/giris"
          className="mt-4 inline-block rounded-md bg-gold-soft px-5 py-3 text-small font-semibold text-text-on-gold"
        >
          Giriş yap ve yaz
        </Link>
      </section>
    </main>
  );
}

function buildProductJsonLd(product: ProductDetail) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.title,
    description: product.description,
    ...(product.brand ? { brand: { '@type': 'Brand', name: product.brand } } : {}),
    ...(product.model ? { model: product.model } : {}),
    ...(product.images.length > 0 ? { image: product.images } : {}),
    category: product.categoryName ?? product.category,
    offers: {
      '@type': 'Offer',
      // §19.2: only claim a price when there is one. An `Offer` with a null
      // price is markup a crawler discards, and one with a zero price is a
      // lie that shows up as "free" in a shopping result.
      ...(product.priceAmount === null
        ? { availability: 'https://schema.org/InStock' }
        : {
            price: product.priceAmount,
            priceCurrency: product.priceCurrency,
            availability:
              product.status === 'active'
                ? 'https://schema.org/InStock'
                : 'https://schema.org/OutOfStock',
          }),
      itemCondition: CONDITION_SCHEMA[product.condition] ?? 'https://schema.org/UsedCondition',
      seller: { '@type': 'Person', name: product.sellerName },
    },
  };
}
