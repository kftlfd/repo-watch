import { err, Result } from 'neverthrow';

import type { ScannerConfig } from '@/config/config.js';
import type { GithubClient } from '@/github/github.client.js';
import type { EnqueueRepoSubscriptionsJobFn } from '@/queue/repo-subscriptions/repo-subscriptions.types.js';
import type { Repository, RepositoryRepo } from '@/repository/repository.repo.js';
import type { HttpError } from '@/utils/errors.js';
import { sleep } from '@/utils/sleep.js';

type FetchWithRetryFn = (owner: string, name: string) => Promise<Result<string, HttpError>>;

export function createFetchWithRetryFn({
  config,
  githubClient,
}: {
  config: ScannerConfig;
  githubClient: GithubClient;
}): FetchWithRetryFn {
  return async function fetchWithRetry(owner, name) {
    let delayMs = config.initialRetryDelay;

    while (true) {
      const result = await githubClient.getLatestRelease(owner, name);

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
  };
}

export function createProcessRepositoryFn({
  repositoryRepo,
  fetchWithRetry,
  enqueueRepoSubscriptions,
}: {
  repositoryRepo: RepositoryRepo;
  fetchWithRetry: FetchWithRetryFn;
  enqueueRepoSubscriptions: EnqueueRepoSubscriptionsJobFn;
}) {
  return async function processRepository(repo: Repository) {
    const { id: repoId, owner, name, fullName, lastSeenTag } = repo;
    const now = new Date();

    const releaseResult = await fetchWithRetry(owner, name);

    if (releaseResult.isErr()) {
      const error = releaseResult.error;
      console.error(`Failed to fetch release for ${fullName}:`, error.type);
      await repositoryRepo.updateAfterScan(repoId, now);
      return;
    }

    const latestTag = releaseResult.value;

    if (latestTag === lastSeenTag) {
      console.log(`No new release for ${fullName}`);
      await repositoryRepo.updateAfterScan(repoId, now);
      return;
    }

    await repositoryRepo.updateAfterScan(repoId, now, latestTag);

    await enqueueRepoSubscriptions({ repoId, repoName: fullName, latestTag }).catch(
      (err: unknown) => {
        console.error('Enqueue error', err);
      },
    );

    console.log(`New release: ${fullName}@${latestTag}, subscriptions notifier enqueued`);
  };
}

type Deps = {
  config: ScannerConfig;
  repositoryRepo: RepositoryRepo;
  githubClient: GithubClient;
  enqueueRepoSubscriptions: EnqueueRepoSubscriptionsJobFn;
};

export function createScannerLoop({
  config,
  repositoryRepo,
  githubClient,
  enqueueRepoSubscriptions,
}: Deps) {
  const fetchWithRetry = createFetchWithRetryFn({ config, githubClient });
  const processRepository = createProcessRepositoryFn({
    repositoryRepo,
    fetchWithRetry,
    enqueueRepoSubscriptions,
  });

  async function startScanner() {
    console.log(
      `Scanner started (interval: ${config.scanIntervalMs.toString()}ms, batch: ${config.batchSize.toString()})`,
    );

    while (true) {
      try {
        const repos = await repositoryRepo.findBatchForScanning(config.batchSize);

        for (const repo of repos) {
          await processRepository(repo);
          await sleep(config.pollDelayMs);
        }
      } catch (error) {
        console.error('Scanner error:', error);
      }

      await sleep(config.scanIntervalMs);
    }
  }

  return startScanner;
}
