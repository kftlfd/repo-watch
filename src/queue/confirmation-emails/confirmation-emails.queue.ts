import { Queue } from 'bullmq';

import { redis } from '@/redis/redis.js';

import type { EnqueueConfirmationEmailJobFn } from './confirmation-emails.types.js';
import { QUEUE_NAME_CONFIRMATION_EMAILS } from './confirmation-emails.types.js';

const queue = new Queue(QUEUE_NAME_CONFIRMATION_EMAILS, {
  connection: redis,
});

export const enqueueConfirmationEmail: EnqueueConfirmationEmailJobFn = async (job) => {
  await queue.add('send-confirmation', job, {
    attempts: 5,
    backoff: { type: 'exponential', delay: 1000 },
  });
};
