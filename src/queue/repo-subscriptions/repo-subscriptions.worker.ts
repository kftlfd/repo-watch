import { Job, Worker } from 'bullmq';

import type { RepoSubJobConfig, WorkerConfig } from '@/config/config.js';
import type { Logger } from '@/logger/logger.js';
import type { ReleaseEmailJob } from '@/queue/release-notifications/release-notifications.types.js';
import type { RepositoryRepo } from '@/repository/repository.repo.js';
import type { SubscriptionRepo } from '@/subscription/subscription.repo.js';
import { redis } from '@/redis/redis.js';
import { sleep } from '@/utils/sleep.js';

import type { RepoSubscriptionsJob } from './repo-subscriptions.types.js';
import { QUEUE_NAME_REPO_SUBSCRIPTIONS } from './repo-subscriptions.types.js';

type ProcessJobFn = (job: Job<RepoSubscriptionsJob>) => Promise<void>;

type ProcessJobDeps = {
  config: RepoSubJobConfig;
  log: Logger;
  repositoryRepo: RepositoryRepo;
  subscriptionRepo: SubscriptionRepo;
  enqueueReleaseEmail: (job: ReleaseEmailJob) => Promise<void>;
};

function createProcessRepoSubscriptionJob({
  config,
  log,
  repositoryRepo,
  subscriptionRepo,
  enqueueReleaseEmail,
}: ProcessJobDeps): ProcessJobFn {
  return async function processJob(job) {
    const { repoId, repoName, latestTag } = job.data;

    const latestTagResult = await repositoryRepo.getLatestTag(repoId);

    if (latestTagResult.isErr()) {
      const error = latestTagResult.error;
      log.error({ error }, `Failed to get latest tag for repo ${String(repoId)}`);
      throw new Error(error.message);
    }

    if (latestTagResult.value != latestTag) {
      // drop outdated job
      return;
    }

    let cursor = -1;
    let total = 0;

    while (true) {
      const subscriptionsBatch = await subscriptionRepo.getConfirmedByRepositoryIdBatch(
        repoId,
        cursor,
        config.batchSize,
      );

      if (subscriptionsBatch.length < 1) {
        if (cursor === -1) {
          log.info(`no subscribers for ${repoName}, marking repo as inactive`);
          await repositoryRepo.update(repoId, { isActive: false }).catch((error: unknown) => {
            log.error({ error }, 'DB error');
          });
        }
        break;
      }

      for (const sub of subscriptionsBatch) {
        await enqueueReleaseEmail({ repoId, repoName, email: sub.email, tag: latestTag })
          .then(() => {
            total++;
          })
          .catch((error: unknown) => {
            log.error({ error }, 'Queue error');
          });
      }

      await sleep(config.pollDelayMs);
      cursor = subscriptionsBatch.at(-1)?.id ?? cursor + config.batchSize;
    }

    log.info(`New release for ${repoName}@${latestTag}, enqueued ${total.toString()} emails`);
  };
}

type Deps = {
  config: WorkerConfig;
  jobConfig: RepoSubJobConfig;
  logger: Logger;
  repositoryRepo: RepositoryRepo;
  subscriptionRepo: SubscriptionRepo;
  enqueueReleaseEmail: (job: ReleaseEmailJob) => Promise<void>;
};

export function createRepoSubscriptionsWorker({
  config,
  jobConfig,
  logger,
  repositoryRepo,
  subscriptionRepo,
  enqueueReleaseEmail,
}: Deps) {
  const log = logger.child({ module: 'repo-subscriptions.worker' });

  const processJob = createProcessRepoSubscriptionJob({
    log,
    config: jobConfig,
    repositoryRepo,
    subscriptionRepo,
    enqueueReleaseEmail,
  });

  const worker = new Worker<RepoSubscriptionsJob>(QUEUE_NAME_REPO_SUBSCRIPTIONS, processJob, {
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
    log.error({ error }, 'Worker error');
  });

  return worker;
}
