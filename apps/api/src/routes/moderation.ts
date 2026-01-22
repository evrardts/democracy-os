import { Router } from 'express';
import { query, param } from 'express-validator';
import { Database } from '@democracy-os/database';
import { authenticate } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { ForbiddenError, NotFoundError } from '../utils/errors';
import { UserRole } from '@democracy-os/shared';

const router: ReturnType<typeof Router> = Router();
const db = new Database();

// Middleware to check moderator access
const requireModerator = (req: any, _res: any, next: any) => {
  if (!req.user || (req.user.role !== UserRole.ADMIN && req.user.role !== UserRole.MODERATOR)) {
    throw new ForbiddenError('Moderator access required');
  }
  next();
};

// GET /api/moderation/comments - Get reported comments
router.get(
  '/comments',
  authenticate,
  requireModerator,
  validate([
    query('status').optional().isIn(['all', 'pending', 'hidden']).withMessage('Invalid status'),
    query('page').optional().isInt({ min: 1 }).withMessage('Page must be >= 1'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be 1-100'),
  ]),
  async (req, res, next) => {
    try {
      const tenantId = req.user!.tenantId;
      const status = (req.query.status as string) || 'pending';
      const page = parseInt(req.query.page as string) || 1;
      const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
      const offset = (page - 1) * limit;

      let whereClause = 'p.tenant_id = $1';
      if (status === 'pending') {
        whereClause += ' AND c.is_hidden = false';
      } else if (status === 'hidden') {
        whereClause += ' AND c.is_hidden = true';
      }

      const result = await db.query(
        `SELECT
           c.id,
           c.poll_id as "pollId",
           p.title as "pollTitle",
           c.content,
           u.display_name as "authorName",
           c.is_hidden as "isHidden",
           c.created_at as "createdAt",
           COUNT(cr.id) as "reportCount",
           ARRAY_AGG(DISTINCT cr.reason) FILTER (WHERE cr.reason IS NOT NULL) as "reportReasons"
         FROM comments c
         JOIN polls p ON c.poll_id = p.id
         JOIN users u ON c.user_id = u.id
         LEFT JOIN comment_reports cr ON c.id = cr.comment_id
         WHERE ${whereClause}
         GROUP BY c.id, p.title, u.display_name
         HAVING COUNT(cr.id) > 0
         ORDER BY COUNT(cr.id) DESC, c.created_at DESC
         LIMIT $2 OFFSET $3`,
        [tenantId, limit, offset]
      );

      // Get total count
      const countResult = await db.query(
        `SELECT COUNT(DISTINCT c.id) as total
         FROM comments c
         JOIN polls p ON c.poll_id = p.id
         LEFT JOIN comment_reports cr ON c.id = cr.comment_id
         WHERE ${whereClause}
         GROUP BY c.id
         HAVING COUNT(cr.id) > 0`,
        [tenantId]
      );

      const total = countResult.rows.length;

      res.json({
        data: result.rows.map(row => ({
          ...row,
          reportCount: parseInt(row.reportCount),
          reportReasons: row.reportReasons || [],
        })),
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

// POST /api/moderation/comments/:commentId/hide - Hide a comment
router.post(
  '/comments/:commentId/hide',
  authenticate,
  requireModerator,
  validate([
    param('commentId').isUUID().withMessage('Invalid comment ID'),
  ]),
  async (req, res, next) => {
    try {
      const { commentId } = req.params;
      const tenantId = req.user!.tenantId;

      // Verify comment belongs to tenant
      const commentResult = await db.query(
        `SELECT c.id FROM comments c
         JOIN polls p ON c.poll_id = p.id
         WHERE c.id = $1 AND p.tenant_id = $2`,
        [commentId, tenantId]
      );

      if (commentResult.rows.length === 0) {
        throw new NotFoundError('Comment not found');
      }

      // Hide the comment
      await db.query(
        `UPDATE comments
         SET is_hidden = true, updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [commentId]
      );

      // Log moderation action
      await db.query(
        `INSERT INTO audit_events (tenant_id, user_id, event_type, target_type, target_id, payload, payload_hash)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          tenantId,
          req.user!.userId,
          'comment_hidden',
          'comment',
          commentId,
          JSON.stringify({ action: 'hide', moderatorId: req.user!.userId }),
          require('crypto').createHash('sha256').update(JSON.stringify({ commentId, action: 'hide' })).digest('hex'),
        ]
      );

      res.json({ success: true, message: 'Comment hidden successfully' });
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/moderation/comments/:commentId/unhide - Unhide a comment
router.post(
  '/comments/:commentId/unhide',
  authenticate,
  requireModerator,
  validate([
    param('commentId').isUUID().withMessage('Invalid comment ID'),
  ]),
  async (req, res, next) => {
    try {
      const { commentId } = req.params;
      const tenantId = req.user!.tenantId;

      // Verify comment belongs to tenant
      const commentResult = await db.query(
        `SELECT c.id FROM comments c
         JOIN polls p ON c.poll_id = p.id
         WHERE c.id = $1 AND p.tenant_id = $2`,
        [commentId, tenantId]
      );

      if (commentResult.rows.length === 0) {
        throw new NotFoundError('Comment not found');
      }

      // Unhide the comment
      await db.query(
        `UPDATE comments
         SET is_hidden = false, updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [commentId]
      );

      res.json({ success: true, message: 'Comment unhidden successfully' });
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/moderation/comments/:commentId/dismiss - Dismiss reports on a comment
router.post(
  '/comments/:commentId/dismiss',
  authenticate,
  requireModerator,
  validate([
    param('commentId').isUUID().withMessage('Invalid comment ID'),
  ]),
  async (req, res, next) => {
    try {
      const { commentId } = req.params;
      const tenantId = req.user!.tenantId;

      // Verify comment belongs to tenant
      const commentResult = await db.query(
        `SELECT c.id FROM comments c
         JOIN polls p ON c.poll_id = p.id
         WHERE c.id = $1 AND p.tenant_id = $2`,
        [commentId, tenantId]
      );

      if (commentResult.rows.length === 0) {
        throw new NotFoundError('Comment not found');
      }

      // Delete reports for this comment
      await db.query(
        'DELETE FROM comment_reports WHERE comment_id = $1',
        [commentId]
      );

      res.json({ success: true, message: 'Reports dismissed successfully' });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
