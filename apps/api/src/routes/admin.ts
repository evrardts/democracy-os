import { Router } from 'express';
import { Database } from '@democracy-os/database';
import { authenticate } from '../middleware/auth';
import { ForbiddenError } from '../utils/errors';
import { UserRole } from '@democracy-os/shared';

const router: ReturnType<typeof Router> = Router();
const db = new Database();

// Middleware to check admin access
const requireAdmin = (req: any, _res: any, next: any) => {
  if (!req.user || (req.user.role !== UserRole.ADMIN && req.user.role !== UserRole.MODERATOR && req.user.role !== UserRole.OFFICIAL)) {
    throw new ForbiddenError('Admin access required');
  }
  next();
};

// GET /api/admin/stats - Get platform statistics
router.get(
  '/stats',
  authenticate,
  requireAdmin,
  async (req, res, next) => {
    try {
      const tenantId = req.user!.tenantId;

      // Get counts in parallel
      const [pollsResult, votesResult, commentsResult, usersResult, reportsResult] = await Promise.all([
        db.query(
          'SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE status = $1) as active FROM polls WHERE tenant_id = $2',
          ['active', tenantId]
        ),
        db.query(
          'SELECT COUNT(*) as total FROM votes v JOIN polls p ON v.poll_id = p.id WHERE p.tenant_id = $1',
          [tenantId]
        ),
        db.query(
          'SELECT COUNT(*) as total FROM comments c JOIN polls p ON c.poll_id = p.id WHERE p.tenant_id = $1',
          [tenantId]
        ),
        db.query(
          'SELECT COUNT(*) as total FROM users WHERE tenant_id = $1',
          [tenantId]
        ),
        db.query(
          `SELECT COUNT(DISTINCT cr.comment_id) as total
           FROM comment_reports cr
           JOIN comments c ON cr.comment_id = c.id
           JOIN polls p ON c.poll_id = p.id
           WHERE p.tenant_id = $1 AND NOT EXISTS (
             SELECT 1 FROM comments c2 WHERE c2.id = cr.comment_id AND c2.is_hidden = true
           )`,
          [tenantId]
        ),
      ]);

      res.json({
        totalPolls: parseInt(pollsResult.rows[0]?.total || '0'),
        activePolls: parseInt(pollsResult.rows[0]?.active || '0'),
        totalVotes: parseInt(votesResult.rows[0]?.total || '0'),
        totalComments: parseInt(commentsResult.rows[0]?.total || '0'),
        totalUsers: parseInt(usersResult.rows[0]?.total || '0'),
        pendingReports: parseInt(reportsResult.rows[0]?.total || '0'),
      });
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/admin/users - List users (admin only)
router.get(
  '/users',
  authenticate,
  requireAdmin,
  async (req, res, next) => {
    try {
      const tenantId = req.user!.tenantId;
      const page = parseInt(req.query.page as string) || 1;
      const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
      const offset = (page - 1) * limit;

      const [usersResult, countResult] = await Promise.all([
        db.query(
          `SELECT id, email, display_name as "displayName", role,
                  created_at as "createdAt", updated_at as "updatedAt"
           FROM users
           WHERE tenant_id = $1
           ORDER BY created_at DESC
           LIMIT $2 OFFSET $3`,
          [tenantId, limit, offset]
        ),
        db.query(
          'SELECT COUNT(*) as total FROM users WHERE tenant_id = $1',
          [tenantId]
        ),
      ]);

      const total = parseInt(countResult.rows[0]?.total || '0');

      res.json({
        data: usersResult.rows,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

// PUT /api/admin/users/:userId/role - Update user role
router.put(
  '/users/:userId/role',
  authenticate,
  async (req, res, next): Promise<void> => {
    try {
      // Only admins can change roles
      if (req.user!.role !== UserRole.ADMIN) {
        throw new ForbiddenError('Only administrators can change user roles');
      }

      const { userId } = req.params;
      const { role } = req.body;
      const tenantId = req.user!.tenantId;

      // Validate role
      const validRoles = ['citizen', 'official', 'moderator', 'admin'];
      if (!validRoles.includes(role)) {
        res.status(400).json({ error: 'Invalid role' });
        return;
      }

      // Cannot change own role
      if (userId === req.user!.userId) {
        res.status(400).json({ error: 'Cannot change your own role' });
        return;
      }

      // Update user role
      const result = await db.query(
        `UPDATE users
         SET role = $1, updated_at = CURRENT_TIMESTAMP
         WHERE id = $2 AND tenant_id = $3
         RETURNING id, email, display_name as "displayName", role`,
        [role, userId, tenantId]
      );

      if (result.rows.length === 0) {
        res.status(404).json({ error: 'User not found' });
        return;
      }

      res.json(result.rows[0]);
    } catch (error) {
      next(error);
    }
  }
);

export default router;
