import type { Repo } from '@/github/github.schema.js';
import type { Repository } from '@/repository/repository.repo.js';
import type { Subscription } from '@/subscription/subscription.repo.js';
import type { Token } from '@/token/token.repo.js';

export function createGithubRepo(overrides?: Partial<Repo>): Repo {
  return {
    full_name: 'owner/repo',
    owner: { login: 'owner' },
    name: 'repo',
    ...overrides,
  };
}

export function createRepository(overrides?: Partial<Repository>): Repository {
  return {
    id: 1,
    owner: 'owner',
    name: 'repo',
    fullName: 'owner/repo',
    lastSeenTag: null,
    lastCheckedAt: null,
    isActive: true,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

export function createSubscription(overrides?: Partial<Subscription>): Subscription {
  return {
    id: 10,
    email: 'user@example.com',
    repositoryId: 1,
    confirmedAt: null,
    removedAt: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

export function createTokenRecord(overrides?: Partial<Token>): Token {
  return {
    id: 20,
    tokenHash: 'hashed-token',
    email: 'user@example.com',
    repositoryId: 1,
    type: 'confirm',
    expiresAt: new Date('2026-01-02T00:00:00.000Z'),
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}
