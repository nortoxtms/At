import { Ionicons } from '@expo/vector-icons';
import { TIMELINE_KIND_LABEL_TR } from '@only-horses/shared-types';
import type { TimelineEntry } from '@only-horses/shared-types';
import { View } from 'react-native';

import { Txt } from '@/components/Text';
import { theme } from '@/theme/tokens';

/**
 * §20.4's horse timeline.
 *
 * The mockup has no screen for this, which is why it needed designing rather
 * than transcribing: v2.1 §20.4 asks for the horse's life as a single vertical
 * spine with year markers, and that is the one view the whole registry premise
 * (§1.3 P1) is for. A horse whose record is a set of unrelated tabs is a horse
 * whose history you cannot read.
 *
 * Grouped by year with the rail running through, newest first. The rail is a
 * hairline, not gold — the entries are the content and a gold spine would make
 * the decoration the loudest thing on a dark screen.
 */
const KIND_ICON: Record<string, keyof typeof Ionicons.glyphMap> = {
  registered: 'finger-print-outline',
  health: 'medkit-outline',
  competition: 'trophy-outline',
  ownership: 'swap-horizontal-outline',
  listing: 'pricetag-outline',
};

export function Timeline({ entries }: { entries: TimelineEntry[] }) {
  const sorted = [...entries].sort((a, b) => b.date.localeCompare(a.date));

  const years: { year: string; items: TimelineEntry[] }[] = [];
  for (const entry of sorted) {
    const year = entry.date.slice(0, 4);
    const bucket = years.at(-1);
    if (bucket?.year === year) bucket.items.push(entry);
    else years.push({ year, items: [entry] });
  }

  return (
    <View>
      {years.map((group) => (
        <View key={group.year}>
          <Txt
            variant="label"
            uppercase
            color={theme.color.textSecondary}
            display={false}
            style={{ marginTop: theme.space.lg, marginBottom: theme.space.sm }}
          >
            {group.year}
          </Txt>

          {group.items.map((entry, index) => {
            const last = index === group.items.length - 1;

            return (
              <View key={`${entry.date}-${entry.title}`} style={{ flexDirection: 'row', gap: theme.space.md }}>
                <View style={{ alignItems: 'center', width: 28 }}>
                  <View
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 14,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: theme.color.surfaceRaised,
                      borderWidth: 1,
                      borderColor: theme.color.border,
                    }}
                  >
                    <Ionicons
                      name={KIND_ICON[entry.kind] ?? 'ellipse-outline'}
                      size={14}
                      color={theme.color.goldSoft}
                    />
                  </View>
                  {last ? null : (
                    <View style={{ flex: 1, width: 1, backgroundColor: theme.color.border }} />
                  )}
                </View>

                <View style={{ flex: 1, paddingBottom: last ? 0 : theme.space.lg, gap: 2 }}>
                  <Txt variant="caption" color={theme.color.textSecondary} display={false}>
                    {TIMELINE_KIND_LABEL_TR[entry.kind] ?? entry.kind}
                    {' · '}
                    {new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long' }).format(
                      new Date(entry.date),
                    )}
                  </Txt>
                  <Txt variant="body" display={false}>
                    {entry.title}
                  </Txt>
                  {entry.detail ? (
                    <Txt variant="small" color={theme.color.textSecondary} display={false}>
                      {entry.detail}
                    </Txt>
                  ) : null}
                </View>
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}
