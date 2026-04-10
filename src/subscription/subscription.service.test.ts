import { describe, expect, it, vi } from 'vitest';

import type { Repository } from '@/repository/repository.repo.js';
import {
  createMockGithubClient,
  createMockRepositoryRepo,
  createMockSubscriptionRepo,
  createMockTokenService,
} from '@/test/mocks.js';
import { expectErr } from '@/test/utils/result.js';

import type { Subscription } from './subscription.repo.js';
import { createSubscriptionService } from './subscription.service.js';

describe('SubscriptionService', () => {
  it('returns an err result on token creation fail', async () => {
    const enqueueConfirmationEmail = vi.fn().mockResolvedValue(null);
    const githubClient = createMockGithubClient();
    const repositoryRepo = createMockRepositoryRepo({
      findByFullName: vi.fn().mockResolvedValue({
        fullName: 'x/y',
        isActive: true,
      } as Repository),
    });
    const subscriptionRepo = createMockSubscriptionRepo({
      findActiveByEmailAndRepoId: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({
        email: 'test@test.com',
      } as Subscription),
    });
    const tokenService = createMockTokenService({
      createToken: vi.fn().mockRejectedValue(null),
    });

    const service = createSubscriptionService({
      enqueueConfirmationEmail,
      githubClient,
      repositoryRepo,
      subscriptionRepo,
      tokenService,
    });

    const result = await service.subscribe({
      email: 'test@test.com',
      repoFullName: 'x/y',
    });

    const err = expectErr(result);
    expect(err.type).toBe('Internal');
  });
});
