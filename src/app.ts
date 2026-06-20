import type { Config } from '@/config/config.js';
import type { Logger } from '@/logger/logger.js';
import { createRedisCache } from '@/cache/redisCache.js';
import { createDBModule } from '@/db/client.js';
import { createEmailService } from '@/email/email.service.js';
import { createCachedGithubClient } from '@/github/github.cached.js';
import { createGithubClient } from '@/github/github.client.js';
import { createMetrics } from '@/metrics/metrics.js';
import { createConfirmationEmailsQueue } from '@/queue/confirmation-emails/confirmation-emails.queue.js';
import { createReleaseNotificationsQueue } from '@/queue/release-notifications/release-notifications.queue.js';
import { createRepoSubscriptionsQueue } from '@/queue/repo-subscriptions/repo-subscriptions.queue.js';
import { createRedisModule } from '@/redis/redis.js';
import { createRepositoryRepo } from '@/repository/repository.repo.js';
import { createScannerLoop } from '@/scanner/scanner.loop.js';
import { createFastifyServer } from '@/server/server.js';
import { createSubscriptionApi } from '@/subscription/subscription.api.js';
import { createSubscriptionRepo } from '@/subscription/subscription.repo.js';
import { createSubscriptionService } from '@/subscription/subscription.service.js';
import { createSubscriptionWeb } from '@/subscription/subscription.web.js';
import { createTokenRepo } from '@/token/token.repo.js';
import { createTokenService } from '@/token/token.service.js';

type Deps = {
  config: Config;
  logger: Logger;
};

export function createApp({ config, logger }: Deps) {
  const metrics = createMetrics();

  // infra
  const { dbModule, db } = createDBModule({ config: config.db, logger });
  const { redisModule, redis } = createRedisModule();
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
  const repositoryRepo = createRepositoryRepo({ config: config.repositoryRepo, db, logger, cache });
  const subscriptionRepo = createSubscriptionRepo({ db });
  const tokenRepo = createTokenRepo({ db });

  // queues
  const confirmationEmailsQueue = createConfirmationEmailsQueue({
    config: config.queues.confirmationEmails,
    logger,
    redis,
    metrics: metrics.queue,
  });
  const releaseNotificationsQueue = createReleaseNotificationsQueue({
    config: config.queues.releaseNotifications,
    logger,
    redis,
    metrics: metrics.queue,
  });
  const repoSubscriptionsQueue = createRepoSubscriptionsQueue({
    config: config.queues.repoSubscriptions,
    logger,
    redis,
    metrics: metrics.queue,
  });

  // services
  const tokenService = createTokenService({ config: config.tokenService, tokenRepo });
  const subscriptionService = createSubscriptionService({
    logger,
    repositoryRepo,
    subscriptionRepo,
    tokenService,
    githubClient: cachedGhClient,
    confirmationEmailsQueue: confirmationEmailsQueue.service,
  });
  const emailService = createEmailService();
  const scannerLoop = createScannerLoop({
    config: config.scanner,
    logger,
    repositoryRepo,
    githubClient: cachedGhClient,
    repoSubscriptionsQueue: repoSubscriptionsQueue.service,
    metrics: metrics.scanner,
  });

  // queue workers
  const workers = [
    confirmationEmailsQueue.createWorker({
      emailService,
    }),
    releaseNotificationsQueue.createWorker({
      emailService,
      repositoryRepo,
      tokenService,
    }),
    repoSubscriptionsQueue.createWorker({
      config: config.queues.repoSubscriptions.job,
      repositoryRepo,
      subscriptionRepo,
      releaseNotificationsQueue: releaseNotificationsQueue.service,
    }),
  ];

  // server
  const subscriptionApi = createSubscriptionApi({ subscriptionService });
  const subscriptionWeb = createSubscriptionWeb({ subscriptionService });
  const server = createFastifyServer({
    config: config.server,
    logger,
    metrics: metrics.server,
    metricsRegistry: metrics.registry,
    subscriptionApi,
    subscriptionWeb,
  });

  return [
    dbModule,
    redisModule,
    confirmationEmailsQueue.module,
    releaseNotificationsQueue.module,
    repoSubscriptionsQueue.module,
    server,
    scannerLoop,
    ...workers,
  ];
}
