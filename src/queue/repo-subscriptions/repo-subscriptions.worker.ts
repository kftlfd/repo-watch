import { Job, Worker } from 'bullmq';

import type { RepoSubJobConfig, WorkerConfig } from '@/config/config.js';
import type { Module } from '@/lib/runtime/runtime.js';
import type { Logger } from '@/logger/logger.js';
import type { ReleaseNotificationsQueue } from '@/queue/release-notifications/release-notifications.queue.js';
import type { Redis } from '@/redis/redis.js';
import type { RepositoryRepo } from '@/repository/repository.repo.js';
import type { SubscriptionRepo } from '@/subscription/subscription.repo.js';
import { newPromise } from '@/utils/promises.js';
import { sleep } from '@/utils/sleep.js';

import type { RepoSubscriptionsJob } from './repo-subscriptions.types.js';
import { QUEUE_NAME_REPO_SUBSCRIPTIONS } from './repo-subscriptions.types.js';

type ProcessJobFn = (job: Job<RepoSubscriptionsJob>) => Promise<void>;

type ProcessJobDeps = {
  config: RepoSubJobConfig;
  log: Logger;
  repositoryRepo: RepositoryRepo;
  subscriptionRepo: SubscriptionRepo;
  releaseNotificationsQueue: ReleaseNotificationsQueue;
};

export function createProcessRepoSubscriptionJob({
  config,
  log,
  repositoryRepo,
  subscriptionRepo,
  releaseNotificationsQueue,
}: ProcessJobDeps): ProcessJobFn {
  return async function processJob(job) {
    const { repoId, repoName, latestTag } = job.data;

    const latestTagResult = await repositoryRepo.getLatestTag(repoId);

    if (latestTagResult.isErr()) {
      const error = latestTagResult.error;
      log.error({ error }, `Failed to get latest tag for repo ${String(repoId)}`);
      throw new Error(error.type);
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
          await repositoryRepo.update(repoId, { isActive: false }).orTee((error) => {
            log.error({ error }, 'Update error');
          });
        }
        break;
      }

      for (const sub of subscriptionsBatch) {
        await releaseNotificationsQueue
          .enqueueReleaseEmail({ repoId, repoName, email: sub.email, tag: latestTag })
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
  releaseNotificationsQueue: ReleaseNotificationsQueue;
  redis: Redis;
};

export function createRepoSubscriptionsWorker({
  config,
  jobConfig,
  logger,
  repositoryRepo,
  subscriptionRepo,
  releaseNotificationsQueue,
  redis,
}: Deps) {
  const moduleName = 'repo-subscriptions.worker';

  const log = logger.child({
    module: moduleName,
    queue: QUEUE_NAME_REPO_SUBSCRIPTIONS,
  });

  const processJob = createProcessRepoSubscriptionJob({
    log,
    config: jobConfig,
    repositoryRepo,
    subscriptionRepo,
    releaseNotificationsQueue,
  });

  const module: Module = {
    name: moduleName,

    start() {
      const worker = new Worker<RepoSubscriptionsJob>(QUEUE_NAME_REPO_SUBSCRIPTIONS, processJob, {
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

      log.info('Repo-subsciptions worker started');

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
