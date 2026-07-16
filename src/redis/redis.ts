import { Redis } from 'ioredis';

import { env } from '@/config/env.js';
import { defineModule } from '@/lib/runtime/runtime.js';
import { newPromise, withTimeout } from '@/utils/promises.js';

export type { Redis };

export function createRedisModule() {
  const redis = new Redis(env.REDIS_URL, {
    // BullMQ requires maxRetriesPerRequest to be null
    // because it handles its own retry logic
    maxRetriesPerRequest: null,
  });

  const connected = newPromise();
  redis.on('connect', connected.resolve);

  const ready = newPromise();
  redis.on('ready', ready.resolve);

  let initError: Error | null = null;
  function initErrorHandler(err: unknown) {
    if (!initError) initError = new Error('Redis init error', { cause: err });
  }
  redis.on('error', initErrorHandler);

  const redisModule = defineModule('redis', {
    async start({ fail }) {
      if (initError) throw initError;
      redis.off('error', initErrorHandler);

      redis.on('error', (err: unknown) => {
        fail(new Error('Redis error', { cause: err }));
      });

      await withTimeout(
        connected.promise.then(() => ready.promise),
        5_000,
        new Error('Redis init timeout'),
      );
    },
    async stop() {
      try {
        await redis.quit();
      } catch {
        redis.disconnect();
      }
    },
  });

  return { redisModule, redis };
}
