import { err, ok, Result } from 'neverthrow';

import type { AppError } from '@/utils/errors.js';

import type { SubscriptionsListItem } from './subscription.repo.js';
import type { SubscriptionService } from './subscription.service.js';
import { EmailSchema, SubscribeInputSchema } from './subscription.schema.js';

export type SubscribeInput = {
  email: string;
  repo: string;
};

export type SubscriptionController = {
  subscribe(body: unknown): Promise<Result<void, AppError>>;
  confirm(token: string): Promise<Result<void, AppError>>;
  unsubscribe(token: string): Promise<Result<void, AppError>>;
  listSubscriptions(email: string): Promise<Result<SubscriptionsListItem[], AppError>>;
};

type Deps = {
  subscriptionService: SubscriptionService;
};

// Shared helper for validating tokens
function validateToken(token: string): Result<string, AppError> {
  if (!token || token.length < 10) {
    return err({ type: 'Validation', message: 'Invalid token' } as AppError);
  }
  return ok(token);
}

export function createSubscriptionController({
  subscriptionService,
}: Deps): SubscriptionController {
  async function subscribe(body: unknown): Promise<Result<void, AppError>> {
    // Parse and validate input inline
    const parsed = SubscribeInputSchema.safeParse(body);
    if (!parsed.success) {
      const message = parsed.error.issues[0]?.message ?? 'Invalid input';
      return err({ type: 'Validation', message } as AppError);
    }

    return subscriptionService.subscribe(parsed.data);
  }

  async function confirm(token: string): Promise<Result<void, AppError>> {
    const validated = validateToken(token);
    if (validated.isErr()) return err(validated.error);

    return subscriptionService.confirm(validated.value);
  }

  async function unsubscribe(token: string): Promise<Result<void, AppError>> {
    const validated = validateToken(token);
    if (validated.isErr()) return err(validated.error);

    return subscriptionService.unsubscribe(validated.value);
  }

  async function listSubscriptions(
    email: string,
  ): Promise<Result<SubscriptionsListItem[], AppError>> {
    if (!email) {
      return err({ type: 'Validation', message: 'Email parameter is required' } as AppError);
    }

    if (!EmailSchema.safeParse(email).success) {
      return err({ type: 'Validation', message: 'Invalid email' } as AppError);
    }

    return subscriptionService.listSubscriptions(email);
  }

  return {
    subscribe,
    confirm,
    unsubscribe,
    listSubscriptions,
  };
}
