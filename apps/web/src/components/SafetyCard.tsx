import Link from 'next/link';

/**
 * Buyer safety card — spec §14.3.
 *
 * "A permanent, dismissible-per-listing safety card on every sale listing."
 * The copy is the spec's, verbatim, because it is the one place the product
 * speaks directly about fraud and paraphrasing it would soften it.
 *
 * Server-rendered rather than a client component: a buyer who is about to be
 * defrauded should see this in the initial HTML, not after hydration.
 */
export function SafetyCard() {
  return (
    <aside
      className="rounded-lg border border-warning/40 bg-warning/5 p-5"
      aria-label="Güvenli alım uyarısı"
    >
      <p className="text-label uppercase text-text-warning">Güvenli alım</p>
      <p className="mt-2 text-small text-text-primary">
        Atı görmeden ödeme yapmayın. Satın alma öncesi veteriner muayenesi (PPE)
        isteyin. Ödemeyi platform dışında kapora olarak göndermeyin.
      </p>
      {/* /tr/rehber/... is not a route. The §24.26 policy page is. */}
      <Link href="/tr/guvenli-alim" className="mt-3 inline-block text-small text-brass-text">
        Güvenli alım rehberi
      </Link>
    </aside>
  );
}
