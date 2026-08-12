import { HorseTimeline, type TimelineEntry } from '@/components/HorseTimeline';

/**
 * Landing page — spec §19.1 `/`.
 *
 * §1.3 P6 makes the web the acquisition channel, so the landing page has to
 * argue the product's actual thesis (§2): the record comes first, the listing
 * is derived from it. The timeline is on the page rather than described,
 * because that is the part a competitor cannot copy.
 *
 * The search entry point and the listing index arrive in M2.
 */

// Illustrative only, until the API is wired in M2.
const SAMPLE_TIMELINE: TimelineEntry[] = [
  {
    id: '1',
    kind: 'listing',
    date: '2026-06-14',
    title: 'Satılık ilan yayınlandı',
    detail: '€12.000 · Ankara',
  },
  {
    id: '2',
    kind: 'competition',
    date: '2026-04-02',
    title: 'Ankara Bahar Kupası — 2. sıra',
    detail: 'Engel atlama · 1.20 m',
  },
  {
    id: '3',
    kind: 'health',
    date: '2026-03-11',
    title: 'Aşı: grip + tetanoz',
    detail: 'Vet. Dr. Kaya · sonraki: 11 Mart 2027',
  },
  {
    id: '4',
    kind: 'ownership',
    date: '2024-09-01',
    title: 'Sahiplik devri',
    detail: 'Uzunyayla Harası → Ayşe Yılmaz',
  },
  {
    id: '5',
    kind: 'registered',
    date: '2024-08-20',
    title: 'ONLY HORSES kaydı oluşturuldu',
    detail: 'Mikroçip doğrulandı',
  },
];

export default function HomePage() {
  return (
    <main>
      {/* §20.1: ink is the hero surface. §20.6: real photographs only — the
          image slot stays empty until licensed photography is in place, rather
          than filling it with an illustration of a horse. */}
      <section className="bg-ink text-text-inverse">
        <div className="mx-auto max-w-5xl px-6 py-16 md:py-24">
          <p className="text-label uppercase text-brass-light mb-4">Türkiye · Beta</p>

          <h1 className="font-display text-4xl md:text-6xl font-semibold leading-tight max-w-3xl">
            Atların dünyası tek bir yerde.
          </h1>

          <p className="mt-6 text-body md:text-lg max-w-xl text-cream/80">
            Atının sağlık, nal, aşı ve sahiplik geçmişini tek dosyada tut. Satmak
            istediğinde ilanın çoktan hazır olsun.
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <a
              href="/app"
              className="rounded-md bg-brass px-6 py-3 text-body font-medium text-ink transition-opacity hover:opacity-90"
            >
              Uygulamayı indir
            </a>
            <a
              href="/atlar"
              className="rounded-md border border-cream/25 px-6 py-3 text-body font-medium text-cream transition-colors hover:bg-cream/10"
            >
              Satılık atlara bak
            </a>
          </div>
        </div>
      </section>

      {/* §2: the two objects, deliberately separated. Stating this plainly is
          the clearest way to explain why the product is not a classifieds app. */}
      <section className="mx-auto max-w-5xl px-6 py-16">
        <div className="grid gap-8 md:grid-cols-2">
          <article className="rounded-lg border border-border bg-paper p-6 shadow-card">
            <p className="text-label uppercase text-text-muted">Kalıcı</p>
            <h2 className="font-display text-h2 mt-2">At kaydı</h2>
            <p className="mt-3 text-small text-text-secondary">
              Mikroçip, pasaport, ırk, doğum tarihi, sağlık ve nal kayıtları,
              yarışma sonuçları, sahiplik geçmişi. At satılsa da kayıt kalır.
            </p>
          </article>

          <article className="rounded-lg border border-border bg-paper p-6 shadow-card">
            <p className="text-label uppercase text-text-muted">Geçici</p>
            <h2 className="font-display text-h2 mt-2">İlan</h2>
            <p className="mt-3 text-small text-text-secondary">
              Satılık, kiralık, hisse veya aygır hizmeti. Fiyat, görünürlük ve
              süre. İlan kapanır, atın geçmişi kalır.
            </p>
          </article>
        </div>
      </section>

      {/* §20.4 signature element. Everything around it stays quiet. */}
      <section className="border-y border-border bg-sand/25">
        <div className="mx-auto max-w-5xl px-6 py-16">
          <h2 className="font-display text-h1 mb-2">Bu atın geçmişi</h2>
          <p className="text-small text-text-secondary mb-10 max-w-lg">
            Her at kaydı bir zaman çizelgesi taşır. Alıcı ne aldığını görür,
            satıcı anlattığını kanıtlar.
          </p>

          <div className="max-w-xl">
            <HorseTimeline entries={SAMPLE_TIMELINE} />
          </div>
        </div>
      </section>

      <footer className="mx-auto max-w-5xl px-6 py-12">
        <p className="text-caption text-text-muted">
          ONLY HORSES bir aracı platformdur, hiçbir satışın tarafı değildir.
        </p>
        <nav className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-small text-text-secondary">
          <a href="/hakkinda" className="hover:text-text-primary">Hakkında</a>
          <a href="/gizlilik" className="hover:text-text-primary">Gizlilik</a>
          <a href="/kosullar" className="hover:text-text-primary">Koşullar</a>
          <a href="/refah-politikasi" className="hover:text-text-primary">Refah politikası</a>
        </nav>
      </footer>
    </main>
  );
}
