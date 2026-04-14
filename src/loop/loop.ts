import type { Result } from 'neverthrow';
import { ResultAsync } from 'neverthrow';

import type { Logger } from '@/logger/logger.js';
import { sleep } from '@/utils/sleep.js';

export type LoopOptions<V, E> = {
  log: Logger;

  run: (signal: AbortSignal) => ResultAsync<V, E>;

  getNextDelayMs: (ctx: {
    runResult: Result<V, E>;
    consecutiveErrors: number;
    iteration: number;
  }) => number;

  onStart?: () => void;
  getFirstRunDelayMs?: () => number;

  /**
   * On run throw continue loop after delay or stop the loop if null
   *
   * Default: `null`
   * */
  afterCrashDelayMs?: number | null;
};

type LoopMetrics = {
  isRunning: boolean;
  consecutiveErrors: number;
  totalIterations: number;
  failures: number;
  crashes: number;
  startedAt: Date | null;
  stoppedAt: Date | null;
};

type LoopLifecycle = {
  start: () => Promise<void>;
  stop: () => Promise<void>;
  getMetrics: () => LoopMetrics;
};

export function createLoop<V, E>({
  log,
  run,
  getNextDelayMs,
  onStart,
  getFirstRunDelayMs,
  afterCrashDelayMs = null,
}: LoopOptions<V, E>): LoopLifecycle {
  const metrics: Omit<LoopMetrics, 'isRunning'> = {
    consecutiveErrors: 0,
    totalIterations: 0,
    failures: 0,
    crashes: 0,
    startedAt: null,
    stoppedAt: null,
  };

  let stopPromise = promiseWithResolvers();

  let controller = new AbortController();

  function isRunning() {
    return !!metrics.startedAt && !controller.signal.aborted;
  }

  async function initLoop() {
    metrics.startedAt = new Date();
    metrics.stoppedAt = null;

    if (getFirstRunDelayMs) {
      const delayMs = getFirstRunDelayMs();
      log.info({ delayMs }, 'First run scheduled');
      await sleep(delayMs, controller.signal);
    }

    while (isRunning()) {
      const runAttempt = await ResultAsync.fromPromise(
        run(controller.signal),
        () => 'RUN_CRASH' as const,
      );

      if (runAttempt.isErr()) {
        metrics.consecutiveErrors++;
        metrics.crashes++;
        metrics.totalIterations++;

        if (afterCrashDelayMs === null) {
          log.warn({ afterCrashDelayMs }, `Run crashed, stopping...`);
          controller.abort();
          break;
        }

        log.warn({ afterCrashDelayMs }, `Run crashed, retrying...`);
        await sleep(afterCrashDelayMs, controller.signal);
        continue;
      }

      const runResult = runAttempt.value;

      if (runResult.isOk()) {
        metrics.consecutiveErrors = 0;
      } else {
        metrics.consecutiveErrors++;
        metrics.failures++;
      }
      metrics.totalIterations++;

      const delayMs = getNextDelayMs({
        runResult,
        consecutiveErrors: metrics.consecutiveErrors,
        iteration: metrics.totalIterations,
      });

      if (!isRunning()) break;

      log.info({ delayMs }, 'Next iteration scheduled');
      await sleep(delayMs, controller.signal);
    }

    log.info(`Stopped`);
    metrics.stoppedAt = new Date();
    stopPromise.resolve();
  }

  async function start() {
    if (isRunning()) {
      log.warn('[start] Already running');
      return;
    }
    stopPromise = promiseWithResolvers();
    controller = new AbortController();
    onStart?.();
    log.info('Starting loop...');
    return initLoop();
  }

  async function stop() {
    if (!isRunning()) {
      log.warn('[stop] Not running');
      return;
    }
    controller.abort();
    log.info('Stopping loop...');
    return stopPromise.promise;
  }

  function getMetrics() {
    return { ...metrics, isRunning: isRunning() };
  }

  return { start, stop, getMetrics };
}

function promiseWithResolvers() {
  let resolve: () => void = () => {};
  let reject: (reason?: unknown) => void = () => {};
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}
