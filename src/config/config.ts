export type GithubClientConfig = {
  baseUrl: string;
  cacheTtlSeconds: number;
};

export type RepositoryRepoConfig = {
  tagCacheTtlSeconds: number;
};

export type ScannerConfig = {
  scanIntervalMs: number;
  batchSize: number;
  pollDelayMs: number;
  initialRetryDelay: number;
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

export const config: Config = {
  githubClient: {
    baseUrl: 'https://api.github.com',
    cacheTtlSeconds: 600,
  },
  repositoryRepo: {
    tagCacheTtlSeconds: 10 * 60,
  },
  scanner: {
    scanIntervalMs: 10 * 60 * 1000,
    batchSize: 20,
    pollDelayMs: 200,
    initialRetryDelay: 1000,
  },
  tokenService: {
    tokenExpiryHours: 24,
  },
  queues: {
    confirmationEmails: {
      queue: { attempts: 3, expBackoffDelay: 1000 },
      worker: { concurrency: 1, limiterMax: 1, limiterDuration: 1000 },
    },
    releaseNotifications: {
      queue: { attempts: 2, expBackoffDelay: 1000 },
      worker: { concurrency: 1, limiterMax: 1, limiterDuration: 1000 },
    },
    repoSubscriptions: {
      queue: { attempts: 2, expBackoffDelay: 1000 },
      worker: { concurrency: 1, limiterMax: 1, limiterDuration: 1000 },
      job: { batchSize: 20, pollDelayMs: 200 },
    },
  },
};
