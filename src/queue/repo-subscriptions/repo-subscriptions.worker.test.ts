import { errAsync, okAsync } from 'neverthrow';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { RepoSubJobConfig } from '@/config/config.js';
import type { MockLogger } from '@/test/mocks.js';
import { createSubscription } from '@/test/factories.js';
import {
  createMockLogger,
  createMockReleaseNotificationsQueue,
  createMockRepositoryRepo,
  createMockSubscriptionRepo,
} from '@/test/mocks.js';
import { sleep } from '@/utils/sleep.js';

import type { RepoSubscriptionsJob } from './repo-subscriptions.types.js';
import { createProcessRepoSubscriptionJob } from './repo-subscriptions.worker.js';

vi.mock('@/utils/sleep.js', () => ({
  sleep: vi.fn().mockResolvedValue(undefined),
}));

function createJob(overrides?: Partial<{ id: string; data: RepoSubscriptionsJob }>) {
  return {
    id: 'job-1',
    data: {
      repoId: 1,
      repoName: 'owner/repo',
      latestTag: 'v2.0.0',
    },
    ...overrides,
  };
}

describe('repo-subscriptions.worker', () => {
  const jobConfig: RepoSubJobConfig = {
    batchSize: 2,
    pollDelayMs: 200,
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

  it('skips outdated jobs when the latest repo tag changed', async () => {
    const getLatestTag = vi.fn().mockReturnValue(okAsync('v3.0.0'));
    const getConfirmedByRepositoryIdBatch = vi.fn();
    const enqueueReleaseEmail = vi.fn();

    const processJob = createProcessRepoSubscriptionJob({
      config: jobConfig,
      log: logger,
      repositoryRepo: createMockRepositoryRepo({ getLatestTag }),
      subscriptionRepo: createMockSubscriptionRepo({ getConfirmedByRepositoryIdBatch }),
      releaseNotificationsQueue: createMockReleaseNotificationsQueue({ enqueueReleaseEmail }),
    });

    await processJob(createJob() as never);

    expect(getLatestTag).toHaveBeenCalledWith(1);
    expect(getConfirmedByRepositoryIdBatch).not.toHaveBeenCalled();
    expect(enqueueReleaseEmail).not.toHaveBeenCalled();
  });

  it('throws when repositoryRepo.getLatestTag fails', async () => {
    const getLatestTag = vi
      .fn()
      .mockReturnValue(errAsync({ type: 'Internal', message: 'latest tag unavailable' }));

    const processJob = createProcessRepoSubscriptionJob({
      config: jobConfig,
      log: logger,
      repositoryRepo: createMockRepositoryRepo({ getLatestTag }),
      subscriptionRepo: createMockSubscriptionRepo(),
      releaseNotificationsQueue: createMockReleaseNotificationsQueue(),
    });

    await expect(processJob(createJob() as never)).rejects.toThrow();

    expect(logger.error).toHaveBeenCalled();
  });

  it('marks repo inactive when the first batch has no confirmed subscribers', async () => {
    const getLatestTag = vi.fn().mockReturnValue(okAsync('v2.0.0'));
    const getConfirmedByRepositoryIdBatch = vi.fn().mockResolvedValue([]);
    const update = vi.fn().mockReturnValue(okAsync());
    const enqueueReleaseEmail = vi.fn();

    const processJob = createProcessRepoSubscriptionJob({
      config: jobConfig,
      log: logger,
      repositoryRepo: createMockRepositoryRepo({ getLatestTag, update }),
      subscriptionRepo: createMockSubscriptionRepo({ getConfirmedByRepositoryIdBatch }),
      releaseNotificationsQueue: createMockReleaseNotificationsQueue({ enqueueReleaseEmail }),
    });

    await processJob(createJob() as never);

    expect(getConfirmedByRepositoryIdBatch).toHaveBeenCalledWith(1, -1, jobConfig.batchSize);
    expect(update).toHaveBeenCalledWith(1, { isActive: false });
    expect(enqueueReleaseEmail).not.toHaveBeenCalled();
  });

  it('paginates through subscribers, enqueues release emails, and does not deactivate after later empty batches', async () => {
    const getLatestTag = vi.fn().mockReturnValue(okAsync('v2.0.0'));
    const firstBatch = [
      createSubscription({
        id: 10,
        email: 'a@example.com',
        repositoryId: 1,
        confirmedAt: new Date(),
      }),
      createSubscription({
        id: 11,
        email: 'b@example.com',
        repositoryId: 1,
        confirmedAt: new Date(),
      }),
    ];
    const secondBatch = [
      createSubscription({
        id: 13,
        email: 'c@example.com',
        repositoryId: 1,
        confirmedAt: new Date(),
      }),
    ];
    const getConfirmedByRepositoryIdBatch = vi
      .fn()
      .mockResolvedValueOnce(firstBatch)
      .mockResolvedValueOnce(secondBatch)
      .mockResolvedValueOnce([]);
    const update = vi.fn();
    const enqueueReleaseEmail = vi.fn().mockResolvedValue(undefined);

    const processJob = createProcessRepoSubscriptionJob({
      config: jobConfig,
      log: logger,
      repositoryRepo: createMockRepositoryRepo({ getLatestTag, update }),
      subscriptionRepo: createMockSubscriptionRepo({ getConfirmedByRepositoryIdBatch }),
      releaseNotificationsQueue: createMockReleaseNotificationsQueue({ enqueueReleaseEmail }),
    });

    await processJob(createJob() as never);

    expect(getConfirmedByRepositoryIdBatch).toHaveBeenNthCalledWith(1, 1, -1, jobConfig.batchSize);
    expect(getConfirmedByRepositoryIdBatch).toHaveBeenNthCalledWith(2, 1, 11, jobConfig.batchSize);
    expect(getConfirmedByRepositoryIdBatch).toHaveBeenNthCalledWith(3, 1, 13, jobConfig.batchSize);
    expect(enqueueReleaseEmail).toHaveBeenCalledTimes(3);
    expect(enqueueReleaseEmail).toHaveBeenNthCalledWith(1, {
      repoId: 1,
      repoName: 'owner/repo',
      email: 'a@example.com',
      tag: 'v2.0.0',
    });
    expect(enqueueReleaseEmail).toHaveBeenNthCalledWith(2, {
      repoId: 1,
      repoName: 'owner/repo',
      email: 'b@example.com',
      tag: 'v2.0.0',
    });
    expect(enqueueReleaseEmail).toHaveBeenNthCalledWith(3, {
      repoId: 1,
      repoName: 'owner/repo',
      email: 'c@example.com',
      tag: 'v2.0.0',
    });
    expect(mockedSleep).toHaveBeenNthCalledWith(1, jobConfig.pollDelayMs);
    expect(mockedSleep).toHaveBeenNthCalledWith(2, jobConfig.pollDelayMs);
    expect(update).not.toHaveBeenCalled();
  });

  it('continues processing when one enqueue fails and logs only successful enqueue count', async () => {
    const getLatestTag = vi.fn().mockReturnValue(okAsync('v2.0.0'));
    const getConfirmedByRepositoryIdBatch = vi
      .fn()
      .mockResolvedValueOnce([
        createSubscription({
          id: 10,
          email: 'a@example.com',
          repositoryId: 1,
          confirmedAt: new Date(),
        }),
        createSubscription({
          id: 11,
          email: 'b@example.com',
          repositoryId: 1,
          confirmedAt: new Date(),
        }),
      ])
      .mockResolvedValueOnce([]);
    const enqueueError = new Error('queue unavailable');
    const enqueueReleaseEmail = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(enqueueError);

    const processJob = createProcessRepoSubscriptionJob({
      config: jobConfig,
      log: logger,
      repositoryRepo: createMockRepositoryRepo({ getLatestTag }),
      subscriptionRepo: createMockSubscriptionRepo({ getConfirmedByRepositoryIdBatch }),
      releaseNotificationsQueue: createMockReleaseNotificationsQueue({ enqueueReleaseEmail }),
    });

    await processJob(createJob() as never);

    expect(enqueueReleaseEmail).toHaveBeenCalledTimes(2);
    expect(logger.error).toHaveBeenCalledWith({ error: enqueueError }, 'Queue error');
    expect(logger.info).toHaveBeenCalledWith(
      'New release for owner/repo@v2.0.0, enqueued 1 emails',
    );
  });
});
