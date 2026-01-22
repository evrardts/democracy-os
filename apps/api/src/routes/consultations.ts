import { Router } from 'express';
import { body, param, query } from 'express-validator';
import { Database } from '@democracy-os/database';
import { authenticate } from '../middleware/auth';
import { voteLimiter } from '../middleware/rate-limit';
import { validate } from '../middleware/validate';
import { NotFoundError, ForbiddenError, BadRequestError } from '../utils/errors';
import {
  ConsultationIdeaWithAuthor,
  ConsultationStageInfo,
  CreateIdeaRequest,
  VoteOnIdeaRequest,
  TransitionStageRequest,
  IdeaStatus,
  PaginatedResponse,
} from '@democracy-os/shared';
import { v4 as uuidv4 } from 'uuid';

const router: ReturnType<typeof Router> = Router();
const db = new Database();

// POST /api/consultations/create-stages - Create consultation stage info
router.post(
  '/create-stages',
  authenticate,
  validate([
    body('pollId').isUUID().withMessage('Invalid poll ID'),
    body('stage1Start').isISO8601().withMessage('Invalid stage 1 start date'),
    body('stage1End').isISO8601().withMessage('Invalid stage 1 end date'),
    body('stage2Start').isISO8601().withMessage('Invalid stage 2 start date'),
    body('stage2End').isISO8601().withMessage('Invalid stage 2 end date'),
    body('stage3Start').isISO8601().withMessage('Invalid stage 3 start date'),
    body('stage3End').isISO8601().withMessage('Invalid stage 3 end date'),
    body('minIdeasForStage2').optional().isInt({ min: 1 }).withMessage('Must be >= 1'),
    body('shortlistSize').optional().isInt({ min: 1 }).withMessage('Must be >= 1'),
  ]),
  async (req, res, next) => {
    try {
      const {
        pollId,
        stage1Start,
        stage1End,
        stage2Start,
        stage2End,
        stage3Start,
        stage3End,
        minIdeasForStage2,
        shortlistSize,
      } = req.body;

      // Verify poll exists and user is creator
      const pollResult = await db.query(
        'SELECT creator_id, poll_type FROM polls WHERE id = $1',
        [pollId]
      );

      if (pollResult.rows.length === 0) {
        throw new NotFoundError('Poll not found');
      }

      if (pollResult.rows[0].creator_id !== req.user!.userId) {
        throw new ForbiddenError('Only poll creator can create stage info');
      }

      if (pollResult.rows[0].poll_type !== 'multi_stage') {
        throw new BadRequestError('Poll must be of type multi_stage');
      }

      // Check if stages already exist
      const existingStageResult = await db.query(
        'SELECT id FROM consultation_stages WHERE poll_id = $1',
        [pollId]
      );

      if (existingStageResult.rows.length > 0) {
        throw new BadRequestError('Consultation stages already exist for this poll');
      }

      // Create consultation stages
      const stageId = uuidv4();
      await db.query(
        `INSERT INTO consultation_stages (
          id, poll_id, stage_1_start, stage_1_end, stage_2_start, stage_2_end,
          stage_3_start, stage_3_end, min_ideas_for_stage_2, shortlist_size
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          stageId,
          pollId,
          new Date(stage1Start),
          new Date(stage1End),
          new Date(stage2Start),
          new Date(stage2End),
          new Date(stage3Start),
          new Date(stage3End),
          minIdeasForStage2 || 10,
          shortlistSize || 5,
        ]
      );

      res.status(201).json({ success: true, stageId });
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/consultations/:pollId/stage - Get current stage info
router.get(
  '/:pollId/stage',
  validate([param('pollId').isUUID().withMessage('Invalid poll ID')]),
  async (req, res, next) => {
    try {
      const { pollId } = req.params;

      // Verify poll is multi-stage type
      const pollResult = await db.query(
        'SELECT poll_type FROM polls WHERE id = $1',
        [pollId]
      );

      if (pollResult.rows.length === 0) {
        throw new NotFoundError('Poll not found');
      }

      if (pollResult.rows[0].poll_type !== 'multi_stage') {
        throw new BadRequestError('Poll is not a multi-stage consultation');
      }

      // Get stage info
      const stageResult = await db.query(
        `SELECT * FROM consultation_stages WHERE poll_id = $1`,
        [pollId]
      );

      if (stageResult.rows.length === 0) {
        throw new NotFoundError('Consultation stage info not found');
      }

      const stage: ConsultationStageInfo = {
        id: stageResult.rows[0].id,
        pollId: stageResult.rows[0].poll_id,
        currentStage: stageResult.rows[0].current_stage,
        stage1Start: stageResult.rows[0].stage_1_start,
        stage1End: stageResult.rows[0].stage_1_end,
        stage2Start: stageResult.rows[0].stage_2_start,
        stage2End: stageResult.rows[0].stage_2_end,
        stage3Start: stageResult.rows[0].stage_3_start,
        stage3End: stageResult.rows[0].stage_3_end,
        minIdeasForStage2: stageResult.rows[0].min_ideas_for_stage_2,
        shortlistSize: stageResult.rows[0].shortlist_size,
        createdAt: stageResult.rows[0].created_at,
        updatedAt: stageResult.rows[0].updated_at,
      };

      res.json(stage);
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/consultations/:pollId/ideas - Submit idea (Stage 1)
router.post(
  '/:pollId/ideas',
  authenticate,
  voteLimiter,
  validate([
    param('pollId').isUUID().withMessage('Invalid poll ID'),
    body('title').notEmpty().withMessage('Title is required').isLength({ max: 500 }),
    body('description').notEmpty().withMessage('Description is required'),
  ]),
  async (req, res, next) => {
    try {
      const { pollId } = req.params;
      const { title, description }: CreateIdeaRequest = req.body;

      // Verify consultation is in stage 1
      const stageResult = await db.query(
        'SELECT current_stage, stage_1_start, stage_1_end FROM consultation_stages WHERE poll_id = $1',
        [pollId]
      );

      if (stageResult.rows.length === 0) {
        throw new NotFoundError('Consultation not found');
      }

      const stage = stageResult.rows[0];

      if (stage.current_stage !== 'idea_collection') {
        throw new BadRequestError('Idea submission is only allowed during Stage 1 (Idea Collection)');
      }

      // Check if we're within the time window
      const now = new Date();
      if (stage.stage_1_start && new Date(stage.stage_1_start) > now) {
        throw new BadRequestError('Stage 1 has not started yet');
      }

      if (stage.stage_1_end && new Date(stage.stage_1_end) < now) {
        throw new BadRequestError('Stage 1 has ended');
      }

      // Create idea
      const ideaId = uuidv4();
      await db.query(
        `INSERT INTO consultation_ideas (id, poll_id, submitter_id, title, description)
         VALUES ($1, $2, $3, $4, $5)`,
        [ideaId, pollId, req.user!.userId, title, description]
      );

      // Fetch created idea
      const ideaResult = await db.query(
        `SELECT ci.*, u.display_name as submitter_name
         FROM consultation_ideas ci
         JOIN users u ON ci.submitter_id = u.id
         WHERE ci.id = $1`,
        [ideaId]
      );

      const idea: ConsultationIdeaWithAuthor = {
        id: ideaResult.rows[0].id,
        pollId: ideaResult.rows[0].poll_id,
        submitterId: ideaResult.rows[0].submitter_id,
        title: ideaResult.rows[0].title,
        description: ideaResult.rows[0].description,
        upvotes: ideaResult.rows[0].upvotes,
        downvotes: ideaResult.rows[0].downvotes,
        status: ideaResult.rows[0].status,
        submitter: {
          id: ideaResult.rows[0].submitter_id,
          displayName: ideaResult.rows[0].submitter_name,
        },
        score: 0,
        createdAt: ideaResult.rows[0].created_at,
        updatedAt: ideaResult.rows[0].updated_at,
      };

      res.status(201).json(idea);
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/consultations/:pollId/ideas - List ideas
router.get(
  '/:pollId/ideas',
  validate([
    param('pollId').isUUID().withMessage('Invalid poll ID'),
    query('status').optional().isIn(['submitted', 'shortlisted', 'rejected', 'winner']),
    query('sort').optional().isIn(['score', 'newest']).withMessage('Invalid sort'),
    query('page').optional().isInt({ min: 1 }).withMessage('Page must be >= 1'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be 1-100'),
  ]),
  async (req, res, next) => {
    try {
      const { pollId } = req.params;
      const status = req.query.status as IdeaStatus | undefined;
      const sort = (req.query.sort as string) || 'score';
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const offset = (page - 1) * limit;

      let whereClause = 'WHERE ci.poll_id = $1';
      const params: any[] = [pollId];
      let paramIndex = 2;

      if (status) {
        whereClause += ` AND ci.status = $${paramIndex++}`;
        params.push(status);
      }

      let orderClause = 'ORDER BY (ci.upvotes - ci.downvotes) DESC, ci.created_at DESC';
      if (sort === 'newest') {
        orderClause = 'ORDER BY ci.created_at DESC';
      }

      // Get total count
      const countResult = await db.query(
        `SELECT COUNT(*) FROM consultation_ideas ci ${whereClause}`,
        params
      );
      const total = parseInt(countResult.rows[0].count);

      // Get ideas with submitter info and user's vote
      const userId = (req as any).user?.userId;
      const ideasResult = await db.query(
        `SELECT ci.*,
                u.display_name as submitter_name,
                (ci.upvotes - ci.downvotes) as score
                ${userId ? `, (SELECT vote_type FROM consultation_idea_votes WHERE idea_id = ci.id AND user_id = $${paramIndex}) as user_vote` : ''}
         FROM consultation_ideas ci
         JOIN users u ON ci.submitter_id = u.id
         ${whereClause}
         ${orderClause}
         LIMIT $${paramIndex + (userId ? 1 : 0)} OFFSET $${paramIndex + (userId ? 2 : 1)}`,
        userId ? [...params, userId, limit, offset] : [...params, limit, offset]
      );

      const ideas: ConsultationIdeaWithAuthor[] = ideasResult.rows.map((row) => ({
        id: row.id,
        pollId: row.poll_id,
        submitterId: row.submitter_id,
        title: row.title,
        description: row.description,
        upvotes: row.upvotes,
        downvotes: row.downvotes,
        status: row.status,
        submitter: {
          id: row.submitter_id,
          displayName: row.submitter_name,
        },
        score: row.score,
        userVote: row.user_vote,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }));

      const response: PaginatedResponse<ConsultationIdeaWithAuthor> = {
        data: ideas,
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

// POST /api/consultations/:pollId/ideas/:ideaId/vote - Vote on idea
router.post(
  '/:pollId/ideas/:ideaId/vote',
  authenticate,
  voteLimiter,
  validate([
    param('pollId').isUUID().withMessage('Invalid poll ID'),
    param('ideaId').isUUID().withMessage('Invalid idea ID'),
    body('voteType').isIn(['upvote', 'downvote']).withMessage('Invalid vote type'),
  ]),
  async (req, res, next) => {
    try {
      const { pollId, ideaId } = req.params;
      const { voteType }: VoteOnIdeaRequest = req.body;

      // Verify idea exists
      const ideaResult = await db.query(
        'SELECT id FROM consultation_ideas WHERE id = $1 AND poll_id = $2',
        [ideaId, pollId]
      );

      if (ideaResult.rows.length === 0) {
        throw new NotFoundError('Idea not found');
      }

      // Check if user has already voted
      const existingVoteResult = await db.query(
        'SELECT id, vote_type FROM consultation_idea_votes WHERE idea_id = $1 AND user_id = $2',
        [ideaId, req.user!.userId]
      );

      await db.query('BEGIN');

      try {
        if (existingVoteResult.rows.length > 0) {
          const existingVote = existingVoteResult.rows[0];

          // If same vote type, remove vote (toggle off)
          if (existingVote.vote_type === voteType) {
            await db.query(
              'DELETE FROM consultation_idea_votes WHERE id = $1',
              [existingVote.id]
            );

            // Update idea vote count
            const field = voteType === 'upvote' ? 'upvotes' : 'downvotes';
            await db.query(
              `UPDATE consultation_ideas SET ${field} = ${field} - 1 WHERE id = $1`,
              [ideaId]
            );
          } else {
            // Change vote type
            await db.query(
              'UPDATE consultation_idea_votes SET vote_type = $1 WHERE id = $2',
              [voteType, existingVote.id]
            );

            // Update idea vote counts (decrement old, increment new)
            const oldField = existingVote.vote_type === 'upvote' ? 'upvotes' : 'downvotes';
            const newField = voteType === 'upvote' ? 'upvotes' : 'downvotes';
            await db.query(
              `UPDATE consultation_ideas SET ${oldField} = ${oldField} - 1, ${newField} = ${newField} + 1 WHERE id = $1`,
              [ideaId]
            );
          }
        } else {
          // Create new vote
          await db.query(
            'INSERT INTO consultation_idea_votes (id, idea_id, user_id, vote_type) VALUES ($1, $2, $3, $4)',
            [uuidv4(), ideaId, req.user!.userId, voteType]
          );

          // Update idea vote count
          const field = voteType === 'upvote' ? 'upvotes' : 'downvotes';
          await db.query(
            `UPDATE consultation_ideas SET ${field} = ${field} + 1 WHERE id = $1`,
            [ideaId]
          );
        }

        await db.query('COMMIT');

        res.json({ success: true });
      } catch (error) {
        await db.query('ROLLBACK');
        throw error;
      }
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/consultations/:pollId/transition - Transition to next stage (admin only)
router.post(
  '/:pollId/transition',
  authenticate,
  validate([
    param('pollId').isUUID().withMessage('Invalid poll ID'),
    body('nextStage')
      .isIn(['shortlist_selection', 'final_arbitration'])
      .withMessage('Invalid stage'),
  ]),
  async (req, res, next) => {
    try {
      const { pollId } = req.params;
      const { nextStage }: TransitionStageRequest = req.body;

      // Check user is creator or elected official/admin
      const pollResult = await db.query(
        'SELECT creator_id FROM polls WHERE id = $1',
        [pollId]
      );

      if (pollResult.rows.length === 0) {
        throw new NotFoundError('Poll not found');
      }

      const userResult = await db.query(
        'SELECT role FROM users WHERE id = $1',
        [req.user!.userId]
      );

      const isCreator = pollResult.rows[0].creator_id === req.user!.userId;
      const isOfficial = ['elected_official', 'administration'].includes(userResult.rows[0].role);

      if (!isCreator && !isOfficial) {
        throw new ForbiddenError('Only poll creator or officials can transition stages');
      }

      // Get current stage
      const stageResult = await db.query(
        'SELECT current_stage, min_ideas_for_stage_2, shortlist_size FROM consultation_stages WHERE poll_id = $1',
        [pollId]
      );

      if (stageResult.rows.length === 0) {
        throw new NotFoundError('Consultation stage info not found');
      }

      const currentStage = stageResult.rows[0].current_stage;
      const minIdeas = stageResult.rows[0].min_ideas_for_stage_2;
      const shortlistSize = stageResult.rows[0].shortlist_size;

      // Validate transition
      if (currentStage === 'idea_collection' && nextStage === 'shortlist_selection') {
        // Check minimum ideas
        const ideasCountResult = await db.query(
          'SELECT COUNT(*) FROM consultation_ideas WHERE poll_id = $1',
          [pollId]
        );
        const ideasCount = parseInt(ideasCountResult.rows[0].count);

        if (ideasCount < minIdeas) {
          throw new BadRequestError(
            `Cannot transition to Stage 2: Need at least ${minIdeas} ideas (currently ${ideasCount})`
          );
        }

        // Automatically shortlist top ideas by score
        await db.query(
          `UPDATE consultation_ideas
           SET status = 'shortlisted'
           WHERE id IN (
             SELECT id FROM consultation_ideas
             WHERE poll_id = $1
             ORDER BY (upvotes - downvotes) DESC, created_at ASC
             LIMIT $2
           )`,
          [pollId, shortlistSize]
        );

        // Mark others as rejected
        await db.query(
          `UPDATE consultation_ideas
           SET status = 'rejected'
           WHERE poll_id = $1 AND status = 'submitted'`,
          [pollId]
        );
      } else if (currentStage === 'shortlist_selection' && nextStage === 'final_arbitration') {
        // Get shortlisted ideas and create poll options
        const shortlistedResult = await db.query(
          `SELECT id, title FROM consultation_ideas
           WHERE poll_id = $1 AND status = 'shortlisted'
           ORDER BY (upvotes - downvotes) DESC`,
          [pollId]
        );

        const options = shortlistedResult.rows.map((row) => ({
          id: row.id,
          text: row.title,
        }));

        // Update poll with final options
        await db.query(
          'UPDATE polls SET options = $1 WHERE id = $2',
          [JSON.stringify(options), pollId]
        );
      } else {
        throw new BadRequestError('Invalid stage transition');
      }

      // Update current stage
      await db.query(
        'UPDATE consultation_stages SET current_stage = $1 WHERE poll_id = $2',
        [nextStage, pollId]
      );

      res.json({ success: true, nextStage });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
