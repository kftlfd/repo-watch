import { Queue } from 'bullmq';

import type { QueueConfig } from '@/config/config.js';
import type { Redis } from '@/redis/redis.js';

import type { ReleaseEmailJob } from './release-notifications.types.js';
import { QUEUE_NAME_RELEASE_NOTIFICATIONS } from './release-notifications.types.js';

export type ReleaseNotificationsQueue = {
  enqueueReleaseEmail(job: ReleaseEmailJob): Promise<void>;
};

type Deps = {
  config: QueueConfig;
  redis: Redis;
};

export function createReleaseNotificationsQueue({
  config,
  redis,
}: Deps): ReleaseNotificationsQueue {
  const queue = new Queue(QUEUE_NAME_RELEASE_NOTIFICATIONS, {
    connection: redis,
    defaultJobOptions: {
      removeOnComplete: { count: config.keepCompletedCount },
      removeOnFail: { count: config.keepFailedCount },
    },
  });

  return {
    async enqueueReleaseEmail(job) {
      await queue.add('send-release-notification-email', job, {
        attempts: config.attempts,
        backoff: { type: 'exponential', delay: config.expBackoffDelay },
      });
    },
  };
}
