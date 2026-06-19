import { err, ok, ResultAsync } from 'neverthrow';

import type { ScannerConfig } from '@/config/config.js';
import type { GithubClient } from '@/github/github.client.js';
import type { Logger } from '@/logger/logger.js';
import type { ScannerMetrics } from '@/metrics/metrics.js';
import type { RepoSubscriptionsQueue } from '@/queue/repo-subscriptions/repo-subscriptions.queue.js';
import type { Repository, RepositoryRepo } from '@/repository/repository.repo.js';
import { createLoop } from '@/lib/loop/loop.js';
import { defineModule } from '@/lib/runtime/runtime.js';
import { sleep } from '@/utils/sleep.js';

export function createFetchWithRetryFn({
  log,
  config,
  githubClient,
  metrics,
}: {
  log: Logger;
  config: ScannerConfig;
  githubClient: GithubClient;
  metrics: ScannerMetrics;
}) {
  /**
   * Keep retrying with exponential backoff on rate-limits until success or non-rate-limit error
   */
  async function retryFetchUntilValidResponse(owner: string, name: string, signal?: AbortSignal) {
    let delayMs = config.initialRetryDelay;

    while (true) {
      if (signal?.aborted) return { type: 'ABORTED' as const };

      const result = await githubClient.getLatestRelease(owner, name);

      if (result.isOk()) {
        return { type: 'OK' as const, tag: result.value };
      }

      metrics.totalGithubFailures.inc();

      const error = result.error;
      if (error.type !== 'HttpTooManyRequests') {
        return { type: 'HTTP_ERROR' as const, error };
      }

      let retryDelayMs = error.retryAfterSeconds === null ? null : error.retryAfterSeconds * 1_000;
      if (retryDelayMs === null) {
        retryDelayMs = Math.ceil(Math.random() * delayMs); // backoff jitter
        delayMs *= 2;
      }

      log.info({ retryDelayMs }, 'Rate limit detected, scheduled retry');
      await sleep(retryDelayMs, signal);
    }
  }

  function fetchWithRetry(owner: string, name: string, signal?: AbortSignal) {
    return ResultAsync.fromPromise(retryFetchUntilValidResponse(owner, name, signal), () => ({
      type: 'FETCH_CRASH' as const,
    })).andThen((res) => {
      switch (res.type) {
        case 'OK':
          return ok(res.tag);
        case 'ABORTED':
          return err({ type: 'ABORTED' as const });
        case 'HTTP_ERROR':
          return err({ type: 'HTTP_ERROR' as const, error: res.error });
        default:
          res satisfies never;
          throw new Error('unhandled result case');
      }
    });
  }

  return fetchWithRetry;
}

type FetchWithRetryFn = ReturnType<typeof createFetchWithRetryFn>;

export function createProcessRepositoryFn({
  log,
  repositoryRepo,
  fetchWithRetry,
  repoSubscriptionsQueue,
  metrics,
}: {
  log: Logger;
  repositoryRepo: RepositoryRepo;
  fetchWithRetry: FetchWithRetryFn;
  repoSubscriptionsQueue: RepoSubscriptionsQueue;
  metrics: ScannerMetrics;
}) {
  function enqueueSubsJob(repoId: number, repoName: string, latestTag: string) {
    return ResultAsync.fromPromise(
      repoSubscriptionsQueue.enqueueRepoSubscriptions({
        repoId,
        repoName,
        latestTag,
      }),
      () => ({ type: 'ENQUEUE_ERROR' as const }),
    );
  }

  function processTag(
    tag: string | null,
    lastSeenTag: string | null,
    repoId: number,
    repoName: string,
    now: Date,
  ) {
    if (tag === null) {
      log.info({ repoName }, 'Failed to fetch repo tag');
      return repositoryRepo.updateAfterScan(repoId, now);
    }

    if (lastSeenTag === null) {
      log.info({ repoName, tag }, 'Saving initial release for a new repo');
      return repositoryRepo.updateAfterScan(repoId, now, tag).andTee(() => {
        metrics.totalNewReleases.inc();
      });
    }

    if (tag === lastSeenTag) {
      log.info({ repoName }, 'No new releases for repo');
      return repositoryRepo.updateAfterScan(repoId, now);
    }

    return repositoryRepo
      .updateAfterScan(repoId, now, tag)
      .andTee(() => {
        metrics.totalNewReleases.inc();
      })
      .andThen(() => enqueueSubsJob(repoId, repoName, tag))
      .andTee(() => {
        log.info({ repoName, latestTag: tag }, 'Subscriptions notifier enqueued');
      });
  }

  function processRepository(repo: Repository, signal?: AbortSignal) {
    const now = new Date();

    async function process() {
      const fetchResult = await fetchWithRetry(repo.owner, repo.name, signal);

      if (fetchResult.isErr()) {
        const fetchError = fetchResult.error;

        if (fetchError.type === 'ABORTED') return { type: 'ABORTED' as const };

        return processTag(null, repo.lastSeenTag, repo.id, repo.fullName, now).match(
          () => ({ type: 'FETCH_ERROR' as const, fetchError }),
          (processError) => ({ type: 'FETCH_PROCESS_ERROR' as const, fetchError, processError }),
        );
      }

      return processTag(fetchResult.value, repo.lastSeenTag, repo.id, repo.fullName, now).match(
        () => ({ type: 'OK' as const }),
        (processError) => ({ type: 'PROCESS_ERROR' as const, processError }),
      );
    }

    return ResultAsync.fromPromise(process(), () => ({
      type: 'PROCESS_REPO_CRASH' as const,
    })).andThen((res) => {
      switch (res.type) {
        case 'OK':
          return ok();

        default:
          return err(res);
      }
    });
  }

  return processRepository;
}

type Deps = {
  config: ScannerConfig;
  repositoryRepo: RepositoryRepo;
  githubClient: GithubClient;
  logger: Logger;
  repoSubscriptionsQueue: RepoSubscriptionsQueue;
  metrics: ScannerMetrics;
};

export function createScannerLoop({
  config,
  repositoryRepo,
  githubClient,
  logger,
  repoSubscriptionsQueue,
  metrics,
}: Deps) {
  const log = logger.child({ module: 'scanner.loop' });

  const fetchWithRetry = createFetchWithRetryFn({ log, config, githubClient, metrics });
  const processRepository = createProcessRepositoryFn({
    log,
    repositoryRepo,
    fetchWithRetry,
    repoSubscriptionsQueue,
    metrics,
  });

  function processRepos(repos: Repository[], signal?: AbortSignal) {
    async function process() {
      let totalCount = 0;
      let fails = 0;
      for (const repo of repos) {
        if (signal?.aborted) break;
        const res = await processRepository(repo, signal);
        totalCount++;
        metrics.totalReposProcessed.inc();
        if (res.isErr()) {
          log.error({ repo: repo.fullName, error: res.error }, 'Process repo error');
          fails++;
        }
        await sleep(config.pollDelayMs, signal);
      }
      return { totalCount, fails };
    }

    return ResultAsync.fromPromise(process(), (e) => ({
      type: 'PROCESS_REPOS_BATCH_CRASH' as const,
      cause: e,
    }));
  }

  const loop = createLoop({
    log,

    run(signal) {
      return repositoryRepo
        .findBatchForScanning(config.batchSize)
        .andThen((repos) => processRepos(repos, signal));
    },

    getNextDelayMs({ runResult }) {
      if (runResult.isErr()) {
        log.error({ error: runResult.error }, 'Batch failed');
      } else {
        const { totalCount: processed, fails } = runResult.value;
        log.info({ batchSize: config.batchSize, processed, fails }, 'Repos batch processed');
      }
      metrics.totalCycles.inc();
      return config.scanIntervalMs;
    },

    onStart() {
      log.info(
        { interval: config.scanIntervalMs, batchSize: config.batchSize },
        'Scanner loop started',
      );
    },
  });

  let handle: ReturnType<typeof loop.start>;

  const module = defineModule('scanner-loop', {
    start({ watch }) {
      handle = loop.start();
      watch(handle.promise);
    },
    async stop() {
      await handle.stop();
    },
  });

  return module;
}
