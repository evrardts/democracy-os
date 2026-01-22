import { Router } from 'express';
import { query } from 'express-validator';
import { Database } from '@democracy-os/database';
import { verifyHashChain } from '@democracy-os/crypto';
import { authenticate } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { AuditEvent, PaginatedResponse } from '@democracy-os/shared';

const router: ReturnType<typeof Router> = Router();
const db = new Database();

// GET /api/audit/events - Get audit events
router.get(
  '/events',
  authenticate,
  validate([
    query('tenantId').optional().isUUID().withMessage('Invalid tenant ID'),
    query('eventType').optional().isString(),
    query('entityType').optional().isString(),
    query('entityId').optional().isUUID(),
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
  ]),
  async (req, res, next) => {
    try {
      const tenantId = req.query.tenantId as string || req.user!.tenantId;
      const eventType = req.query.eventType as string;
      const entityType = req.query.entityType as string;
      const entityId = req.query.entityId as string;
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 50;
      const offset = (page - 1) * limit;

      let whereConditions = ['tenant_id = $1'];
      let params: any[] = [tenantId];
      let paramIndex = 2;

      if (eventType) {
        whereConditions.push(`event_type = $${paramIndex++}`);
        params.push(eventType);
      }

      if (entityType) {
        whereConditions.push(`entity_type = $${paramIndex++}`);
        params.push(entityType);
      }

      if (entityId) {
        whereConditions.push(`entity_id = $${paramIndex++}`);
        params.push(entityId);
      }

      const whereClause = whereConditions.join(' AND ');

      // Get total count
      const countResult = await db.query(
        `SELECT COUNT(*) as total FROM audit_events WHERE ${whereClause}`,
        params
      );
      const total = parseInt(countResult.rows[0].total);

      // Get events
      const result = await db.query<AuditEvent>(
        `SELECT id, tenant_id as "tenantId", event_type as "eventType",
                entity_type as "entityType", entity_id as "entityId",
                payload, payload_hash as "payloadHash",
                previous_event_hash as "previousEventHash",
                created_at as "createdAt"
         FROM audit_events
         WHERE ${whereClause}
         ORDER BY created_at DESC
         LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
        [...params, limit, offset]
      );

      const response: PaginatedResponse<AuditEvent> = {
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

// GET /api/audit/verify - Verify hash chain integrity
router.get(
  '/verify',
  authenticate,
  validate([
    query('tenantId').optional().isUUID().withMessage('Invalid tenant ID'),
    query('limit').optional().isInt({ min: 1, max: 1000 }),
  ]),
  async (req, res, next): Promise<void> => {
    try {
      const tenantId = req.query.tenantId as string || req.user!.tenantId;
      const limit = parseInt(req.query.limit as string) || 100;

      // Get events in chronological order
      const result = await db.query(
        `SELECT payload_hash, previous_event_hash
         FROM audit_events
         WHERE tenant_id = $1
         ORDER BY created_at ASC
         LIMIT $2`,
        [tenantId, limit]
      );

      if (result.rows.length === 0) {
        res.json({
          valid: true,
          message: 'No events to verify',
          eventsChecked: 0,
        });
        return;
      }

      const events = result.rows;
      const isValid = verifyHashChain(events);

      res.json({
        valid: isValid,
        message: isValid ? 'Hash chain is valid' : 'Hash chain integrity violation detected',
        eventsChecked: events.length,
      });
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/audit/export - Export audit bundle for external verification
router.get(
  '/export',
  authenticate,
  validate([
    query('tenantId').optional().isUUID().withMessage('Invalid tenant ID'),
    query('format').optional().isIn(['json', 'csv']).withMessage('Invalid format'),
    query('limit').optional().isInt({ min: 1, max: 10000 }),
  ]),
  async (req, res, next) => {
    try {
      const tenantId = req.query.tenantId as string || req.user!.tenantId;
      const format = (req.query.format as string) || 'json';
      const limit = parseInt(req.query.limit as string) || 1000;

      // Get all audit events for the tenant
      const result = await db.query(
        `SELECT id, tenant_id, event_type, entity_type, entity_id,
                payload, payload_hash, previous_event_hash, created_at
         FROM audit_events
         WHERE tenant_id = $1
         ORDER BY created_at ASC
         LIMIT $2`,
        [tenantId, limit]
      );

      const events = result.rows;

      if (format === 'csv') {
        // CSV format for spreadsheet analysis
        const csvLines = [
          'ID,Tenant ID,Event Type,Entity Type,Entity ID,Payload Hash,Previous Event Hash,Created At',
          ...events.map((e) =>
            [
              e.id,
              e.tenant_id,
              e.event_type,
              e.entity_type,
              e.entity_id,
              e.payload_hash,
              e.previous_event_hash || '',
              e.created_at,
            ].join(',')
          ),
        ];

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="audit-export-${tenantId}-${Date.now()}.csv"`);
        res.send(csvLines.join('\n'));
      } else {
        // JSON format with verification metadata
        const bundle = {
          exportedAt: new Date().toISOString(),
          tenantId,
          totalEvents: events.length,
          events: events.map((e) => ({
            id: e.id,
            eventType: e.event_type,
            entityType: e.entity_type,
            entityId: e.entity_id,
            payload: e.payload,
            payloadHash: e.payload_hash,
            previousEventHash: e.previous_event_hash,
            createdAt: e.created_at,
          })),
          verification: {
            instructions: 'To verify integrity, check that each event\'s previousEventHash matches the previous event\'s payloadHash',
            chainValid: verifyHashChain(events),
          },
        };

        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename="audit-bundle-${tenantId}-${Date.now()}.json"`);
        res.json(bundle);
      }
    } catch (error) {
      next(error);
    }
  }
);

export default router;
