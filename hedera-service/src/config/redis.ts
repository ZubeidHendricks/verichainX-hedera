import { createClient, RedisClientType } from 'redis';

let redisClient: RedisClientType;

export async function connectRedis(): Promise<void> {
  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379/0';
  
  redisClient = createClient({
    url: redisUrl,
    socket: {
      connectTimeout: 5000,
      // Give up reconnecting after a few attempts so a missing Redis doesn't
      // retry forever in the background.
      reconnectStrategy: (retries) => (retries > 5 ? false : Math.min(retries * 300, 2000)),
    },
  });

  // Swallow errors after we've stopped retrying so they don't crash the process.
  redisClient.on('error', (err) => {
    console.error('Redis Client Error:', err instanceof Error ? err.message : err);
  });

  redisClient.on('connect', () => {
    console.log('Redis Client Connected');
  });

  await redisClient.connect();
}

export function getRedisClient(): RedisClientType {
  if (!redisClient) {
    throw new Error('Redis client not initialized. Call connectRedis() first.');
  }
  return redisClient;
}

export async function publishToChannel(channel: string, message: any): Promise<void> {
  const client = getRedisClient();
  await client.publish(channel, JSON.stringify(message));
}

export async function subscribeToChannel(channel: string, callback: (message: string) => void): Promise<void> {
  const client = getRedisClient();
  await client.subscribe(channel, callback);
}