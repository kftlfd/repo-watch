import type { FastifyPluginCallback } from 'fastify';
import Fastify from 'fastify';

import type { Logger } from '@/logger/logger.js';

type Deps = {
  logger: Logger;
  subscriptionController: FastifyPluginCallback;
};

export function createFastifyServer({ logger, subscriptionController }: Deps) {
  const app = Fastify({
    loggerInstance: logger,
  });

  app.get('/', function handler() {
    return { hello: 'world' };
  });

  app.register(subscriptionController, { prefix: '/api' });

  return app;
}
