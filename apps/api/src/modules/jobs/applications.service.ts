import { Injectable, Logger } from '@nestjs/common';
import {
  type ApplicationDecisionInput,
  type ApplicationStatus,
  APPLICATION_STATUS_COPY,
  type ApplyToJobInput,
  canTransitionApplication,
} from '@only-horses/shared-types';

import { ApiException } from '../../common/filters/api-exception.filter.js';
import { DatabaseService } from '../../database/database.service.js';
import { ConversationsService } from '../messaging/conversations.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';

/**
 * Job applications — spec §12, §13.6, §17, §18.2 S19.
 *
 * §18.2 S19 ends with "Submit → creates a conversation with the poster", and
 * that is the design: an application is not a form that disappears into an
 * inbox, it opens the same thread every other contact on this platform uses.
 * The conversation carries the cover letter as its first message, so the
 * poster can simply reply, and every later status change is posted into that
 * same thread as a system message — the applicant sees the decision where they
 * are already looking.
 */
@Injectable()
export class ApplicationsService {
  private readonly logger = new Logger(ApplicationsService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly conversations: ConversationsService,
    private readonly notifications: NotificationsService,
  ) {}

  /** §12 POST /jobs/:id/apply. */
  async apply(
    profileId: string,
    jobIdOrSlug: string,
    input: ApplyToJobInput,
  ): Promise<{ id: string; conversationId: string; status: ApplicationStatus }> {
    const job = await this.loadOpenJob(jobIdOrSlug);

    if (job.poster_profile_id === profileId) {
      throw ApiException.validation('Kendi ilanına başvuramazsın.');
    }

    if (job.apply_method !== 'in_app') {
      throw ApiException.validation(
        job.apply_method === 'email'
          ? 'Bu ilana e-posta ile başvurulması isteniyor.'
          : 'Bu ilana ilan sahibinin sitesinden başvurulması isteniyor.',
        { applyMethod: job.apply_method, applyEmail: job.apply_email, applyUrl: job.apply_url },
      );
    }

    if (job.application_deadline && new Date(job.application_deadline) < startOfToday()) {
      throw ApiException.validation('Bu ilanın başvuru süresi doldu.');
    }

    const existing = await this.db.queryAs<{ id: string; status: string }>(
      profileId,
      `SELECT id, status FROM job_applications WHERE job_id = $1 AND applicant_id = $2`,
      [job.id, profileId],
    );

    if (existing[0]) {
      throw new ApiException('CONFLICT', 'Bu ilana zaten başvurdun.', 409, {
        applicationId: existing[0].id,
        status: existing[0].status,
      });
    }

    // The conversation comes first, and deliberately: it enforces §24.13's
    // block rule and §3.3's daily message cap, and an application whose thread
    // could not be opened is an application the poster can never answer.
    const { conversationId } = await this.conversations.create(profileId, {
      contextType: 'job',
      contextId: job.id,
      participantId: job.poster_profile_id!,
      firstMessage: input.coverLetter,
    });

    const rows = await this.db.withUser(profileId, async (client) => {
      const result = await client.query<{ id: string; status: ApplicationStatus }>(
        `INSERT INTO job_applications
           (job_id, applicant_id, cover_letter, cv_media_id, video_media_id, answers, conversation_id)
         VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7)
         RETURNING id, status`,
        [
          job.id,
          profileId,
          input.coverLetter,
          input.cvMediaId ?? null,
          input.videoMediaId ?? null,
          JSON.stringify(input.answers),
          conversationId,
        ],
      );
      return result.rows;
    });

    const application = rows[0]!;

    // No separate "new application" notification type: §17's table has none,
    // and the conversation the application just opened already sent
    // `message.new` to the poster with the cover letter in it. Adding a second
    // alert for one event would be this file inventing notification policy.
    this.logger.log(`Application ${application.id} submitted for job ${job.id}`);

    return { id: application.id, conversationId, status: application.status };
  }

  /** §12 GET /me/applications — §18.2 S24's "Başvurularım" tile. */
  async mine(profileId: string): Promise<unknown[]> {
    return this.db.queryAs(
      profileId,
      `SELECT a.id, a.status, a.status_note, a.created_at, a.updated_at, a.conversation_id,
              j.id AS job_id, j.slug AS job_slug, j.title AS job_title, j.job_type,
              j.city, j.country_code, j.status AS job_status,
              o.name AS organization_name
       FROM job_applications a
       JOIN job_listings j ON j.id = a.job_id
       LEFT JOIN organizations o ON o.id = j.organization_id
       WHERE a.applicant_id = $1
       ORDER BY a.created_at DESC`,
      [profileId],
    );
  }

  /**
   * §12 GET /jobs/:id/applications.
   *
   * Opening the list marks `submitted` applications as `viewed` (§13.6). The
   * status is the applicant's only signal that a human opened their
   * application, and no employer will ever click a "mark as viewed" button.
   */
  async forJob(profileId: string, jobId: string): Promise<unknown[]> {
    const viewed = await this.db.query<{ mark_applications_viewed: string }>(
      // system: attributed inside the function, which refuses anyone who is
      // not the poster or an org admin (migration 0038).
      `SELECT mark_applications_viewed($1, $2)`,
      [jobId, profileId],
    );

    const applications = await this.db.queryAs<Record<string, unknown>>(
      profileId,
      `SELECT a.id, a.status, a.status_note, a.cover_letter, a.answers,
              a.cv_media_id, a.video_media_id, a.conversation_id,
              a.created_at, a.updated_at,
              p.id AS applicant_id, p.handle AS applicant_handle,
              p.display_name AS applicant_name, p.city, p.country_code,
              p.verification_level, p.trust_score, p.languages,
              av.cf_image_id AS applicant_avatar,
              (SELECT coalesce(json_agg(json_build_object(
                        'role', rp.role, 'headline', rp.headline,
                        'yearsExperience', rp.years_experience,
                        'specialties', rp.specialties)), '[]'::json)
                 FROM role_profiles rp
                WHERE rp.profile_id = p.id AND rp.is_public) AS roles
       FROM job_applications a
       JOIN profiles p ON p.id = a.applicant_id
       LEFT JOIN media av ON av.id = p.avatar_media_id
       WHERE a.job_id = $1
       ORDER BY a.created_at DESC`,
      [jobId],
    );

    // An empty list from a poster's own job is indistinguishable from "you
    // cannot see this job", so the caller is told which it was.
    if (applications.length === 0) await this.assertCanReadApplications(profileId, jobId);

    for (const application of viewed) {
      const id = application.mark_applications_viewed;
      if (id) await this.notifyStatus(id, 'viewed', null);
    }

    return applications;
  }

  /**
   * §12 PATCH /applications/:id {status, note} — §13.6's state machine.
   *
   * "Every status change notifies the applicant." That is the DoD sentence for
   * this milestone, so the notification is dispatched here rather than left to
   * a client, and it goes out for the applicant's own withdrawal too — the
   * poster is the one who needs to hear that.
   */
  async decide(
    profileId: string,
    applicationId: string,
    input: ApplicationDecisionInput,
  ): Promise<{ status: ApplicationStatus }> {
    const context = await this.loadContext(profileId, applicationId);

    const actor =
      context.applicant_id === profileId
        ? ('applicant' as const)
        : context.can_decide
          ? ('poster' as const)
          : null;

    if (!actor) throw ApiException.notFound('Başvuru');

    const transition = canTransitionApplication(context.status, input.status, actor);
    if (!transition.allowed) throw ApiException.validation(transition.reasonTr!);

    await this.db.withUser(profileId, (client) =>
      client.query(
        `UPDATE job_applications SET status = $2::application_status, status_note = COALESCE($3, status_note)
         WHERE id = $1`,
        [applicationId, input.status, input.note ?? null],
      ),
    );

    if (actor === 'poster') {
      await this.notifyStatus(applicationId, input.status, input.note ?? null);
    } else if (context.poster_profile_id) {
      await this.notifications.dispatch({
        profileId: context.poster_profile_id,
        type: 'application.status_changed',
        title: `${context.job_title} · başvuru geri çekildi`,
        body: `${context.applicant_name} başvurusunu geri çekti.`,
        data: { applicationId, jobId: context.job_id, status: input.status },
        channels: ['push', 'in_app'],
      });
    }

    this.logger.log(`Application ${applicationId} → ${input.status} by ${actor}`);
    return { status: input.status };
  }

  /**
   * §17 `application.status_changed`, push + email.
   *
   * Also posted into the application's thread. A candidate who was shortlisted
   * three weeks ago should be able to read the history in one place rather
   * than reconstruct it from notifications they may have cleared.
   */
  private async notifyStatus(
    applicationId: string,
    status: ApplicationStatus,
    note: string | null,
  ): Promise<void> {
    const rows = await this.db.query<{
      applicant_id: string;
      job_id: string;
      job_title: string;
      conversation_id: string | null;
    }>(
      // system: routed through a SECURITY DEFINER function (migration 0042).
      // `applications_select` is written for the two parties, so read
      // unscoped this returned nothing and the notification was silently
      // skipped — which is the one thing §13.6 asks for.
      `SELECT * FROM application_notification_context($1)`,
      [applicationId],
    );

    const application = rows[0];
    if (!application) return;

    const copy = APPLICATION_STATUS_COPY[status];

    await this.notifications.dispatch({
      profileId: application.applicant_id,
      type: 'application.status_changed',
      title: `${application.job_title} · ${copy.tr}`,
      body: note ?? copy.tr,
      data: { applicationId, jobId: application.job_id, status },
      channels: ['push', 'email'],
      // One notification per state, not per click: an employer flipping
      // between "shortlisted" and back must not page the candidate twice.
      dedupeKey: `application_status:${applicationId}:${status}`,
    });

    if (application.conversation_id) {
      await this.conversations.postSystemMessage(
        application.conversation_id,
        note ? `${copy.tr} — ${note}` : copy.tr,
        { type: 'application_status', payload: { applicationId, status } },
      );
    }
  }

  private async loadOpenJob(idOrSlug: string): Promise<{
    id: string;
    poster_profile_id: string | null;
    apply_method: string;
    apply_email: string | null;
    apply_url: string | null;
    application_deadline: string | null;
  }> {
    // Unscoped by design: `jobs_select` shows active jobs to everyone, which
    // is exactly the set that may be applied to.
    const rows = await this.db.query<{
      id: string;
      poster_profile_id: string | null;
      apply_method: string;
      apply_email: string | null;
      apply_url: string | null;
      application_deadline: string | null;
      status: string;
    }>(
      `SELECT id, poster_profile_id, apply_method, apply_email, apply_url,
              application_deadline, status
       FROM job_listings
       WHERE (id::text = $1 OR slug = $1) AND status = 'active'`,
      [idOrSlug],
    );

    const job = rows[0];
    if (!job) throw ApiException.notFound('İş ilanı');
    if (!job.poster_profile_id) {
      // §7 sets `poster_profile_id` to NULL when the account is deleted; there
      // is nobody left to receive the application.
      throw ApiException.validation('Bu ilan artık başvuruya kapalı.');
    }

    return job;
  }

  private async assertCanReadApplications(profileId: string, jobId: string): Promise<void> {
    const rows = await this.db.queryAs<{ id: string }>(
      profileId,
      `SELECT j.id FROM job_listings j
       WHERE j.id = $1
         AND (j.poster_profile_id = $2 OR is_org_member(j.organization_id))`,
      [jobId, profileId],
    );

    if (!rows[0]) throw ApiException.notFound('İş ilanı');
  }

  private async loadContext(
    profileId: string,
    applicationId: string,
  ): Promise<{
    status: ApplicationStatus;
    applicant_id: string;
    applicant_name: string;
    job_id: string;
    job_title: string;
    poster_profile_id: string | null;
    can_decide: boolean;
  }> {
    const rows = await this.db.queryAs<{
      status: ApplicationStatus;
      applicant_id: string;
      applicant_name: string;
      job_id: string;
      job_title: string;
      poster_profile_id: string | null;
      can_decide: boolean;
    }>(
      profileId,
      `SELECT a.status, a.applicant_id, p.display_name AS applicant_name,
              j.id AS job_id, j.title AS job_title, j.poster_profile_id,
              (j.poster_profile_id = $2
               OR is_org_member(j.organization_id, ARRAY['owner','admin']::org_member_role[])) AS can_decide
       FROM job_applications a
       JOIN job_listings j ON j.id = a.job_id
       JOIN profiles p ON p.id = a.applicant_id
       WHERE a.id = $1`,
      [applicationId, profileId],
    );

    const context = rows[0];
    if (!context) throw ApiException.notFound('Başvuru');

    return context;
  }
}

function startOfToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}
