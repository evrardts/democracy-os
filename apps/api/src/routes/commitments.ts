import { Router } from 'express';
import { body, param, query } from 'express-validator';
import { Database } from '@democracy-os/database';
import { authenticate, requireRole } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { NotFoundError, ForbiddenError } from '../utils/errors';
import {
  Commitment,
  CreateCommitmentRequest,
  UpdateCommitmentRequest,
  UserRole,
  CommitmentStatus,
} from '@democracy-os/shared';

const router: ReturnType<typeof Router> = Router();
const db = new Database();

// GET /api/commitments - List commitments
router.get(
  '/',
  validate([
    query('tenantId').optional().isUUID().withMessage('Invalid tenant ID'),
    query('status').optional().isIn(['planned', 'in_progress', 'delivered', 'cancelled']),
  ]),
  async (req, res, next) => {
    try {
      const tenantId = req.query.tenantId as string;
      const status = req.query.status as CommitmentStatus;

      let whereConditions = ['previous_version_id IS NULL']; // Only show latest versions
      let params: any[] = [];
      let paramIndex = 1;

      if (tenantId) {
        whereConditions.push(`tenant_id = $${paramIndex++}`);
        params.push(tenantId);
      }

      if (status) {
        whereConditions.push(`status = $${paramIndex++}`);
        params.push(status);
      }

      const whereClause = whereConditions.join(' AND ');

      const result = await db.query<Commitment>(
        `SELECT id, tenant_id as "tenantId", creator_id as "creatorId",
                title, description, responsible_party as "responsibleParty",
                planned_budget as "plannedBudget", actual_budget as "actualBudget",
                target_date as "targetDate", status, version,
                previous_version_id as "previousVersionId", attachments,
                document_ids as "documentIds",
                created_at as "createdAt", updated_at as "updatedAt"
         FROM commitments
         WHERE ${whereClause}
         ORDER BY created_at DESC`,
        params
      );

      res.json(result.rows);
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/commitments/:id - Get commitment by ID
router.get(
  '/:id',
  validate([param('id').isUUID().withMessage('Invalid commitment ID')]),
  async (req, res, next) => {
    try {
      const { id } = req.params;

      const result = await db.query<Commitment>(
        `SELECT id, tenant_id as "tenantId", creator_id as "creatorId",
                title, description, responsible_party as "responsibleParty",
                planned_budget as "plannedBudget", actual_budget as "actualBudget",
                target_date as "targetDate", status, version,
                previous_version_id as "previousVersionId", attachments,
                document_ids as "documentIds",
                created_at as "createdAt", updated_at as "updatedAt"
         FROM commitments
         WHERE id = $1`,
        [id]
      );

      if (result.rows.length === 0) {
        throw new NotFoundError('Commitment not found');
      }

      res.json(result.rows[0]);
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/commitments/:id/history - Get commitment version history
router.get(
  '/:id/history',
  validate([param('id').isUUID().withMessage('Invalid commitment ID')]),
  async (req, res, next) => {
    try {
      const { id } = req.params;

      // Get all versions by following the previous_version_id chain
      const result = await db.query<Commitment>(
        `WITH RECURSIVE commitment_history AS (
          -- Start with the specified commitment
          SELECT * FROM commitments WHERE id = $1
          UNION ALL
          -- Recursively get previous versions
          SELECT c.*
          FROM commitments c
          INNER JOIN commitment_history ch ON c.id = ch.previous_version_id
        )
        SELECT id, tenant_id as "tenantId", creator_id as "creatorId",
               title, description, responsible_party as "responsibleParty",
               planned_budget as "plannedBudget", actual_budget as "actualBudget",
               target_date as "targetDate", status, version,
               previous_version_id as "previousVersionId", attachments,
               document_ids as "documentIds",
               created_at as "createdAt", updated_at as "updatedAt"
        FROM commitment_history
        ORDER BY version DESC`,
        [id]
      );

      if (result.rows.length === 0) {
        throw new NotFoundError('Commitment not found');
      }

      res.json(result.rows);
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/commitments - Create commitment
router.post(
  '/',
  authenticate,
  requireRole(UserRole.ELECTED_OFFICIAL, UserRole.ADMINISTRATION),
  validate([
    body('title').trim().isLength({ min: 5, max: 500 }).withMessage('Title must be 5-500 characters'),
    body('description').optional().trim(),
    body('responsibleParty').optional().trim().isLength({ max: 255 }),
    body('plannedBudget').optional().isFloat({ min: 0 }).withMessage('Planned budget must be >= 0'),
    body('targetDate').optional().isISO8601().withMessage('Invalid target date'),
    body('documentIds').optional().isArray().withMessage('Document IDs must be an array'),
    body('documentIds.*').optional().isUUID().withMessage('Each document ID must be a valid UUID'),
  ]),
  async (req, res, next) => {
    try {
      const request: CreateCommitmentRequest = req.body;

      const result = await db.query<Commitment>(
        `INSERT INTO commitments (tenant_id, creator_id, title, description,
                                  responsible_party, planned_budget, target_date, status, document_ids)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'planned', $8)
         RETURNING id, tenant_id as "tenantId", creator_id as "creatorId",
                   title, description, responsible_party as "responsibleParty",
                   planned_budget as "plannedBudget", actual_budget as "actualBudget",
                   target_date as "targetDate", status, version,
                   previous_version_id as "previousVersionId", attachments,
                   document_ids as "documentIds",
                   created_at as "createdAt", updated_at as "updatedAt"`,
        [
          req.user!.tenantId,
          req.user!.userId,
          request.title,
          request.description || null,
          request.responsibleParty || null,
          request.plannedBudget || null,
          request.targetDate || null,
          request.documentIds || [],
        ]
      );

      res.status(201).json(result.rows[0]);
    } catch (error) {
      next(error);
    }
  }
);

// PUT /api/commitments/:id - Update commitment (creates new version)
router.put(
  '/:id',
  authenticate,
  requireRole(UserRole.ELECTED_OFFICIAL, UserRole.ADMINISTRATION),
  validate([
    param('id').isUUID().withMessage('Invalid commitment ID'),
    body('title').optional().trim().isLength({ min: 5, max: 500 }),
    body('description').optional().trim(),
    body('responsibleParty').optional().trim().isLength({ max: 255 }),
    body('plannedBudget').optional().isFloat({ min: 0 }),
    body('actualBudget').optional().isFloat({ min: 0 }),
    body('targetDate').optional().isISO8601(),
    body('status').optional().isIn(['planned', 'in_progress', 'delivered', 'cancelled']),
    body('documentIds').optional().isArray().withMessage('Document IDs must be an array'),
    body('documentIds.*').optional().isUUID().withMessage('Each document ID must be a valid UUID'),
  ]),
  async (req, res, next) => {
    try {
      const { id } = req.params;
      const update: UpdateCommitmentRequest = req.body;

      // Get existing commitment
      const existingResult = await db.query(
        `SELECT * FROM commitments WHERE id = $1`,
        [id]
      );

      if (existingResult.rows.length === 0) {
        throw new NotFoundError('Commitment not found');
      }

      const existing = existingResult.rows[0];

      // Verify user has permission (same tenant)
      if (existing.tenant_id !== req.user!.tenantId) {
        throw new ForbiddenError('Cannot update commitment from another tenant');
      }

      // Create new version
      const newVersion = existing.version + 1;

      const result = await db.query<Commitment>(
        `INSERT INTO commitments (
          tenant_id, creator_id, title, description, responsible_party,
          planned_budget, actual_budget, target_date, status, version, previous_version_id,
          attachments, document_ids
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        RETURNING id, tenant_id as "tenantId", creator_id as "creatorId",
                  title, description, responsible_party as "responsibleParty",
                  planned_budget as "plannedBudget", actual_budget as "actualBudget",
                  target_date as "targetDate", status, version,
                  previous_version_id as "previousVersionId", attachments,
                  document_ids as "documentIds",
                  created_at as "createdAt", updated_at as "updatedAt"`,
        [
          existing.tenant_id,
          req.user!.userId,
          update.title ?? existing.title,
          update.description ?? existing.description,
          update.responsibleParty ?? existing.responsible_party,
          update.plannedBudget ?? existing.planned_budget,
          update.actualBudget ?? existing.actual_budget,
          update.targetDate ?? existing.target_date,
          update.status ?? existing.status,
          newVersion,
          existing.id,
          existing.attachments,
          update.documentIds ?? existing.document_ids ?? [],
        ]
      );

      res.json(result.rows[0]);
    } catch (error) {
      next(error);
    }
  }
);

export default router;
