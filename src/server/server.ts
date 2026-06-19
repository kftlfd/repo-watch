import type { FastifyPluginCallback } from 'fastify';
import formbody from '@fastify/formbody';
import fastifySwagger from '@fastify/swagger';
import scalarApiReference from '@scalar/fastify-api-reference';
import Fastify from 'fastify';
import {
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
} from 'fastify-type-provider-zod';

import type { ServerConfig } from '@/config/config.js';
import type { Logger } from '@/logger/logger.js';
import type { MetricsRegistry, ServerMetrics } from '@/metrics/metrics.js';
import { defineModule } from '@/lib/runtime/runtime.js';

const requestTimer = Symbol('request-timer');

type Deps = {
  config: ServerConfig;
  logger: Logger;
  metrics: ServerMetrics;
  metricsRegistry: MetricsRegistry;
  subscriptionApi: FastifyPluginCallback;
  subscriptionWeb: FastifyPluginCallback;
};

export function createFastifyServer({
  config,
  logger,
  metrics,
  metricsRegistry,
  subscriptionApi,
  subscriptionWeb,
}: Deps) {
  const app = Fastify({
    loggerInstance: logger,
  });

  app.addHook('onRequest', (req, reply, done) => {
    (req as typeof req & { [requestTimer]: () => number })[requestTimer] =
      metrics.requestsDuration.startTimer({
        method: req.method,
        path: req.routeOptions.url,
      });
    done();
  });

  app.addHook('onResponse', (req, reply, done) => {
    (req as typeof req & { [requestTimer]: () => number })[requestTimer]();
    metrics.requestsTotal.inc({
      method: req.method,
      path: req.routeOptions.url,
      status: reply.statusCode,
    });
    done();
  });

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  app.register(fastifySwagger, {
    openapi: {
      info: {
        title: 'GitHub Realease Notifications API',
        description: 'Subscribe to email notifications for new releases of GitHub reppo',
        version: '1.0.0',
      },
    },
    transform: jsonSchemaTransform,
  });

  app.register(scalarApiReference, {
    routePrefix: '/docs',
    configuration: {
      agent: { disabled: true },
      mcp: { disabled: true },
      hideClientButton: true,
      defaultOpenAllTags: true,
    },
  });

  app.get('/metrics', (_, reply) => {
    reply.header('content-type', metricsRegistry.contentType);
    return metricsRegistry.metrics();
  });

  app.register(formbody);

  app.register(subscriptionApi, { prefix: '/api' });
  app.register(subscriptionWeb);

  return defineModule('fastify-server', {
    async start() {
      await app.listen({ host: config.host, port: config.port });
      await app.ready();
    },
    async stop() {
      await app.close();
    },
  });
}
