import { err, errAsync, ok, okAsync } from 'neverthrow';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ScannerConfig } from '@/config/config.js';
import type { MockLogger } from '@/test/mocks.js';
import { createRepository } from '@/test/factories.js';
import {
  createMockGithubClient,
  createMockLogger,
  createMockRepositoryRepo,
  createMockRepoSubscriptionsQueue,
} from '@/test/mocks.js';
import { expectErr, expectOk } from '@/test/utils/result.js';
import { sleep } from '@/utils/sleep.js';

import { createFetchWithRetryFn, createProcessRepositoryFn } from './scanner.loop.js';

vi.mock('@/utils/sleep.js', () => ({
  sleep: vi.fn().mockResolvedValue(undefined),
}));

describe('scanner.service', () => {
  const scannerConfig: ScannerConfig = {
    scanIntervalMs: 60_000,
    batchSize: 10,
    pollDelayMs: 100,
    initialRetryDelay: 5_000,
    baseErrorDelayMs: 5_000,
    maxBackoffDelayMs: 30_000,
  };

  let logger: MockLogger;
  const mockedSleep = vi.mocked(sleep);

  beforeEach(() => {
    logger = createMockLogger();
    mockedSleep.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('retries on TooManyRequests using retryAfterSeconds converted to milliseconds', async () => {
    const githubClient = createMockGithubClient({
      getLatestRelease: vi
        .fn()
        .mockReturnValueOnce(errAsync({ type: 'TooManyRequests', retryAfterSeconds: 7 }))
        .mockReturnValueOnce(okAsync('v2.0.0')),
    });

    const fetchWithRetry = createFetchWithRetryFn({
      log: logger,
      config: scannerConfig,
      githubClient,
    });

    const result = await fetchWithRetry('owner', 'repo');

    expect(expectOk(result)).toBe('v2.0.0');
    expect(mockedSleep).toHaveBeenCalledWith(7_000);
  });

  it('falls back to exponential backoff when retryAfterSeconds is missing', async () => {
    const githubClient = createMockGithubClient({
      getLatestRelease: vi
        .fn()
        .mockReturnValueOnce(errAsync({ type: 'TooManyRequests', retryAfterSeconds: null }))
        .mockReturnValueOnce(errAsync({ type: 'TooManyRequests', retryAfterSeconds: null }))
        .mockReturnValueOnce(okAsync('v2.0.0')),
    });

    const fetchWithRetry = createFetchWithRetryFn({
      log: logger,
      config: scannerConfig,
      githubClient,
    });

    const result = await fetchWithRetry('owner', 'repo');

    expectOk(result);
    expect(mockedSleep).toHaveBeenNthCalledWith(1, scannerConfig.initialRetryDelay);
    expect(mockedSleep).toHaveBeenNthCalledWith(2, scannerConfig.initialRetryDelay * 2);
  });

  it('stops immediately on non-rate-limit errors', async () => {
    const rateLimitError = { type: 'Unauthorized', message: 'Authentication failed' } as const;
    const githubClient = createMockGithubClient({
      getLatestRelease: vi.fn().mockReturnValue(errAsync(rateLimitError)),
    });

    const fetchWithRetry = createFetchWithRetryFn({
      log: logger,
      config: scannerConfig,
      githubClient,
    });

    const result = await fetchWithRetry('owner', 'repo');

    expect(expectErr(result)).toEqual(rateLimitError);
    expect(mockedSleep).not.toHaveBeenCalled();
  });

  it('baselines lastSeenTag on the first scan without enqueueing notifications', async () => {
    const updateAfterScan = vi.fn().mockResolvedValue(undefined);
    const repositoryRepo = createMockRepositoryRepo({
      updateAfterScan,
    });
    const enqueueRepoSubscriptions = vi.fn().mockResolvedValue(undefined);
    const repoSubscriptionsQueue = createMockRepoSubscriptionsQueue({ enqueueRepoSubscriptions });
    const fetchWithRetry = vi.fn().mockResolvedValue(ok('v1.0.0'));
    const processRepository = createProcessRepositoryFn({
      log: logger,
      repositoryRepo,
      fetchWithRetry,
      repoSubscriptionsQueue,
    });

    await processRepository(createRepository({ lastSeenTag: null }));

    expect(fetchWithRetry).toHaveBeenCalledWith('owner', 'repo');
    expect(updateAfterScan).toHaveBeenCalledTimes(1);
    expect(updateAfterScan).toHaveBeenCalledWith(1, expect.any(Date), 'v1.0.0');
    expect(enqueueRepoSubscriptions).not.toHaveBeenCalled();
  });

  it('updates scan timestamp only when the tag is unchanged', async () => {
    const updateAfterScan = vi.fn().mockResolvedValue(undefined);
    const repositoryRepo = createMockRepositoryRepo({
      updateAfterScan,
    });
    const enqueueRepoSubscriptions = vi.fn().mockResolvedValue(undefined);
    const repoSubscriptionsQueue = createMockRepoSubscriptionsQueue({ enqueueRepoSubscriptions });
    const processRepository = createProcessRepositoryFn({
      log: logger,
      repositoryRepo,
      fetchWithRetry: vi.fn().mockResolvedValue(ok('v1.0.0')),
      repoSubscriptionsQueue,
    });

    await processRepository(createRepository({ lastSeenTag: 'v1.0.0' }));

    expect(updateAfterScan).toHaveBeenCalledTimes(1);
    expect(updateAfterScan).toHaveBeenCalledWith(1, expect.any(Date));
    expect(enqueueRepoSubscriptions).not.toHaveBeenCalled();
  });

  it('stores a new tag and enqueues repo subscriptions when a release changes', async () => {
    const updateAfterScan = vi.fn().mockResolvedValue(undefined);
    const repositoryRepo = createMockRepositoryRepo({
      updateAfterScan,
    });
    const enqueueRepoSubscriptions = vi.fn().mockResolvedValue(undefined);
    const repoSubscriptionsQueue = createMockRepoSubscriptionsQueue({ enqueueRepoSubscriptions });
    const processRepository = createProcessRepositoryFn({
      log: logger,
      repositoryRepo,
      fetchWithRetry: vi.fn().mockResolvedValue(ok('v2.0.0')),
      repoSubscriptionsQueue,
    });

    await processRepository(createRepository({ lastSeenTag: 'v1.0.0' }));

    expect(updateAfterScan).toHaveBeenCalledWith(1, expect.any(Date), 'v2.0.0');
    expect(enqueueRepoSubscriptions).toHaveBeenCalledWith({
      repoId: 1,
      repoName: 'owner/repo',
      latestTag: 'v2.0.0',
    });
  });

  it('logs fetch errors and still updates scan timestamp', async () => {
    const updateAfterScan = vi.fn().mockResolvedValue(undefined);
    const repositoryRepo = createMockRepositoryRepo({
      updateAfterScan,
    });
    const enqueueRepoSubscriptions = vi.fn().mockResolvedValue(undefined);
    const repoSubscriptionsQueue = createMockRepoSubscriptionsQueue({ enqueueRepoSubscriptions });
    const fetchError = { type: 'Unauthorized', message: 'Authentication failed' } as const;
    const processRepository = createProcessRepositoryFn({
      log: logger,
      repositoryRepo,
      fetchWithRetry: vi.fn().mockResolvedValue(err(fetchError)),
      repoSubscriptionsQueue,
    });

    await processRepository(createRepository({ lastSeenTag: 'v1.0.0' }));

    expect(updateAfterScan).toHaveBeenCalledWith(1, expect.any(Date));
    expect(enqueueRepoSubscriptions).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith(
      { error: fetchError, repoId: 1, repoFullName: 'owner/repo' },
      'Failed to fetch release for owner/repo',
    );
  });

  it('logs and swallows enqueue failures after updating the latest tag', async () => {
    const updateAfterScan = vi.fn().mockResolvedValue(undefined);
    const repositoryRepo = createMockRepositoryRepo({
      updateAfterScan,
    });
    const enqueueError = new Error('queue down');
    const enqueueRepoSubscriptions = vi.fn().mockRejectedValue(enqueueError);
    const repoSubscriptionsQueue = createMockRepoSubscriptionsQueue({
      enqueueRepoSubscriptions,
    });
    const processRepository = createProcessRepositoryFn({
      log: logger,
      repositoryRepo,
      fetchWithRetry: vi.fn().mockResolvedValue(ok('v2.0.0')),
      repoSubscriptionsQueue,
    });

    await processRepository(createRepository({ lastSeenTag: 'v1.0.0' }));

    expect(updateAfterScan).toHaveBeenCalledWith(1, expect.any(Date), 'v2.0.0');
    expect(logger.error).toHaveBeenCalledWith({ error: enqueueError }, 'Enqueue error');
  });
});
