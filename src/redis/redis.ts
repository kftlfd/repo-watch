import { Redis } from 'ioredis';

import { env } from '@/config/env.js';
import { defineModule } from '@/lib/runtime/runtime.js';

export type { Redis };

export function createRedisModule() {
  const redis = new Redis(env.REDIS_URL, {
    // BullMQ requires maxRetriesPerRequest to be null
    // because it handles its own retry logic
    maxRetriesPerRequest: null,
  });

  const redisModule = defineModule('redis', {
    async stop() {
      await redis.quit();
    },
  });

  return { redisModule, redis };
}
