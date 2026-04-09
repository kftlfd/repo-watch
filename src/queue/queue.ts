import { Queue } from 'bullmq';

import { redis } from '@/db/redis.js';

export const emailQueue = new Queue('email-notifications', {
  connection: redis,
});
