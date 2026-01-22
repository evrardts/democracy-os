// Vercel Serverless Function Entry Point
import type { VercelRequest, VercelResponse } from '@vercel/node';

// Load environment variables first
import dotenv from 'dotenv';
dotenv.config();

// Import and create app after env vars are loaded
import { createApp } from '../src/app';

const app = createApp();

export default function handler(req: VercelRequest, res: VercelResponse) {
  return app(req, res);
}
