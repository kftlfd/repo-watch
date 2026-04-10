import Fastify from 'fastify';

import { createRedisCache } from '@/cache/redisCache.js';
import { config } from '@/config/config.js';
import { env } from '@/config/env.js';
import { createEmailService } from '@/email/email.service.js';
import { createCachedGithubClient } from '@/github/github.cached.js';
import { createGithubClient } from '@/github/github.client.js';
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

const enqueueConfirmationEmail = createEnqueueConfirmationEmaiFn(
  config.queues.confirmationEmails.queue,
);
const enqueueReleaseEmail = createEnqueueReleaseEmail(config.queues.releaseNotifications.queue);
const enqueueRepoSubscriptions = createEnqueueRepoSubscriptions(
  config.queues.repoSubscriptions.queue,
);
const cache = createRedisCache(redis);
const repositoryRepo = createRepositoryRepo();
const subscriptionRepo = createSubscriptionRepo();
const tokenRepo = createTokenRepo();
const emailService = createEmailService();
const tokenService = createTokenService({ config: config.tokenService, tokenRepo });
const ghClient = createGithubClient(config.githubClient);
const cachedGhClient = createCachedGithubClient({
  config: config.githubClient,
  base: ghClient,
  cache,
});
const subscriptionService = createSubscriptionService({
  repositoryRepo,
  subscriptionRepo,
  tokenService,
  githubClient: cachedGhClient,
  enqueueConfirmationEmail,
});
const subsController = createSubscriptionController(subscriptionService);

const startScannerLoop = createScannerLoop({
  config: config.scanner,
  repositoryRepo,
  githubClient: cachedGhClient,
  enqueueRepoSubscriptions,
});
startScannerLoop().catch((err: unknown) => {
  console.error('Scanner loop error', err);
});

const createWorkers = () => ({
  confirmEmails: Array.from({ length: 1 }, () =>
    createConfirmationEmailsWorker({ emailService }, config.queues.confirmationEmails.worker),
  ),
  releaseEmails: Array.from({ length: 1 }, () =>
    createReleaseNotificationsWorker(
      { emailService, repositoryRepo },
      config.queues.releaseNotifications.worker,
    ),
  ),
  repoSubs: Array.from({ length: 1 }, () =>
    createRepoSubscriptionsWorker(
      {
        config: config.queues.repoSubscriptions.job,
        repositoryRepo,
        subscriptionRepo,
        enqueueReleaseEmail,
      },
      config.queues.repoSubscriptions.worker,
    ),
  ),
});
createWorkers();

const app = Fastify({
  logger: true,
});

app.get('/', function handler() {
  return { hello: 'world' };
});

app.register(subsController, { prefix: '/api' });

app
  .listen({
    host: env.NODE_ENV === 'dev' ? '127.0.0.1' : '0.0.0.0',
    port: 3000,
  })
  .catch((err: unknown) => {
    app.log.error(err);
    process.exit(1);
  });
