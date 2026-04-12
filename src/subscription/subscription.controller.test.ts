import { describe, expect, it } from 'vitest';

import { createSubscriptionController } from './subscription.controller.js';
import { createMockSubscriptionService } from '@/test/mocks.js';

describe('Subscription Controller', () => {
  it('Shoud create without errors', () => {
    const subscriptionService = createMockSubscriptionService();

    const controller = createSubscriptionController({ subscriptionService });

    expect(controller).toBeTruthy();
  })
});
