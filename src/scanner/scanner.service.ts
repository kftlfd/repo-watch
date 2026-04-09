import { err, Result } from 'neverthrow';

import { setCacheLatestTag } from '@/cache/cache.service.js';
import { getLatestRelease } from '@/github/github.client.js';
import { emailQueue } from '@/queue/queue.js';
import * as repositoryRepo from '@/repository/repository.repo.js';
import * as subscriptionRepo from '@/subscription/subscription.repo.js';
import { AppError } from '@/utils/errors.js';

const SCAN_INTERVAL_MS = 60 * 1000;
const BATCH_SIZE = 20;
const POLL_DELAY_MS = 200;
const INITIAL_RETRY_DELAY_MS = 1000;

function isRetryableError(error: AppError): boolean {
  if (error.type === 'External' && error.service === 'github') {
    const msg = error.message.toLowerCase();
    return msg.includes('rate') || msg.includes('too many');
  }

  if (error.type === 'Internal') {
    const msg = error.message.toLowerCase();
    return msg.includes('fetch') || msg.includes('network');
  }

  return false;
}

async function fetchWithRetry(owner: string, name: string): Promise<Result<string, AppError>> {
  let delay = INITIAL_RETRY_DELAY_MS;

  for (;;) {
    const result = await getLatestRelease(owner, name);

    if (result.isOk()) {
      return result;
    }

    const error = result.error;
    if (!isRetryableError(error)) {
      return err(error);
    }

    console.log(
      `Retryable error for ${owner}/${name}: ${error.message}, retrying in ${String(delay)}ms...`,
    );
    await new Promise((resolve) => setTimeout(resolve, delay));
    delay *= 2;
  }
}

async function processRepository(repo: repositoryRepo.Repository) {
  const { id: repoId, owner, name, fullName, lastSeenTag } = repo;

  const releaseResult = await fetchWithRetry(owner, name);

  if (releaseResult.isErr()) {
    const error = releaseResult.error;
    console.error(`Failed to fetch release for ${fullName}:`, error.message);
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
  await setCacheLatestTag(repoId, latestTag);

  const subscriptions = await subscriptionRepo.findConfirmedByRepositoryId(repoId);

  if (subscriptions.length === 0) {
    console.log(`New release for ${fullName}: ${latestTag}, no subscribers`);
    return;
  }

  for (const sub of subscriptions) {
    await emailQueue.add('notification', {
      repoId,
      email: sub.email,
      tag: latestTag,
      repoName: fullName,
    });
  }

  console.log(
    `New release for ${fullName}: ${latestTag}, enqueued ${String(subscriptions.length)} emails`,
  );
}

export async function startScanner() {
  console.log(
    `Scanner started (interval: ${String(SCAN_INTERVAL_MS)}ms, batch: ${String(BATCH_SIZE)})`,
  );

  for (;;) {
    try {
      const repos = await repositoryRepo.findBatchForScanning(BATCH_SIZE);

      for (const repo of repos) {
        await processRepository(repo);
        await new Promise((resolve) => setTimeout(resolve, POLL_DELAY_MS));
      }
    } catch (error) {
      console.error('Scanner error:', error);
    }

    await new Promise((resolve) => setTimeout(resolve, SCAN_INTERVAL_MS));
  }
}
