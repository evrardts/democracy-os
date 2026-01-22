import { Request, Response, NextFunction } from 'express';
import { Database } from '@democracy-os/database';
import { BadRequestError, NotFoundError } from '../utils/errors';
import { Tenant } from '@democracy-os/shared';

declare global {
  namespace Express {
    interface Request {
      tenant?: Tenant;
    }
  }
}

const db = new Database();

export async function extractTenant(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // Extract tenant from header, subdomain, or path
    const tenantSlug =
      req.headers['x-tenant-slug'] as string ||
      req.query.tenantSlug as string ||
      req.body.tenantSlug as string;

    if (!tenantSlug) {
      throw new BadRequestError('Tenant identifier is required');
    }

    const result = await db.query<Tenant>(
      'SELECT * FROM tenants WHERE slug = $1',
      [tenantSlug]
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('Tenant not found');
    }

    req.tenant = result.rows[0];
    next();
  } catch (error) {
    next(error);
  }
}

export async function optionalTenant(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const tenantSlug =
      req.headers['x-tenant-slug'] as string ||
      req.query.tenantSlug as string ||
      req.body.tenantSlug as string;

    if (tenantSlug) {
      const result = await db.query<Tenant>(
        'SELECT * FROM tenants WHERE slug = $1',
        [tenantSlug]
      );

      if (result.rows.length > 0) {
        req.tenant = result.rows[0];
      }
    }

    next();
  } catch (error) {
    next(error);
  }
}
