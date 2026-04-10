import { Queue } from 'bullmq';

import { redis } from '@/redis/redis.js';

import {
  QUEUE_NAME_REPO_SUBSCRIPTIONS,
  type RepoSubscriptionsJob,
} from './repo-subscriptions.types.js';

const queue = new Queue(QUEUE_NAME_REPO_SUBSCRIPTIONS, {
  connection: redis,
});

export async function enqueueRepoSubscriptions(job: RepoSubscriptionsJob) {
  await queue.add('check-subscriptions', job, {
    attempts: 5,
    backoff: { type: 'exponential', delay: 1000 },
  });
}
