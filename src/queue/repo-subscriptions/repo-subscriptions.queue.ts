import { Queue } from 'bullmq';

import type { QueueConfig } from '@/config/config.js';
import type { Redis } from '@/redis/redis.js';

import type { RepoSubscriptionsJob } from './repo-subscriptions.types.js';
import { QUEUE_NAME_REPO_SUBSCRIPTIONS } from './repo-subscriptions.types.js';

export type RepoSubscriptionsQueue = {
  enqueueRepoSubscriptions(job: RepoSubscriptionsJob): Promise<void>;
};

type Deps = {
  config: QueueConfig;
  redis: Redis;
};

export function createRepoSubscriptionsQueue({ config, redis }: Deps): RepoSubscriptionsQueue {
  const queue = new Queue(QUEUE_NAME_REPO_SUBSCRIPTIONS, {
    connection: redis,
    defaultJobOptions: {
      removeOnComplete: { count: config.keepCompletedCount },
      removeOnFail: { count: config.keepFailedCount },
    },
  });

  return {
    async enqueueRepoSubscriptions(job) {
      await queue.add('notify-repo-subscriptions', job, {
        attempts: config.attempts,
        backoff: { type: 'exponential', delay: config.expBackoffDelay },
      });
    },
  };
}
