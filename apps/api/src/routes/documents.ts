import { Router } from 'express';
import { param } from 'express-validator';
import multer from 'multer';
import { authenticate } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { uploadFile, getPresignedDownloadUrl, deleteFile, validateFile } from '../utils/s3';
import { Database } from '@democracy-os/database';
import { NotFoundError, BadRequestError, ForbiddenError } from '../utils/errors';

const router: ReturnType<typeof Router> = Router();
const db = new Database();

// Configure multer for memory storage (files stored in buffer)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max file size
    files: 5, // Max 5 files at once
  },
});

// POST /api/documents/upload - Upload document(s)
router.post(
  '/upload',
  authenticate,
  upload.array('files', 5),
  async (req, res, next) => {
    try {
      const files = req.files as Express.Multer.File[];

      if (!files || files.length === 0) {
        throw new BadRequestError('No files provided');
      }

      const tenantId = req.user!.tenantId;
      const folder = (req.body.folder as string) || 'documents';

      // Validate folder name (prevent directory traversal)
      if (!/^[a-zA-Z0-9-_]+$/.test(folder)) {
        throw new BadRequestError('Invalid folder name');
      }

      // Validate and upload each file
      const uploadedFiles = [];

      for (const file of files) {
        // Validate file
        const validation = validateFile(file);
        if (!validation.valid) {
          throw new BadRequestError(validation.error!);
        }

        // Upload to S3
        const result = await uploadFile(file, tenantId, folder);

        // Store metadata in database
        const documentId = await db.query(
          `INSERT INTO documents (tenant_id, key, url, filename, size, mime_type, uploaded_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           RETURNING id`,
          [tenantId, result.key, result.url, result.filename, result.size, file.mimetype, req.user!.userId]
        );

        uploadedFiles.push({
          id: documentId.rows[0].id,
          ...result,
          mimeType: file.mimetype,
        });
      }

      res.status(201).json({
        success: true,
        files: uploadedFiles,
      });
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/documents/:id - Get document metadata
router.get(
  '/:id',
  authenticate,
  validate([param('id').isUUID().withMessage('Invalid document ID')]),
  async (req, res, next) => {
    try {
      const { id } = req.params;
      const tenantId = req.user!.tenantId;

      const result = await db.query(
        `SELECT id, key, filename, size, mime_type as "mimeType", created_at as "createdAt"
         FROM documents
         WHERE id = $1 AND tenant_id = $2`,
        [id, tenantId]
      );

      if (result.rows.length === 0) {
        throw new NotFoundError('Document not found');
      }

      res.json(result.rows[0]);
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/documents/:id/download - Get presigned download URL
router.get(
  '/:id/download',
  authenticate,
  validate([param('id').isUUID().withMessage('Invalid document ID')]),
  async (req, res, next) => {
    try {
      const { id } = req.params;
      const tenantId = req.user!.tenantId;

      // Get document from database
      const result = await db.query(
        `SELECT key, filename FROM documents WHERE id = $1 AND tenant_id = $2`,
        [id, tenantId]
      );

      if (result.rows.length === 0) {
        throw new NotFoundError('Document not found');
      }

      const { key, filename } = result.rows[0];

      // Generate presigned URL (valid for 1 hour)
      const downloadUrl = await getPresignedDownloadUrl(key, 3600);

      res.json({
        downloadUrl,
        filename,
        expiresIn: 3600,
      });
    } catch (error) {
      next(error);
    }
  }
);

// DELETE /api/documents/:id - Delete document
router.delete(
  '/:id',
  authenticate,
  validate([param('id').isUUID().withMessage('Invalid document ID')]),
  async (req, res, next) => {
    try {
      const { id } = req.params;
      const tenantId = req.user!.tenantId;
      const userId = req.user!.userId;

      // Get document from database
      const result = await db.query(
        `SELECT key, uploaded_by FROM documents WHERE id = $1 AND tenant_id = $2`,
        [id, tenantId]
      );

      if (result.rows.length === 0) {
        throw new NotFoundError('Document not found');
      }

      const { key, uploaded_by } = result.rows[0];

      // Check if user is the uploader or an admin
      if (uploaded_by !== userId && req.user!.role !== 'administration') {
        throw new ForbiddenError('You do not have permission to delete this document');
      }

      // Delete from S3
      await deleteFile(key);

      // Delete from database
      await db.query('DELETE FROM documents WHERE id = $1', [id]);

      res.json({
        success: true,
        message: 'Document deleted successfully',
      });
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/documents - List documents (for current tenant)
router.get(
  '/',
  authenticate,
  async (req, res, next) => {
    try {
      const tenantId = req.user!.tenantId;
      const limit = parseInt(req.query.limit as string) || 50;
      const offset = parseInt(req.query.offset as string) || 0;

      const result = await db.query(
        `SELECT id, filename, size, mime_type as "mimeType", created_at as "createdAt"
         FROM documents
         WHERE tenant_id = $1
         ORDER BY created_at DESC
         LIMIT $2 OFFSET $3`,
        [tenantId, limit, offset]
      );

      const countResult = await db.query(
        'SELECT COUNT(*) as total FROM documents WHERE tenant_id = $1',
        [tenantId]
      );

      res.json({
        documents: result.rows,
        total: parseInt(countResult.rows[0].total),
        limit,
        offset,
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
