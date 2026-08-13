/**
 * The banner the static preview wears.
 *
 * Rendered only when `NEXT_PUBLIC_STATIC_PREVIEW=1`, which only the GitHub
 * Pages build sets. It exists so nobody mistakes a static export for the
 * running product: the marketplace is server-rendered against a live API, and
 * a preview that stayed silent about that would be showing an empty search
 * page as if it were the real one.
 */
export function PreviewBanner() {
  if (process.env.NEXT_PUBLIC_STATIC_PREVIEW !== '1') return null;

  return (
    <div className="border-b border-brass/40 bg-sand px-6 py-3 text-center text-small">
      <strong className="font-display">Statik önizleme.</strong>{' '}
      Tasarım sistemi, metinler ve yasal sayfalar burada gerçek. İlan arama,
      mesajlaşma ve ödeme akışları canlı API gerektirir — bu sürümde yer almazlar.
    </div>
  );
}
