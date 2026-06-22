import { err, ok, ResultAsync } from 'neverthrow';

import type { GithubClient } from '@/github/github.client.js';
import type { Logger } from '@/logger/logger.js';
import type { SubscriptionsMetrics } from '@/metrics/metrics.js';
import type { ConfirmationEmailsQueue } from '@/queue/confirmation-emails/confirmation-emails.queue.js';
import type { RepositoryRepo } from '@/repository/repository.repo.js';
import type {
  Subscription,
  SubscriptionRepo,
  SubscriptionsListItem,
} from '@/subscription/subscription.repo.js';
import type { TokenService } from '@/token/token.service.js';
import type { AppError } from '@/utils/errors.js';

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

type ExtractAsyncErr<R> = R extends ResultAsync<unknown, infer E> ? E : never;

function mapHttpErrorToAppError(
  error: ExtractAsyncErr<ReturnType<GithubClient['getRepo']>>,
): AppError {
  switch (error.type) {
    case 'HttpNotFound':
      return { type: 'NotFound', message: error.message ?? 'Not found' };
    case 'HttpNetworkError':
    case 'HttpBadResponse':
    case 'HttpUnauthorized':
    case 'HttpUnknownError':
      return {
        type: 'External',
        service: 'github',
        message: error.type === 'HttpNetworkError' ? 'Network error' : (error.message ?? 'Error'),
      };
    case 'HttpTooManyRequests':
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
  metrics: SubscriptionsMetrics;
};

export function createSubscriptionService({
  repositoryRepo,
  subscriptionRepo,
  tokenService,
  githubClient,
  logger,
  confirmationEmailsQueue,
  metrics,
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
    const updatedRepoResult = await repositoryRepo
      .findByFullName(githubRepo.fullName)
      .andThen((existingRepo) => {
        return repositoryRepo.update(existingRepo.id, {
          fullName: githubRepo.fullName,
          owner: githubRepo.owner,
          name: githubRepo.name,
          isActive: true,
        });
      })
      .orElse((error) => {
        if (error.type === 'DBNotFound') {
          return repositoryRepo.create({
            fullName: githubRepo.fullName,
            owner: githubRepo.owner,
            name: githubRepo.name,
            isActive: true,
          });
        }
        return err(error);
      })
      .mapErr<AppError>(() => ({ type: 'Internal', message: 'Failed to create or update repo' }));

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
          repoName: githubRepo.fullName,
          confirmHtmlUrl,
          confirmApiUrl,
        }),
        (): AppError => ({ type: 'Internal', message: 'Failed to enqueue confirmation email' }),
      );
    });

    return emailOk.andThen(() => {
      metrics.recordAction('sub');
      return ok();
    });
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
          .andThen(() => ok({ token }))
          .mapErr<AppError>(() => ({ type: 'Internal', message: 'Failed to activate repository' })),
      )
      .andTee(({ token }) => {
        tokenService.deleteToken(token.id).catch((error: unknown) => {
          log.error({ error }, 'DB Error: failed to delete token');
        });
      })
      .andThen(() => {
        metrics.recordAction('confirm-sub');
        return ok();
      });
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
      .andThen(() => {
        metrics.recordAction('unsub');
        return ok();
      });
  }

  function listSubscriptions(email: string) {
    return ResultAsync.fromPromise(
      subscriptionRepo.getSubscriptionsForEmail(email),
      (): AppError => ({ type: 'Internal', message: 'DB error' }),
    );
  }

  // TODO: refactor subscribe
  function handleSubscribe(inp: SubscribeInput) {
    return ResultAsync.fromSafePromise(subscribe(inp)).andThen((res) =>
      res.isOk() ? ok() : err(res.error),
    );
  }

  return {
    subscribe: handleSubscribe,
    confirm,
    unsubscribe,
    listSubscriptions,
  };
}
