import { Queue } from 'bullmq';

import { redis } from '@/db/redis.js';

import {
  ConfirmationEmailJob,
  QUEUE_NAME_CONFIRMATION_EMAILS,
} from './confirmation-emails.types.js';

const queue = new Queue(QUEUE_NAME_CONFIRMATION_EMAILS, {
  connection: redis,
});

export function enqueueConfirmationEmail(job: ConfirmationEmailJob) {
  return queue.add('send-confirmation', job, {
    attempts: 5,
    backoff: { type: 'exponential', delay: 1000 },
  });
}
