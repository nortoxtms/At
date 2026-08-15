import { DEMO_BREEDS, DEMO_DISCIPLINES } from '@only-horses/demo-content';
import type { ReferenceItem } from '@only-horses/demo-content';

import { api } from '@/lib/api';

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


let breeds: ReferenceItem[] | null = null;
let disciplines: ReferenceItem[] | null = null;

/**
 * The bundled copies, used whenever the server does not answer.
 *
 * §9's tables change with a migration, not with a session, so shipping them is
 * cheap and the alternative is expensive: an unreachable API means a breed
 * picker with nothing in it, and a wizard step with no options is a wizard
 * nobody can finish.
 */
export async function loadBreeds(): Promise<ReferenceItem[]> {
  if (breeds) return breeds;

  const result = await api<ReferenceItem[]>('/reference/breeds', { auth: false });
  breeds =
    result.ok && Array.isArray(result.data) && result.data.length > 0
      ? result.data
      : [...DEMO_BREEDS];
  return breeds;
}

export async function loadDisciplines(): Promise<ReferenceItem[]> {
  if (disciplines) return disciplines;

  const result = await api<ReferenceItem[]>('/reference/disciplines', { auth: false });
  disciplines =
    result.ok && Array.isArray(result.data) && result.data.length > 0
      ? result.data
      : [...DEMO_DISCIPLINES];
  return disciplines;
}

/** The Turkish name for a code, from the loaded table or the bundled labels. */
export function disciplineName(code: string): string {
  return (
    disciplines?.find((entry) => entry.code === code)?.name ??
    DEMO_DISCIPLINES.find((entry) => entry.code === code)?.name ??
    code
  );
}

export function breedName(code: string | null | undefined): string {
  if (!code) return '';
  return (
    breeds?.find((entry) => entry.code === code)?.name ??
    DEMO_BREEDS.find((entry) => entry.code === code)?.name ??
    code
  );
}

export type { ReferenceItem };
