// Environment variables are loaded by bootstrap.ts before this module is imported
import { createApp } from './app';
import { Database } from '@democracy-os/database';
import { redis } from './utils/redis';

const PORT = process.env.API_PORT || 3001;
const HOST = process.env.API_HOST || 'localhost';

async function startServer() {
  try {
    console.log('🚀 Starting Democracy OS API Server...\n');

    // Initialize database connection
    console.log('📊 Connecting to database...');
    const db = new Database();
    const dbHealthy = await db.healthCheck();

    if (!dbHealthy) {
      throw new Error('Database health check failed');
    }
    console.log('✓ Database connected\n');

    // Initialize Redis connection (optional)
    console.log('🔴 Connecting to Redis...');
    await redis.connect();
    if (redis.isDisabled()) {
      console.log('⚠ Redis not configured - rate limiting disabled\n');
    } else {
      console.log('✓ Redis connected\n');
    }

    // Create Express app
    const app = createApp();

    // Start server
    const server = app.listen(PORT, () => {
      console.log(`✓ Server running on http://${HOST}:${PORT}`);
      console.log(`✓ Health check: http://${HOST}:${PORT}/health`);
      console.log(`✓ API endpoints: http://${HOST}:${PORT}/api`);
      console.log('\n🎉 Democracy OS API is ready!\n');
    });

    // Graceful shutdown
    process.on('SIGTERM', async () => {
      console.log('\n📴 SIGTERM signal received. Closing server...');
      server.close(async () => {
        console.log('✓ HTTP server closed');
        await db.close();
        console.log('✓ Database connection closed');
        await redis.close();
        console.log('✓ Redis connection closed');
        process.exit(0);
      });
    });

    process.on('SIGINT', async () => {
      console.log('\n📴 SIGINT signal received. Closing server...');
      server.close(async () => {
        console.log('✓ HTTP server closed');
        await db.close();
        console.log('✓ Database connection closed');
        await redis.close();
        console.log('✓ Redis connection closed');
        process.exit(0);
      });
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
