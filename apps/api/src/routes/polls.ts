import { Router } from 'express';
import { body, param, query } from 'express-validator';
import { Database } from '@democracy-os/database';
import { authenticate, optionalAuthenticate } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { NotFoundError, ForbiddenError, BadRequestError } from '../utils/errors';
import {
  Poll,
  CreatePollRequest,
  UpdatePollRequest,
  PollStatus,
  PaginatedResponse,
} from '@democracy-os/shared';
import { v4 as uuidv4 } from 'uuid';

const router: ReturnType<typeof Router> = Router();
const db = new Database();

// GET /api/polls - List polls
router.get(
  '/',
  optionalAuthenticate,
  validate([
    query('tenantId').optional().isUUID().withMessage('Invalid tenant ID'),
    query('status').optional().isIn(['draft', 'active', 'closed']).withMessage('Invalid status'),
    query('type').optional().isIn(['quick_poll', 'multi_stage']).withMessage('Invalid poll type'),
    query('page').optional().isInt({ min: 1 }).withMessage('Page must be >= 1'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be 1-100'),
  ]),
  async (req, res, next) => {
    try {
      const tenantId = req.query.tenantId as string;
      const status = req.query.status as PollStatus;
      const pollType = req.query.type as string;
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const offset = (page - 1) * limit;

      let whereConditions = [];
      let params: any[] = [];
      let paramIndex = 1;

      if (tenantId) {
        whereConditions.push(`tenant_id = $${paramIndex++}`);
        params.push(tenantId);
      }

      if (pollType) {
        whereConditions.push(`poll_type = $${paramIndex++}`);
        params.push(pollType);
      }

      if (status) {
        whereConditions.push(`status = $${paramIndex++}`);
        params.push(status);
      } else if (!req.user) {
        // Non-authenticated users can only see active polls
        whereConditions.push(`status = $${paramIndex++}`);
        params.push('active');
      }

      const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

      // Get total count
      const countResult = await db.query(
        `SELECT COUNT(*) as total FROM polls ${whereClause}`,
        params
      );
      const total = parseInt(countResult.rows[0].total);

      // Get polls
      const result = await db.query<Poll>(
        `SELECT id, tenant_id as "tenantId", creator_id as "creatorId",
                title, description, poll_type as "pollType", status,
                start_time as "startTime", end_time as "endTime",
                options, tags, created_at as "createdAt", updated_at as "updatedAt"
         FROM polls
         ${whereClause}
         ORDER BY created_at DESC
         LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
        [...params, limit, offset]
      );

      const response: PaginatedResponse<Poll> = {
        data: result.rows,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      };

      res.json(response);
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/polls/:id - Get poll by ID
router.get(
  '/:id',
  optionalAuthenticate,
  validate([param('id').isUUID().withMessage('Invalid poll ID')]),
  async (req, res, next) => {
    try {
      const { id } = req.params;

      const result = await db.query<Poll>(
        `SELECT id, tenant_id as "tenantId", creator_id as "creatorId",
                title, description, poll_type as "pollType", status,
                start_time as "startTime", end_time as "endTime",
                options, tags, created_at as "createdAt", updated_at as "updatedAt"
         FROM polls
         WHERE id = $1`,
        [id]
      );

      if (result.rows.length === 0) {
        throw new NotFoundError('Poll not found');
      }

      const poll = result.rows[0];

      // Check access permissions
      if (poll.status === 'draft' && (!req.user || req.user.userId !== poll.creatorId)) {
        throw new ForbiddenError('Cannot access draft polls');
      }

      res.json(poll);
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/polls - Create poll
router.post(
  '/',
  authenticate,
  validate([
    body('title').trim().isLength({ min: 5, max: 500 }).withMessage('Title must be 5-500 characters'),
    body('description').optional().trim(),
    body('pollType').optional().isIn(['quick_poll', 'multi_stage']).withMessage('Invalid poll type'),
    body('startTime').optional().isISO8601().withMessage('Invalid start time'),
    body('endTime').optional().isISO8601().withMessage('Invalid end time'),
    body('options')
      .custom((value, { req }) => {
        // Multi-stage polls don't need options upfront (they come from ideas)
        if (req.body.pollType === 'multi_stage') {
          return true;
        }
        // Quick polls need at least 2 options
        if (!Array.isArray(value) || value.length < 2) {
          throw new Error('At least 2 options required for quick polls');
        }
        return true;
      }),
    body('options.*.text')
      .optional()
      .trim()
      .isLength({ min: 1, max: 200 })
      .withMessage('Option text must be 1-200 characters'),
    body('tags').optional().isArray().withMessage('Tags must be an array'),
  ]),
  async (req, res, next) => {
    try {
      const request: CreatePollRequest = req.body;

      // Assign IDs to options (empty array for multi_stage)
      const options = (request.options || []).map((opt) => ({
        id: uuidv4(),
        text: opt.text,
      }));

      const result = await db.query<Poll>(
        `INSERT INTO polls (tenant_id, creator_id, title, description, poll_type,
                           start_time, end_time, options, tags, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'draft')
         RETURNING id, tenant_id as "tenantId", creator_id as "creatorId",
                   title, description, poll_type as "pollType", status,
                   start_time as "startTime", end_time as "endTime",
                   options, tags, created_at as "createdAt", updated_at as "updatedAt"`,
        [
          req.user!.tenantId,
          req.user!.userId,
          request.title,
          request.description || null,
          request.pollType || 'quick_poll',
          request.startTime || null,
          request.endTime || null,
          JSON.stringify(options),
          request.tags || [],
        ]
      );

      res.status(201).json(result.rows[0]);
    } catch (error) {
      next(error);
    }
  }
);

// PUT /api/polls/:id - Update poll
router.put(
  '/:id',
  authenticate,
  validate([
    param('id').isUUID().withMessage('Invalid poll ID'),
    body('title').optional().trim().isLength({ min: 5, max: 500 }),
    body('description').optional().trim(),
    body('status').optional().isIn(['draft', 'active', 'closed']),
    body('startTime').optional().isISO8601(),
    body('endTime').optional().isISO8601(),
    body('tags').optional().isArray(),
  ]),
  async (req, res, next) => {
    try {
      const { id } = req.params;
      const update: UpdatePollRequest = req.body;

      // Check if poll exists and user is creator
      const pollResult = await db.query(
        'SELECT creator_id, status FROM polls WHERE id = $1',
        [id]
      );

      if (pollResult.rows.length === 0) {
        throw new NotFoundError('Poll not found');
      }

      const poll = pollResult.rows[0];

      if (poll.creator_id !== req.user!.userId) {
        throw new ForbiddenError('Only the creator can update this poll');
      }

      // Build update query
      const updates: string[] = [];
      const params: any[] = [];
      let paramIndex = 1;

      if (update.title !== undefined) {
        updates.push(`title = $${paramIndex++}`);
        params.push(update.title);
      }

      if (update.description !== undefined) {
        updates.push(`description = $${paramIndex++}`);
        params.push(update.description);
      }

      if (update.status !== undefined) {
        updates.push(`status = $${paramIndex++}`);
        params.push(update.status);
      }

      if (update.startTime !== undefined) {
        updates.push(`start_time = $${paramIndex++}`);
        params.push(update.startTime);
      }

      if (update.endTime !== undefined) {
        updates.push(`end_time = $${paramIndex++}`);
        params.push(update.endTime);
      }

      if (update.tags !== undefined) {
        updates.push(`tags = $${paramIndex++}`);
        params.push(update.tags);
      }

      if (updates.length === 0) {
        throw new BadRequestError('No fields to update');
      }

      params.push(id);

      const result = await db.query<Poll>(
        `UPDATE polls
         SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP
         WHERE id = $${paramIndex}
         RETURNING id, tenant_id as "tenantId", creator_id as "creatorId",
                   title, description, poll_type as "pollType", status,
                   start_time as "startTime", end_time as "endTime",
                   options, tags, created_at as "createdAt", updated_at as "updatedAt"`,
        params
      );

      res.json(result.rows[0]);
    } catch (error) {
      next(error);
    }
  }
);

// DELETE /api/polls/:id - Delete poll
router.delete(
  '/:id',
  authenticate,
  validate([param('id').isUUID().withMessage('Invalid poll ID')]),
  async (req, res, next) => {
    try {
      const { id } = req.params;

      // Check if poll exists and user is creator
      const pollResult = await db.query(
        'SELECT creator_id FROM polls WHERE id = $1',
        [id]
      );

      if (pollResult.rows.length === 0) {
        throw new NotFoundError('Poll not found');
      }

      if (pollResult.rows[0].creator_id !== req.user!.userId) {
        throw new ForbiddenError('Only the creator can delete this poll');
      }

      // Check if poll has votes
      const votesResult = await db.query(
        'SELECT COUNT(*) as count FROM votes WHERE poll_id = $1',
        [id]
      );

      if (parseInt(votesResult.rows[0].count) > 0) {
        throw new BadRequestError('Cannot delete poll with votes');
      }

      await db.query('DELETE FROM polls WHERE id = $1', [id]);

      res.status(204).send();
    } catch (error) {
      next(error);
    }
  }
);

export default router;
