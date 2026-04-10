import Fastify from 'fastify';

import { createRedisCache } from '@/cache/redisCache.js';
import { env } from '@/config/env.js';
import { createEmailService } from '@/email/email.service.js';
import { createCachedGithubClient } from '@/github/github.cached.js';
import { createGithubClient } from '@/github/github.client.js';
import { createConfirmationEmailsWorker } from '@/queue/confirmation-emails/confirmation-emails.worker.js';
import { enqueueReleaseEmail } from '@/queue/release-notifications/release-notifications.queue.js';
import { createReleaseNotificationsWorker } from '@/queue/release-notifications/release-notifications.worker.js';
import { createRepoSubscriptionsWorker } from '@/queue/repo-subscriptions/repo-subscriptions.worker.js';
import { redis } from '@/redis/redis.js';
import { createRepositoryRepo } from '@/repository/repository.repo.js';
import { createScannerLoop } from '@/scanner/scanner.service.js';
import { createSubscriptionController } from '@/subscription/subscription.controller.js';
import { createSubscriptionRepo } from '@/subscription/subscription.repo.js';
import { createSubscriptionService } from '@/subscription/subscription.service.js';
import { createTokenRepo } from '@/token/token.repo.js';
import { createTokenService } from '@/token/token.service.js';

const cache = createRedisCache(redis);
const repoRepo = createRepositoryRepo();
const subsRepo = createSubscriptionRepo();
const tokenRepo = createTokenRepo();
const emailService = createEmailService();
const tokenService = createTokenService(tokenRepo);
const ghClient = createGithubClient();
const cachedGhClient = createCachedGithubClient(ghClient, cache);
const subsService = createSubscriptionService(repoRepo, subsRepo, tokenService, cachedGhClient);
const subsController = createSubscriptionController(subsService);

const startScannerLoop = createScannerLoop(repoRepo, cachedGhClient);
startScannerLoop().catch((err: unknown) => {
  console.error('Scanner loop error', err);
});

const createWorkers = () => ({
  confirmEmails: Array.from({ length: 1 }, () => createConfirmationEmailsWorker({ emailService })),
  releaseEmails: Array.from({ length: 1 }, () =>
    createReleaseNotificationsWorker({ emailService, repositoryRepo: repoRepo }),
  ),
  repoSubs: Array.from({ length: 1 }, () =>
    createRepoSubscriptionsWorker({
      repositoryRepo: repoRepo,
      subscriptionRepo: subsRepo,
      enqueueReleaseEmail,
    }),
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
