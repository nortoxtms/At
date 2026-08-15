import { DISCIPLINE_LABEL_TR } from '@only-horses/shared-types';

import { api } from '@/lib/api';
import { DISCIPLINES as DEMO_DISCIPLINES } from '@/lib/catalog';

/**
 * §7's reference data, loaded once from the API.
 *
 * The horse wizard was asking for a breed as free text and sending it as
 * `breedId`, which is a code from this table — "Arap" is not `arabian`, and a
 * code the table does not have is a foreign key the insert refuses. Same for
 * disciplines: the app carried its own Turkish names, which is a second
 * translation of the same enum, free to drift from the one the API serves.
 *
 * Cached in module scope rather than refetched per screen. This is a table
 * that changes with a migration, not with a session, and the wizard opening
 * with an empty breed list because a fetch was in flight is the failure worth
 * avoiding.
 */
export interface ReferenceItem {
  code: string;
  name: string;
  groupCode?: string;
  origin?: string | null;
}

let breeds: ReferenceItem[] | null = null;
let disciplines: ReferenceItem[] | null = null;

/**
 * Falls back to the labels compiled into the app.
 *
 * §7's discipline list is stable and the app already ships Turkish names for
 * it, so an unreachable API means an older list rather than an empty picker —
 * a wizard step with no options is a wizard nobody can finish.
 */
const FALLBACK_DISCIPLINES: ReferenceItem[] = DEMO_DISCIPLINES.map((code) => ({
  code,
  name: DISCIPLINE_LABEL_TR[code] ?? code,
}));

export async function loadBreeds(): Promise<ReferenceItem[]> {
  if (breeds) return breeds;

  const result = await api<ReferenceItem[]>('/reference/breeds', { auth: false });
  breeds = result.ok && Array.isArray(result.data) ? result.data : [];
  return breeds;
}

export async function loadDisciplines(): Promise<ReferenceItem[]> {
  if (disciplines) return disciplines;

  const result = await api<ReferenceItem[]>('/reference/disciplines', { auth: false });
  disciplines =
    result.ok && Array.isArray(result.data) && result.data.length > 0
      ? result.data
      : FALLBACK_DISCIPLINES;
  return disciplines;
}

/** The Turkish name for a code, from the loaded table or the bundled labels. */
export function disciplineName(code: string): string {
  return (
    disciplines?.find((entry) => entry.code === code)?.name ??
    DISCIPLINE_LABEL_TR[code] ??
    code
  );
}

export function breedName(code: string | null | undefined): string {
  if (!code) return '';
  return breeds?.find((entry) => entry.code === code)?.name ?? code;
}
