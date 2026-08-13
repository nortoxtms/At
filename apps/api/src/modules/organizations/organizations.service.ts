import { Injectable, Logger } from '@nestjs/common';
import type {
  CreateOrganizationInput,
  InviteMemberInput,
  UpdateOrganizationInput,
} from '@only-horses/shared-types';

import { ApiException } from '../../common/filters/api-exception.filter.js';
import { DatabaseService } from '../../database/database.service.js';

/**
 * Organizations — spec §7, §12 "Organizations", §19.1 `/ciftlik/[slug]`.
 *
 * An organization is what makes §16.1's Business tier mean anything: a farm
 * page, staff accounts, and listings that carry the stable's name rather than
 * one person's. §3.3 gives org owners and admins the same publishing rights as
 * the individual who would otherwise own the listing.
 */
@Injectable()
export class OrganizationsService {
  private readonly logger = new Logger(OrganizationsService.name);

  constructor(private readonly db: DatabaseService) {}

  /** §12 POST /organizations. */
  async create(profileId: string, input: CreateOrganizationInput): Promise<{ id: string; slug: string }> {
    const slug = await this.allocateSlug(input.name);

    // system: creation writes the organization *and* its first membership, and
    // `org_members_write` requires being an admin of an organization that does
    // not exist yet (migration 0050).
    try {
      const rows = await this.db.query<{ id: string; slug: string }>(
        `SELECT * FROM create_organization($1, $2, $3, $4::org_type, $5, $6, $7)`,
        [
          profileId,
          slug,
          input.name,
          input.type,
          input.countryCode,
          input.city ?? null,
          input.about ?? null,
        ],
      );

      this.logger.log(`Organization ${rows[0]!.id} created by ${profileId}`);
      return rows[0]!;
    } catch (error) {
      if ((error as { code?: string }).code === '23505') {
        throw new ApiException('CONFLICT', 'Bu isimde bir işletme zaten var.', 409);
      }
      throw error;
    }
  }

  /** §12 GET /organizations/:slug — public (§19.1 renders it server-side). */
  async findBySlug(slug: string): Promise<Record<string, unknown>> {
    const rows = await this.db.query<Record<string, unknown>>(
      `SELECT * FROM organization_page($1)`,
      [slug],
    );

    const organization = rows[0];
    if (!organization) throw ApiException.notFound('İşletme');

    return organization;
  }

  /** §12 PATCH /organizations/:id — `organizations_update` decides who may. */
  async update(profileId: string, id: string, input: UpdateOrganizationInput): Promise<void> {
    const columns: Record<string, unknown> = {
      name: input.name,
      about: input.about,
      type: input.type,
      country_code: input.countryCode,
      region: input.region,
      city: input.city,
      address_line: input.addressLine,
      website: input.website,
      email: input.email,
      phone_e164: input.phone,
      facilities: input.facilities,
      disciplines: input.disciplines,
      stall_count: input.stallCount,
      logo_media_id: input.logoMediaId,
      cover_media_id: input.coverMediaId,
    };

    const present = Object.entries(columns).filter(([, value]) => value !== undefined);
    if (present.length === 0) return;

    const updated = await this.db.withUser(profileId, async (client) => {
      const assignments = present.map(([column], index) => `${column} = $${index + 2}`);
      const result = await client.query(
        `UPDATE organizations SET ${assignments.join(', ')} WHERE id = $1 RETURNING id`,
        [id, ...present.map(([, value]) => value)],
      );
      return result.rows;
    });

    // Zero rows means the policy refused: not an admin, or no such organization.
    if (updated.length === 0) throw ApiException.notFound('İşletme');
  }

  /** §12 POST /organizations/:id/members {email, role}. */
  async invite(
    profileId: string,
    organizationId: string,
    input: InviteMemberInput,
  ): Promise<{ invited: boolean }> {
    const rows = await this.db.query<{ invite_org_member: string | null }>(
      `SELECT invite_org_member($1, $2, $3, $4::org_member_role)`,
      [profileId, organizationId, input.email, input.role],
    );

    // Deliberately the same answer whether the address is unregistered or the
    // invite landed: an org admin should not be able to use this to discover
    // which email addresses have accounts.
    const invited = Boolean(rows[0]?.invite_org_member);
    this.logger.log(`Invite to ${organizationId} by ${profileId}: ${invited ? 'joined' : 'no account'}`);

    return { invited };
  }

  async members(profileId: string, organizationId: string): Promise<unknown[]> {
    const rows = await this.db.queryAs(
      profileId,
      `SELECT m.profile_id, m.role, m.title, m.invited_at, m.accepted_at,
              p.handle, p.display_name, av.cf_image_id AS avatar
       FROM organization_members m
       JOIN profiles p ON p.id = m.profile_id
       LEFT JOIN media av ON av.id = p.avatar_media_id
       WHERE m.organization_id = $1
       ORDER BY m.role, m.invited_at`,
      [organizationId],
    );

    // `org_members_select` shows the roster to members only, so an empty list
    // from a non-member is indistinguishable from an empty organization —
    // except that an organization always has at least its owner (0050).
    if (rows.length === 0) throw ApiException.notFound('İşletme');
    return rows;
  }

  async setMemberRole(
    profileId: string,
    organizationId: string,
    memberId: string,
    role: string,
  ): Promise<void> {
    await this.assertNotLastOwner(profileId, organizationId, memberId, role);

    const updated = await this.db.withUser(profileId, async (client) => {
      const result = await client.query(
        `UPDATE organization_members SET role = $3::org_member_role
         WHERE organization_id = $1 AND profile_id = $2 RETURNING profile_id`,
        [organizationId, memberId, role],
      );
      return result.rows;
    });

    if (updated.length === 0) throw ApiException.notFound('Üye');
  }

  async removeMember(profileId: string, organizationId: string, memberId: string): Promise<void> {
    await this.assertNotLastOwner(profileId, organizationId, memberId, 'staff');

    await this.db.withUser(profileId, (client) =>
      client.query(
        `DELETE FROM organization_members WHERE organization_id = $1 AND profile_id = $2`,
        [organizationId, memberId],
      ),
    );
  }

  async mine(profileId: string): Promise<unknown[]> {
    return this.db.queryAs(
      profileId,
      `SELECT o.id, o.slug, o.name, o.type, o.verification_level, m.role,
              logo.cf_image_id AS logo_image
       FROM organization_members m
       JOIN organizations o ON o.id = m.organization_id AND o.deleted_at IS NULL
       LEFT JOIN media logo ON logo.id = o.logo_media_id
       WHERE m.profile_id = $1
       ORDER BY o.name`,
      [profileId],
    );
  }

  /**
   * An organization without an owner cannot be administered again — the update
   * policy needs one, and no policy would let anyone else appoint one.
   */
  private async assertNotLastOwner(
    profileId: string,
    organizationId: string,
    memberId: string,
    nextRole: string,
  ): Promise<void> {
    if (nextRole === 'owner') return;

    const rows = await this.db.queryAs<{ owners: string; is_owner: boolean }>(
      profileId,
      `SELECT count(*) FILTER (WHERE role = 'owner')::text AS owners,
              bool_or(profile_id = $2 AND role = 'owner') AS is_owner
       FROM organization_members WHERE organization_id = $1`,
      [organizationId, memberId],
    );

    if (rows[0]?.is_owner && Number(rows[0].owners) <= 1) {
      throw ApiException.validation(
        'İşletmenin tek sahibi kaldırılamaz. Önce başka birini sahip yap.',
      );
    }
  }

  private async allocateSlug(name: string): Promise<string> {
    const base = slugify(name).slice(0, 60) || 'isletme';

    for (let attempt = 0; attempt < 50; attempt += 1) {
      const candidate = attempt === 0 ? base : `${base}-${attempt + 1}`;
      const rows = await this.db.query<{ taken: boolean }>(
        `SELECT EXISTS (SELECT 1 FROM organizations WHERE slug = $1) AS taken`,
        [candidate],
      );
      if (!rows[0]?.taken) return candidate;
    }

    return `${base}-${Date.now().toString(36)}`;
  }
}

function slugify(input: string): string {
  const turkish: Record<string, string> = {
    ı: 'i', İ: 'i', ş: 's', Ş: 's', ğ: 'g', Ğ: 'g',
    ü: 'u', Ü: 'u', ö: 'o', Ö: 'o', ç: 'c', Ç: 'c',
  };

  return input
    .replace(/[ıİşŞğĞüÜöÖçÇ]/g, (char) => turkish[char] ?? char)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
