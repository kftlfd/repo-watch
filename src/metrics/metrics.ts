import type { FastifyPluginCallback } from 'fastify';
import { collectDefaultMetrics, Counter, Histogram, Registry } from 'prom-client';

export type MetricsRegistry = Registry;

export type MetricsService = ReturnType<typeof createMetrics>;
export type ServerMetrics = MetricsService['server'];

export function createMetrics() {
  const registry = new Registry();

  collectDefaultMetrics({ register: registry });

  return { registry, server: createServerMetrics(registry) };
}

function createServerMetrics(registry: MetricsRegistry) {
  const requestsTotal = new Counter({
    name: 'http_requests_total',
    help: 'Total number of requests',
    labelNames: ['method', 'path', 'status'],
    registers: [registry],
  });

  const requestsDuration = new Histogram({
    name: 'http_request_duration_seconds',
    help: 'Request duration',
    labelNames: ['method', 'path'],
    registers: [registry],
  });

  const trackRequestMetrics: FastifyPluginCallback = (app) => {
    const requestTimer = Symbol('request-timer');

    app.addHook('onRequest', (req) => {
      (req as typeof req & { [requestTimer]: () => number })[requestTimer] =
        requestsDuration.startTimer({
          method: req.method,
          path: req.url,
        });
    });

    app.addHook('onResponse', (req, reply) => {
      (req as typeof req & { [requestTimer]: () => number })[requestTimer]();
      requestsTotal.inc({ method: req.method, path: req.url, status: reply.statusCode });
    });
  };

  return {
    trackRequestMetrics,
  };
}
