import type { FastifyInstance, FastifyPluginCallback } from 'fastify';
import Fastify from 'fastify';

import type { Logger } from '@/logger/logger.js';

type Deps = {
  logger: Logger;
  subscriptionController: FastifyPluginCallback;
};

export function createFastifyServer({ logger, subscriptionController }: Deps): FastifyInstance {
  const app = Fastify({
    logger,
  });

  app.get('/', function handler() {
    return { hello: 'world' };
  });

  app.register(subscriptionController, { prefix: '/api' });

  return app;
}
