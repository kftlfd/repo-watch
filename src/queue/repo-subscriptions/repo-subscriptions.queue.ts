import { Queue } from 'bullmq';

import { redis } from '@/redis/redis.js';

import type { EnqueueRepoSubscriptionsJobFn } from './repo-subscriptions.types.js';
import { QUEUE_NAME_REPO_SUBSCRIPTIONS } from './repo-subscriptions.types.js';

const queue = new Queue(QUEUE_NAME_REPO_SUBSCRIPTIONS, {
  connection: redis,
});

export const enqueueRepoSubscriptions: EnqueueRepoSubscriptionsJobFn = async (job) => {
  await queue.add('check-subscriptions', job, {
    attempts: 5,
    backoff: { type: 'exponential', delay: 1000 },
  });
};
