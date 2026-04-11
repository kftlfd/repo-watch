import type { Config } from '@/config/config.js';
import { createRedisCache } from '@/cache/redisCache.js';
import { createEmailService } from '@/email/email.service.js';
import { createCachedGithubClient } from '@/github/github.cached.js';
import { createGithubClient } from '@/github/github.client.js';
import { createLogger } from '@/logger/logger.js';
import { createConfirmationEmailsQueue } from '@/queue/confirmation-emails/confirmation-emails.queue.js';
import { createConfirmationEmailsWorker } from '@/queue/confirmation-emails/confirmation-emails.worker.js';
import { createReleaseNotificationsQueue } from '@/queue/release-notifications/release-notifications.queue.js';
import { createReleaseNotificationsWorker } from '@/queue/release-notifications/release-notifications.worker.js';
import { createRepoSubscriptionsQueue } from '@/queue/repo-subscriptions/repo-subscriptions.queue.js';
import { createRepoSubscriptionsWorker } from '@/queue/repo-subscriptions/repo-subscriptions.worker.js';
import { redis } from '@/redis/redis.js';
import { createRepositoryRepo } from '@/repository/repository.repo.js';
import { createScannerService } from '@/scanner/scanner.service.js';
import { createFastifyServer } from '@/server/server.js';
import { createSubscriptionController } from '@/subscription/subscription.controller.js';
import { createSubscriptionRepo } from '@/subscription/subscription.repo.js';
import { createSubscriptionService } from '@/subscription/subscription.service.js';
import { createTokenRepo } from '@/token/token.repo.js';
import { createTokenService } from '@/token/token.service.js';

export function createApp(config: Config) {
  // infra
  const logger = createLogger();
  const cache = createRedisCache(redis);

  // clients
  const ghClient = createGithubClient(config.githubClient);
  const cachedGhClient = createCachedGithubClient({
    config: config.githubClient,
    base: ghClient,
    cache,
    logger,
  });

  // repos
  const repositoryRepo = createRepositoryRepo({ config: config.repositoryRepo, logger, cache });
  const subscriptionRepo = createSubscriptionRepo();
  const tokenRepo = createTokenRepo();

  // queues
  const confirmationEmailsQueue = createConfirmationEmailsQueue({
    config: config.queues.confirmationEmails.queue,
    redis,
  });
  const releaseNotificationsQueue = createReleaseNotificationsQueue({
    config: config.queues.releaseNotifications.queue,
    redis,
  });
  const repoSubscriptionsQueue = createRepoSubscriptionsQueue({
    config: config.queues.repoSubscriptions.queue,
    redis,
  });

  // services
  const tokenService = createTokenService({ config: config.tokenService, tokenRepo });
  const subscriptionService = createSubscriptionService({
    logger,
    repositoryRepo,
    subscriptionRepo,
    tokenService,
    githubClient: cachedGhClient,
    confirmationEmailsQueue,
  });
  const emailService = createEmailService();
  const scannerService = createScannerService({
    config: config.scanner,
    logger,
    repositoryRepo,
    githubClient: cachedGhClient,
    repoSubscriptionsQueue,
  });

  // queue workers
  const createWorkers = () => [
    createConfirmationEmailsWorker({
      redis,
      config: config.queues.confirmationEmails.worker,
      logger,
      emailService,
    }),
    createReleaseNotificationsWorker({
      redis,
      config: config.queues.releaseNotifications.worker,
      logger,
      emailService,
      repositoryRepo,
    }),
    createRepoSubscriptionsWorker({
      redis,
      config: config.queues.repoSubscriptions.worker,
      jobConfig: config.queues.repoSubscriptions.job,
      logger,
      repositoryRepo,
      subscriptionRepo,
      releaseNotificationsQueue,
    }),
  ];

  // server
  const subscriptionController = createSubscriptionController(subscriptionService);
  const app = createFastifyServer({ logger, subscriptionController });

  return {
    logger,
    app,
    scannerService,
    createWorkers,
  };
}
