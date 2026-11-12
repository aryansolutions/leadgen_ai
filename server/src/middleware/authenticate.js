import jwt from 'jsonwebtoken';
import { query } from '../config/database.js';
import { env } from '../config/env.js';
import { HttpError } from '../utils/httpError.js';

export async function authenticate(request, response, next) {
  try {
    const authorization = request.headers.authorization || '';
    const token = authorization.startsWith('Bearer ')
      ? authorization.slice(7)
      : null;

    if (!token) {
      throw new HttpError(401, 'Authentication required.');
    }

    let payload;

    try {
      payload = jwt.verify(token, env.JWT_SECRET, {
        issuer: 'leadflow-api',
        audience: 'leadflow-client',
      });
    } catch {
      throw new HttpError(401, 'Session is invalid or expired. Please sign in again.');
    }

    const organizationId = request.headers['x-organization-id'];

    if (!organizationId) {
      throw new HttpError(400, 'Organization context is required.');
    }

    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      organizationId,
    );

    if (!isUuid) {
      throw new HttpError(400, 'Organization ID is invalid.');
    }

    const membership = await query(
      `SELECT
          u.id AS user_id,
          u.full_name,
          u.email,
          om.organization_id,
          om.role,
          o.name AS organization_name,
          o.slug AS organization_slug
       FROM users u
       JOIN organization_members om ON om.user_id = u.id
       JOIN organizations o ON o.id = om.organization_id
       WHERE u.id = $1
         AND om.organization_id = $2
         AND u.is_active = TRUE`,
      [payload.sub, organizationId],
    );

    if (membership.rowCount === 0) {
      throw new HttpError(403, 'You do not have access to this organization.');
    }

    request.user = membership.rows[0];
    next();
  } catch (error) {
    next(error);
  }
}

export function requireRole(...allowedRoles) {
  return (request, response, next) => {
    if (!request.user || !allowedRoles.includes(request.user.role)) {
      return next(new HttpError(403, 'You do not have permission to perform this action.'));
    }

    next();
  };
}
