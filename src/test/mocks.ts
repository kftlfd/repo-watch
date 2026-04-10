import { vi } from 'vitest';

import type { GithubClient } from '@/github/github.client.js';
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
