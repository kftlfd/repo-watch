import { Redis } from 'ioredis';

import { env } from '@/config/env.js';

export type { Redis };

export const redis = new Redis(env.REDIS_URL);

export async function closeRedis() {
  await redis.quit();
}
