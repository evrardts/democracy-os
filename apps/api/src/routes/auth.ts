import { Router } from 'express';
import { body } from 'express-validator';
import bcrypt from 'bcrypt';
import { Database } from '@democracy-os/database';
import { generateAccessToken, generateRefreshToken, verifyToken } from '../utils/jwt';
import { generateSecretSalt } from '@democracy-os/crypto';
import { validate } from '../middleware/validate';
import { authenticate } from '../middleware/auth';
import { authLimiter } from '../middleware/rate-limit';
import { BadRequestError, UnauthorizedError, ConflictError } from '../utils/errors';
import { RegisterRequest, LoginRequest, AuthResponse, User } from '@democracy-os/shared';

const router: ReturnType<typeof Router> = Router();
const db = new Database();

const BCRYPT_ROUNDS = 12;

// POST /api/auth/register - Register new user
router.post(
  '/register',
  authLimiter,
  validate([
    body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
    body('password')
      .isLength({ min: 8 })
      .withMessage('Password must be at least 8 characters')
      .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
      .withMessage('Password must contain uppercase, lowercase, and number'),
    body('displayName')
      .trim()
      .isLength({ min: 2, max: 100 })
      .withMessage('Display name must be 2-100 characters'),
    body('tenantSlug').notEmpty().withMessage('Tenant slug is required'),
  ]),
  async (req, res, next) => {
    try {
      const { email, password, displayName, tenantSlug }: RegisterRequest = req.body;

      // Check if tenant exists
      const tenantResult = await db.query('SELECT id FROM tenants WHERE slug = $1', [tenantSlug]);

      if (tenantResult.rows.length === 0) {
        throw new BadRequestError('Tenant not found');
      }

      const tenantId = tenantResult.rows[0].id;

      // Check if user already exists
      const existingUser = await db.query(
        'SELECT id FROM users WHERE tenant_id = $1 AND email = $2',
        [tenantId, email]
      );

      if (existingUser.rows.length > 0) {
        throw new ConflictError('User already exists with this email');
      }

      // Hash password
      const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

      // Generate secret salt for nullifier generation
      const secretSalt = generateSecretSalt();

      // Create user
      const result = await db.query<User>(
        `INSERT INTO users (tenant_id, email, password_hash, display_name, role, secret_salt)
         VALUES ($1, $2, $3, $4, 'citizen', $5)
         RETURNING id, tenant_id as "tenantId", email, role, display_name as "displayName",
                   verified, created_at as "createdAt", updated_at as "updatedAt"`,
        [tenantId, email, passwordHash, displayName, secretSalt]
      );

      const user = result.rows[0];

      // Generate tokens
      const accessToken = generateAccessToken(user.id, user.tenantId, user.role);
      const refreshToken = generateRefreshToken(user.id, user.tenantId, user.role);

      // Set HTTP-only cookie
      res.cookie('accessToken', accessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 15 * 60 * 1000, // 15 minutes
      });

      res.cookie('refreshToken', refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      });

      const response: AuthResponse = {
        user,
        accessToken,
        refreshToken,
      };

      res.status(201).json(response);
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/auth/login - Login user
router.post(
  '/login',
  authLimiter,
  validate([
    body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
    body('password').notEmpty().withMessage('Password is required'),
    body('tenantSlug').notEmpty().withMessage('Tenant slug is required'),
  ]),
  async (req, res, next) => {
    try {
      const { email, password, tenantSlug }: LoginRequest = req.body;

      // Get tenant
      const tenantResult = await db.query('SELECT id FROM tenants WHERE slug = $1', [tenantSlug]);

      if (tenantResult.rows.length === 0) {
        throw new UnauthorizedError('Invalid credentials');
      }

      const tenantId = tenantResult.rows[0].id;

      // Get user
      const userResult = await db.query(
        `SELECT id, tenant_id as "tenantId", email, password_hash, role,
                display_name as "displayName", verified,
                created_at as "createdAt", updated_at as "updatedAt"
         FROM users
         WHERE tenant_id = $1 AND email = $2`,
        [tenantId, email]
      );

      if (userResult.rows.length === 0) {
        throw new UnauthorizedError('Invalid credentials');
      }

      const user = userResult.rows[0];

      // Verify password
      const passwordValid = await bcrypt.compare(password, user.password_hash);

      if (!passwordValid) {
        throw new UnauthorizedError('Invalid credentials');
      }

      // Remove password hash from response
      delete user.password_hash;

      // Generate tokens
      const accessToken = generateAccessToken(user.id, user.tenantId, user.role);
      const refreshToken = generateRefreshToken(user.id, user.tenantId, user.role);

      // Set HTTP-only cookies
      res.cookie('accessToken', accessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 15 * 60 * 1000,
      });

      res.cookie('refreshToken', refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });

      const response: AuthResponse = {
        user,
        accessToken,
        refreshToken,
      };

      res.json(response);
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/auth/refresh - Refresh access token
router.post('/refresh', async (req, res, next) => {
  try {
    const refreshToken = req.cookies?.refreshToken || req.body.refreshToken;

    if (!refreshToken) {
      throw new UnauthorizedError('No refresh token provided');
    }

    const payload = verifyToken(refreshToken);

    if (payload.type !== 'refresh') {
      throw new UnauthorizedError('Invalid token type');
    }

    // Generate new access token
    const newAccessToken = generateAccessToken(payload.userId, payload.tenantId, payload.role);

    res.cookie('accessToken', newAccessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 15 * 60 * 1000,
    });

    res.json({ accessToken: newAccessToken });
  } catch (error) {
    next(error);
  }
});

// POST /api/auth/logout - Logout user
router.post('/logout', (_req, res) => {
  res.clearCookie('accessToken');
  res.clearCookie('refreshToken');
  res.json({ message: 'Logged out successfully' });
});

// GET /api/auth/me - Get current user
router.get('/me', authenticate, async (req, res, next) => {
  try {
    if (!req.user) {
      throw new UnauthorizedError('Not authenticated');
    }

    const result = await db.query<User>(
      `SELECT id, tenant_id as "tenantId", email, role,
              display_name as "displayName", verified,
              created_at as "createdAt", updated_at as "updatedAt"
       FROM users
       WHERE id = $1`,
      [req.user.userId]
    );

    if (result.rows.length === 0) {
      throw new UnauthorizedError('User not found');
    }

    res.json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

export default router;
