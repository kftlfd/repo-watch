import { Redis } from 'ioredis';

import { env } from '@/config/env.js';

export const redis = new Redis(env.REDIS_URL);

export async function closeRedis() {
  await redis.quit();
}
