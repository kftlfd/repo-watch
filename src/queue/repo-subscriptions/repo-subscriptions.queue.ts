import { Queue } from 'bullmq';

import { redis } from '@/redis/redis.js';

import { QUEUE_NAME_REPO_SUBSCRIPTIONS, RepoSubscriptionsJob } from './repo-subscriptions.types.js';

const queue = new Queue(QUEUE_NAME_REPO_SUBSCRIPTIONS, {
  connection: redis,
});

export function enqueueRepoSubscriptions(job: RepoSubscriptionsJob) {
  return queue.add('check-subscriptions', job, {
    attempts: 5,
    backoff: { type: 'exponential', delay: 1000 },
  });
}
