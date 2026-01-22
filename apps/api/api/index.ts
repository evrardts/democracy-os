// Vercel Serverless Function Entry Point
import type { Request, Response } from 'express';

// Load environment variables first
import dotenv from 'dotenv';
dotenv.config();

// Import and create app after env vars are loaded
import { createApp } from '../src/app';

const app = createApp();

export default function handler(req: Request, res: Response) {
  return app(req as any, res as any);
}
