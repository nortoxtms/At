import Link from 'next/link';

import { HeroField } from '@/components/HeroField';
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
      {/*
        §20.1 makes ink the hero surface and §20.6 allows real photographs and
        nothing else — there are none yet, so this builds depth out of light
        rather than filling the slot with an illustration: a slow field of
        brass motes, a warm radial wash, and a hairline grid that stops before
        it becomes a pattern.
      */}
      <section className="relative isolate overflow-hidden bg-ink text-text-inverse">
        <HeroField />

        {/* A single warm source, off-centre. Flat ink reads as a placeholder;
            one light gives the surface somewhere to fall away to. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-70"
          style={{
            background:
              'radial-gradient(70rem 40rem at 78% -10%, rgba(217,173,92,0.20), transparent 60%),' +
              'radial-gradient(50rem 30rem at 8% 110%, rgba(74,47,29,0.55), transparent 65%)',
          }}
        />

        <div className="relative mx-auto max-w-6xl px-6 py-24 md:py-36">
          <p className="text-label uppercase tracking-[0.2em] text-brass-light">
            Türkiye · Beta
          </p>

          {/*
            The type does the work here. §20.2 reserves Fraunces for display,
            and this is the one place on the site where it is allowed to be
            genuinely large — a marketplace that opens quietly reads as a
            directory.
          */}
          <h1 className="font-display mt-6 max-w-4xl text-[clamp(2.5rem,7vw,5.25rem)] font-semibold leading-[0.98] tracking-[-0.02em]">
            Atların dünyası
            <br />
            <span className="text-brass-light">tek bir yerde.</span>
          </h1>

          <p className="mt-8 max-w-xl text-lg leading-relaxed text-cream/75">
            Atının sağlık, nal, aşı ve sahiplik geçmişini tek dosyada tut.
            Satmak istediğinde ilanın çoktan hazır olsun.
          </p>

          <div className="mt-10 flex flex-wrap items-center gap-3">
            {/*
              §21 makes tr the default locale and every public route lives
              under it. This said `/atlar`, which is not a route in any locale
              — the landing page's main call to action was a 404 in production
              as well as in the preview.
            */}
            <Link
              href="/tr/atlar"
              className="group inline-flex items-center gap-2 rounded-full bg-brass px-7 py-3.5 text-body font-medium text-ink transition-transform duration-200 hover:-translate-y-0.5"
            >
              Satılık atlara bak
              <span
                aria-hidden="true"
                className="transition-transform duration-200 group-hover:translate-x-1"
              >
                →
              </span>
            </Link>
            <Link
              href="/tr/hizmetler"
              className="rounded-full border border-cream/25 px-7 py-3.5 text-body font-medium text-cream transition-colors duration-200 hover:border-cream/50 hover:bg-cream/5"
            >
              Hizmet ara
            </Link>
          </div>

          {/* §22's counters, once there are any. Until then this states the
              two facts that are true on day one and cost nothing to keep. */}
          <dl className="mt-16 grid max-w-2xl grid-cols-2 gap-x-10 gap-y-6 border-t border-cream/15 pt-8 sm:grid-cols-3">
            {[
              ['Komisyon', '%0', 'Satıştan pay alınmaz'],
              ['Kimlik', 'Zorunlu', 'İlan vermenin koşulu'],
              ['Kayıt', 'Kalıcı', 'At satılsa da kalır'],
            ].map(([label, value, note]) => (
              <div key={label}>
                <dt className="text-label uppercase tracking-wider text-cream/50">{label}</dt>
                <dd className="font-display mt-1 text-h2 text-cream">{value}</dd>
                <dd className="mt-1 text-caption text-cream/55">{note}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/*
        §2: the two objects, deliberately separated. Stating this plainly is
        the clearest way to explain why the product is not a classifieds app —
        so the layout states it too, with the permanent record given the
        weight and the listing sitting beside it as the smaller, temporary
        thing.
      */}
      <section className="mx-auto max-w-6xl px-6 py-20 md:py-28">
        <p className="text-label uppercase tracking-[0.2em] text-brass-text">İki nesne</p>
        <h2 className="font-display mt-4 max-w-2xl text-[clamp(1.75rem,3.5vw,2.75rem)] leading-tight tracking-[-0.01em]">
          Kayıt kalıcıdır. İlan geçicidir.
        </h2>

        <div className="mt-12 grid gap-6 lg:grid-cols-5">
          <article className="group relative overflow-hidden rounded-xl border border-border bg-paper p-8 transition-colors duration-300 hover:border-brass/40 lg:col-span-3">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-brass/5 transition-transform duration-500 group-hover:scale-125"
            />
            <p className="text-label uppercase tracking-wider text-text-muted">Kalıcı</p>
            <h3 className="font-display text-h1 mt-2">At kaydı</h3>
            <p className="text-body text-text-secondary mt-4 max-w-md leading-relaxed">
              Mikroçip, pasaport, ırk, doğum tarihi, sağlık ve nal kayıtları,
              yarışma sonuçları, sahiplik geçmişi. At satılsa da kayıt kalır.
            </p>

            <ul className="mt-6 flex flex-wrap gap-2">
              {['Mikroçip', 'Sağlık dosyası', 'Nal takvimi', 'Sahiplik geçmişi'].map((item) => (
                <li
                  key={item}
                  className="rounded-full border border-border px-3 py-1 text-caption text-text-secondary"
                >
                  {item}
                </li>
              ))}
            </ul>
          </article>

          <article className="rounded-xl border border-border bg-sand/40 p-8 lg:col-span-2">
            <p className="text-label uppercase tracking-wider text-text-muted">Geçici</p>
            <h3 className="font-display text-h1 mt-2">İlan</h3>
            <p className="text-body text-text-secondary mt-4 leading-relaxed">
              Satılık, kiralık, hisse veya aygır hizmeti. Fiyat, görünürlük ve
              süre. İlan kapanır, atın geçmişi kalır.
            </p>
          </article>
        </div>
      </section>

      {/* §20.4 signature element. Everything around it stays quiet. */}
      <section className="border-y border-border bg-sand/25">
        <div className="mx-auto grid max-w-6xl gap-12 px-6 py-20 md:py-28 lg:grid-cols-2 lg:items-center">
          <div>
            <p className="text-label uppercase tracking-[0.2em] text-brass-text">Zaman çizelgesi</p>
            <h2 className="font-display mt-4 text-[clamp(1.75rem,3.5vw,2.75rem)] leading-tight tracking-[-0.01em]">
              Bu atın geçmişi
            </h2>
            <p className="text-body text-text-secondary mt-5 max-w-md leading-relaxed">
              Her at kaydı bir zaman çizelgesi taşır. Alıcı ne aldığını görür,
              satıcı anlattığını kanıtlar — ve bu geçmiş, ilan kapandığında da
              atın yanında kalır.
            </p>

            <Link
              href="/tr/atlar"
              className="group mt-8 inline-flex items-center gap-2 text-body text-brass-text"
            >
              Örnek kayıtlara bak
              <span
                aria-hidden="true"
                className="transition-transform duration-200 group-hover:translate-x-1"
              >
                →
              </span>
            </Link>
          </div>

          <div className="rounded-xl border border-border bg-paper p-6 shadow-card md:p-8">
            <HorseTimeline entries={SAMPLE_TIMELINE} />
          </div>
        </div>
      </section>

      {/*
        The page-local footer is gone: SiteFooter is in the root layout now, so
        every page carries the same one. Its links were also wrong — `/gizlilik`
        and the rest have no locale segment, and `/hakkinda` is not a route at
        all, so three of the four 404'd.
      */}
      <section className="mx-auto max-w-5xl px-6 py-12">
        <p className="text-caption text-text-muted">
          ONLY HORSES bir aracı platformdur, hiçbir satışın tarafı değildir.
        </p>
      </section>
    </main>
  );
}
