import { err, errAsync, ok, okAsync, ResultAsync } from 'neverthrow';
import { z } from 'zod';

import { getRepo } from '@/github/github.client.js';
import { enqueueConfirmationEmail } from '@/queue/confirmation-emails/index.js';
import * as repositoryRepo from '@/repository/repository.repo.js';
import * as subscriptionRepo from '@/subscription/subscription.repo.js';
import * as tokenService from '@/token/token.service.js';
import { AppError, type HttpError } from '@/utils/errors.js';

export const SubscribeSchema = z.object({
  email: z.email(),
  repoFullName: z.string().regex(/^[^/]+\/[^/]+$/, 'Invalid format. Use owner/repo'),
});

export type SubscribeInput = z.infer<typeof SubscribeSchema>;

function parseRepoFullName(fullName: string): { owner: string; name: string } {
  const [owner = '', name = ''] = fullName.split('/');
  return { owner, name };
}

function validationError(message: string) {
  return errAsync<never, AppError>({ type: 'Validation', message });
}

function mapHttpErrorToAppError(error: HttpError): AppError {
  switch (error.type) {
    case 'NotFound':
      return { type: 'NotFound', message: error.message };
    case 'NetworkError':
    case 'BadResponse':
    case 'Unauthorized':
    case 'Unknown':
      return { type: 'External', service: 'github', message: error.message };
    case 'TooManyRequests':
      return { type: 'External', service: 'github', message: 'Rate limited by GitHub' };
    default:
      error satisfies never;
      return { type: 'Internal', message: 'Unknown error' };
  }
}

export async function subscribe(input: SubscribeInput) {
  const parsed = SubscribeSchema.safeParse(input);
  if (!parsed.success) {
    const message = parsed.error.message || 'Invalid input';
    return validationError(message);
  }

  const { email, repoFullName } = parsed.data;
  const { owner, name } = parseRepoFullName(repoFullName);

  // 1. Get the repo from DB or fetch from GH
  const repo = await ResultAsync.fromPromise(
    repositoryRepo.findByFullName(repoFullName),
    (): AppError => ({ type: 'Internal', message: 'DB error' }),
  )
    .andThen((repo) =>
      repo
        ? ok({ type: 'DB_REPO' as const, repo })
        : err({ type: 'NotFound', message: 'Repo not found in DB' } as AppError),
    )
    .orElse(() =>
      getRepo(owner, name)
        .map((repo) => ({ type: 'GH_REPO' as const, repo }))
        .mapErr<AppError>(mapHttpErrorToAppError),
    );

  if (repo.isErr()) {
    return err(repo.error);
  }

  // 2. Create/update the repo in DB
  const updatedRepoResult = await repo
    .asyncAndThen((res) => {
      switch (res.type) {
        case 'DB_REPO': {
          if (res.repo.isActive) return okAsync(res.repo);
          return ResultAsync.fromPromise(
            repositoryRepo.update(res.repo.id, {
              isActive: true,
            }),
            (): AppError => ({ type: 'Internal', message: 'DB Error: updating repo' }),
          );
        }
        case 'GH_REPO': {
          return ResultAsync.fromPromise(
            repositoryRepo.create({
              fullName: res.repo.full_name,
              owner: res.repo.owner.login,
              name: res.repo.name,
              isActive: true,
            }),
            (): AppError => ({ type: 'Internal', message: 'DB Error: creating repo' }),
          );
        }
        default:
          res satisfies never;
          return errAsync({ type: 'Internal', message: 'Unreachable code' } as AppError);
      }
    })
    .andThen((repo) =>
      repo
        ? ok(repo)
        : err({ type: 'Internal', message: 'Failed to create or update repo' } as AppError),
    );

  if (updatedRepoResult.isErr()) {
    return err(updatedRepoResult.error);
  }

  const updatedRepo = updatedRepoResult.value;

  // 3. Check if already subscribed and ceate/update subscription
  const subscription = ResultAsync.fromPromise(
    subscriptionRepo.findActiveByEmailAndRepoId(email, updatedRepo.id),
    () => 'DB_QUERY_FAILED' as const,
  )
    .andThen((sub) => {
      if (sub?.confirmedAt) {
        return err('ALREADY_SUBSCRIBED' as const);
      }
      if (sub) {
        return ResultAsync.fromPromise(
          subscriptionRepo.update(sub.id, { removedAt: null }),
          () => 'SUB_UPDATE_FAILED' as const,
        );
      }
      return ResultAsync.fromPromise(
        subscriptionRepo.create({ email, repositoryId: updatedRepo.id }),
        () => 'SUB_CREATE_FAILED' as const,
      );
    })
    .andThen((sub) => (sub ? ok<subscriptionRepo.Subscription>(sub) : err('SUB_MISSING')))
    .mapErr<AppError>((err) => {
      if (err === 'ALREADY_SUBSCRIBED') {
        return { type: 'Conflict', message: 'Already subscribed' };
      }
      return { type: 'Internal', message: 'Failed to create subscription' };
    });

  // 4. Create subscription token
  const tokenResult = subscription.andThen((sub) =>
    ResultAsync.fromPromise(
      tokenService.createToken({
        email,
        repositoryId: sub.repositoryId,
        type: 'confirm',
      }),
      (): AppError => ({ type: 'Internal', message: 'Failed to create token' }),
    ),
  );

  // 5. Enqueue confirmation email
  const emailOk = tokenResult.andThen((token) => {
    const confirmUrl = tokenService.getTokenUrl(token.token, 'confirm');
    return ResultAsync.fromPromise(
      enqueueConfirmationEmail({
        email,
        repoName: repoFullName,
        confirmUrl,
      }),
      (): AppError => ({ type: 'Internal', message: 'Failed to enqueue confirmation email' }),
    );
  });

  return emailOk.andThen(() => ok());
}

export function confirm(token: string) {
  const tokenResult = tokenService.validateToken(token, 'confirm');

  return tokenResult
    .andThen((token) =>
      ResultAsync.fromPromise(
        subscriptionRepo.findActiveByEmailAndRepoId(token.email, token.repositoryId),
        () => ({ type: 'Internal', message: 'DB error' }) as AppError,
      ),
    )
    .andThen((sub) =>
      sub ? ok(sub) : err({ type: 'NotFound', message: 'Subscription not found' } as AppError),
    )
    .andThen((sub) =>
      ResultAsync.fromPromise(
        subscriptionRepo.update(sub.id, { confirmedAt: new Date(), removedAt: null }),
        () => ({ type: 'Internal', message: 'DB error' }) as AppError,
      ),
    )
    .andTee(() => {
      tokenResult.andTee((token) => {
        tokenService.deleteToken(token.id).catch((err: unknown) => {
          console.error('DB Error: failed to delete token', err);
        });
      });
    })
    .andThen(() => ok());
}

export function unsubscribe(token: string): ResultAsync<void, AppError> {
  const tokenResult = tokenService.validateToken(token, 'unsubscribe');

  return tokenResult
    .andThen((tokenRecord) =>
      ResultAsync.fromPromise(
        subscriptionRepo.findActiveByEmailAndRepoId(tokenRecord.email, tokenRecord.repositoryId),
        () => ({ type: 'Internal', message: 'DB error' }) as AppError,
      ),
    )
    .andThen((sub) =>
      sub ? ok(sub) : err({ type: 'NotFound', message: 'Subscription not found' } as AppError),
    )
    .andThen((sub) =>
      ResultAsync.fromPromise(
        subscriptionRepo.softDelete(sub.id),
        () => ({ type: 'Internal', message: 'DB error' }) as AppError,
      ),
    )
    .andTee(() => {
      tokenResult.andTee((token) => {
        tokenService.deleteToken(token.id).catch((err: unknown) => {
          console.error('DB Error: failed to delete token', err);
        });
      });
    })
    .andThen(() => ok());
}

export function listSubscriptions(email: string) {
  if (!z.email().safeParse(email).success) {
    return validationError('Invalid email');
  }

  return ResultAsync.fromPromise(
    subscriptionRepo.getSubscriptionsForEmail(email),
    (): AppError => ({ type: 'Internal', message: 'DB error' }),
  );
}
