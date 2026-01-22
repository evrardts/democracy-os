import { createClient, RedisClientType } from 'redis';

class RedisClient {
  private client: RedisClientType | null = null;
  private connecting = false;
  private disabled = false;

  async connect(): Promise<void> {
    // Skip Redis in serverless if not configured
    if (this.disabled || !process.env.REDIS_URL) {
      if (process.env.NODE_ENV === 'production' && !process.env.REDIS_URL) {
        console.warn('Redis URL not configured - rate limiting disabled');
        this.disabled = true;
      }
      return;
    }

    if (this.client?.isOpen) {
      return;
    }

    if (this.connecting) {
      // Wait for existing connection attempt
      await new Promise((resolve) => setTimeout(resolve, 100));
      return this.connect();
    }

    this.connecting = true;

    try {
      const redisUrl = process.env.REDIS_URL;

      // Support both standard Redis and Upstash (TLS) URLs
      const useTls = redisUrl.startsWith('rediss://');

      this.client = createClient({
        url: redisUrl,
        socket: useTls ? {
          tls: true,
          rejectUnauthorized: false
        } : undefined
      });

      this.client.on('error', (err) => {
        console.error('Redis Client Error', err);
        // Don't crash on Redis errors in production
        if (process.env.NODE_ENV === 'production') {
          this.disabled = true;
        }
      });

      this.client.on('connect', () => {
        console.log('Redis connected');
      });

      await this.client.connect();
    } catch (error) {
      console.error('Failed to connect to Redis:', error);
      if (process.env.NODE_ENV === 'production') {
        this.disabled = true;
      }
    } finally {
      this.connecting = false;
    }
  }

  async get(key: string): Promise<string | null> {
    if (this.disabled) return null;
    await this.connect();
    if (!this.client) return null;
    return this.client.get(key);
  }

  async set(key: string, value: string, expireSeconds?: number): Promise<void> {
    if (this.disabled) return;
    await this.connect();
    if (!this.client) return;
    if (expireSeconds) {
      await this.client.setEx(key, expireSeconds, value);
    } else {
      await this.client.set(key, value);
    }
  }

  async del(key: string): Promise<void> {
    if (this.disabled) return;
    await this.connect();
    if (!this.client) return;
    await this.client.del(key);
  }

  async incr(key: string): Promise<number> {
    if (this.disabled) return 1;
    await this.connect();
    if (!this.client) return 1;
    return this.client.incr(key);
  }

  async expire(key: string, seconds: number): Promise<void> {
    if (this.disabled) return;
    await this.connect();
    if (!this.client) return;
    await this.client.expire(key, seconds);
  }

  async exists(key: string): Promise<boolean> {
    if (this.disabled) return false;
    await this.connect();
    if (!this.client) return false;
    const result = await this.client.exists(key);
    return result === 1;
  }

  async close(): Promise<void> {
    if (this.client?.isOpen) {
      await this.client.quit();
    }
  }

  isDisabled(): boolean {
    return this.disabled;
  }
}

export const redis = new RedisClient();
