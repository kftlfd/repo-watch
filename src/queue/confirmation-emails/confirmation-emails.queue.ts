import type { Job } from 'bullmq';

import type { EmailService } from '@/email/email.service.js';
import type { DefineQueueDeps } from '@/lib/redis-queue/redis-queue.js';
import type { Logger } from '@/logger/logger.js';
import { defineQueue } from '@/lib/redis-queue/redis-queue.js';

const QUEUE_NAME_CONFIRMATION_EMAILS = 'confirmation-emails';

export type ConfirmationEmailJob = {
  email: string;
  repoName: string;
  confirmHtmlUrl: string;
  confirmApiUrl: string;
};

export type ConfirmationEmailsQueue = {
  enqueueConfirmationEmail(job: ConfirmationEmailJob): Promise<void>;
};

export function createConfirmationEmailsQueue(deps: DefineQueueDeps) {
  const queue = defineQueue<ConfirmationEmailJob>(QUEUE_NAME_CONFIRMATION_EMAILS, deps);

  const { module, enqueueJob } = queue.createQueue();

  const service: ConfirmationEmailsQueue = {
    enqueueConfirmationEmail: enqueueJob,
  };

  function createWorker({ emailService }: WorkerDeps) {
    return queue.createWorker((log) => createProcessConfirmationEmailJob({ log, emailService }));
  }

  return { module, service, createWorker };
}

type WorkerDeps = {
  emailService: EmailService;
};

type ProcessJobDeps = WorkerDeps & {
  log: Logger;
};

export function createProcessConfirmationEmailJob({ log, emailService }: ProcessJobDeps) {
  return async function processJob(job: Job<ConfirmationEmailJob>) {
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
