import { Queue } from 'bullmq';

import { redis } from '@/redis/redis.js';

import {
  QUEUE_NAME_RELEASE_NOTIFICATIONS,
  type ReleaseEmailJob,
} from './release-notifications.types.js';

const emailQueue = new Queue(QUEUE_NAME_RELEASE_NOTIFICATIONS, {
  connection: redis,
});

export async function enqueueReleaseEmail(job: ReleaseEmailJob) {
  await emailQueue.add('send-email', job, {
    attempts: 5,
    backoff: { type: 'exponential', delay: 1000 },
  });
}
