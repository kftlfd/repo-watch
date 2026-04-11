import { describe, expect, it, vi } from 'vitest';

import type { Repository } from '@/repository/repository.repo.js';
import { createLogger } from '@/logger/logger.js';
import {
  createMockGithubClient,
  createMockRepositoryRepo,
  createMockSubscriptionRepo,
  createMockTokenService,
  createMockConfirmationEmailsQueue,
} from '@/test/mocks.js';
import { expectErr } from '@/test/utils/result.js';

import type { Subscription } from './subscription.repo.js';
import { createSubscriptionService } from './subscription.service.js';

describe('SubscriptionService', () => {
  describe('subscribe()', () => {
    it('creates subscription and stores it in DB', async () => {
      // arrange:
      // - mock repo
      // - mock token service
      // - mock email queue
      
      // act:
      // - call subscribe()
      
      // assert:
      // - repo.create called with correct data
      // - token generated
      // - email queued
    });

    it('returns error when repo insert fails', async () => {
      // arrange:
      // - repo.create returns Err

      // act:
      // - call subscribe()

      // assert:
      // - returns Err
      // - email NOT queued
    });

    it('does not create duplicate subscription if already exists', async () => {
      // arrange:
      // - repo.find returns existing subscription

      // act:
      // - call subscribe()
      
      // assert:
      // - repo.create NOT called
      // - returns success or idempotent response
    });
  });

  describe('confirm()', () => {
    it('confirms subscription with valid token', async () => {
      // arrange:
      // - token repo returns valid token
      // - subscription repo updated
      
      // act
      // - call confirm()
      
      // assert
      // - subscription marked confirmed
    });

    it('fails with invalid token', async () => {
      // arrange:
      // - token repo returns null
      
      // act:
      // - call confirm()
      
      // assert:
      // - returns Err
    });

    it('is idempotent if already confirmed', async () => {
      // arrange:
      // - subscription already confirmed
      
      // act:
      // - call confirm()
      
      // assert:
      // - no DB update
    });
  });
});

describe('-- trying things out, can ignore --', () => {
  it('returns an err result on token creation fail', async () => {
    const logger = createLogger();
    const confirmationEmailsQueue = createMockConfirmationEmailsQueue();
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
      logger,
      confirmationEmailsQueue,
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
