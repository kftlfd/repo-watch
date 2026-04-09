import { Job, Worker } from 'bullmq';

import { redis } from '@/db/redis.js';
import { sendEmail } from '@/email/email.service.js';

import {
  ConfirmationEmailJob,
  QUEUE_NAME_CONFIRMATION_EMAILS,
} from './confirmation-emails.types.js';

async function processJob(job: Job<ConfirmationEmailJob>) {
  const { email, repoName, confirmUrl } = job.data;

  const sendResult = await sendEmail(email, {
    type: 'confirmation',
    data: {
      repoName,
      confirmUrl,
    },
  });

  if (sendResult.isErr()) {
    const error = sendResult.error;
    console.error(`Failed to send confirmation email to ${email}:`, error.message);
    throw new Error(error.message);
  }

  console.log(`Sent confirmation email for ${repoName} to ${email}`);
}

export function startConfirmationEmailsWorker() {
  const worker = new Worker<ConfirmationEmailJob>(QUEUE_NAME_CONFIRMATION_EMAILS, processJob, {
    connection: redis,
    concurrency: 10,
    limiter: {
      max: 5,
      duration: 1000,
    },
  });

  worker.on('failed', (job, error) => {
    const jobId = job?.id ?? 'unknown';
    console.error(`Job ${jobId} failed:`, error.message);
  });

  worker.on('error', (error) => {
    console.error('Worker error:', error);
  });

  return worker;
}
