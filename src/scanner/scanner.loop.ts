import { err, errAsync, Result, ResultAsync } from 'neverthrow';

import type { ScannerConfig } from '@/config/config.js';
import type { GithubClient } from '@/github/github.client.js';
import type { Logger } from '@/logger/logger.js';
import type { RepoSubscriptionsQueue } from '@/queue/repo-subscriptions/repo-subscriptions.queue.js';
import type { Repository, RepositoryRepo } from '@/repository/repository.repo.js';
import type { HttpError } from '@/utils/errors.js';
import { createLoop } from '@/loop/loop.js';
import { sleep } from '@/utils/sleep.js';

/**
 * TODO:
 *
 * Add scanner health metrics for monitoring
 * - lastSuccessfulScan timestamp
 * - totalReposScanned counter
 * - apiCallsPerScan average
 * - reposWithNewReleases counter
 * - retries in `fetchWithRetries`
 *
 * (?) Interrupt DB queries
 * - Pass AbortSignal into `repositoryRepo.findBatchForScanning`
 *
 * (?) Separate "process repo & update DB" from "enqueue subs-notifications event"
 */

export function createFetchWithRetryFn({
  log,
  config,
  githubClient,
}: {
  log: Logger;
  config: ScannerConfig;
  githubClient: GithubClient;
}) {
  /**
   * Keep retrying with exponential backoff on rate-limits until success or non-rate-limit error
   */
  return async function fetchWithRetry(
    owner: string,
    name: string,
    signal?: AbortSignal,
  ): Promise<Result<string, HttpError | 'ABORTED'>> {
    let delayMs = config.initialRetryDelay;

    while (true) {
      if (signal?.aborted) return err('ABORTED');

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

      log.info({ retryDelayMs }, 'Rete limit detected, scheduled retry');
      await sleep(retryDelayMs, signal);
    }
  };
}

type FetchWithRetryFn = ReturnType<typeof createFetchWithRetryFn>;

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
  function updateAfterScan(repoId: number, now: Date, latestTag?: string) {
    return ResultAsync.fromPromise(
      repositoryRepo.updateAfterScan(repoId, now, latestTag),
      (error) => {
        log.error({ error }, '[updateAfterScan] DB_ERROR');
        return 'DB_ERROR' as const;
      },
    );
  }

  return function processRepository(repo: Repository, signal?: AbortSignal) {
    const { id: repoId, owner, name, fullName, lastSeenTag } = repo;
    const now = new Date();

    return ResultAsync.fromPromise(
      fetchWithRetry(owner, name, signal),
      () => 'FETCH_FN_CRASHED' as const,
    ).andThen((tagResult) => {
      if (tagResult.isErr()) {
        const error = tagResult.error;

        if (error === 'ABORTED') return errAsync(error);

        log.error({ error, repoId, fullName }, 'Failed to fetch release');
        return updateAfterScan(repoId, now);
      }

      const latestTag = tagResult.value;

      if (lastSeenTag === null) {
        log.info(`Saving initial release for a new repo: ${fullName}@${latestTag}`);
        return updateAfterScan(repoId, now, latestTag);
      }

      if (latestTag === lastSeenTag) {
        log.info(`No new releases for ${fullName}`);
        return updateAfterScan(repoId, now);
      }

      return updateAfterScan(repoId, now, latestTag)
        .andThen(() =>
          ResultAsync.fromPromise(
            repoSubscriptionsQueue.enqueueRepoSubscriptions({
              repoId,
              repoName: fullName,
              latestTag,
            }),
            (error) => {
              log.error({ error, fullName, latestTag }, 'Enqueue subscriptions notifier failed');
              return 'ENQUEUE_ERROR' as const;
            },
          ),
        )
        .andTee(() => {
          log.info({ fullName, latestTag }, 'subscriptions notifier enqueued');
        });
    });
  };
}

type Deps = {
  config: ScannerConfig;
  repositoryRepo: RepositoryRepo;
  githubClient: GithubClient;
  logger: Logger;
  repoSubscriptionsQueue: RepoSubscriptionsQueue;
};

export function createScannerLoop({
  config,
  repositoryRepo,
  githubClient,
  logger,
  repoSubscriptionsQueue,
}: Deps) {
  const log = logger.child({ module: 'scanner.loop' });

  const fetchWithRetry = createFetchWithRetryFn({ log, config, githubClient });
  const processRepository = createProcessRepositoryFn({
    log,
    repositoryRepo,
    fetchWithRetry,
    repoSubscriptionsQueue,
  });

  async function processRepos(repos: Repository[], signal?: AbortSignal) {
    let fails = 0;
    for (const repo of repos) {
      if (signal?.aborted) return;
      const res = await processRepository(repo, signal);
      if (res.isErr()) {
        log.error({ error: res.error }, 'Process repo error');
        fails++;
      }
      await sleep(config.pollDelayMs, signal);
    }
    log.info({ batchSize: repos.length, fails }, 'Repos batch processed');
  }

  const loop = createLoop({
    log,

    run(signal) {
      return ResultAsync.fromPromise(
        repositoryRepo.findBatchForScanning(config.batchSize),
        () => 'DB_ERROR' as const,
      ).andThen((repos) =>
        ResultAsync.fromPromise(processRepos(repos, signal), () => 'PROCESSING_ERROR' as const),
      );
    },

    getNextDelayMs({ runResult }) {
      if (runResult.isErr()) {
        log.error({ error: runResult.error }, 'Batch failed');
      }
      return config.scanIntervalMs;
    },

    onStart() {
      log.info({ interval: config.scanIntervalMs, batchSize: config.batchSize }, 'Scanner started');
    },
  });

  return loop;
}
