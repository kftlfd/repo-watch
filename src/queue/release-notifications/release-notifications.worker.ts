import { Job, Worker } from 'bullmq';

import type { WorkerConfig } from '@/config/config.js';
import type { EmailService } from '@/email/email.service.js';
import type { Logger } from '@/logger/logger.js';
import type { RepositoryRepo } from '@/repository/repository.repo.js';
import { redis } from '@/redis/redis.js';

import type { ReleaseEmailJob } from './release-notifications.types.js';
import { QUEUE_NAME_RELEASE_NOTIFICATIONS } from './release-notifications.types.js';

type ProcessJobFn = (job: Job<ReleaseEmailJob>) => Promise<void>;

type ProcessJobDeps = {
  log: Logger;
  emailService: EmailService;
  repositoryRepo: RepositoryRepo;
};

function createProcessReleaseNotificationJob({
  log,
  emailService,
  repositoryRepo,
}: ProcessJobDeps): ProcessJobFn {
  return async function processJob(job) {
    const { repoId, email, tag: jobTag, repoName } = job.data;

    const latestTagResult = await repositoryRepo.getLatestTag(repoId);

    if (latestTagResult.isErr()) {
      const error = latestTagResult.error;
      log.error({ error }, `Failed to get latest tag for repo ${repoId.toString()}`);
      throw new Error(error.message);
    }

    const latestTag = latestTagResult.value;

    if (latestTag !== jobTag) {
      const jobId = job.id ?? 'unknown';
      log.info(`Skipping outdated job ${jobId}: job tag ${jobTag} != latest tag ${latestTag}`);
      return;
    }

    const sendResult = await emailService.sendEmail(email, {
      type: 'release',
      data: {
        repoName,
        tag: jobTag,
        releaseUrl: `https://github.com/${repoName}/releases/tag/${jobTag}`,
        unsubscribeUrl: `https://example.com/unsubscribe`,
      },
    });

    if (sendResult.isErr()) {
      const error = sendResult.error;
      log.error({ error }, `Failed to send email to ${email}`);
      throw new Error(error.message);
    }

    log.info(`Sent release notification for ${repoName} ${jobTag} to ${email}`);
  };
}

type Deps = {
  config: WorkerConfig;
  logger: Logger;
  emailService: EmailService;
  repositoryRepo: RepositoryRepo;
};

export function createReleaseNotificationsWorker({
  config,
  logger,
  emailService,
  repositoryRepo,
}: Deps) {
  const log = logger.child({ module: 'release-notifications.worker' });

  const processJob = createProcessReleaseNotificationJob({
    log,
    emailService,
    repositoryRepo,
  });

  const emailWorker = new Worker<ReleaseEmailJob>(QUEUE_NAME_RELEASE_NOTIFICATIONS, processJob, {
    connection: redis,
    concurrency: config.concurrency,
    limiter: {
      max: config.limiterMax,
      duration: config.limiterDuration,
    },
  });

  emailWorker.on('failed', (job, error) => {
    const jobId = job?.id ?? 'unknown';
    log.error({ error }, `Job ${jobId} failed:`);
  });

  emailWorker.on('error', (error) => {
    log.error({ error }, 'Worker error');
  });

  return emailWorker;
}
