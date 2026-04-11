import { Job, Worker } from 'bullmq';

import type { WorkerConfig } from '@/config/config.js';
import type { EmailService } from '@/email/email.service.js';
import type { Logger } from '@/logger/logger.js';
import type { Redis } from '@/redis/redis.js';

import type { ConfirmationEmailJob } from './confirmation-emails.types.js';
import { QUEUE_NAME_CONFIRMATION_EMAILS } from './confirmation-emails.types.js';

type ProcessJobFn = (job: Job<ConfirmationEmailJob>) => Promise<void>;

type ProcessJobDeps = {
  log: Logger;
  emailService: EmailService;
};

function createProcessConfirmationEmailJob({ log, emailService }: ProcessJobDeps): ProcessJobFn {
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
      log.error({ error }, `Failed to send confirmation email to ${email}`);
      throw new Error(error.message);
    }

    log.info(`Sent confirmation email for ${repoName} to ${email}`);
  };
}

type Deps = {
  config: WorkerConfig;
  logger: Logger;
  emailService: EmailService;
  redis: Redis;
};

export function createConfirmationEmailsWorker({ config, logger, emailService, redis }: Deps) {
  const log = logger.child({
    module: 'confirmation-emails.worker',
    queue: QUEUE_NAME_CONFIRMATION_EMAILS,
  });

  const processJob = createProcessConfirmationEmailJob({ log, emailService });

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
    log.error({ error }, `Job ${jobId} failed`);
  });

  worker.on('error', (error) => {
    log.error({ error }, 'Worker error:');
  });

  return worker;
}
