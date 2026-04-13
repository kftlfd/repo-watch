import type { Redis } from '@/redis/redis.js';

import type { Cache } from './cache.js';

export function createRedisCache(redis: Redis): Cache {
  return {
    get(key) {
      return redis.get(key);
    },
    async set(key, value, ttl) {
      await redis.setex(key, ttl, value);
    },
  };
}
