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
    <div className="border-b border-gold-muted/50 bg-surface-raised px-6 py-3 text-center text-small text-text-primary">
      <strong className="font-display">Demo.</strong>{' '}
      Tasarım, metinler ve yasal sayfalar gerçek; ilanlar örnek veridir ve
      filtreler tarayıcıda çalışır. Mesajlaşma, kayıt ve ödeme canlı sunucu
      gerektirir — bu sürümde yer almazlar.
    </div>
  );
}
