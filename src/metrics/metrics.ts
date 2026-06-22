import { collectDefaultMetrics, Counter, Gauge, Histogram, Registry } from 'prom-client';

import { env } from '@/config/env.js';

export type MetricsRegistry = Registry;

export type MetricsService = ReturnType<typeof createMetrics>;
export type ServerMetrics = MetricsService['server'];
export type SubscriptionsMetrics = MetricsService['subscriptions'];
export type ScannerMetrics = MetricsService['scanner'];
export type QueueMetrics = MetricsService['queue'];
export type EmailsMetrics = MetricsService['emails'];

export function createMetrics() {
  const registry = new Registry();

  registry.setDefaultLabels({
    service: 'repo-watch',
    env: env.NODE_ENV,
  });

  collectDefaultMetrics({ register: registry });

  return {
    registry,
    server: createServerMetrics(registry),
    subscriptions: createSubsriptionsMetrics(registry),
    scanner: createScannerMetrics(registry),
    queue: createQueueMetrics(registry),
    emails: createEmailMetrics(registry),
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

function createSubsriptionsMetrics(registry: MetricsRegistry, prefix = 'subscriptions') {
  const subscriptionsTotal = new Counter({
    name: prefix,
    help: 'Subscriptions total by action',
    labelNames: ['action'],
    registers: [registry],
  });

  function recordAction(action: 'sub' | 'confirm-sub' | 'unsub') {
    subscriptionsTotal.inc({ action });
  }

  return { recordAction };
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

function createQueueMetrics(registry: MetricsRegistry, prefix = 'queue') {
  const queueJobs = new Gauge({
    name: `${prefix}_jobs`,
    help: 'Jobs by state',
    labelNames: ['queue', 'state'],
    registers: [registry],
  });

  const jobsProcessed = new Counter({
    name: `${prefix}_job_processed_total`,
    help: 'Jobs processed',
    labelNames: ['queue', 'status'],
    registers: [registry],
  });

  const jobDuration = new Histogram({
    name: `${prefix}_job_duration_seconds`,
    help: 'Job duration',
    labelNames: ['queue'],
    registers: [registry],
  });

  return { queueJobs, jobsProcessed, jobDuration };
}

function createEmailMetrics(registry: MetricsRegistry, prefix = 'emails') {
  const emailsTotal = new Counter({
    name: `${prefix}_total`,
    help: 'Total emails sent',
    labelNames: ['status'],
    registers: [registry],
  });

  return { emailsTotal };
}
