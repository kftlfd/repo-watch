import { Queue } from 'bullmq';

import type { QueueConfig } from '@/config/config.js';
import { redis } from '@/redis/redis.js';

import type { EnqueueReleaseEmailJobFn } from './release-notifications.types.js';
import { QUEUE_NAME_RELEASE_NOTIFICATIONS } from './release-notifications.types.js';

const emailQueue = new Queue(QUEUE_NAME_RELEASE_NOTIFICATIONS, {
  connection: redis,
});

export function createEnqueueReleaseEmail(config: QueueConfig): EnqueueReleaseEmailJobFn {
  return async function enqueueReleaseEmail(job) {
    await emailQueue.add('send-email', job, {
      attempts: config.attempts,
      backoff: { type: 'exponential', delay: config.expBackoffDelay },
    });
  };
}
