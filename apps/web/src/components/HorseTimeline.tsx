import { tokens } from '@only-horses/shared-types';

/**
 * The horse timeline — spec §20.4.
 *
 * "On every horse and listing detail page there is a vertical rule in --brass
 * with year markers, running through registration → health entries →
 * competition results → ownership changes → listings. It is the one visually
 * distinctive component in the product and the physical expression of the core
 * insight."
 *
 * §18.2 S08 step 7 gives it visual weight on the listing page, because a
 * five-year record is the thing a competitor cannot clone (§1.2).
 */
export type TimelineEntryKind =
  | 'registered'
  | 'health'
  | 'competition'
  | 'ownership'
  | 'listing';

export interface TimelineEntry {
  id: string;
  kind: TimelineEntryKind;
  date: string;
  title: string;
  detail?: string;
}

const KIND_LABEL_TR: Record<TimelineEntryKind, string> = {
  registered: 'Kayıt',
  health: 'Sağlık',
  competition: 'Yarışma',
  ownership: 'Sahiplik',
  listing: 'İlan',
};

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('tr-TR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(iso));
}

export function HorseTimeline({ entries }: { entries: TimelineEntry[] }) {
  // Newest first, grouped by year with a Fraunces year marker (§20.4).
  const sorted = [...entries].sort((a, b) => b.date.localeCompare(a.date));

  const byYear = sorted.reduce<Map<string, TimelineEntry[]>>((acc, entry) => {
    const year = entry.date.slice(0, 4);
    acc.set(year, [...(acc.get(year) ?? []), entry]);
    return acc;
  }, new Map());

  return (
    <div className="timeline">
      {[...byYear.entries()].map(([year, yearEntries]) => (
        <section key={year} className="mb-8 last:mb-0">
          <h3 className="font-display text-h3 text-text-secondary mb-3 tabular">{year}</h3>

          <ol className="space-y-6">
            {yearEntries.map((entry) => (
              <li
                key={entry.id}
                className="timeline-node"
                data-origin={entry.kind === 'registered'}
              >
                <p className="text-label uppercase text-text-secondary mb-1">
                  {KIND_LABEL_TR[entry.kind]}
                </p>
                <p className="text-body text-text-primary">{entry.title}</p>
                {entry.detail ? (
                  <p className="text-small text-text-secondary mt-0.5">{entry.detail}</p>
                ) : null}
                <p className="text-caption text-text-secondary mt-1 tabular">
                  {formatDate(entry.date)}
                </p>
              </li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}

/** Exported so the mobile timeline can assert it renders the same ordering. */
export const TIMELINE_ACCENT = tokens.colors.gold;

/**
 * §12's timeline row, as this component's entry.
 *
 * The API returns `referenceId` — the id of the health record, competition or
 * listing the row came from — and `detail` as `null` rather than absent. Both
 * pages that render a timeline need the same conversion, and two copies of it
 * is two chances for one of them to key rows by index and lose React's
 * identity across a refresh.
 */
export function toTimelineEntry(entry: {
  kind: string;
  date: string;
  title: string;
  detail: string | null;
  referenceId: string | null;
}): TimelineEntry {
  return {
    id: entry.referenceId ?? `${entry.kind}-${entry.date}`,
    kind: entry.kind as TimelineEntryKind,
    date: entry.date,
    title: entry.title,
    detail: entry.detail ?? undefined,
  };
}
