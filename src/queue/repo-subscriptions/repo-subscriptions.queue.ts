import { Queue } from 'bullmq';

import type { QueueConfig } from '@/config/config.js';
import { redis } from '@/redis/redis.js';

import type { EnqueueRepoSubscriptionsJobFn } from './repo-subscriptions.types.js';
import { QUEUE_NAME_REPO_SUBSCRIPTIONS } from './repo-subscriptions.types.js';

const queue = new Queue(QUEUE_NAME_REPO_SUBSCRIPTIONS, {
  connection: redis,
});

export function createEnqueueRepoSubscriptions(config: QueueConfig): EnqueueRepoSubscriptionsJobFn {
  return async function enqueueRepoSubscriptions(job) {
    await queue.add('check-subscriptions', job, {
      attempts: config.attempts,
      backoff: { type: 'exponential', delay: config.expBackoffDelay },
    });
  };
}
