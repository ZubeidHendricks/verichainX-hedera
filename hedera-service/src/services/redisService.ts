import { createClient, RedisClientType } from 'redis';
import { Logger } from '../utils/logger';

/**
 * Thin Redis wrapper injected into agents and services.
 *
 * Provides pub/sub and key/value helpers. A single instance is created at
 * startup and shared; callers pass already-serialized strings.
 */
export class RedisService {
  private client: RedisClientType;
  private connected = false;
  private logger = new Logger('RedisService');

  constructor(redisUrl: string = process.env.REDIS_URL || 'redis://localhost:6379/0') {
    this.client = createClient({ url: redisUrl });
    this.client.on('error', (err) => this.logger.error('Redis client error', { error: String(err) }));
    this.client.on('connect', () => this.logger.info('Redis client connected'));
  }

  async connect(): Promise<void> {
    if (this.connected) return;
    await this.client.connect();
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    if (!this.connected) return;
    await this.client.quit();
    this.connected = false;
  }

  /** Publish a message to a channel. */
  async publish(channel: string, message: string): Promise<void> {
    await this.client.publish(channel, message);
  }

  /** Subscribe to a channel with a message callback. */
  async subscribe(channel: string, callback: (message: string) => void): Promise<void> {
    await this.client.subscribe(channel, callback);
  }

  /** Set a key, optionally with a TTL (seconds). */
  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (ttlSeconds && ttlSeconds > 0) {
      await this.client.set(key, value, { EX: ttlSeconds });
    } else {
      await this.client.set(key, value);
    }
  }

  /** Get a key's value, or null if absent. */
  async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  /** Delete a key. */
  async del(key: string): Promise<void> {
    await this.client.del(key);
  }
}

export default RedisService;
