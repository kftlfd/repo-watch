import { errAsync, okAsync } from 'neverthrow';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { MockLogger } from '@/test/mocks.js';
import type { TokenUrls } from '@/token/token.service.js';
import {
  createGithubRepo,
  createRepository,
  createSubscription,
  createTokenRecord,
} from '@/test/factories.js';
import {
  createMockConfirmationEmailsQueue,
  createMockGithubClient,
  createMockLogger,
  createMockRepositoryRepo,
  createMockSubscriptionRepo,
  createMockTokenService,
} from '@/test/mocks.js';
import { expectErr, expectErrAsync, expectOk, expectOkAsync } from '@/test/utils/result.js';

import { createSubscriptionService } from './subscription.service.js';

describe('subscription.service', () => {
  const email = 'user@example.com';
  const repoInput = 'owner/repo';
  const confirmToken = 'confirm-token';
  const confirmUrls: TokenUrls = {
    htmlUrl: 'http://localhost:3000/confirm/confirm-token',
    apiUrl: 'http://localhost:3000/api/confirm/confirm-token',
  };

  let logger: MockLogger;

  beforeEach(() => {
    logger = createMockLogger();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('subscribe creates repo, subscription, token, and confirmation email job', async () => {
    const githubRepo = createGithubRepo();
    const storedRepo = createRepository();
    const createdSubscription = createSubscription();

    const getRepo = vi.fn().mockReturnValue(okAsync(githubRepo));
    const findByFullName = vi.fn().mockResolvedValue(null);
    const createRepo = vi.fn().mockResolvedValue(storedRepo);
    const findActiveByEmailAndRepoId = vi.fn().mockResolvedValue(null);
    const createSubscriptionRecord = vi.fn().mockResolvedValue(createdSubscription);
    const createToken = vi.fn().mockResolvedValue(confirmToken);
    const getTokenUrls = vi.fn().mockReturnValue(confirmUrls);
    const enqueueConfirmationEmail = vi.fn().mockResolvedValue(undefined);

    const service = createSubscriptionService({
      logger,
      githubClient: createMockGithubClient({ getRepo }),
      repositoryRepo: createMockRepositoryRepo({
        findByFullName,
        create: createRepo,
      }),
      subscriptionRepo: createMockSubscriptionRepo({
        findActiveByEmailAndRepoId,
        create: createSubscriptionRecord,
      }),
      tokenService: createMockTokenService({
        createToken,
        getTokenUrls,
      }),
      confirmationEmailsQueue: createMockConfirmationEmailsQueue({ enqueueConfirmationEmail }),
    });

    const result = await service.subscribe({ email, repo: repoInput });

    expectOk(result);
    expect(getRepo).toHaveBeenCalledWith('owner', 'repo');
    expect(findByFullName).toHaveBeenCalledWith(githubRepo.full_name);
    expect(createRepo).toHaveBeenCalledWith({
      fullName: 'owner/repo',
      owner: 'owner',
      name: 'repo',
      isActive: true,
    });
    expect(createSubscriptionRecord).toHaveBeenCalledWith({
      email,
      repositoryId: storedRepo.id,
    });
    expect(createToken).toHaveBeenCalledWith({
      email,
      repositoryId: storedRepo.id,
      type: 'confirm',
    });
    expect(getTokenUrls).toHaveBeenCalledWith(confirmToken, 'confirm');
    expect(enqueueConfirmationEmail).toHaveBeenCalledWith({
      email,
      repoName: githubRepo.full_name,
      confirmHtmlUrl: confirmUrls.htmlUrl,
      confirmApiUrl: confirmUrls.apiUrl,
    });
  });

  it('subscribe returns NotFound when GitHub says the repo does not exist', async () => {
    const getRepo = vi
      .fn()
      .mockReturnValue(errAsync({ type: 'NotFound', message: 'Resource not found' }));
    const findByFullName = vi.fn();

    const service = createSubscriptionService({
      logger,
      githubClient: createMockGithubClient({ getRepo }),
      repositoryRepo: createMockRepositoryRepo({ findByFullName }),
      subscriptionRepo: createMockSubscriptionRepo(),
      tokenService: createMockTokenService(),
      confirmationEmailsQueue: createMockConfirmationEmailsQueue(),
    });

    const result = await service.subscribe({ email, repo: repoInput });

    expect(expectErr(result)).toEqual({ type: 'NotFound', message: 'Resource not found' });
    expect(findByFullName).not.toHaveBeenCalled();
  });

  it('subscribe maps GitHub rate limiting to RateLimited', async () => {
    const getRepo = vi.fn().mockReturnValue(
      errAsync({
        type: 'TooManyRequests',
        retryAfterSeconds: 60,
      }),
    );

    const service = createSubscriptionService({
      logger,
      githubClient: createMockGithubClient({ getRepo }),
      repositoryRepo: createMockRepositoryRepo(),
      subscriptionRepo: createMockSubscriptionRepo(),
      tokenService: createMockTokenService(),
      confirmationEmailsQueue: createMockConfirmationEmailsQueue(),
    });

    const result = await service.subscribe({ email, repo: repoInput });

    expect(expectErr(result)).toEqual({
      type: 'RateLimited',
      service: 'github',
      message: 'Rate limited by GitHub',
      retryAfterSeconds: 60,
    });
  });

  it('subscribe maps non-rate-limit GitHub failures to External', async () => {
    const getRepo = vi
      .fn()
      .mockReturnValue(errAsync({ type: 'Unauthorized', message: 'Authentication failed' }));

    const service = createSubscriptionService({
      logger,
      githubClient: createMockGithubClient({ getRepo }),
      repositoryRepo: createMockRepositoryRepo(),
      subscriptionRepo: createMockSubscriptionRepo(),
      tokenService: createMockTokenService(),
      confirmationEmailsQueue: createMockConfirmationEmailsQueue(),
    });

    const result = await service.subscribe({ email, repo: repoInput });

    expect(expectErr(result)).toEqual({
      type: 'External',
      service: 'github',
      message: 'Authentication failed',
    });
  });

  it('subscribe updates an existing repo with canonical GitHub data and reactivates it', async () => {
    const githubRepo = createGithubRepo({
      full_name: 'canonical-owner/canonical-repo',
      owner: { login: 'canonical-owner' },
      name: 'canonical-repo',
    });
    const existingRepo = createRepository({
      id: 7,
      fullName: 'owner/repo',
      owner: 'old-owner',
      name: 'old-repo',
      isActive: false,
    });
    const updatedRepo = createRepository({
      id: 7,
      fullName: githubRepo.full_name,
      owner: githubRepo.owner.login,
      name: githubRepo.name,
      isActive: true,
    });
    const createdSubscription = createSubscription({ repositoryId: updatedRepo.id });

    const updateRepo = vi.fn().mockResolvedValue(updatedRepo);

    const service = createSubscriptionService({
      logger,
      githubClient: createMockGithubClient({
        getRepo: vi.fn().mockReturnValue(okAsync(githubRepo)),
      }),
      repositoryRepo: createMockRepositoryRepo({
        findByFullName: vi.fn().mockResolvedValue(existingRepo),
        update: updateRepo,
      }),
      subscriptionRepo: createMockSubscriptionRepo({
        findActiveByEmailAndRepoId: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(createdSubscription),
      }),
      tokenService: createMockTokenService({
        createToken: vi.fn().mockResolvedValue(confirmToken),
        getTokenUrls: vi.fn().mockReturnValue(confirmUrls),
      }),
      confirmationEmailsQueue: createMockConfirmationEmailsQueue(),
    });

    const result = await service.subscribe({ email, repo: repoInput });

    expectOk(result);
    expect(updateRepo).toHaveBeenCalledWith(existingRepo.id, {
      fullName: githubRepo.full_name,
      owner: githubRepo.owner.login,
      name: githubRepo.name,
      isActive: true,
    });
  });

  it('subscribe returns Conflict for an already confirmed active subscription', async () => {
    const githubRepo = createGithubRepo();
    const storedRepo = createRepository();
    const existingSubscription = createSubscription({
      confirmedAt: new Date('2026-01-03T00:00:00.000Z'),
    });

    const createToken = vi.fn();
    const enqueueConfirmationEmail = vi.fn();

    const service = createSubscriptionService({
      logger,
      githubClient: createMockGithubClient({
        getRepo: vi.fn().mockReturnValue(okAsync(githubRepo)),
      }),
      repositoryRepo: createMockRepositoryRepo({
        findByFullName: vi.fn().mockResolvedValue(storedRepo),
        update: vi.fn().mockResolvedValue(storedRepo),
      }),
      subscriptionRepo: createMockSubscriptionRepo({
        findActiveByEmailAndRepoId: vi.fn().mockResolvedValue(existingSubscription),
      }),
      tokenService: createMockTokenService({ createToken }),
      confirmationEmailsQueue: createMockConfirmationEmailsQueue({ enqueueConfirmationEmail }),
    });

    const result = await service.subscribe({ email, repo: repoInput });

    expect(expectErr(result)).toEqual({ type: 'Conflict', message: 'Already subscribed' });
    expect(createToken).not.toHaveBeenCalled();
    expect(enqueueConfirmationEmail).not.toHaveBeenCalled();
  });

  it('subscribe reuses an existing unconfirmed subscription instead of creating a duplicate', async () => {
    const githubRepo = createGithubRepo();
    const storedRepo = createRepository();
    const existingSubscription = createSubscription({ id: 99, confirmedAt: null, removedAt: null });
    const updatedSubscription = createSubscription({ id: 99, confirmedAt: null, removedAt: null });

    const updateSubscription = vi.fn().mockResolvedValue(updatedSubscription);
    const createSubscriptionRecord = vi.fn();

    const service = createSubscriptionService({
      logger,
      githubClient: createMockGithubClient({
        getRepo: vi.fn().mockReturnValue(okAsync(githubRepo)),
      }),
      repositoryRepo: createMockRepositoryRepo({
        findByFullName: vi.fn().mockResolvedValue(storedRepo),
        update: vi.fn().mockResolvedValue(storedRepo),
      }),
      subscriptionRepo: createMockSubscriptionRepo({
        findActiveByEmailAndRepoId: vi.fn().mockResolvedValue(existingSubscription),
        update: updateSubscription,
        create: createSubscriptionRecord,
      }),
      tokenService: createMockTokenService({
        createToken: vi.fn().mockResolvedValue(confirmToken),
        getTokenUrls: vi.fn().mockReturnValue(confirmUrls),
      }),
      confirmationEmailsQueue: createMockConfirmationEmailsQueue(),
    });

    const result = await service.subscribe({ email, repo: repoInput });

    expectOk(result);
    expect(updateSubscription).toHaveBeenCalledWith(existingSubscription.id, { removedAt: null });
    expect(createSubscriptionRecord).not.toHaveBeenCalled();
  });

  it('subscribe returns Internal and does not queue email when token creation fails', async () => {
    const githubRepo = createGithubRepo();
    const storedRepo = createRepository();
    const createdSubscription = createSubscription();
    const enqueueConfirmationEmail = vi.fn();

    const service = createSubscriptionService({
      logger,
      githubClient: createMockGithubClient({
        getRepo: vi.fn().mockReturnValue(okAsync(githubRepo)),
      }),
      repositoryRepo: createMockRepositoryRepo({
        findByFullName: vi.fn().mockResolvedValue(storedRepo),
        update: vi.fn().mockResolvedValue(storedRepo),
      }),
      subscriptionRepo: createMockSubscriptionRepo({
        findActiveByEmailAndRepoId: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(createdSubscription),
      }),
      tokenService: createMockTokenService({
        createToken: vi.fn().mockRejectedValue(new Error('boom')),
      }),
      confirmationEmailsQueue: createMockConfirmationEmailsQueue({ enqueueConfirmationEmail }),
    });

    const result = await service.subscribe({ email, repo: repoInput });

    expect(expectErr(result)).toEqual({ type: 'Internal', message: 'Failed to create token' });
    expect(enqueueConfirmationEmail).not.toHaveBeenCalled();
  });

  it('confirm confirms the subscription, reactivates the repo, and deletes the token', async () => {
    const tokenRecord = createTokenRecord();
    const subscription = createSubscription({ repositoryId: tokenRecord.repositoryId });
    const confirmedSubscription = createSubscription({
      id: subscription.id,
      repositoryId: subscription.repositoryId,
      confirmedAt: new Date('2026-01-03T00:00:00.000Z'),
      removedAt: null,
    });

    const updateSubscription = vi.fn().mockResolvedValue(confirmedSubscription);
    const updateRepo = vi
      .fn()
      .mockResolvedValue(createRepository({ id: tokenRecord.repositoryId }));
    const deleteToken = vi.fn().mockResolvedValue(undefined);

    const service = createSubscriptionService({
      logger,
      githubClient: createMockGithubClient(),
      repositoryRepo: createMockRepositoryRepo({ update: updateRepo }),
      subscriptionRepo: createMockSubscriptionRepo({
        findActiveByEmailAndRepoId: vi.fn().mockResolvedValue(subscription),
        update: updateSubscription,
      }),
      tokenService: createMockTokenService({
        validateToken: vi.fn().mockReturnValue(okAsync(tokenRecord)),
        deleteToken,
      }),
      confirmationEmailsQueue: createMockConfirmationEmailsQueue(),
    });

    await expectOkAsync(service.confirm(confirmToken));

    const updateCall = updateSubscription.mock.calls[0] as
      | [number, { confirmedAt?: Date; removedAt?: Date | null }]
      | undefined;

    expect(updateSubscription).toHaveBeenCalledTimes(1);
    expect(updateCall?.[0]).toBe(subscription.id);
    expect(updateCall?.[1].removedAt).toBeNull();
    expect(updateCall?.[1].confirmedAt).toBeInstanceOf(Date);
    expect(updateRepo).toHaveBeenCalledWith(tokenRecord.repositoryId, { isActive: true });
    expect(deleteToken).toHaveBeenCalledWith(tokenRecord.id);
  });

  it('confirm returns Internal if repository activation fails and does not delete the token', async () => {
    const tokenRecord = createTokenRecord();
    const subscription = createSubscription({ repositoryId: tokenRecord.repositoryId });
    const deleteToken = vi.fn();

    const service = createSubscriptionService({
      logger,
      githubClient: createMockGithubClient(),
      repositoryRepo: createMockRepositoryRepo({
        update: vi.fn().mockResolvedValue(null),
      }),
      subscriptionRepo: createMockSubscriptionRepo({
        findActiveByEmailAndRepoId: vi.fn().mockResolvedValue(subscription),
        update: vi.fn().mockResolvedValue(subscription),
      }),
      tokenService: createMockTokenService({
        validateToken: vi.fn().mockReturnValue(okAsync(tokenRecord)),
        deleteToken,
      }),
      confirmationEmailsQueue: createMockConfirmationEmailsQueue(),
    });

    const error = await expectErrAsync(service.confirm(confirmToken));

    expect(error).toEqual({ type: 'Internal', message: 'Failed to activate repository' });
    expect(deleteToken).not.toHaveBeenCalled();
  });

  it('unsubscribe soft-deletes the subscription and deletes the token', async () => {
    const tokenRecord = createTokenRecord({ type: 'unsubscribe' });
    const subscription = createSubscription({ repositoryId: tokenRecord.repositoryId });
    const softDelete = vi.fn().mockResolvedValue(subscription);
    const deleteToken = vi.fn().mockResolvedValue(undefined);

    const service = createSubscriptionService({
      logger,
      githubClient: createMockGithubClient(),
      repositoryRepo: createMockRepositoryRepo(),
      subscriptionRepo: createMockSubscriptionRepo({
        findActiveByEmailAndRepoId: vi.fn().mockResolvedValue(subscription),
        softDelete,
      }),
      tokenService: createMockTokenService({
        validateToken: vi.fn().mockReturnValue(okAsync(tokenRecord)),
        deleteToken,
      }),
      confirmationEmailsQueue: createMockConfirmationEmailsQueue(),
    });

    await expectOkAsync(service.unsubscribe('unsubscribe-token'));

    expect(softDelete).toHaveBeenCalledWith(subscription.id);
    expect(deleteToken).toHaveBeenCalledWith(tokenRecord.id);
  });

  it('unsubscribe returns NotFound when the subscription is missing', async () => {
    const tokenRecord = createTokenRecord({ type: 'unsubscribe' });

    const service = createSubscriptionService({
      logger,
      githubClient: createMockGithubClient(),
      repositoryRepo: createMockRepositoryRepo(),
      subscriptionRepo: createMockSubscriptionRepo({
        findActiveByEmailAndRepoId: vi.fn().mockResolvedValue(null),
      }),
      tokenService: createMockTokenService({
        validateToken: vi.fn().mockReturnValue(okAsync(tokenRecord)),
      }),
      confirmationEmailsQueue: createMockConfirmationEmailsQueue(),
    });

    const error = await expectErrAsync(service.unsubscribe('unsubscribe-token'));

    expect(error).toEqual({ type: 'NotFound', message: 'Subscription not found' });
  });

  it('confirm still succeeds when deleting the token fails', async () => {
    const tokenRecord = createTokenRecord();
    const subscription = createSubscription({ repositoryId: tokenRecord.repositoryId });

    const service = createSubscriptionService({
      logger,
      githubClient: createMockGithubClient(),
      repositoryRepo: createMockRepositoryRepo({
        update: vi.fn().mockResolvedValue(createRepository({ id: tokenRecord.repositoryId })),
      }),
      subscriptionRepo: createMockSubscriptionRepo({
        findActiveByEmailAndRepoId: vi.fn().mockResolvedValue(subscription),
        update: vi.fn().mockResolvedValue(subscription),
      }),
      tokenService: createMockTokenService({
        validateToken: vi.fn().mockReturnValue(okAsync(tokenRecord)),
        deleteToken: vi.fn().mockRejectedValue(new Error('delete failed')),
      }),
      confirmationEmailsQueue: createMockConfirmationEmailsQueue(),
    });

    await expectOkAsync(service.confirm(confirmToken));
    await Promise.resolve();

    const logCall = logger.error.mock.calls[0] as [{ error: unknown }, string] | undefined;

    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(logCall?.[1]).toBe('DB Error: failed to delete token');
    expect(logCall?.[0].error).toBeInstanceOf(Error);
  });
});
