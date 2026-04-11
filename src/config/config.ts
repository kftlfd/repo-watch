import { env } from './env.js';

export type MigrationConfig = {
  maxAttempts: number;
  retryDelayMs: number;
};

export type GithubClientConfig = {
  baseUrl: string;
  authToken?: string;
  cacheTtlSeconds: number;
  timeoutMs: number;
};

export type RepositoryRepoConfig = {
  tagCacheTtlSeconds: number;
};

export type ScannerConfig = {
  scanIntervalMs: number;
  batchSize: number;
  pollDelayMs: number;
  initialRetryDelay: number;
  baseErrorDelayMs: number;
  maxBackoffDelayMs: number;
};

export type TokenServiceConfig = {
  tokenExpiryHours: number;
};

export type QueueConfig = {
  attempts: number;
  expBackoffDelay: number;
};

export type WorkerConfig = {
  concurrency: number;
  limiterMax: number;
  limiterDuration: number;
};

type QueueWorkerConfig = {
  queue: QueueConfig;
  worker: WorkerConfig;
};

type QueueWorkerJobConfig<JobConfig> = QueueWorkerConfig & {
  job: JobConfig;
};

export type RepoSubJobConfig = {
  batchSize: number;
  pollDelayMs: number;
};

export type Config = {
  migrations: MigrationConfig;
  githubClient: GithubClientConfig;
  repositoryRepo: RepositoryRepoConfig;
  scanner: ScannerConfig;
  tokenService: TokenServiceConfig;
  queues: {
    confirmationEmails: QueueWorkerConfig;
    releaseNotifications: QueueWorkerConfig;
    repoSubscriptions: QueueWorkerJobConfig<RepoSubJobConfig>;
  };
};

const hasGithubToken = !!env.GITHUB_TOKEN;

export const config: Config = {
  migrations: {
    maxAttempts: 5,
    retryDelayMs: 2_000,
  },
  githubClient: {
    baseUrl: 'https://api.github.com',
    authToken: env.GITHUB_TOKEN,
    cacheTtlSeconds: hasGithubToken ? 10 * 60 : 60 * 60,
    timeoutMs: 30_000,
  },
  repositoryRepo: {
    tagCacheTtlSeconds: 60 * 60,
  },
  scanner: {
    scanIntervalMs: hasGithubToken ? 10 * 60_000 : 60 * 60_000,
    batchSize: 10,
    pollDelayMs: 1_000,
    initialRetryDelay: 5_000,
    baseErrorDelayMs: 5_000,
    maxBackoffDelayMs: 30 * 60_000,
  },
  tokenService: {
    tokenExpiryHours: 24,
  },
  queues: {
    confirmationEmails: {
      queue: { attempts: 3, expBackoffDelay: 1_000 },
      worker: { concurrency: 1, limiterMax: 1, limiterDuration: 1_000 },
    },
    releaseNotifications: {
      queue: { attempts: 2, expBackoffDelay: 1_000 },
      worker: { concurrency: 1, limiterMax: 1, limiterDuration: 1_000 },
    },
    repoSubscriptions: {
      queue: { attempts: 2, expBackoffDelay: 1_000 },
      worker: { concurrency: 1, limiterMax: 1, limiterDuration: 1_000 },
      job: { batchSize: 20, pollDelayMs: 200 },
    },
  },
};
