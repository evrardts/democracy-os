// Vercel Serverless Function Entry Point
import type { VercelRequest, VercelResponse } from '@vercel/node';

// Load environment variables first
import dotenv from 'dotenv';
dotenv.config();

// Import and create app after env vars are loaded
import { createApp } from '../src/app';

const app = createApp();

// Vercel handler - Express app is callable as (req, res) middleware
export default function handler(req: VercelRequest, res: VercelResponse) {
  return app(req as any, res as any);
}
