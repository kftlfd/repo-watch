import { err, Result } from 'neverthrow';

import { setCacheLatestTag } from '@/cache/cache.service.js';
import { getLatestRelease } from '@/github/github.client.js';
import { enqueueRepoSubscriptions } from '@/queue/repo-subscriptions/repo-subscriptions.queue.js';
import * as repositoryRepo from '@/repository/repository.repo.js';
import { HttpError } from '@/utils/errors.js';
import { sleep } from '@/utils/sleep.js';

const SCAN_INTERVAL_MS = 10 * 60 * 1000;
const BATCH_SIZE = 20;
const POLL_DELAY_MS = 200;
const INITIAL_RETRY_DELAY_MS = 1000;

async function fetchWithRetry(owner: string, name: string): Promise<Result<string, HttpError>> {
  let delayMs = INITIAL_RETRY_DELAY_MS;

  while (true) {
    const result = await getLatestRelease(owner, name);

    if (result.isOk()) {
      return result;
    }

    const error = result.error;
    if (error.type !== 'TooManyRequests') {
      return err(error);
    }

    let retryDelayMs = error.retryAfter;
    if (!retryDelayMs) {
      retryDelayMs = delayMs;
      delayMs *= 2;
    }

    console.log(`[Scanner] TooManyRequests error, retrying in ${retryDelayMs.toString()}ms...`);
    await sleep(retryDelayMs);
  }
}

async function processRepository(repo: repositoryRepo.Repository) {
  const { id: repoId, owner, name, fullName, lastSeenTag } = repo;

  const releaseResult = await fetchWithRetry(owner, name);

  if (releaseResult.isErr()) {
    const error = releaseResult.error;
    console.error(`Failed to fetch release for ${fullName}:`, error.type);
    await repositoryRepo.update(repoId, { lastCheckedAt: new Date() });
    return;
  }

  const latestTag = releaseResult.value;

  if (latestTag === lastSeenTag) {
    console.log(`No new release for ${fullName}`);
    await repositoryRepo.update(repoId, { lastCheckedAt: new Date() });
    return;
  }

  await repositoryRepo.update(repoId, { lastSeenTag: latestTag, lastCheckedAt: new Date() });

  await setCacheLatestTag(repoId, latestTag).catch((err: unknown) => {
    console.log('Cache write failed:', err);
  });

  await enqueueRepoSubscriptions({ repoId, repoName: fullName, latestTag }).catch(
    (err: unknown) => {
      console.error('Enqueue error', err);
    },
  );

  console.log(`New release: ${fullName}@${latestTag}, subscriptions notifier enqueued`);
}

export async function startScanner() {
  console.log(
    `Scanner started (interval: ${SCAN_INTERVAL_MS.toString()}ms, batch: ${BATCH_SIZE.toString()})`,
  );

  while (true) {
    try {
      const repos = await repositoryRepo.findBatchForScanning(BATCH_SIZE);

      for (const repo of repos) {
        await processRepository(repo);
        await sleep(POLL_DELAY_MS);
      }
    } catch (error) {
      console.error('Scanner error:', error);
    }

    await sleep(SCAN_INTERVAL_MS);
  }
}
