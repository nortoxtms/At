import { Injectable } from '@nestjs/common';
import {
  type CreateHealthRecordInput,
  HEALTH_TYPE_LABEL_TR,
  type HealthRecordType,
  suggestNextDue,
} from '@only-horses/shared-types';

import { ApiException } from '../../common/filters/api-exception.filter.js';
import { DatabaseService } from '../../database/database.service.js';
import { HorsesService } from '../horses/horses.service.js';

/**
 * Health records — spec §7, §12, §18.2 S12.
 *
 * §1.2: the registry is what gives the product weekly utility, and the health
 * file is the registry's core. §24.4 is the constraint everything here is
 * written against: "Health records are invisible to non-granted users on every
 * surface, including the API, the web page source, and the search index."
 */

export interface HealthRecord {
  id: string;
  type: HealthRecordType;
  typeLabel: string;
  title: string;
  notes: string | null;
  performedOn: string;
  nextDueOn: string | null;
  performedByName: string | null;
  clinicName: string | null;
  costAmount: number | null;
  costCurrency: string | null;
  documentMediaIds: string[];
  isSensitive: boolean;
}

export interface DueReminder {
  recordId: string;
  horseId: string;
  horseName: string;
  type: HealthRecordType;
  typeLabel: string;
  title: string;
  nextDueOn: string;
  daysUntil: number;
}

@Injectable()
export class HealthRecordsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly horses: HorsesService,
  ) {}

  /**
   * §24.4. The grant check happens here and the query runs through
   * `withUser`, so the §8 policy is a second gate rather than the only one —
   * either alone would be enough to pass a test, and neither alone is enough
   * to trust.
   */
  async list(horseId: string, viewerId: string, type?: HealthRecordType): Promise<HealthRecord[]> {
    const access = await this.resolveAccess(horseId, viewerId);
    if (access === 'none') throw ApiException.notFound('At');

    const rows = await this.db.withUser(viewerId, async (client) => {
      const result = await client.query(
        `SELECT id, type, title, notes, performed_on, next_due_on,
                performed_by_name, clinic_name, cost_amount, cost_currency,
                document_media_ids, is_sensitive
         FROM horse_health_records
         WHERE horse_id = $1
           AND ($2::health_record_type IS NULL OR type = $2)
           -- A granted buyer sees the health file, but not entries the owner
           -- marked sensitive (§18.2 S12).
           AND ($3 = TRUE OR is_sensitive = FALSE)
         ORDER BY performed_on DESC, created_at DESC`,
        [horseId, type ?? null, access === 'owner'],
      );
      return result.rows as Record<string, unknown>[];
    });

    return rows.map(toHealthRecord);
  }

  async create(
    profileId: string,
    horseId: string,
    input: CreateHealthRecordInput,
  ): Promise<{ id: string; nextDueOn: string | null }> {
    await this.horses.assertCanEdit(profileId, horseId);

    // §18.2 S12 auto-suggests the next due date. `undefined` means "accept the
    // suggestion"; explicit null means the owner opted out of a follow-up.
    const nextDueOn =
      input.nextDueOn === undefined
        ? suggestNextDue(input.type, input.performedOn)
        : input.nextDueOn;

    const rows = await this.db.withUser(profileId, async (client) => {
      const result = await client.query<{ id: string; next_due_on: string | null }>(
        `INSERT INTO horse_health_records (
           horse_id, type, title, notes, performed_on, next_due_on,
           performed_by_profile_id, performed_by_name, clinic_name,
           cost_amount, cost_currency, document_media_ids, is_sensitive, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
         RETURNING id, next_due_on`,
        [
          horseId,
          input.type,
          input.title,
          input.notes ?? null,
          input.performedOn,
          nextDueOn,
          input.performedByProfileId ?? null,
          input.performedByName ?? null,
          input.clinicName ?? null,
          input.costAmount ?? null,
          input.costCurrency ?? null,
          input.documentMediaIds,
          input.isSensitive,
          profileId,
        ],
      );
      return result.rows;
    });

    const record = rows[0]!;
    return {
      id: record.id,
      nextDueOn: record.next_due_on ? String(record.next_due_on).slice(0, 10) : null,
    };
  }

  async update(
    profileId: string,
    horseId: string,
    recordId: string,
    input: Record<string, unknown>,
  ): Promise<void> {
    await this.horses.assertCanEdit(profileId, horseId);

    const columns: Record<string, unknown> = {
      type: input.type,
      title: input.title,
      notes: input.notes,
      performed_on: input.performedOn,
      next_due_on: input.nextDueOn,
      performed_by_profile_id: input.performedByProfileId,
      performed_by_name: input.performedByName,
      clinic_name: input.clinicName,
      cost_amount: input.costAmount,
      cost_currency: input.costCurrency,
      document_media_ids: input.documentMediaIds,
      is_sensitive: input.isSensitive,
    };

    const present = Object.entries(columns).filter(([, value]) => value !== undefined);
    if (present.length === 0) return;

    const assignments = present.map(([column], index) => `${column} = $${index + 3}`);

    const result = await this.db.withUser(profileId, (client) =>
      client.query(
        `UPDATE horse_health_records SET ${assignments.join(', ')}
         WHERE id = $1 AND horse_id = $2`,
        [recordId, horseId, ...present.map(([, value]) => value)],
      ),
    );

    if (result.rowCount === 0) throw ApiException.notFound('Sağlık kaydı');
  }

  async remove(profileId: string, horseId: string, recordId: string): Promise<void> {
    await this.horses.assertCanEdit(profileId, horseId);

    const result = await this.db.withUser(profileId, (client) =>
      client.query(`DELETE FROM horse_health_records WHERE id = $1 AND horse_id = $2`, [
        recordId,
        horseId,
      ]),
    );

    if (result.rowCount === 0) throw ApiException.notFound('Sağlık kaydı');
  }

  /**
   * §12 GET /me/health/due — the "Yaklaşan bakımlar" section of §18.2 S09 and
   * the source the reminder job reads.
   *
   * Only the *earliest* outstanding record per horse and type is returned. A
   * horse with four years of vaccinations has four rows with a next_due_on;
   * three of them are already superseded, and showing them would make the
   * stable screen look like a backlog of neglect.
   */
  async due(profileId: string, withinDays = 30): Promise<DueReminder[]> {
    const rows = await this.db.queryAs<{
      record_id: string;
      horse_id: string;
      horse_name: string;
      type: HealthRecordType;
      title: string;
      next_due_on: string;
      days_until: number;
    }>(
      profileId,
      `SELECT DISTINCT ON (r.horse_id, r.type)
              r.id AS record_id, r.horse_id, h.name AS horse_name,
              r.type, r.title, r.next_due_on,
              (r.next_due_on - CURRENT_DATE) AS days_until
       FROM horse_health_records r
       JOIN horses h ON h.id = r.horse_id
       WHERE h.owner_profile_id = $1
         AND h.deleted_at IS NULL
         AND h.status = 'active'
         AND r.next_due_on IS NOT NULL
         AND r.next_due_on <= CURRENT_DATE + ($2 || ' days')::interval
       ORDER BY r.horse_id, r.type, r.next_due_on DESC
      `,
      [profileId, withinDays],
    );

    return rows
      .map((row) => ({
        recordId: row.record_id,
        horseId: row.horse_id,
        horseName: row.horse_name,
        type: row.type,
        typeLabel: HEALTH_TYPE_LABEL_TR[row.type],
        title: row.title,
        nextDueOn: String(row.next_due_on).slice(0, 10),
        daysUntil: Number(row.days_until),
      }))
      .sort((a, b) => a.daysUntil - b.daysUntil);
  }

  private async resolveAccess(
    horseId: string,
    viewerId: string,
  ): Promise<'owner' | 'granted' | 'none'> {
    const rows = await this.db.queryAs<{ is_owner: boolean; has_grant: boolean }>(
      viewerId,
      `SELECT
         EXISTS (SELECT 1 FROM horses h
                 WHERE h.id = $1 AND h.deleted_at IS NULL AND h.owner_profile_id = $2) AS is_owner,
         EXISTS (SELECT 1 FROM horse_access_grants g
                 WHERE g.horse_id = $1 AND g.grantee_id = $2 AND g.status = 'granted'
                   AND (g.expires_at IS NULL OR g.expires_at > now())
                   AND 'health' = ANY(g.scope)) AS has_grant`,
      [horseId, viewerId],
    );

    const access = rows[0];
    if (access?.is_owner) return 'owner';
    if (access?.has_grant) return 'granted';
    return 'none';
  }
}

function toHealthRecord(row: Record<string, unknown>): HealthRecord {
  const type = row.type as HealthRecordType;
  return {
    id: row.id as string,
    type,
    typeLabel: HEALTH_TYPE_LABEL_TR[type],
    title: row.title as string,
    notes: (row.notes as string | null) ?? null,
    performedOn: String(row.performed_on).slice(0, 10),
    nextDueOn: row.next_due_on ? String(row.next_due_on).slice(0, 10) : null,
    performedByName: (row.performed_by_name as string | null) ?? null,
    clinicName: (row.clinic_name as string | null) ?? null,
    costAmount: row.cost_amount === null ? null : Number(row.cost_amount),
    costCurrency: (row.cost_currency as string | null) ?? null,
    documentMediaIds: (row.document_media_ids as string[] | null) ?? [],
    isSensitive: Boolean(row.is_sensitive),
  };
}
