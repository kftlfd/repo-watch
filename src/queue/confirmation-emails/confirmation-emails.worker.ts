import { Job, Worker } from 'bullmq';

import type { WorkerConfig } from '@/config/config.js';
import type { EmailService } from '@/email/email.service.js';
import type { Module } from '@/lib/runtime/runtime.js';
import type { Logger } from '@/logger/logger.js';
import type { Redis } from '@/redis/redis.js';
import { newPromise } from '@/utils/promises.js';

import type { ConfirmationEmailJob } from './confirmation-emails.types.js';
import { QUEUE_NAME_CONFIRMATION_EMAILS } from './confirmation-emails.types.js';

type ProcessJobFn = (job: Job<ConfirmationEmailJob>) => Promise<void>;

type ProcessJobDeps = {
  log: Logger;
  emailService: EmailService;
};

export function createProcessConfirmationEmailJob({
  log,
  emailService,
}: ProcessJobDeps): ProcessJobFn {
  return async function processJob(job) {
    const { email, repoName, confirmHtmlUrl, confirmApiUrl } = job.data;

    const sendResult = await emailService.sendEmail(email, {
      type: 'confirmation',
      data: {
        repoName,
        confirmHtmlUrl,
        confirmApiUrl,
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
  const moduleName = 'confirmation-emails.worker';

  const log = logger.child({
    module: moduleName,
    queue: QUEUE_NAME_CONFIRMATION_EMAILS,
  });

  const processJob = createProcessConfirmationEmailJob({ log, emailService });

  const module: Module = {
    name: moduleName,

    start() {
      const worker = new Worker<ConfirmationEmailJob>(QUEUE_NAME_CONFIRMATION_EMAILS, processJob, {
        connection: redis,
        concurrency: config.concurrency,
        limiter: {
          max: config.limiterMax,
          duration: config.limiterDuration,
        },
      });

      const promise = newPromise();

      worker.on('failed', (job, error) => {
        const jobId = job?.id ?? 'unknown';
        log.error({ error }, `Job ${jobId} failed`);
      });

      worker.on('error', (error) => {
        log.error({ error }, 'Worker error, force-closing');
        promise.reject(error);
      });

      log.info('Confirmation-emails worker started');

      return Promise.resolve({
        exited: promise.promise,
        stop() {
          return worker.close(true);
        },
      });
    },
  };

  return module;
}
