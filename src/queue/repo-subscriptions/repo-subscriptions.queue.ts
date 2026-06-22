import type { Job } from 'bullmq';

import type { RepoSubJobConfig } from '@/config/config.js';
import type { DefineQueueDeps } from '@/lib/redis-queue/redis-queue.js';
import type { Logger } from '@/logger/logger.js';
import type { ReleaseNotificationsQueue } from '@/queue/release-notifications/release-notifications.queue.js';
import type { RepositoryRepo } from '@/repository/repository.repo.js';
import type { SubscriptionRepo } from '@/subscription/subscription.repo.js';
import { defineQueue } from '@/lib/redis-queue/redis-queue.js';
import { sleep } from '@/utils/sleep.js';

const QUEUE_NAME_REPO_SUBSCRIPTIONS = 'repo-subscriptions';

export type RepoSubscriptionsJob = {
  repoId: number;
  repoName: string;
  latestTag: string;
};

export type RepoSubscriptionsQueue = {
  enqueueRepoSubscriptions(job: RepoSubscriptionsJob): Promise<void>;
};

export function createRepoSubscriptionsQueue(deps: DefineQueueDeps) {
  const queue = defineQueue<RepoSubscriptionsJob>(QUEUE_NAME_REPO_SUBSCRIPTIONS, deps);

  const { module, enqueueJob } = queue.createQueue();

  const service: RepoSubscriptionsQueue = {
    enqueueRepoSubscriptions: enqueueJob,
  };

  function createWorker({
    config,
    repositoryRepo,
    subscriptionRepo,
    releaseNotificationsQueue,
  }: WorkerDeps) {
    return queue.createWorker((log, onSkip) =>
      createProcessRepoSubscriptionJob({
        log,
        onSkip,
        config,
        repositoryRepo,
        subscriptionRepo,
        releaseNotificationsQueue,
      }),
    );
  }

  return { module, service, createWorker };
}

type WorkerDeps = {
  config: RepoSubJobConfig;
  repositoryRepo: RepositoryRepo;
  subscriptionRepo: SubscriptionRepo;
  releaseNotificationsQueue: ReleaseNotificationsQueue;
};

type ProcessJobDeps = WorkerDeps & {
  log: Logger;
  onSkip: () => void;
};

export function createProcessRepoSubscriptionJob({
  config,
  log,
  repositoryRepo,
  subscriptionRepo,
  releaseNotificationsQueue,
  onSkip,
}: ProcessJobDeps) {
  return async function processJob(job: Job<RepoSubscriptionsJob>) {
    const { repoId, repoName, latestTag: tag } = job.data;

    const latestTagResult = await repositoryRepo.getLatestTag(repoId);

    if (latestTagResult.isErr()) {
      const error = latestTagResult.error;
      log.error({ error }, `Failed to get latest tag for repo ${String(repoId)}`);
      throw new Error(error.type);
    }

    if (latestTagResult.value != tag) {
      const [jobId, latestTag] = [job.id ?? 'unknown', latestTagResult.value];
      log.info(`Skipping outdated job ${jobId}: job tag ${tag} != latest tag ${latestTag}`);
      onSkip();
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
          .enqueueReleaseEmail({ repoId, repoName, email: sub.email, tag: tag })
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

    log.info(`New release for ${repoName}@${tag}, enqueued ${total.toString()} emails`);
  };
}
