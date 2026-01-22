import jwt, { SignOptions } from 'jsonwebtoken';
import { UnauthorizedError } from './errors';

const JWT_SECRET = process.env.JWT_SECRET || 'change-this-to-a-secure-random-string-in-production';
const JWT_ACCESS_EXPIRATION: SignOptions['expiresIn'] = (process.env.JWT_ACCESS_EXPIRATION || '15m') as SignOptions['expiresIn'];
const JWT_REFRESH_EXPIRATION: SignOptions['expiresIn'] = (process.env.JWT_REFRESH_EXPIRATION || '7d') as SignOptions['expiresIn'];

export interface JwtPayload {
  userId: string;
  tenantId: string;
  role: string;
  type: 'access' | 'refresh';
}

export function generateAccessToken(userId: string, tenantId: string, role: string): string {
  const payload: JwtPayload = {
    userId,
    tenantId,
    role,
    type: 'access',
  };

  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: JWT_ACCESS_EXPIRATION,
  });
}

export function generateRefreshToken(userId: string, tenantId: string, role: string): string {
  const payload: JwtPayload = {
    userId,
    tenantId,
    role,
    type: 'refresh',
  };

  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: JWT_REFRESH_EXPIRATION,
  });
}

export function verifyToken(token: string): JwtPayload {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload;
    return decoded;
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new UnauthorizedError('Token expired');
    }
    if (error instanceof jwt.JsonWebTokenError) {
      throw new UnauthorizedError('Invalid token');
    }
    throw new UnauthorizedError('Token verification failed');
  }
}

export function decodeToken(token: string): JwtPayload | null {
  try {
    return jwt.decode(token) as JwtPayload;
  } catch (error) {
    return null;
  }
}
