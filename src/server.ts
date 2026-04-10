import Fastify from 'fastify';

import { createRedisCache } from '@/cache/redisCache.js';
import { config } from '@/config/config.js';
import { env } from '@/config/env.js';
import { createEmailService } from '@/email/email.service.js';
import { createCachedGithubClient } from '@/github/github.cached.js';
import { createGithubClient } from '@/github/github.client.js';
import { createLogger } from '@/logger/logger.js';
import { createEnqueueConfirmationEmaiFn } from '@/queue/confirmation-emails/confirmation-emails.queue.js';
import { createConfirmationEmailsWorker } from '@/queue/confirmation-emails/confirmation-emails.worker.js';
import { createEnqueueReleaseEmail } from '@/queue/release-notifications/release-notifications.queue.js';
import { createReleaseNotificationsWorker } from '@/queue/release-notifications/release-notifications.worker.js';
import { createEnqueueRepoSubscriptions } from '@/queue/repo-subscriptions/repo-subscriptions.queue.js';
import { createRepoSubscriptionsWorker } from '@/queue/repo-subscriptions/repo-subscriptions.worker.js';
import { redis } from '@/redis/redis.js';
import { createRepositoryRepo } from '@/repository/repository.repo.js';
import { createScannerLoop } from '@/scanner/scanner.service.js';
import { createSubscriptionController } from '@/subscription/subscription.controller.js';
import { createSubscriptionRepo } from '@/subscription/subscription.repo.js';
import { createSubscriptionService } from '@/subscription/subscription.service.js';
import { createTokenRepo } from '@/token/token.repo.js';
import { createTokenService } from '@/token/token.service.js';

const logger = createLogger();

const enqueueConfirmationEmail = createEnqueueConfirmationEmaiFn(
  config.queues.confirmationEmails.queue,
);
const enqueueReleaseEmail = createEnqueueReleaseEmail(config.queues.releaseNotifications.queue);
const enqueueRepoSubscriptions = createEnqueueRepoSubscriptions(
  config.queues.repoSubscriptions.queue,
);
const cache = createRedisCache(redis);
const repositoryRepo = createRepositoryRepo({ config: config.repositoryRepo, logger, cache });
const subscriptionRepo = createSubscriptionRepo();
const tokenRepo = createTokenRepo();
const emailService = createEmailService();
const tokenService = createTokenService({ config: config.tokenService, tokenRepo });
const ghClient = createGithubClient(config.githubClient);
const cachedGhClient = createCachedGithubClient({
  config: config.githubClient,
  base: ghClient,
  cache,
  logger,
});
const subscriptionService = createSubscriptionService({
  logger,
  repositoryRepo,
  subscriptionRepo,
  tokenService,
  githubClient: cachedGhClient,
  enqueueConfirmationEmail,
});
const subsController = createSubscriptionController(subscriptionService);

const startScannerLoop = createScannerLoop({
  config: config.scanner,
  logger,
  repositoryRepo,
  githubClient: cachedGhClient,
  enqueueRepoSubscriptions,
});

const createWorkers = () => ({
  confirmEmails: Array.from({ length: 1 }, () =>
    createConfirmationEmailsWorker({
      config: config.queues.confirmationEmails.worker,
      logger,
      emailService,
    }),
  ),
  releaseEmails: Array.from({ length: 1 }, () =>
    createReleaseNotificationsWorker({
      config: config.queues.releaseNotifications.worker,
      logger,
      emailService,
      repositoryRepo,
    }),
  ),
  repoSubs: Array.from({ length: 1 }, () =>
    createRepoSubscriptionsWorker({
      config: config.queues.repoSubscriptions.worker,
      jobConfig: config.queues.repoSubscriptions.job,
      logger,
      repositoryRepo,
      subscriptionRepo,
      enqueueReleaseEmail,
    }),
  ),
});

const app = Fastify({
  logger,
});

app.get('/', function handler() {
  return { hello: 'world' };
});

app.register(subsController, { prefix: '/api' });

async function bootstrap() {
  await startScannerLoop();

  createWorkers();

  await app.listen({
    host: env.NODE_ENV === 'dev' ? '127.0.0.1' : '0.0.0.0',
    port: 3000,
  });
}

bootstrap().catch((err: unknown) => {
  logger.error(err, 'Bootstrap fail');
  process.exit(1);
});
