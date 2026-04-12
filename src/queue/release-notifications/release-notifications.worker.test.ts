import { errAsync, okAsync } from 'neverthrow';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { MockLogger } from '@/test/mocks.js';
import type { TokenUrls } from '@/token/token.service.js';
import type { AppError } from '@/utils/errors.js';
import {
  createMockEmailService,
  createMockLogger,
  createMockRepositoryRepo,
  createMockTokenService,
} from '@/test/mocks.js';

import type { ReleaseEmailJob } from './release-notifications.types.js';
import { createProcessReleaseNotificationJob } from './release-notifications.worker.js';

function createJob(overrides?: Partial<{ id: string; data: ReleaseEmailJob }>) {
  return {
    id: 'job-1',
    data: {
      email: 'user@example.com',
      repoId: 1,
      repoName: 'owner/repo',
      tag: 'v2.0.0',
    },
    ...overrides,
  };
}

describe('release-notifications.worker', () => {
  let logger: MockLogger;

  beforeEach(() => {
    logger = createMockLogger();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('skips outdated jobs when the repository latest tag changed', async () => {
    const getLatestTag = vi.fn().mockReturnValue(okAsync('v3.0.0'));
    const createToken = vi.fn();
    const sendEmail = vi.fn();

    const processJob = createProcessReleaseNotificationJob({
      log: logger,
      repositoryRepo: createMockRepositoryRepo({ getLatestTag }),
      tokenService: createMockTokenService({ createToken }),
      emailService: createMockEmailService({ sendEmail }),
    });

    await processJob(createJob() as never);

    expect(getLatestTag).toHaveBeenCalledWith(1);
    expect(createToken).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith(
      'Skipping outdated job job-1: job tag v2.0.0 != latest tag v3.0.0',
    );
  });

  it('throws when latest tag lookup fails', async () => {
    const latestTagError = { type: 'Internal', message: 'latest tag unavailable' } as const;
    const getLatestTag = vi.fn().mockReturnValue(errAsync(latestTagError));

    const processJob = createProcessReleaseNotificationJob({
      log: logger,
      repositoryRepo: createMockRepositoryRepo({ getLatestTag }),
      tokenService: createMockTokenService(),
      emailService: createMockEmailService(),
    });

    await expect(processJob(createJob() as never)).rejects.toThrow('latest tag unavailable');
    expect(logger.error).toHaveBeenCalledWith(
      { error: latestTagError },
      'Failed to get latest tag for repo 1',
    );
  });

  it('creates an unsubscribe token and sends the release email with expected payload', async () => {
    const getLatestTag = vi.fn().mockReturnValue(okAsync('v2.0.0'));
    const createToken = vi.fn().mockResolvedValue('unsubscribe-token');
    const getTokenUrls = vi.fn().mockReturnValue({
      htmlUrl: 'http://localhost:3000/unsubscribe/unsubscribe-token',
      apiUrl: 'http://localhost:3000/api/unsubscribe/unsubscribe-token',
    } satisfies TokenUrls);
    const sendEmail = vi.fn().mockReturnValue(okAsync(undefined));

    const processJob = createProcessReleaseNotificationJob({
      log: logger,
      repositoryRepo: createMockRepositoryRepo({ getLatestTag }),
      tokenService: createMockTokenService({ createToken, getTokenUrls }),
      emailService: createMockEmailService({ sendEmail }),
    });

    await processJob(createJob() as never);

    expect(createToken).toHaveBeenCalledWith({
      email: 'user@example.com',
      repositoryId: 1,
      type: 'unsubscribe',
    });
    expect(getTokenUrls).toHaveBeenCalledWith('unsubscribe-token', 'unsubscribe');
    expect(sendEmail).toHaveBeenCalledWith('user@example.com', {
      type: 'release',
      data: {
        repoName: 'owner/repo',
        tag: 'v2.0.0',
        releaseUrl: 'https://github.com/owner/repo/releases/tag/v2.0.0',
        unsubscribeHtmlUrl: 'http://localhost:3000/unsubscribe/unsubscribe-token',
        unsubscribeApiUrl: 'http://localhost:3000/api/unsubscribe/unsubscribe-token',
      },
    });
    expect(logger.info).toHaveBeenCalledWith(
      'Sent release notification for owner/repo v2.0.0 to user@example.com',
    );
  });

  it('throws when email sending fails', async () => {
    const getLatestTag = vi.fn().mockReturnValue(okAsync('v2.0.0'));
    const sendError: AppError = { type: 'Internal', message: 'Failed to send email' };
    const sendEmail = vi.fn().mockReturnValue(errAsync(sendError));

    const processJob = createProcessReleaseNotificationJob({
      log: logger,
      repositoryRepo: createMockRepositoryRepo({ getLatestTag }),
      tokenService: createMockTokenService({
        createToken: vi.fn().mockResolvedValue('unsubscribe-token'),
        getTokenUrls: vi.fn().mockReturnValue({
          htmlUrl: 'http://localhost:3000/unsubscribe/unsubscribe-token',
          apiUrl: 'http://localhost:3000/api/unsubscribe/unsubscribe-token',
        } satisfies TokenUrls),
      }),
      emailService: createMockEmailService({ sendEmail }),
    });

    await expect(processJob(createJob() as never)).rejects.toThrow('Failed to send email');
    expect(logger.error).toHaveBeenCalledWith(
      { error: sendError },
      'Failed to send email to user@example.com',
    );
  });
});
