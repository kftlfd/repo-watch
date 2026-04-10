import { Job, Worker } from 'bullmq';

import { enqueueReleaseEmail } from '@/queue/release-notifications/release-notifications.queue.js';
import { redis } from '@/redis/redis.js';
import * as repositoryRepo from '@/repository/repository.repo.js';
import * as subscriptionRepo from '@/subscription/subscription.repo.js';
import { sleep } from '@/utils/sleep.js';

import { QUEUE_NAME_REPO_SUBSCRIPTIONS, RepoSubscriptionsJob } from './repo-subscriptions.types.js';

const BATCH_SIZE = 20;
const POLL_DELAY_MS = 200;

async function processJob(job: Job<RepoSubscriptionsJob>) {
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
      BATCH_SIZE,
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

    await sleep(POLL_DELAY_MS);
    cursor = subscriptionsBatch.at(-1)?.id ?? cursor + BATCH_SIZE;
  }

  console.log(`New release for ${repoName}@${latestTag}, enqueued ${total.toString()} emails`);
}

export function startRepoSubscriptionsWorker() {
  const worker = new Worker<RepoSubscriptionsJob>(QUEUE_NAME_REPO_SUBSCRIPTIONS, processJob, {
    connection: redis,
    concurrency: 2,
    limiter: {
      max: 5,
      duration: 1000,
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
