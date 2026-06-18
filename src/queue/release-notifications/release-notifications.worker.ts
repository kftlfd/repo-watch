import { Job, Worker } from 'bullmq';

import type { WorkerConfig } from '@/config/config.js';
import type { EmailService } from '@/email/email.service.js';
import type { Module } from '@/lib/runtime/runtime.js';
import type { Logger } from '@/logger/logger.js';
import type { Redis } from '@/redis/redis.js';
import type { RepositoryRepo } from '@/repository/repository.repo.js';
import type { TokenService } from '@/token/token.service.js';
import { newPromise } from '@/utils/promises.js';

import type { ReleaseEmailJob } from './release-notifications.types.js';
import { QUEUE_NAME_RELEASE_NOTIFICATIONS } from './release-notifications.types.js';

type ProcessJobFn = (job: Job<ReleaseEmailJob>) => Promise<void>;

type ProcessJobDeps = {
  log: Logger;
  emailService: EmailService;
  repositoryRepo: RepositoryRepo;
  tokenService: TokenService;
};

export function createProcessReleaseNotificationJob({
  log,
  emailService,
  repositoryRepo,
  tokenService,
}: ProcessJobDeps): ProcessJobFn {
  return async function processJob(job) {
    const { repoId, email, tag: jobTag, repoName } = job.data;

    const latestTagResult = await repositoryRepo.getLatestTag(repoId);

    if (latestTagResult.isErr()) {
      const error = latestTagResult.error;
      log.error({ error }, `Failed to get latest tag for repo ${repoId.toString()}`);
      throw new Error(error.type);
    }

    const latestTag = latestTagResult.value;

    if (latestTag !== jobTag) {
      const jobId = job.id ?? 'unknown';
      log.info(`Skipping outdated job ${jobId}: job tag ${jobTag} != latest tag ${latestTag}`);
      return;
    }

    const token = await tokenService.createToken({
      email,
      repositoryId: repoId,
      type: 'unsubscribe',
    });
    const { htmlUrl: unsubscribeHtmlUrl, apiUrl: unsubscribeApiUrl } = tokenService.getTokenUrls(
      token,
      'unsubscribe',
    );

    const sendResult = await emailService.sendEmail(email, {
      type: 'release',
      data: {
        repoName,
        tag: jobTag,
        releaseUrl: `https://github.com/${repoName}/releases/tag/${jobTag}`,
        unsubscribeHtmlUrl,
        unsubscribeApiUrl,
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
  tokenService: TokenService;
  redis: Redis;
};

export function createReleaseNotificationsWorker({
  config,
  logger,
  emailService,
  repositoryRepo,
  tokenService,
  redis,
}: Deps) {
  const moduleName = 'release-notifications.worker';

  const log = logger.child({
    module: moduleName,
    queue: QUEUE_NAME_RELEASE_NOTIFICATIONS,
  });

  const processJob = createProcessReleaseNotificationJob({
    log,
    emailService,
    repositoryRepo,
    tokenService,
  });

  const module: Module = {
    name: moduleName,

    start() {
      const emailWorker = new Worker<ReleaseEmailJob>(
        QUEUE_NAME_RELEASE_NOTIFICATIONS,
        processJob,
        {
          connection: redis,
          concurrency: config.concurrency,
          limiter: {
            max: config.limiterMax,
            duration: config.limiterDuration,
          },
        },
      );

      const promise = newPromise();

      emailWorker.on('failed', (job, error) => {
        const jobId = job?.id ?? 'unknown';
        log.error({ error }, `Job ${jobId} failed:`);
      });

      emailWorker.on('error', (error) => {
        log.error({ error }, 'Worker error, force-closing');
        promise.reject(error);
      });

      log.info('Release-notifications worker started');

      return Promise.resolve({
        exited: promise.promise,
        stop() {
          return emailWorker.close(true);
        },
      });
    },
  };

  return module;
}
