import type { FastifyPluginCallback } from 'fastify';
import formbody from '@fastify/formbody';
import Fastify from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';

import type { Logger } from '@/logger/logger.js';

type Deps = {
  logger: Logger;
  subscriptionApi: FastifyPluginCallback;
  subscriptionWeb: FastifyPluginCallback;
};

export function createFastifyServer({ logger, subscriptionApi, subscriptionWeb }: Deps) {
  const app = Fastify({
    loggerInstance: logger,
  });

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  app.register(formbody);

  app.register(subscriptionApi, { prefix: '/api' });
  app.register(subscriptionWeb);

  return app;
}
