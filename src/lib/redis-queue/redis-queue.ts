import type { Processor } from 'bullmq';
import { Queue, Worker } from 'bullmq';

import type { QueueWorkerConfig } from '@/config/config.js';
import type { Logger } from '@/logger/logger.js';
import type { QueueMetrics } from '@/metrics/metrics.js';
import type { Redis } from '@/redis/redis.js';
import { defineModule } from '@/lib/runtime/runtime.js';

export type DefineQueueDeps = {
  config: QueueWorkerConfig;
  logger: Logger;
  metrics: QueueMetrics;
  redis: Redis;
};

export function defineQueue<JobPayload>(
  name: string,
  { config: conf, logger, metrics, redis }: DefineQueueDeps,
) {
  function createQueue() {
    const config = conf.queue;
    const queueLogger = logger.child({ module: `${name}.queue` });

    const queue = new Queue(name, {
      connection: redis,
      defaultJobOptions: {
        removeOnComplete: { count: config.keepCompletedCount },
        removeOnFail: { count: config.keepFailedCount },
      },
    });

    async function enqueueJob(payload: JobPayload) {
      await queue.add(name, payload, {
        attempts: config.attempts,
        backoff: { type: 'exponential', delay: config.expBackoffDelay },
      });
    }

    let interval: NodeJS.Timeout;

    const module = defineModule(`${name}.queue`, {
      start() {
        interval = setInterval(() => {
          queue
            .getJobCounts()
            .then((counts) => {
              for (const [state, count] of Object.entries(counts)) {
                metrics.queueJobs.set({ queue: name, state }, count);
              }
            })
            .catch((err: unknown) => {
              queueLogger.error({ err, queueName: name }, 'Queue getJobCounts error');
            });
        }, config.metricsIntervalMs);
      },
      stop() {
        clearInterval(interval);
      },
    });

    return { module, enqueueJob };
  }

  function createWorker(createProcessor: (log: Logger, skip: () => void) => Processor<JobPayload>) {
    const config = conf.worker;
    const workerLogger = logger.child({ module: `${name}.worker` });

    const onSkip = () => {
      metrics.jobsProcessed.inc({ queue: name, status: 'skipped' });
    };

    const processor = createProcessor(workerLogger, onSkip);

    const processWithMetrics: Processor<JobPayload> = async (job) => {
      const stopTimer = metrics.jobDuration.startTimer({
        queue: name,
      });

      try {
        await processor(job);

        metrics.jobsProcessed.inc({
          queue: name,
          status: 'success',
        });
      } catch (err) {
        metrics.jobsProcessed.inc({
          queue: name,
          status: 'failed',
        });

        throw err;
      } finally {
        stopTimer();
      }
    };

    let worker: Worker<JobPayload>;

    return defineModule(`${name}.worker`, {
      start({ fail }) {
        worker = new Worker<JobPayload>(name, processWithMetrics, {
          connection: redis,
          concurrency: config.concurrency,
          limiter: {
            max: config.limiterMax,
            duration: config.limiterDuration,
          },
        });

        worker.on('failed', (job, error) => {
          const jobId = job?.id ?? 'unknown';
          workerLogger.error({ error }, `Job ${jobId} failed`);
        });

        worker.on('error', (error) => {
          workerLogger.error({ error }, 'Worker error, force-closing');
          fail(error);
        });

        workerLogger.info('Worker started');
      },

      async stop() {
        return worker.close();
      },
    });
  }

  return { createQueue, createWorker };
}
