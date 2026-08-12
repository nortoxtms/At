import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { Env } from '../../config/env.js';
import { DatabaseService } from '../../database/database.service.js';

export interface ReferenceItem {
  code: string;
  name: string;
  sortOrder: number;
}

export interface BreedItem extends ReferenceItem {
  origin: string | null;
  groupCode: string | null;
  typicalHeightMinCm: number | null;
  typicalHeightMaxCm: number | null;
}

/**
 * Reference taxonomies — spec §9, §21.
 *
 * §21 requires per-locale name columns on all reference data. The locale is
 * resolved to a column here rather than shipping all four names to the client,
 * which keeps the payload small enough to cache on device.
 */
@Injectable()
export class ReferenceService {
  private static readonly SUPPORTED_LOCALES = ['en', 'tr', 'es', 'de'] as const;

  constructor(
    private readonly db: DatabaseService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /**
   * Locale is interpolated into the column name, so it must be validated
   * against a fixed list rather than parameterised — an unrecognised value
   * falls back to the default locale.
   */
  private nameColumn(locale?: string): string {
    const configured = this.config.get('DEFAULT_LOCALE', { infer: true }) ?? 'tr';
    const requested = (locale ?? configured).slice(0, 2);
    const supported = ReferenceService.SUPPORTED_LOCALES.includes(
      requested as (typeof ReferenceService.SUPPORTED_LOCALES)[number],
    );
    const resolved = supported ? requested : 'en';

    // name_en is NOT NULL; the others are nullable, so fall back to English.
    return resolved === 'en' ? 'name_en' : `COALESCE(name_${resolved}, name_en)`;
  }

  async breeds(locale?: string): Promise<BreedItem[]> {
    const rows = await this.db.query<{
      code: string;
      name: string;
      origin: string | null;
      group_code: string | null;
      typical_height_min_cm: number | null;
      typical_height_max_cm: number | null;
      sort_order: number;
    }>(
      `SELECT code, ${this.nameColumn(locale)} AS name, origin, group_code,
              typical_height_min_cm, typical_height_max_cm, sort_order
       FROM breeds ORDER BY sort_order, name`,
    );

    return rows.map((row) => ({
      code: row.code,
      name: row.name,
      origin: row.origin,
      groupCode: row.group_code,
      typicalHeightMinCm: row.typical_height_min_cm,
      typicalHeightMaxCm: row.typical_height_max_cm,
      sortOrder: row.sort_order,
    }));
  }

  async disciplines(locale?: string): Promise<ReferenceItem[]> {
    const rows = await this.db.query<{ code: string; name: string; sort_order: number }>(
      `SELECT code, ${this.nameColumn(locale)} AS name, sort_order
       FROM disciplines ORDER BY sort_order, name`,
    );
    return rows.map(toReferenceItem);
  }

  async serviceCategories(locale?: string): Promise<(ReferenceItem & { icon: string | null })[]> {
    const rows = await this.db.query<{
      code: string;
      name: string;
      icon: string | null;
      sort_order: number;
    }>(
      `SELECT code, ${this.nameColumn(locale)} AS name, icon, sort_order
       FROM service_categories ORDER BY sort_order, name`,
    );

    return rows.map((row) => ({ ...toReferenceItem(row), icon: row.icon }));
  }
}

function toReferenceItem(row: { code: string; name: string; sort_order: number }): ReferenceItem {
  return { code: row.code, name: row.name, sortOrder: row.sort_order };
}
