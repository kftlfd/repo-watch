import type { Job } from 'bullmq';

import type { EmailService } from '@/email/email.service.js';
import type { DefineQueueDeps } from '@/lib/redis-queue/redis-queue.js';
import type { Logger } from '@/logger/logger.js';
import type { RepositoryRepo } from '@/repository/repository.repo.js';
import type { TokenService } from '@/token/token.service.js';
import { defineQueue } from '@/lib/redis-queue/redis-queue.js';

const QUEUE_NAME_RELEASE_NOTIFICATIONS = 'release-notifications';

export type ReleaseEmailJob = {
  email: string;
  repoId: number;
  repoName: string;
  tag: string;
};

export type ReleaseNotificationsQueue = {
  enqueueReleaseEmail(job: ReleaseEmailJob): Promise<void>;
};

export function createReleaseNotificationsQueue(deps: DefineQueueDeps) {
  const queue = defineQueue<ReleaseEmailJob>(QUEUE_NAME_RELEASE_NOTIFICATIONS, deps);

  const { module, enqueueJob } = queue.createQueue();

  const service: ReleaseNotificationsQueue = {
    enqueueReleaseEmail: enqueueJob,
  };

  function createWorker({ emailService, repositoryRepo, tokenService }: WorkerDeps) {
    return queue.createWorker((log, onSkip) =>
      createProcessReleaseNotificationJob({
        log,
        emailService,
        repositoryRepo,
        tokenService,
        onSkip,
      }),
    );
  }

  return { module, service, createWorker };
}

type WorkerDeps = {
  emailService: EmailService;
  repositoryRepo: RepositoryRepo;
  tokenService: TokenService;
};

type ProcessJobDeps = WorkerDeps & {
  log: Logger;
  onSkip: () => void;
};

export function createProcessReleaseNotificationJob({
  log,
  emailService,
  repositoryRepo,
  tokenService,
  onSkip,
}: ProcessJobDeps) {
  return async function processJob(job: Job<ReleaseEmailJob>) {
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
      onSkip();
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
