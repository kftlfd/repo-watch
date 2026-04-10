import { Queue } from 'bullmq';

import { redis } from '@/redis/redis.js';

import {
  QUEUE_NAME_RELEASE_NOTIFICATIONS,
  ReleaseEmailJob,
} from './release-notifications.types.js';

const emailQueue = new Queue(QUEUE_NAME_RELEASE_NOTIFICATIONS, {
  connection: redis,
});

export function enqueueReleaseEmail(job: ReleaseEmailJob) {
  return emailQueue.add('send-email', job, {
    attempts: 5,
    backoff: { type: 'exponential', delay: 1000 },
  });
}
