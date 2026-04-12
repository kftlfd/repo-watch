import { err, ok, Result, ResultAsync } from 'neverthrow';

import type { GithubClient } from '@/github/github.client.js';
import type { Logger } from '@/logger/logger.js';
import type { ConfirmationEmailsQueue } from '@/queue/confirmation-emails/confirmation-emails.queue.js';
import type { RepositoryRepo } from '@/repository/repository.repo.js';
import type {
  Subscription,
  SubscriptionRepo,
  SubscriptionsListItem,
} from '@/subscription/subscription.repo.js';
import type { TokenService } from '@/token/token.service.js';
import type { AppError, HttpError } from '@/utils/errors.js';

import type { SubscribeInput } from './subscription.schema.js';

export type SubscriptionService = {
  subscribe(input: SubscribeInput): Promise<Result<void, AppError>>;
  confirm(token: string): ResultAsync<void, AppError>;
  unsubscribe(token: string): ResultAsync<void, AppError>;
  listSubscriptions(email: string): ResultAsync<SubscriptionsListItem[], AppError>;
};

function parseRepoFullName(fullName: string): { owner: string; name: string } {
  const [owner = '', name = ''] = fullName.split('/');
  return { owner, name };
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
      return {
        type: 'RateLimited',
        service: 'github',
        message: 'Rate limited by GitHub',
        retryAfterSeconds: error.retryAfterSeconds,
      };
    default:
      error satisfies never;
      return { type: 'Internal', message: 'Unknown error' };
  }
}

type Deps = {
  repositoryRepo: RepositoryRepo;
  subscriptionRepo: SubscriptionRepo;
  tokenService: TokenService;
  githubClient: GithubClient;
  logger: Logger;
  confirmationEmailsQueue: ConfirmationEmailsQueue;
};

export function createSubscriptionService({
  repositoryRepo,
  subscriptionRepo,
  tokenService,
  githubClient,
  logger,
  confirmationEmailsQueue,
}: Deps): SubscriptionService {
  const log = logger.child({ module: 'subscription.service' });

  async function subscribe(input: SubscribeInput) {
    const { email, repo: repoFullName } = input;
    const { owner, name } = parseRepoFullName(repoFullName);

    // 1. Verify the repository exists
    const githubRepoResult = await githubClient.getRepo(owner, name);

    if (githubRepoResult.isErr()) {
      return err(mapHttpErrorToAppError(githubRepoResult.error));
    }

    const githubRepo = githubRepoResult.value;

    // 2. Sync the verified repo into the DB
    const updatedRepoResult = await ResultAsync.fromPromise(
      repositoryRepo.findByFullName(githubRepo.full_name),
      (): AppError => ({ type: 'Internal', message: 'DB error' }),
    )
      .andThen((existingRepo) => {
        if (existingRepo) {
          return ResultAsync.fromPromise(
            repositoryRepo.update(existingRepo.id, {
              fullName: githubRepo.full_name,
              owner: githubRepo.owner.login,
              name: githubRepo.name,
              isActive: true,
            }),
            (): AppError => ({ type: 'Internal', message: 'DB Error: updating repo' }),
          );
        }

        return ResultAsync.fromPromise(
          repositoryRepo.create({
            fullName: githubRepo.full_name,
            owner: githubRepo.owner.login,
            name: githubRepo.name,
            isActive: true,
          }),
          (): AppError => ({ type: 'Internal', message: 'DB Error: creating repo' }),
        );
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

    // 3. Check if already subscribed and create/update subscription
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
      .andThen((sub) => (sub ? ok<Subscription>(sub) : err('SUB_MISSING')))
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
      const { htmlUrl: confirmHtmlUrl, apiUrl: confirmApiUrl } = tokenService.getTokenUrls(
        token,
        'confirm',
      );
      return ResultAsync.fromPromise(
        confirmationEmailsQueue.enqueueConfirmationEmail({
          email,
          repoName: githubRepo.full_name,
          confirmHtmlUrl,
          confirmApiUrl,
        }),
        (): AppError => ({ type: 'Internal', message: 'Failed to enqueue confirmation email' }),
      );
    });

    return emailOk.andThen(() => ok());
  }

  function confirm(token: string) {
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
          tokenService.deleteToken(token.id).catch((error: unknown) => {
            log.error({ error }, 'DB Error: failed to delete token');
          });
        });
      })
      .andThen(() => ok());
  }

  function unsubscribe(token: string): ResultAsync<void, AppError> {
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
          tokenService.deleteToken(token.id).catch((error: unknown) => {
            log.error({ error }, 'DB Error: failed to delete token');
          });
        });
      })
      .andThen(() => ok());
  }

  function listSubscriptions(email: string) {
    return ResultAsync.fromPromise(
      subscriptionRepo.getSubscriptionsForEmail(email),
      (): AppError => ({ type: 'Internal', message: 'DB error' }),
    );
  }

  return {
    subscribe,
    confirm,
    unsubscribe,
    listSubscriptions,
  };
}
