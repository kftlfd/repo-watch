import type { FastifyPluginCallback } from 'fastify';
import { collectDefaultMetrics, Counter, Histogram, Registry } from 'prom-client';

export type MetricsRegistry = Registry;

export type MetricsService = ReturnType<typeof createMetrics>;
export type ServerMetrics = MetricsService['server'];
export type ScannerMetrics = MetricsService['scanner'];

export function createMetrics() {
  const registry = new Registry();

  collectDefaultMetrics({ register: registry });

  return {
    registry,
    server: createServerMetrics(registry),
    scanner: createScannerMetrics(registry),
  };
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

function createScannerMetrics(registry: MetricsRegistry) {
  const totalCycles = new Counter({
    name: 'scanner_scan_cycles_total',
    help: 'Total number of scan cycles',
    registers: [registry],
  });

  const totalReposProcessed = new Counter({
    name: 'scanner_repos_processed_total',
    help: 'Total repos processed',
    registers: [registry],
  });

  const totalGithubFailures = new Counter({
    name: 'scanner_github_failures_total',
    help: 'Total Github failures',
    registers: [registry],
  });

  const totalNewReleases = new Counter({
    name: 'scanner_new_releases_total',
    help: 'Total new releases detected',
    registers: [registry],
  });

  return {
    totalCycles,
    totalReposProcessed,
    totalGithubFailures,
    totalNewReleases,
  };
}
