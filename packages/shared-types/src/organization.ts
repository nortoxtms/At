import { z } from 'zod';

import { orgMemberRole, orgType } from './enums.js';

/**
 * Organizations — spec §7, §12, §19.1 `/ciftlik/[slug]`.
 *
 * The unit that makes §16.1's Business tier real: a farm page, staff accounts,
 * and listings published under a stable's name. §3.3 grants org owners and
 * admins the publishing rights the individual would otherwise hold.
 */

export const createOrganizationSchema = z.object({
  name: z.string().trim().min(2, 'İşletme adı en az 2 karakter olmalı.').max(140),
  type: orgType,
  countryCode: z.string().length(2),
  city: z.string().trim().max(120).optional(),
  about: z.string().trim().max(4000).optional(),
});
export type CreateOrganizationInput = z.infer<typeof createOrganizationSchema>;

export const updateOrganizationSchema = z.object({
  name: z.string().trim().min(2).max(140).optional(),
  type: orgType.optional(),
  about: z.string().trim().max(4000).nullish(),
  countryCode: z.string().length(2).optional(),
  region: z.string().trim().max(120).nullish(),
  city: z.string().trim().max(120).nullish(),
  addressLine: z.string().trim().max(240).nullish(),
  website: z.string().url().nullish(),
  email: z.string().email().nullish(),
  phone: z.string().trim().max(24).nullish(),
  facilities: z.array(z.string().max(60)).max(30).optional(),
  disciplines: z.array(z.string().max(60)).max(30).optional(),
  stallCount: z.number().int().min(0).max(5000).nullish(),
  logoMediaId: z.string().uuid().nullish(),
  coverMediaId: z.string().uuid().nullish(),
});
export type UpdateOrganizationInput = z.infer<typeof updateOrganizationSchema>;

/** §12 POST /organizations/:id/members {email, role}. */
export const inviteMemberSchema = z.object({
  email: z.string().email(),
  role: orgMemberRole.default('staff'),
});
export type InviteMemberInput = z.infer<typeof inviteMemberSchema>;

export const setMemberRoleSchema = z.object({ role: orgMemberRole });
export type SetMemberRoleInput = z.infer<typeof setMemberRoleSchema>;
