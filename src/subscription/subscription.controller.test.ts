import { describe, expect, it, vi } from 'vitest';

import type { SubscriptionService } from '@/subscription/subscription.service.js';

describe('Subscription Controller', () => {
  describe('POST /api/subscribe', () => {
    it('accepts valid input', async () => {
      const mockService: SubscriptionService = {
        subscribe: vi.fn().mockResolvedValue({ ok: true, value: undefined }),
        confirm: vi.fn(),
        unsubscribe: vi.fn(),
        listSubscriptions: vi.fn(),
      };

      const result = await mockService.subscribe({
        email: 'test@example.com',
        repo: 'owner/repository',
      });

      expect(result.isOk()).toBe(true);
    });
  });

  describe('GET /api/confirm/{token}', () => {
  });

  describe('GET /api/unsubscribe/{token}', () => {
  });

  describe('GET /api/subscriptions', () => {
  });
});
