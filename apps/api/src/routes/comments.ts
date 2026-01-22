import { Router } from 'express';
import { body, param, query } from 'express-validator';
import { Database } from '@democracy-os/database';
import { authenticate } from '../middleware/auth';
import { commentLimiter } from '../middleware/rate-limit';
import { validate } from '../middleware/validate';
import { NotFoundError, ForbiddenError, BadRequestError } from '../utils/errors';
import {
  Comment,
  CommentWithAuthor,
  CreateCommentRequest,
  UpdateCommentRequest,
  CommentVoteRequest,
  CommentReportRequest,
} from '@democracy-os/shared';

const router: ReturnType<typeof Router> = Router();
const db = new Database();

// GET /api/polls/:pollId/comments - List comments for a poll
router.get(
  '/:pollId/comments',
  validate([
    param('pollId').isUUID().withMessage('Invalid poll ID'),
    query('sort').optional().isIn(['best', 'newest', 'controversial']).withMessage('Invalid sort'),
  ]),
  async (req, res, next) => {
    try {
      const { pollId } = req.params;
      const sort = (req.query.sort as string) || 'best';

      // Verify poll exists
      const pollResult = await db.query('SELECT id FROM polls WHERE id = $1', [pollId]);

      if (pollResult.rows.length === 0) {
        throw new NotFoundError('Poll not found');
      }

      // Get comments with vote counts and user votes
      let orderBy = 'c.created_at DESC';

      if (sort === 'best') {
        orderBy = '(COALESCE(upvotes, 0) - COALESCE(downvotes, 0)) DESC, c.created_at DESC';
      } else if (sort === 'controversial') {
        orderBy = '(COALESCE(upvotes, 0) + COALESCE(downvotes, 0)) DESC, ABS(COALESCE(upvotes, 0) - COALESCE(downvotes, 0)) ASC';
      }

      const result = await db.query<CommentWithAuthor>(
        `SELECT
          c.id, c.poll_id as "pollId", c.user_id as "userId",
          c.parent_id as "parentId", c.content, c.edit_history as "editHistory",
          c.created_at as "createdAt", c.updated_at as "updatedAt",
          u.id as "author.id", u.display_name as "author.displayName",
          COALESCE(upvotes, 0) as upvotes,
          COALESCE(downvotes, 0) as downvotes,
          (COALESCE(upvotes, 0) - COALESCE(downvotes, 0)) as score,
          COALESCE(report_count, 0) as "reportCount"
         FROM comments c
         INNER JOIN users u ON c.user_id = u.id
         LEFT JOIN (
           SELECT comment_id,
             SUM(CASE WHEN vote_type = 'upvote' THEN 1 ELSE 0 END) as upvotes,
             SUM(CASE WHEN vote_type = 'downvote' THEN 1 ELSE 0 END) as downvotes
           FROM comment_votes
           GROUP BY comment_id
         ) cv ON c.id = cv.comment_id
         LEFT JOIN (
           SELECT comment_id, COUNT(*) as report_count
           FROM comment_reports
           GROUP BY comment_id
         ) cr ON c.id = cr.comment_id
         WHERE c.poll_id = $1 AND c.parent_id IS NULL AND c.is_hidden = false
         ORDER BY ${orderBy}`,
        [pollId]
      );

      // Transform the flat result to nested structure
      const comments = result.rows.map((row: any) => ({
        id: row.id,
        pollId: row.pollId,
        userId: row.userId,
        parentId: row.parentId,
        content: row.content,
        editHistory: row.editHistory,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        author: {
          id: row['author.id'],
          displayName: row['author.displayName'],
        },
        upvotes: parseInt(row.upvotes),
        downvotes: parseInt(row.downvotes),
        score: parseInt(row.score),
        reportCount: parseInt(row.reportCount),
      }));

      res.json(comments);
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/polls/:pollId/comments - Create comment
router.post(
  '/:pollId/comments',
  authenticate,
  commentLimiter,
  validate([
    param('pollId').isUUID().withMessage('Invalid poll ID'),
    body('content').trim().isLength({ min: 1, max: 2000 }).withMessage('Content must be 1-2000 characters'),
    body('parentId').optional().isUUID().withMessage('Invalid parent ID'),
  ]),
  async (req, res, next) => {
    try {
      const { pollId } = req.params;
      const { content, parentId }: CreateCommentRequest = req.body;

      // Verify poll exists
      const pollResult = await db.query('SELECT id FROM polls WHERE id = $1', [pollId]);

      if (pollResult.rows.length === 0) {
        throw new NotFoundError('Poll not found');
      }

      // Verify parent comment exists if provided
      if (parentId) {
        const parentResult = await db.query(
          'SELECT id FROM comments WHERE id = $1 AND poll_id = $2',
          [parentId, pollId]
        );

        if (parentResult.rows.length === 0) {
          throw new NotFoundError('Parent comment not found');
        }
      }

      // Create comment
      const result = await db.query<Comment>(
        `INSERT INTO comments (poll_id, user_id, parent_id, content)
         VALUES ($1, $2, $3, $4)
         RETURNING id, poll_id as "pollId", user_id as "userId",
                   parent_id as "parentId", content, edit_history as "editHistory",
                   created_at as "createdAt", updated_at as "updatedAt"`,
        [pollId, req.user!.userId, parentId || null, content]
      );

      res.status(201).json(result.rows[0]);
    } catch (error) {
      next(error);
    }
  }
);

// PUT /api/comments/:id - Edit comment
router.put(
  '/:id',
  authenticate,
  validate([
    param('id').isUUID().withMessage('Invalid comment ID'),
    body('content').trim().isLength({ min: 1, max: 2000 }).withMessage('Content must be 1-2000 characters'),
  ]),
  async (req, res, next) => {
    try {
      const { id } = req.params;
      const { content }: UpdateCommentRequest = req.body;

      // Get existing comment
      const commentResult = await db.query(
        'SELECT user_id, content, edit_history FROM comments WHERE id = $1',
        [id]
      );

      if (commentResult.rows.length === 0) {
        throw new NotFoundError('Comment not found');
      }

      const comment = commentResult.rows[0];

      if (comment.user_id !== req.user!.userId) {
        throw new ForbiddenError('Only the author can edit this comment');
      }

      // Add current content to edit history
      const editHistory = comment.edit_history || [];
      editHistory.push({
        content: comment.content,
        editedAt: new Date(),
      });

      // Update comment
      const result = await db.query<Comment>(
        `UPDATE comments
         SET content = $1, edit_history = $2, updated_at = CURRENT_TIMESTAMP
         WHERE id = $3
         RETURNING id, poll_id as "pollId", user_id as "userId",
                   parent_id as "parentId", content, edit_history as "editHistory",
                   created_at as "createdAt", updated_at as "updatedAt"`,
        [content, JSON.stringify(editHistory), id]
      );

      res.json(result.rows[0]);
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/comments/:id/vote - Vote on comment
router.post(
  '/:id/vote',
  authenticate,
  validate([
    param('id').isUUID().withMessage('Invalid comment ID'),
    body('voteType').isIn(['upvote', 'downvote']).withMessage('Vote type must be upvote or downvote'),
  ]),
  async (req, res, next) => {
    try {
      const { id } = req.params;
      const { voteType }: CommentVoteRequest = req.body;

      // Verify comment exists
      const commentResult = await db.query('SELECT id FROM comments WHERE id = $1', [id]);

      if (commentResult.rows.length === 0) {
        throw new NotFoundError('Comment not found');
      }

      // Check if user already voted
      const existingVoteResult = await db.query(
        'SELECT id, vote_type FROM comment_votes WHERE comment_id = $1 AND user_id = $2',
        [id, req.user!.userId]
      );

      if (existingVoteResult.rows.length > 0) {
        const existingVote = existingVoteResult.rows[0];

        if (existingVote.vote_type === voteType) {
          // Remove vote if same type
          await db.query('DELETE FROM comment_votes WHERE id = $1', [existingVote.id]);
          res.json({ message: 'Vote removed' });
        } else {
          // Update vote if different type
          await db.query(
            'UPDATE comment_votes SET vote_type = $1 WHERE id = $2',
            [voteType, existingVote.id]
          );
          res.json({ message: 'Vote updated' });
        }
      } else {
        // Insert new vote
        await db.query(
          'INSERT INTO comment_votes (comment_id, user_id, vote_type) VALUES ($1, $2, $3)',
          [id, req.user!.userId, voteType]
        );
        res.json({ message: 'Vote recorded' });
      }
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/comments/:id/report - Report comment
router.post(
  '/:id/report',
  authenticate,
  validate([
    param('id').isUUID().withMessage('Invalid comment ID'),
    body('reason').isIn(['spam', 'hate', 'off_topic', 'harassment']).withMessage('Invalid report reason'),
  ]),
  async (req, res, next) => {
    try {
      const { id } = req.params;
      const { reason }: CommentReportRequest = req.body;

      // Verify comment exists
      const commentResult = await db.query('SELECT id FROM comments WHERE id = $1', [id]);

      if (commentResult.rows.length === 0) {
        throw new NotFoundError('Comment not found');
      }

      // Check if user already reported
      const existingReportResult = await db.query(
        'SELECT id FROM comment_reports WHERE comment_id = $1 AND reporter_id = $2',
        [id, req.user!.userId]
      );

      if (existingReportResult.rows.length > 0) {
        throw new BadRequestError('You have already reported this comment');
      }

      // Insert report
      await db.query(
        'INSERT INTO comment_reports (comment_id, reporter_id, reason) VALUES ($1, $2, $3)',
        [id, req.user!.userId, reason]
      );

      res.json({ message: 'Report submitted' });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
