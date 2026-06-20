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

function createServerMetrics(registry: MetricsRegistry, prefix = 'http') {
  const requestsTotal = new Counter({
    name: `${prefix}_requests_total`,
    help: 'Total number of requests',
    labelNames: ['method', 'path', 'status'],
    registers: [registry],
  });

  const requestsDuration = new Histogram({
    name: `${prefix}_request_duration_seconds`,
    help: 'Request duration',
    labelNames: ['method', 'path'],
    registers: [registry],
  });

  return {
    requestsTotal,
    requestsDuration,
  };
}

function createScannerMetrics(registry: MetricsRegistry, prefix = 'scanner') {
  const totalCycles = new Counter({
    name: `${prefix}_scan_cycles_total`,
    help: 'Total number of scan cycles',
    registers: [registry],
  });

  const totalReposProcessed = new Counter({
    name: `${prefix}_repos_processed_total`,
    help: 'Total repos processed',
    labelNames: ['status'],
    registers: [registry],
  });

  const totalGithubFailures = new Counter({
    name: `${prefix}_github_failures_total`,
    help: 'Total Github failures',
    registers: [registry],
  });

  const totalNewReleases = new Counter({
    name: `${prefix}_new_releases_total`,
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
