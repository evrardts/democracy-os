import { Router } from 'express';
import { body, param, query } from 'express-validator';
import { Database } from '@democracy-os/database';
import { generateNullifier } from '@democracy-os/crypto';
import { authenticate } from '../middleware/auth';
import { voteLimiter } from '../middleware/rate-limit';
import { validate } from '../middleware/validate';
import { NotFoundError, BadRequestError, ForbiddenError } from '../utils/errors';
import { Vote, VoteRequest, VoteResponse, PollResults } from '@democracy-os/shared';

const router: ReturnType<typeof Router> = Router();
const db = new Database();

// POST /api/polls/:pollId/vote - Submit or update vote
router.post(
  '/:pollId/vote',
  authenticate,
  voteLimiter,
  validate([
    param('pollId').isUUID().withMessage('Invalid poll ID'),
    body('optionId').notEmpty().withMessage('Option ID is required'),
  ]),
  async (req, res, next) => {
    try {
      const { pollId } = req.params;
      const { optionId }: VoteRequest = req.body;

      // Get poll and verify it exists and is active
      const pollResult = await db.query(
        `SELECT id, status, options, start_time, end_time FROM polls WHERE id = $1`,
        [pollId]
      );

      if (pollResult.rows.length === 0) {
        throw new NotFoundError('Poll not found');
      }

      const poll = pollResult.rows[0];

      if (poll.status !== 'active') {
        throw new BadRequestError('Poll is not active');
      }

      // Check if poll is within time range
      const now = new Date();
      if (poll.start_time && new Date(poll.start_time) > now) {
        throw new BadRequestError('Poll has not started yet');
      }

      if (poll.end_time && new Date(poll.end_time) < now) {
        throw new BadRequestError('Poll has ended');
      }

      // Verify option exists
      const options = poll.options as any[];
      const optionExists = options.some((opt) => opt.id === optionId);

      if (!optionExists) {
        throw new BadRequestError('Invalid option ID');
      }

      // Get user's secret salt
      const userResult = await db.query(
        'SELECT secret_salt FROM users WHERE id = $1',
        [req.user!.userId]
      );

      if (userResult.rows.length === 0) {
        throw new NotFoundError('User not found');
      }

      const secretSalt = userResult.rows[0].secret_salt;

      // Generate nullifier for anonymous voting
      const nullifier = generateNullifier(pollId, secretSalt);

      // Check if user has already voted
      const existingVoteResult = await db.query(
        'SELECT id FROM votes WHERE poll_id = $1 AND nullifier = $2',
        [pollId, nullifier]
      );

      let vote: Vote;

      if (existingVoteResult.rows.length > 0) {
        // Update existing vote
        const previousVoteId = existingVoteResult.rows[0].id;

        const updateResult = await db.query<Vote>(
          `INSERT INTO votes (poll_id, nullifier, option_id, previous_vote_id)
           VALUES ($1, $2, $3, $4)
           RETURNING id, poll_id as "pollId", nullifier, option_id as "optionId",
                     vote_timestamp as "voteTimestamp", previous_vote_id as "previousVoteId"`,
          [pollId, nullifier, optionId, previousVoteId]
        );

        // Delete old vote to maintain one vote per nullifier
        await db.query('DELETE FROM votes WHERE id = $1', [previousVoteId]);

        vote = updateResult.rows[0];
      } else {
        // Insert new vote
        const insertResult = await db.query<Vote>(
          `INSERT INTO votes (poll_id, nullifier, option_id)
           VALUES ($1, $2, $3)
           RETURNING id, poll_id as "pollId", nullifier, option_id as "optionId",
                     vote_timestamp as "voteTimestamp", previous_vote_id as "previousVoteId"`,
          [pollId, nullifier, optionId]
        );

        vote = insertResult.rows[0];
      }

      const response: VoteResponse = {
        success: true,
        vote,
      };

      res.json(response);
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/polls/:pollId/has-voted - Check if current user has voted
router.get(
  '/:pollId/has-voted',
  authenticate,
  validate([param('pollId').isUUID().withMessage('Invalid poll ID')]),
  async (req, res, next) => {
    try {
      const { pollId } = req.params;

      // Get user's secret salt
      const userResult = await db.query(
        'SELECT secret_salt FROM users WHERE id = $1',
        [req.user!.userId]
      );

      if (userResult.rows.length === 0) {
        throw new NotFoundError('User not found');
      }

      const secretSalt = userResult.rows[0].secret_salt;

      // Generate nullifier
      const nullifier = generateNullifier(pollId, secretSalt);

      // Check if vote exists
      const voteResult = await db.query(
        `SELECT option_id as "optionId", vote_timestamp as "voteTimestamp"
         FROM votes
         WHERE poll_id = $1 AND nullifier = $2`,
        [pollId, nullifier]
      );

      const hasVoted = voteResult.rows.length > 0;

      res.json({
        hasVoted,
        vote: hasVoted ? voteResult.rows[0] : null,
      });
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/polls/:pollId/results - Get poll results
router.get(
  '/:pollId/results',
  authenticate,
  validate([param('pollId').isUUID().withMessage('Invalid poll ID')]),
  async (req, res, next) => {
    try {
      const { pollId } = req.params;

      // Get poll
      const pollResult = await db.query(
        'SELECT id, options FROM polls WHERE id = $1',
        [pollId]
      );

      if (pollResult.rows.length === 0) {
        throw new NotFoundError('Poll not found');
      }

      const poll = pollResult.rows[0];

      // Check if user has voted (required to see results)
      const userResult = await db.query(
        'SELECT secret_salt FROM users WHERE id = $1',
        [req.user!.userId]
      );

      if (userResult.rows.length === 0) {
        throw new NotFoundError('User not found');
      }

      const secretSalt = userResult.rows[0].secret_salt;
      const nullifier = generateNullifier(pollId, secretSalt);

      const hasVotedResult = await db.query(
        'SELECT id FROM votes WHERE poll_id = $1 AND nullifier = $2',
        [pollId, nullifier]
      );

      if (hasVotedResult.rows.length === 0) {
        throw new ForbiddenError('You must vote before viewing results');
      }

      // Get vote counts
      const votesResult = await db.query(
        `SELECT option_id, COUNT(*) as count
         FROM votes
         WHERE poll_id = $1
         GROUP BY option_id`,
        [pollId]
      );

      const voteCounts = votesResult.rows.reduce((acc, row) => {
        acc[row.option_id] = parseInt(row.count);
        return acc;
      }, {} as Record<string, number>);

      // Calculate total votes
      const totalVotes: number = (Object.values(voteCounts) as number[]).reduce((sum, count) => sum + count, 0);

      // Build results
      const options = poll.options as any[];
      const results = options.map((option) => {
        const count: number = voteCounts[option.id] || 0;
        const percentage = totalVotes > 0 ? (count / totalVotes) * 100 : 0;

        return {
          optionId: option.id,
          optionText: option.text,
          count,
          percentage: Math.round(percentage * 100) / 100,
        };
      });

      const response: PollResults = {
        pollId,
        totalVotes,
        results,
      };

      res.json(response);
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/polls/:pollId/results/export - Export results as CSV
router.get(
  '/:pollId/results/export',
  authenticate,
  validate([
    param('pollId').isUUID().withMessage('Invalid poll ID'),
    query('format').optional().isIn(['json', 'csv']).withMessage('Invalid format'),
  ]),
  async (req, res, next) => {
    try {
      const { pollId } = req.params;
      const format = (req.query.format as string) || 'csv';

      // Get poll
      const pollResult = await db.query(
        'SELECT id, title, options FROM polls WHERE id = $1',
        [pollId]
      );

      if (pollResult.rows.length === 0) {
        throw new NotFoundError('Poll not found');
      }

      const poll = pollResult.rows[0];

      // Check if user has voted (required to see results)
      const userResult = await db.query(
        'SELECT secret_salt FROM users WHERE id = $1',
        [req.user!.userId]
      );

      if (userResult.rows.length === 0) {
        throw new NotFoundError('User not found');
      }

      const secretSalt = userResult.rows[0].secret_salt;
      const nullifier = generateNullifier(pollId, secretSalt);

      const hasVotedResult = await db.query(
        'SELECT id FROM votes WHERE poll_id = $1 AND nullifier = $2',
        [pollId, nullifier]
      );

      if (hasVotedResult.rows.length === 0) {
        throw new ForbiddenError('You must vote before viewing results');
      }

      // Get vote counts
      const votesResult = await db.query(
        `SELECT option_id, COUNT(*) as count
         FROM votes
         WHERE poll_id = $1
         GROUP BY option_id`,
        [pollId]
      );

      const voteCounts = votesResult.rows.reduce((acc, row) => {
        acc[row.option_id] = parseInt(row.count);
        return acc;
      }, {} as Record<string, number>);

      // Calculate total votes
      const totalVotes: number = (Object.values(voteCounts) as number[]).reduce((sum, count) => sum + count, 0);

      // Build results
      const options = poll.options as any[];
      const results = options.map((option) => {
        const count: number = voteCounts[option.id] || 0;
        const percentage = totalVotes > 0 ? (count / totalVotes) * 100 : 0;

        return {
          optionId: option.id,
          optionText: option.text,
          count,
          percentage: Math.round(percentage * 100) / 100,
        };
      });

      if (format === 'csv') {
        // CSV export
        const csvLines = [
          `Poll: ${poll.title}`,
          `Total Votes: ${totalVotes}`,
          '',
          'Option,Votes,Percentage',
          ...results.map((r) => `"${r.optionText}",${r.count},${r.percentage}%`),
        ];

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="poll-results-${pollId}-${Date.now()}.csv"`);
        res.send(csvLines.join('\n'));
      } else {
        // JSON export
        const exportData = {
          pollId,
          pollTitle: poll.title,
          totalVotes,
          exportedAt: new Date().toISOString(),
          results,
        };

        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename="poll-results-${pollId}-${Date.now()}.json"`);
        res.json(exportData);
      }
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/polls/:pollId/results/public - Get public results (no auth required, after poll closed)
router.get(
  '/:pollId/results/public',
  validate([param('pollId').isUUID().withMessage('Invalid poll ID')]),
  async (req, res, next) => {
    try {
      const { pollId } = req.params;

      // Get poll
      const pollResult = await db.query(
        'SELECT id, options, status FROM polls WHERE id = $1',
        [pollId]
      );

      if (pollResult.rows.length === 0) {
        throw new NotFoundError('Poll not found');
      }

      const poll = pollResult.rows[0];

      // Only allow public results for closed polls
      if (poll.status !== 'closed') {
        throw new ForbiddenError('Results are only public after poll is closed');
      }

      // Get vote counts (same logic as authenticated endpoint)
      const votesResult = await db.query(
        `SELECT option_id, COUNT(*) as count
         FROM votes
         WHERE poll_id = $1
         GROUP BY option_id`,
        [pollId]
      );

      const voteCounts = votesResult.rows.reduce((acc, row) => {
        acc[row.option_id] = parseInt(row.count);
        return acc;
      }, {} as Record<string, number>);

      const totalVotes: number = (Object.values(voteCounts) as number[]).reduce((sum, count) => sum + count, 0);

      const options = poll.options as any[];
      const results = options.map((option) => {
        const count: number = voteCounts[option.id] || 0;
        const percentage = totalVotes > 0 ? (count / totalVotes) * 100 : 0;

        return {
          optionId: option.id,
          optionText: option.text,
          count,
          percentage: Math.round(percentage * 100) / 100,
        };
      });

      const response: PollResults = {
        pollId,
        totalVotes,
        results,
      };

      res.json(response);
    } catch (error) {
      next(error);
    }
  }
);

export default router;
