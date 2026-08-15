/** A §9 reference row, as `/reference/*` returns it. */
export interface ReferenceItem {
  code: string;
  name: string;
  origin?: string | null;
  groupCode?: string | null;
}
