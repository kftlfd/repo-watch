import { err, Result } from 'neverthrow';

import type { ScannerConfig } from '@/config/config.js';
import type { GithubClient } from '@/github/github.client.js';
import type { Logger } from '@/logger/logger.js';
import type { RepoSubscriptionsQueue } from '@/queue/repo-subscriptions/repo-subscriptions.queue.js';
import type { Repository, RepositoryRepo } from '@/repository/repository.repo.js';
import type { HttpError } from '@/utils/errors.js';
import { sleep } from '@/utils/sleep.js';

export type ScannerService = {
  start(): Promise<void>;
  stop(): void;
};

type FetchWithRetryFn = (owner: string, name: string) => Promise<Result<string, HttpError>>;

export function createFetchWithRetryFn({
  log,
  config,
  githubClient,
}: {
  log: Logger;
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

      let retryDelayMs = error.retryAfterSeconds === null ? null : error.retryAfterSeconds * 1_000;
      if (retryDelayMs === null) {
        retryDelayMs = delayMs;
        delayMs *= 2;
      }

      log.info(`[Scanner] TooManyRequests error, retrying in ${retryDelayMs.toString()}ms...`);
      await sleep(retryDelayMs);
    }
  };
}

export function createProcessRepositoryFn({
  log,
  repositoryRepo,
  fetchWithRetry,
  repoSubscriptionsQueue,
}: {
  log: Logger;
  repositoryRepo: RepositoryRepo;
  fetchWithRetry: FetchWithRetryFn;
  repoSubscriptionsQueue: RepoSubscriptionsQueue;
}) {
  return async function processRepository(repo: Repository) {
    const { id: repoId, owner, name, fullName, lastSeenTag } = repo;
    const now = new Date();

    const releaseResult = await fetchWithRetry(owner, name);

    if (releaseResult.isErr()) {
      const error = releaseResult.error;
      log.error(
        { error, repoId, repoFullName: fullName },
        `Failed to fetch release for ${fullName}`,
      );
      await repositoryRepo.updateAfterScan(repoId, now);
      return;
    }

    const latestTag = releaseResult.value;

    if (lastSeenTag === null) {
      log.info(`Saving initial realease for a new repo: ${fullName}@${latestTag}`);
      await repositoryRepo.updateAfterScan(repoId, now, latestTag);
      return;
    }

    if (latestTag === lastSeenTag) {
      log.info(`No new releases for ${fullName}`);
      await repositoryRepo.updateAfterScan(repoId, now);
      return;
    }

    await repositoryRepo.updateAfterScan(repoId, now, latestTag);

    await repoSubscriptionsQueue
      .enqueueRepoSubscriptions({
        repoId,
        repoName: fullName,
        latestTag,
      })
      .catch((error: unknown) => {
        log.error({ error }, 'Enqueue error');
      });

    log.info(`New release: ${fullName}@${latestTag}, subscriptions notifier enqueued`);
  };
}

type Deps = {
  config: ScannerConfig;
  repositoryRepo: RepositoryRepo;
  githubClient: GithubClient;
  logger: Logger;
  repoSubscriptionsQueue: RepoSubscriptionsQueue;
};

export function createScannerService({
  config,
  repositoryRepo,
  githubClient,
  logger,
  repoSubscriptionsQueue,
}: Deps): ScannerService {
  const log = logger.child({ module: 'scanner.service' });

  const fetchWithRetry = createFetchWithRetryFn({ log, config, githubClient });
  const processRepository = createProcessRepositoryFn({
    log,
    repositoryRepo,
    fetchWithRetry,
    repoSubscriptionsQueue,
  });

  let running = true;
  let consecutiveErrors = 0;

  // TODO: Add scanner health metrics for monitoring
  // - lastSuccessfulScan timestamp
  // - totalReposScanned counter
  // - apiCallsPerScan average
  // - reposWithNewReleases counter

  async function start() {
    log.info(
      `Scanner started (interval: ${config.scanIntervalMs.toString()}ms, batch: ${config.batchSize.toString()})`,
    );

    while (running) {
      try {
        const repos = await repositoryRepo.findBatchForScanning(config.batchSize);

        for (const repo of repos) {
          await processRepository(repo);
          await sleep(config.pollDelayMs);
        }

        consecutiveErrors = 0;
      } catch (error) {
        log.error({ error }, 'Scanner error:');
        consecutiveErrors++;

        const backoffDelay = Math.min(
          config.baseErrorDelayMs * Math.pow(2, consecutiveErrors - 1),
          config.maxBackoffDelayMs,
        );

        log.info(
          `Backing off for ${backoffDelay.toString()}ms after ${consecutiveErrors.toString()} consecutive errors`,
        );
        await sleep(backoffDelay);
      }

      await sleep(config.scanIntervalMs);
    }
  }

  function stop() {
    running = false;
  }

  return { start, stop };
}
