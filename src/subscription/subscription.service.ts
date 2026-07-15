import { err, ok, ResultAsync } from 'neverthrow';

import type { GithubClient } from '@/github/github.client.js';
import type { Repo } from '@/github/github.schema.js';
import type { Logger } from '@/logger/logger.js';
import type { SubscriptionsMetrics } from '@/metrics/metrics.js';
import type { ConfirmationEmailsQueue } from '@/queue/confirmation-emails/confirmation-emails.queue.js';
import type { RepositoryRepo } from '@/repository/repository.repo.js';
import type { SubscriptionRepo } from '@/subscription/subscription.repo.js';
import type { TokenService } from '@/token/token.service.js';

import type { SubscribeInput } from './subscription.schema.js';

export type SubscriptionService = ReturnType<typeof createSubscriptionService>;

function parseRepoFullName(fullName: string): { owner: string; name: string } {
  const [owner = '', name = ''] = fullName.split('/');
  return { owner, name };
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
}: Deps) {
  const log = logger.child({ module: 'subscription.service' });

  function verifyRepoExists(owner: string, name: string) {
    return githubClient.getRepo(owner, name).mapErr((e) => {
      if (e.type === 'HTTP_ERROR') {
        switch (e.error.type) {
          case 'HttpTooManyRequests':
            return 'GH_RATE_LIMITED';
          case 'HttpNotFound':
            return 'GH_NOT_FOUND';
        }
      }
      return 'GH_ERROR';
    });
  }

  function syncRepoToDb(githubRepo: Repo) {
    return repositoryRepo
      .findByFullName(githubRepo.fullName)
      .andThen((existingRepo) => {
        if (
          existingRepo.isActive &&
          existingRepo.fullName === githubRepo.fullName &&
          existingRepo.owner === githubRepo.owner &&
          existingRepo.name === githubRepo.name
        ) {
          return ok(existingRepo);
        }

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
      });
  }

  function checkOrCreateSub(email: string, repoId: number) {
    return subscriptionRepo
      .findActiveByEmailAndRepoId(email, repoId)
      .andThen((sub) => (sub.confirmedAt ? err('ALREADY_SUBSCRIBED' as const) : ok(sub)))
      .orElse((e) => {
        if (typeof e === 'object' && e.type === 'DBNotFound') {
          return subscriptionRepo.create({ email, repositoryId: repoId });
        }
        return err(e);
      });
  }

  function createSubToken(email: string, repoId: number) {
    return tokenService.createToken({
      email,
      repositoryId: repoId,
      type: 'confirm',
    });
  }

  function enqueueConfirmationEmail(email: string, token: string, repoFullName: string) {
    const { htmlUrl: confirmHtmlUrl, apiUrl: confirmApiUrl } = tokenService.getTokenUrls(
      token,
      'confirm',
    );

    return ResultAsync.fromPromise(
      confirmationEmailsQueue.enqueueConfirmationEmail({
        email,
        repoName: repoFullName,
        confirmHtmlUrl,
        confirmApiUrl,
      }),
      () => 'ENQUEUE_EMAIL_ERROR' as const,
    );
  }

  function subscribe(input: SubscribeInput) {
    const { email, repo: repoFullName } = input;
    const { owner, name } = parseRepoFullName(repoFullName);

    // 1. Verify the repository exists
    return (
      verifyRepoExists(owner, name)
        // 2. Sync the verified repo into the DB
        .andThen((repo) => syncRepoToDb(repo))
        // 3. Check if already subscribed and create/update subscription
        .andThen((repo) =>
          checkOrCreateSub(email, repo.id).map((sub) => ({ sub, repoFullName: repo.fullName })),
        )
        // 4. Create subscription token
        .andThen(({ sub, repoFullName }) =>
          createSubToken(email, sub.repositoryId).map((token) => ({ token, repoFullName })),
        )
        // 5. Enqueue confirmation email
        .andThen(({ token, repoFullName }) => enqueueConfirmationEmail(email, token, repoFullName))
        .andTee(() => {
          metrics.recordAction('sub');
        })
    );
  }

  function confirm(token: string) {
    return tokenService
      .validateToken(token, 'confirm')
      .andThen((token) =>
        subscriptionRepo
          .findActiveByEmailAndRepoId(token.email, token.repositoryId)
          .map((sub) => ({ token, sub })),
      )
      .andThen(({ token, sub }) =>
        subscriptionRepo
          .update(sub.id, { confirmedAt: new Date(), removedAt: null })
          .map(() => ({ token })),
      )
      .andThen(({ token }) =>
        repositoryRepo.update(token.repositoryId, { isActive: true }).map(() => ({ token })),
      )
      .andTee(({ token }) => {
        metrics.recordAction('confirm-sub');
        tokenService.deleteToken(token.id).orTee((error) => {
          log.error({ error }, 'DB Error: failed to delete token');
        });
      })
      .map(() => {});
  }

  function unsubscribe(token: string) {
    return tokenService
      .validateToken(token, 'unsubscribe')
      .andThen((tokenRecord) =>
        subscriptionRepo
          .findActiveByEmailAndRepoId(tokenRecord.email, tokenRecord.repositoryId)
          .map((sub) => ({ sub, tokenId: tokenRecord.id })),
      )
      .andThen(({ sub, tokenId }) => subscriptionRepo.softDelete(sub.id).map(() => tokenId))
      .andTee((tokenId) => {
        metrics.recordAction('unsub');
        tokenService.deleteToken(tokenId).orTee((error: unknown) => {
          log.error({ error }, 'DB Error: failed to delete token');
        });
      })
      .map(() => {});
  }

  function listSubscriptions(email: string) {
    return subscriptionRepo.getSubscriptionsForEmail(email);
  }

  return {
    subscribe,
    confirm,
    unsubscribe,
    listSubscriptions,
  };
}
