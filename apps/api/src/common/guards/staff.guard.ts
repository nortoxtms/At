import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';

import { DatabaseService } from '../../database/database.service.js';
import { ApiException } from '../filters/api-exception.filter.js';
import type { AuthenticatedRequest } from './auth.guard.js';

/**
 * Gates the §12 admin routes on `is_moderator` or `is_admin`.
 *
 * The flag is read from the database on every request rather than carried in
 * the session token: revoking a moderator has to take effect immediately, and
 * a token minted while they still held the role would otherwise stay valid for
 * its full lifetime.
 */
@Injectable()
export class StaffGuard implements CanActivate {
  constructor(private readonly db: DatabaseService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const profileId = request.profileId;

    if (!profileId) throw ApiException.unauthorized();

    const rows = await this.db.query<{ is_staff: boolean }>(
      `SELECT (is_moderator OR is_admin) AS is_staff
       FROM profiles WHERE id = $1 AND deleted_at IS NULL AND is_suspended = FALSE`,
      [profileId],
    );

    // NOT_FOUND, not FORBIDDEN: the existence of the admin console is not
    // something an ordinary user needs confirmed.
    if (!rows[0]?.is_staff) throw ApiException.notFound('Uç nokta');

    return true;
  }
}
