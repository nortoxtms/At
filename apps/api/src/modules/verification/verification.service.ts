import { Injectable, Logger } from '@nestjs/common';
import type { VerificationLevel } from '@only-horses/shared-types';

import { ApiException } from '../../common/filters/api-exception.filter.js';
import { DatabaseService } from '../../database/database.service.js';

/**
 * Verification ladder — spec §14.1, §12.
 *
 * §3.3 calls identity verification "the single most important anti-fraud
 * control", and §24.2 requires that publishing without it is impossible from
 * every client. Everything here exists to make that rung real: a level is only
 * ever raised by an approved `verifications` row, never by a client claim.
 */

export type VerificationKind =
  | 'email'
  | 'phone'
  | 'identity'
  | 'professional'
  | 'business'
  | 'horse_ownership';

/** §14.1's ladder, and what each rung unlocks. */
const LEVEL_FOR_KIND: Partial<Record<VerificationKind, VerificationLevel>> = {
  email: 'email_verified',
  phone: 'phone_verified',
  identity: 'identity_verified',
  professional: 'professional_verified',
  business: 'business_verified',
};

const LEVEL_ORDER: VerificationLevel[] = [
  'none',
  'email_verified',
  'phone_verified',
  'identity_verified',
  'professional_verified',
  'business_verified',
];

export interface LadderRung {
  kind: VerificationKind;
  level: VerificationLevel | null;
  state: 'completed' | 'in_review' | 'rejected' | 'available';
  benefitTr: string;
  decidedAt: string | null;
}

@Injectable()
export class VerificationService {
  private readonly logger = new Logger(VerificationService.name);

  constructor(private readonly db: DatabaseService) {}

  /** §18.2 S26 — the ladder UI, one row per rung with its state and benefit. */
  async ladder(profileId: string): Promise<LadderRung[]> {
    const [profile] = await this.db.queryAs<{ verification_level: VerificationLevel }>(
      profileId,
      `SELECT verification_level FROM profiles WHERE id = $1`,
      [profileId],
    );

    if (!profile) throw ApiException.notFound('Profil');

    const submissions = await this.db.queryAs<{
      kind: VerificationKind;
      status: string;
      decided_at: string | null;
    }>(
      profileId,
      `SELECT DISTINCT ON (kind) kind, status, decided_at
       FROM verifications WHERE profile_id = $1
       ORDER BY kind, submitted_at DESC`,
      [profileId],
    );

    const byKind = new Map(submissions.map((row) => [row.kind, row]));
    const current = LEVEL_ORDER.indexOf(profile.verification_level);

    const benefits: Record<VerificationKind, string> = {
      email: 'Gözat, kaydet, günde 3 mesaj gönder',
      phone: 'Günde 20 mesaj gönder',
      identity: 'İlan yayınla, iletişim bilgilerini gör, öne çıkar',
      professional: 'Rol profilinde profesyonel rozeti',
      business: 'İşletme rozeti ve işletme sayfası',
      horse_ownership: 'Atında “Sahiplik doğrulandı” rozeti',
    };

    return (Object.keys(benefits) as VerificationKind[]).map((kind) => {
      const submission = byKind.get(kind);
      const level = LEVEL_FOR_KIND[kind] ?? null;

      // A rung below the profile's current level counts as completed even
      // without a row: the ladder is cumulative (§14.1), and a user who
      // verified their identity should not be told to verify their email.
      const impliedByLevel = level !== null && current >= LEVEL_ORDER.indexOf(level);

      const state: LadderRung['state'] =
        submission?.status === 'approved' || impliedByLevel
          ? 'completed'
          : submission?.status === 'pending'
            ? 'in_review'
            : submission?.status === 'rejected'
              ? 'rejected'
              : 'available';

      return { kind, level, state, benefitTr: benefits[kind], decidedAt: submission?.decided_at ?? null };
    });
  }

  /**
   * Records a submission awaiting review. Professional, business and
   * horse-ownership go to the manual queue (§14.1); identity is decided by
   * Stripe and lands through the webhook.
   */
  async submit(
    profileId: string,
    input: {
      kind: VerificationKind;
      evidenceMediaIds?: string[];
      horseId?: string;
      organizationId?: string;
      provider?: string;
      providerRef?: string;
    },
  ): Promise<{ id: string; status: string }> {
    const pending = await this.db.queryAs<{ id: string }>(
      profileId,
      `SELECT id FROM verifications
       WHERE profile_id = $1 AND kind = $2 AND status = 'pending'`,
      [profileId, input.kind],
    );

    if (pending[0]) {
      // Resubmitting while a review is open would let a user flood the queue.
      throw new ApiException(
        'CONFLICT',
        'Bu doğrulama zaten inceleniyor.',
        409,
        { verificationId: pending[0].id },
      );
    }

    if (input.kind === 'horse_ownership' && !input.horseId) {
      throw ApiException.validation('Doğrulanacak atı seç.');
    }

    if (input.kind === 'business' && !input.organizationId) {
      throw ApiException.validation('Doğrulanacak işletmeyi seç.');
    }

    const rows = await this.db.withUser(profileId, async (client) => {
      const result = await client.query<{ id: string; status: string }>(
        `INSERT INTO verifications (profile_id, organization_id, kind, status, provider,
                                    provider_ref, evidence_media_ids, horse_id)
         VALUES ($1,$2,$3,'pending',$4,$5,$6,$7)
         RETURNING id, status`,
        [
          profileId,
          input.organizationId ?? null,
          input.kind,
          input.provider ?? 'manual',
          input.providerRef ?? null,
          input.evidenceMediaIds ?? [],
          input.horseId ?? null,
        ],
      );
      return result.rows;
    });

    return rows[0]!;
  }

  /**
   * Applies a decision. The only path that raises `profiles.verification_level`
   * — nothing a client sends can move it (§24.2).
   */
  async decide(
    verificationId: string,
    decision: { status: 'approved' | 'rejected'; reviewerId: string | null; note?: string },
  ): Promise<{ profileId: string; level: VerificationLevel | null }> {
    const rows = await this.db.query<{
      id: string;
      profile_id: string;
      kind: VerificationKind;
      horse_id: string | null;
      organization_id: string | null;
      status: string;
    }>(
      `SELECT id, profile_id, kind, horse_id, organization_id, status
       FROM verifications WHERE id = $1`,
      [verificationId],
    );

    const verification = rows[0];
    if (!verification) throw ApiException.notFound('Doğrulama');
    if (verification.status !== 'pending') {
      throw ApiException.validation('Bu doğrulama zaten karara bağlanmış.');
    }

    await this.db.query(
      `UPDATE verifications
       SET status = $2, reviewer_id = $3, reviewer_note = $4, decided_at = now()
       WHERE id = $1`,
      [verificationId, decision.status, decision.reviewerId, decision.note ?? null],
    );

    if (decision.status !== 'approved') {
      return { profileId: verification.profile_id, level: null };
    }

    const level = LEVEL_FOR_KIND[verification.kind] ?? null;

    if (level) {
      // Raise only — approving a professional badge must not demote someone
      // who is already business verified.
      await this.db.query(
        `UPDATE profiles
         SET verification_level = $2::verification_level
         WHERE id = $1
           AND array_position($3::verification_level[], verification_level)
               < array_position($3::verification_level[], $2::verification_level)`,
        [verification.profile_id, level, LEVEL_ORDER],
      );
    }

    if (verification.kind === 'horse_ownership' && verification.horse_id) {
      await this.db.query(`UPDATE horses SET ownership_verified_at = now() WHERE id = $1`, [
        verification.horse_id,
      ]);
    }

    if (verification.kind === 'business' && verification.organization_id) {
      await this.db.query(
        `UPDATE organizations SET verification_level = 'business_verified' WHERE id = $1`,
        [verification.organization_id],
      );
    }

    // §13.3: verification is worth up to 50 of the 100 trust points, so the
    // score is refreshed immediately rather than waiting for the nightly job.
    await this.db.query(`SELECT refresh_trust_score($1)`, [verification.profile_id]);

    this.logger.log(`Verification ${verification.kind} approved for ${verification.profile_id}`);

    return { profileId: verification.profile_id, level };
  }

  /** §12 GET /admin/verifications/queue. */
  async queue(status = 'pending', limit = 50): Promise<unknown[]> {
    return this.db.query(
      `SELECT v.id, v.kind, v.status, v.submitted_at, v.evidence_media_ids,
              v.horse_id, v.organization_id,
              p.handle, p.display_name, p.verification_level, p.trust_score
       FROM verifications v
       JOIN profiles p ON p.id = v.profile_id
       WHERE v.status = $1
       ORDER BY v.submitted_at
       LIMIT $2`,
      [status, limit],
    );
  }

  async mine(profileId: string): Promise<unknown[]> {
    return this.db.queryAs(
      profileId,
      `SELECT id, kind, status, submitted_at, decided_at, reviewer_note
       FROM verifications WHERE profile_id = $1 ORDER BY submitted_at DESC`,
      [profileId],
    );
  }
}
