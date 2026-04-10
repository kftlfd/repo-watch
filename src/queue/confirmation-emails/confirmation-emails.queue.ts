import { Queue } from 'bullmq';

import { redis } from '@/redis/redis.js';

import {
  QUEUE_NAME_CONFIRMATION_EMAILS,
  type ConfirmationEmailJob,
} from './confirmation-emails.types.js';

const queue = new Queue(QUEUE_NAME_CONFIRMATION_EMAILS, {
  connection: redis,
});

export async function enqueueConfirmationEmail(job: ConfirmationEmailJob) {
  await queue.add('send-confirmation', job, {
    attempts: 5,
    backoff: { type: 'exponential', delay: 1000 },
  });
}
