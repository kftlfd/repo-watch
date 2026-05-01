import { okAsync } from 'neverthrow';
import { vi } from 'vitest';

import type { Cache } from '@/cache/cache.js';
import type { EmailService } from '@/email/email.service.js';
import type { GithubClient } from '@/github/github.client.js';
import type { Logger } from '@/logger/logger.js';
import type { ConfirmationEmailsQueue } from '@/queue/confirmation-emails/confirmation-emails.queue.js';
import type { ReleaseNotificationsQueue } from '@/queue/release-notifications/release-notifications.queue.js';
import type { RepoSubscriptionsQueue } from '@/queue/repo-subscriptions/repo-subscriptions.queue.js';
import type { RepositoryRepo } from '@/repository/repository.repo.js';
import type { SubscriptionRepo } from '@/subscription/subscription.repo.js';
import type { SubscriptionService } from '@/subscription/subscription.service.js';
import type { TokenRepo } from '@/token/token.repo.js';
import type { TokenService } from '@/token/token.service.js';

export type MockLogger = Logger & {
  child: ReturnType<typeof vi.fn>;
  error: ReturnType<typeof vi.fn>;
  info: ReturnType<typeof vi.fn>;
  warn: ReturnType<typeof vi.fn>;
};

export function createMockLogger(): MockLogger {
  const logger = {
    child: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  };

  logger.child.mockReturnValue(logger);

  return logger as unknown as MockLogger;
}

export function createMockGithubClient(overrides?: Partial<GithubClient>): GithubClient {
  return {
    getRepo: vi.fn(),
    getLatestRelease: vi.fn(),
    ...overrides,
  };
}

export function createMockEmailService(overrides?: Partial<EmailService>): EmailService {
  return {
    sendEmail: vi.fn(),
    ...overrides,
  };
}

export function createMockCache(overrides?: Partial<Cache>): Cache {
  return {
    get: vi.fn(),
    set: vi.fn(),
    ...overrides,
  };
}

export function createMockRepositoryRepo(overrides?: Partial<RepositoryRepo>): RepositoryRepo {
  return {
    create: vi.fn().mockReturnValue(okAsync()),
    update: vi.fn().mockReturnValue(okAsync()),
    findBatchForScanning: vi.fn().mockReturnValue(okAsync()),
    findByFullName: vi.fn().mockReturnValue(okAsync()),
    getLatestTag: vi.fn().mockReturnValue(okAsync()),
    updateAfterScan: vi.fn().mockReturnValue(okAsync()),
    ...overrides,
  };
}

export function createMockSubscriptionRepo(
  overrides?: Partial<SubscriptionRepo>,
): SubscriptionRepo {
  return {
    create: vi.fn(),
    findActiveByEmailAndRepoId: vi.fn(),
    getConfirmedByRepositoryIdBatch: vi.fn(),
    getSubscriptionsForEmail: vi.fn(),
    softDelete: vi.fn(),
    update: vi.fn(),
    ...overrides,
  };
}

export function createMockTokenService(overrides?: Partial<TokenService>): TokenService {
  return {
    createToken: vi.fn(),
    deleteToken: vi.fn(),
    getTokenUrls: vi.fn(),
    validateToken: vi.fn(),
    ...overrides,
  };
}

export function createMockTokenRepo(overrides?: Partial<TokenRepo>): TokenRepo {
  return {
    create: vi.fn(),
    findValidByHashAndType: vi.fn(),
    deleteById: vi.fn(),
    ...overrides,
  };
}

export function createMockSubscriptionService(
  overrides?: Partial<SubscriptionService>,
): SubscriptionService {
  return {
    subscribe: vi.fn(),
    confirm: vi.fn(),
    listSubscriptions: vi.fn(),
    unsubscribe: vi.fn(),
    ...overrides,
  };
}

export function createMockConfirmationEmailsQueue(
  overrides?: Partial<ConfirmationEmailsQueue>,
): ConfirmationEmailsQueue {
  return {
    enqueueConfirmationEmail: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

export function createMockReleaseNotificationsQueue(
  overrides?: Partial<ReleaseNotificationsQueue>,
): ReleaseNotificationsQueue {
  return {
    enqueueReleaseEmail: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

export function createMockRepoSubscriptionsQueue(
  overrides?: Partial<RepoSubscriptionsQueue>,
): RepoSubscriptionsQueue {
  return {
    enqueueRepoSubscriptions: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}
