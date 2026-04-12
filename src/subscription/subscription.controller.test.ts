import { err, ok } from 'neverthrow';
import { describe, expect, it, vi } from 'vitest';

import { createMockSubscriptionService } from '@/test/mocks.js';
import { expectErr, expectOk } from '@/test/utils/result.js';

import { createSubscriptionController } from './subscription.controller.js';

describe('subscription.controller', () => {
  it('rejects invalid subscribe payload before calling the service', async () => {
    const subscribe = vi.fn();
    const controller = createSubscriptionController({
      subscriptionService: createMockSubscriptionService({ subscribe }),
    });

    const result = await controller.subscribe({ email: 'not-an-email', repo: 'bad-format' });

    const error = expectErr(result);
    expect(error).toEqual({
      type: 'Validation',
      message: 'Invalid email address',
    });
    expect(subscribe).not.toHaveBeenCalled();
  });

  it('forwards valid subscribe input unchanged to the service', async () => {
    const subscribe = vi.fn().mockResolvedValue(ok(undefined));
    const controller = createSubscriptionController({
      subscriptionService: createMockSubscriptionService({ subscribe }),
    });

    const result = await controller.subscribe({
      email: 'user@example.com',
      repo: 'owner/repo',
    });

    expectOk(result);
    expect(subscribe).toHaveBeenCalledWith({ email: 'user@example.com', repo: 'owner/repo' });
  });

  it('rejects invalid tokens before calling confirm or unsubscribe service methods', async () => {
    const confirm = vi.fn();
    const unsubscribe = vi.fn();
    const controller = createSubscriptionController({
      subscriptionService: createMockSubscriptionService({ confirm, unsubscribe }),
    });

    const confirmResult = await controller.confirm('short');
    const unsubscribeResult = await controller.unsubscribe('');

    const confirmError = expectErr(confirmResult);
    expect(confirmError).toEqual({
      type: 'Validation',
      message: 'Invalid token',
    });
    const unsubError = expectErr(unsubscribeResult);
    expect(unsubError).toEqual({
      type: 'Validation',
      message: 'Invalid token',
    });
    expect(confirm).not.toHaveBeenCalled();
    expect(unsubscribe).not.toHaveBeenCalled();
  });

  it('rejects missing or invalid email for listSubscriptions before calling the service', async () => {
    const listSubscriptions = vi.fn();
    const controller = createSubscriptionController({
      subscriptionService: createMockSubscriptionService({ listSubscriptions }),
    });

    const missingEmail = await controller.listSubscriptions('');
    const invalidEmail = await controller.listSubscriptions('not-an-email');

    const missingError = expectErr(missingEmail);
    expect(missingError).toEqual({
      type: 'Validation',
      message: 'Email parameter is required',
    });
    const invalidError = expectErr(invalidEmail);
    expect(invalidError).toEqual({
      type: 'Validation',
      message: 'Invalid email',
    });
    expect(listSubscriptions).not.toHaveBeenCalled();
  });

  it('forwards valid confirm, unsubscribe, and listSubscriptions inputs to the service', async () => {
    const confirm = vi.fn().mockResolvedValue(ok(undefined));
    const unsubscribe = vi.fn().mockResolvedValue(ok(undefined));
    const listSubscriptions = vi.fn().mockResolvedValue(ok([]));
    const controller = createSubscriptionController({
      subscriptionService: createMockSubscriptionService({
        confirm,
        unsubscribe,
        listSubscriptions,
      }),
    });

    const confirmResult = await controller.confirm('valid-token-123');
    const unsubscribeResult = await controller.unsubscribe('valid-token-456');
    const listResult = await controller.listSubscriptions('user@example.com');

    expectOk(confirmResult);
    expectOk(unsubscribeResult);
    expectOk(listResult);
    expect(confirm).toHaveBeenCalledWith('valid-token-123');
    expect(unsubscribe).toHaveBeenCalledWith('valid-token-456');
    expect(listSubscriptions).toHaveBeenCalledWith('user@example.com');
  });

  it('returns service errors unchanged', async () => {
    const serviceError = { type: 'Conflict', message: 'Already subscribed' } as const;
    const subscribe = vi.fn().mockResolvedValue(err(serviceError));
    const controller = createSubscriptionController({
      subscriptionService: createMockSubscriptionService({ subscribe }),
    });

    const result = await controller.subscribe({
      email: 'user@example.com',
      repo: 'owner/repo',
    });

    const error = expectErr(result);
    expect(error).toEqual(serviceError);
  });
});
