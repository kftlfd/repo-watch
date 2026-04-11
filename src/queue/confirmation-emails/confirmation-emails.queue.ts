import { Queue } from 'bullmq';

import type { QueueConfig } from '@/config/config.js';
import type { Redis } from '@/redis/redis.js';

import type { ConfirmationEmailJob } from './confirmation-emails.types.js';
import { QUEUE_NAME_CONFIRMATION_EMAILS } from './confirmation-emails.types.js';

export type ConfirmationEmailsQueue = {
  enqueueConfirmationEmail(job: ConfirmationEmailJob): Promise<void>;
};

type Deps = {
  config: QueueConfig;
  redis: Redis;
};

export function createConfirmationEmailsQueue({ config, redis }: Deps): ConfirmationEmailsQueue {
  const queue = new Queue(QUEUE_NAME_CONFIRMATION_EMAILS, {
    connection: redis,
  });

  return {
    async enqueueConfirmationEmail(job) {
      await queue.add('send-confirmation-email', job, {
        attempts: config.attempts,
        backoff: { type: 'exponential', delay: config.expBackoffDelay },
      });
    },
  };
}
