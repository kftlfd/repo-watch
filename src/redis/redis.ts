import { Redis } from 'ioredis';

import { env } from '@/config/env.js';

export type { Redis };

export const redis = new Redis(env.REDIS_URL, {
  // BullMQ requires maxRetriesPerRequest to be null
  // because it handles its own retry logic
  maxRetriesPerRequest: null,
});

export async function closeRedis() {
  await redis.quit();
}
