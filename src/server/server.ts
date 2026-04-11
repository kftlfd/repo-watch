import type { FastifyPluginCallback } from 'fastify';
import formbody from '@fastify/formbody';
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

  // Register formbody plugin to support application/x-www-form-urlencoded
  // This allows the subscribe endpoint to accept both JSON and form data
  app.register(formbody);

  app.get('/', function handler() {
    return { hello: 'world' };
  });

  app.register(subscriptionController, { prefix: '/api' });

  return app;
}
