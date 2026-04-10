import { Job, Worker } from 'bullmq';

import type { RepoSubJobConfig, WorkerConfig } from '@/config/config.js';
import type { ReleaseEmailJob } from '@/queue/release-notifications/release-notifications.types.js';
import type { RepositoryRepo } from '@/repository/repository.repo.js';
import type { SubscriptionRepo } from '@/subscription/subscription.repo.js';
import { redis } from '@/redis/redis.js';
import { sleep } from '@/utils/sleep.js';

import type { RepoSubscriptionsJob } from './repo-subscriptions.types.js';
import { QUEUE_NAME_REPO_SUBSCRIPTIONS } from './repo-subscriptions.types.js';

type ProcessJobFn = (job: Job<RepoSubscriptionsJob>) => Promise<void>;

type Deps = {
  config: RepoSubJobConfig;
  repositoryRepo: RepositoryRepo;
  subscriptionRepo: SubscriptionRepo;
  enqueueReleaseEmail: (job: ReleaseEmailJob) => Promise<void>;
};

function createProcessRepoSubscriptionJob({
  config,
  repositoryRepo,
  subscriptionRepo,
  enqueueReleaseEmail,
}: Deps): ProcessJobFn {
  return async function processJob(job) {
    const { repoId, repoName, latestTag } = job.data;

    const latestTagResult = await repositoryRepo.getLatestTag(repoId);

    if (latestTagResult.isErr()) {
      const error = latestTagResult.error;
      console.error(`Failed to get latest tag for repo ${String(repoId)}:`, error.message);
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
          console.log(`no subscribers, marking repo as inactive`);
          await repositoryRepo.update(repoId, { isActive: false }).catch((err: unknown) => {
            console.error('DB error:', err);
          });
        }
        break;
      }

      for (const sub of subscriptionsBatch) {
        await enqueueReleaseEmail({ repoId, repoName, email: sub.email, tag: latestTag })
          .then(() => {
            total++;
          })
          .catch((err: unknown) => {
            console.error('Queue error:', err);
          });
      }

      await sleep(config.pollDelayMs);
      cursor = subscriptionsBatch.at(-1)?.id ?? cursor + config.batchSize;
    }

    console.log(`New release for ${repoName}@${latestTag}, enqueued ${total.toString()} emails`);
  };
}

export function createRepoSubscriptionsWorker(deps: Deps, config: WorkerConfig) {
  const processJob = createProcessRepoSubscriptionJob(deps);

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
    console.error(`Job ${jobId} failed:`, error.message);
  });

  worker.on('error', (error) => {
    console.error('Worker error:', error);
  });

  return worker;
}
