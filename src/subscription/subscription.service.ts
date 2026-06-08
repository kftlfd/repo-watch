import { err, ok, ResultAsync } from 'neverthrow';

import type { GithubClient } from '@/github/github.client.js';
import type { Repo } from '@/github/github.schema.js';
import type { Logger } from '@/logger/logger.js';
import type { ConfirmationEmailsQueue } from '@/queue/confirmation-emails/confirmation-emails.queue.js';
import type { Repository, RepositoryRepo } from '@/repository/repository.repo.js';
import type {
  Subscription,
  SubscriptionRepo,
  SubscriptionsListItem,
} from '@/subscription/subscription.repo.js';
import type { TokenService } from '@/token/token.service.js';
import type { AppError, HttpError } from '@/utils/errors.js';

import type { SubscribeInput } from './subscription.schema.js';

export type SubscriptionService = {
  subscribe(input: SubscribeInput): ResultAsync<void, AppError>;
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

  // ==================================
  // Subscribe
  // ==================================

  // 1. Verify the repository exists
  function getGHRepo(owner: string, name: string) {
    return githubClient.getRepo(owner, name).mapErr((e) => mapHttpErrorToAppError(e));
  }

  // 2. Sync the verified repo into the DB
  function updateRepoInDB(ghRepo: Repo) {
    return repositoryRepo
      .findByFullName(ghRepo.full_name)
      .mapErr((e) => (e.type === 'DBNotFound' ? ('NOT_FOUND' as const) : e))
      .andThen((repo) =>
        repositoryRepo.update(repo.id, {
          fullName: ghRepo.full_name,
          owner: ghRepo.owner.login,
          name: ghRepo.name,
          isActive: true,
        }),
      )
      .orElse((e) => {
        if (e === 'NOT_FOUND') {
          return repositoryRepo.create({
            fullName: ghRepo.full_name,
            owner: ghRepo.owner.login,
            name: ghRepo.name,
            isActive: true,
          });
        }
        return err(e);
      });
  }

  // 3. Check if already subscribed and create/update subscription
  function checkUpdateSubscription(email: string, repo: Repository) {
    return ResultAsync.fromPromise(
      subscriptionRepo.findActiveByEmailAndRepoId(email, repo.id),
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
          subscriptionRepo.create({ email, repositoryId: repo.id }),
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
  }

  // 4. Create subscription token
  function createSubscrToken(subscription: Subscription, email: string) {
    return ResultAsync.fromPromise(
      tokenService.createToken({
        email,
        repositoryId: subscription.repositoryId,
        type: 'confirm',
      }),
      (): AppError => ({ type: 'Internal', message: 'Failed to create token' }),
    );
  }

  // 5. Enqueue confirmation email
  function enqueueEmail(token: string, email: string, repoName: string) {
    const { htmlUrl: confirmHtmlUrl, apiUrl: confirmApiUrl } = tokenService.getTokenUrls(
      token,
      'confirm',
    );

    return ResultAsync.fromPromise(
      confirmationEmailsQueue.enqueueConfirmationEmail({
        email,
        repoName,
        confirmHtmlUrl,
        confirmApiUrl,
      }),
      (): AppError => ({ type: 'Internal', message: 'Failed to enqueue confirmation email' }),
    );
  }

  function handleSubsctiption(email: string, repo: Repository) {
    return checkUpdateSubscription(email, repo)
      .andThen((sub) => createSubscrToken(sub, email))
      .andThen((token) => enqueueEmail(token, email, repo.fullName));
  }

  function subscribe(input: SubscribeInput) {
    const { email, repo: repoFullName } = input;
    const { owner, name } = parseRepoFullName(repoFullName);

    return getGHRepo(owner, name)
      .andThen((ghRepo) => updateRepoInDB(ghRepo))
      .andThen((repo) => handleSubsctiption(email, repo))
      .mapErr(
        (e): AppError =>
          e.type === 'DBError' || e.type === 'DBNotFound'
            ? { type: 'Internal', message: 'DB error' }
            : e,
      );
  }

  function confirm(token: string) {
    return tokenService
      .validateToken(token, 'confirm')
      .andThen((token) =>
        ResultAsync.fromPromise(
          subscriptionRepo.findActiveByEmailAndRepoId(token.email, token.repositoryId),
          (): AppError => ({ type: 'Internal', message: 'DB error' }),
        ).andThen((sub) =>
          sub
            ? ok({ token, sub })
            : err<never, AppError>({ type: 'NotFound', message: 'Subscription not found' }),
        ),
      )
      .andThen(({ token, sub }) =>
        ResultAsync.fromPromise(
          subscriptionRepo.update(sub.id, { confirmedAt: new Date(), removedAt: null }),
          (): AppError => ({ type: 'Internal', message: 'DB error' }),
        ).andThen((sub) =>
          sub
            ? ok({ token })
            : err<never, AppError>({ type: 'Internal', message: 'Failed to update subscription' }),
        ),
      )
      .andThen(({ token }) =>
        repositoryRepo
          .update(token.repositoryId, { isActive: true })
          .map(() => ({ token }))
          .mapErr((): AppError => ({ type: 'Internal', message: 'Error activating repo' })),
      )
      .andTee(({ token }) => {
        tokenService.deleteToken(token.id).catch((error: unknown) => {
          log.error({ error }, 'DB Error: failed to delete token');
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
