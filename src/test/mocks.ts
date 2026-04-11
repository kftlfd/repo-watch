import { vi } from 'vitest';

import type { GithubClient } from '@/github/github.client.js';
import type { ConfirmationEmailsQueue } from '@/queue/confirmation-emails/confirmation-emails.queue.js';
import type { ReleaseNotificationsQueue } from '@/queue/release-notifications/release-notifications.queue.js';
import type { RepoSubscriptionsQueue } from '@/queue/repo-subscriptions/repo-subscriptions.queue.js';
import type { RepositoryRepo } from '@/repository/repository.repo.js';
import type { SubscriptionRepo } from '@/subscription/subscription.repo.js';
import type { SubscriptionService } from '@/subscription/subscription.service.js';
import type { TokenService } from '@/token/token.service.js';

export function createMockGithubClient(overrides?: Partial<GithubClient>): GithubClient {
  return {
    getRepo: vi.fn(),
    getLatestRelease: vi.fn(),
    ...overrides,
  };
}

export function createMockRepositoryRepo(overrides?: Partial<RepositoryRepo>): RepositoryRepo {
  return {
    create: vi.fn(),
    update: vi.fn(),
    findBatchForScanning: vi.fn(),
    findByFullName: vi.fn(),
    getLatestTag: vi.fn(),
    updateAfterScan: vi.fn(),
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
    getTokenUrl: vi.fn(),
    validateToken: vi.fn(),
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
