import { Job, Worker } from 'bullmq';

import type { WorkerConfig } from '@/config/config.js';
import type { EmailService } from '@/email/email.service.js';
import { redis } from '@/redis/redis.js';

import type { ConfirmationEmailJob } from './confirmation-emails.types.js';
import { QUEUE_NAME_CONFIRMATION_EMAILS } from './confirmation-emails.types.js';

type ProcessJobFn = (job: Job<ConfirmationEmailJob>) => Promise<void>;

type Deps = {
  emailService: EmailService;
};

function createProcessConfirmationEmailJob({ emailService }: Deps): ProcessJobFn {
  return async function processJob(job) {
    const { email, repoName, confirmUrl } = job.data;

    const sendResult = await emailService.sendEmail(email, {
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
  };
}

export function createConfirmationEmailsWorker(deps: Deps, config: WorkerConfig) {
  const processJob = createProcessConfirmationEmailJob(deps);

  const worker = new Worker<ConfirmationEmailJob>(QUEUE_NAME_CONFIRMATION_EMAILS, processJob, {
    connection: redis,
    concurrency: config.concurrency,
    limiter: {
      max: config.limiterMax,
      duration: config.limiterDuration,
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
