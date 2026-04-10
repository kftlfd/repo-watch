import { Queue } from 'bullmq';

import type { QueueConfig } from '@/config/config.js';
import { redis } from '@/redis/redis.js';

import type { EnqueueConfirmationEmailJobFn } from './confirmation-emails.types.js';
import { QUEUE_NAME_CONFIRMATION_EMAILS } from './confirmation-emails.types.js';

const queue = new Queue(QUEUE_NAME_CONFIRMATION_EMAILS, {
  connection: redis,
});

export function createEnqueueConfirmationEmaiFn(
  config: QueueConfig,
): EnqueueConfirmationEmailJobFn {
  return async function enqueueConfirmationEmail(job) {
    await queue.add('send-confirmation', job, {
      attempts: config.attempts,
      backoff: { type: 'exponential', delay: config.expBackoffDelay },
    });
  };
}
