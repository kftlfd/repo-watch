import { Queue } from 'bullmq';

import { redis } from '@/redis/redis.js';

import type { EnqueueReleaseEmailJobFn } from './release-notifications.types.js';
import { QUEUE_NAME_RELEASE_NOTIFICATIONS } from './release-notifications.types.js';

const emailQueue = new Queue(QUEUE_NAME_RELEASE_NOTIFICATIONS, {
  connection: redis,
});

export const enqueueReleaseEmail: EnqueueReleaseEmailJobFn = async (job) => {
  await emailQueue.add('send-email', job, {
    attempts: 5,
    backoff: { type: 'exponential', delay: 1000 },
  });
};
