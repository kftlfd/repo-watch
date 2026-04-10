import { Redis } from '@/redis/redis.js';

import { Cache } from './cache.js';

export function createRedisCache(redis: Redis): Cache {
  return {
    get(key) {
      return redis.get(key);
    },
    async set(key, value, ttl) {
      await redis.setex(key, value, ttl);
    },
  };
}
