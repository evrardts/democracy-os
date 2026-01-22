import { Router } from 'express';
import { Database } from '@democracy-os/database';

const router: ReturnType<typeof Router> = Router();
const db = new Database();

// GET /api/tenants - List all tenants
router.get('/', async (_req, res, next) => {
  try {
    const result = await db.query('SELECT id, name, slug, domain, created_at FROM tenants ORDER BY name');
    res.json(result.rows);
  } catch (error) {
    next(error);
  }
});

// GET /api/tenants/:slug - Get tenant by slug
router.get('/:slug', async (req, res, next): Promise<void> => {
  try {
    const { slug } = req.params;
    const result = await db.query(
      'SELECT id, name, slug, domain, settings, created_at FROM tenants WHERE slug = $1',
      [slug]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Tenant not found' });
      return;
    }

    res.json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

export default router;
