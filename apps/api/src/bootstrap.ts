// Bootstrap file - loads environment variables before anything else
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables FIRST
dotenv.config({ path: path.join(__dirname, '../../../.env') });

// Now dynamically import the main module
import('./server').catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
