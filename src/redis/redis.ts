import { Redis } from 'ioredis';

import type { Module } from '@/lib/runtime/runtime.js';
import { env } from '@/config/env.js';
import { newPromise } from '@/utils/promises.js';

export type { Redis };

export function createRedisModule() {
  const redis = new Redis(env.REDIS_URL, {
    // BullMQ requires maxRetriesPerRequest to be null
    // because it handles its own retry logic
    maxRetriesPerRequest: null,
  });

  const redisModule: Module = {
    name: 'redis',
    start() {
      return Promise.resolve({
        exited: newPromise().promise,
        async stop() {
          await redis.quit();
        },
      });
    },
  };

  return { redisModule, redis };
}
