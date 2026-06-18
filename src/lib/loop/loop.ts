import type { Result, ResultAsync } from 'neverthrow';

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
};

type LoopMetrics = {
  isRunning: boolean;
  consecutiveErrors: number;
  totalIterations: number;
  failures: number;
  startedAt: Date | null;
  stoppedAt: Date | null;
};

type LoopState = ReturnType<typeof newLoopState>;

function newLoopState() {
  return {
    promise: newPromise(),
    controller: new AbortController(),
    startedAt: null as Date | null,
    stoppedAt: null as Date | null,
    consecutiveErrors: 0,
    totalIterations: 0,
    failures: 0,
  };
}

function newPromise<T = void>() {
  return Promise.withResolvers<T>();
}

function isRunning(s: LoopState) {
  return !!s.startedAt && !s.controller.signal.aborted;
}

export function createLoop<V, E>({
  log,
  run,
  getNextDelayMs,
  onStart,
  getFirstRunDelayMs,
}: LoopOptions<V, E>) {
  async function initLoop(s: LoopState) {
    if (getFirstRunDelayMs) {
      const delayMs = getFirstRunDelayMs();
      log.info({ delayMs }, 'First run scheduled');
      await sleep(delayMs, s.controller.signal);
    }

    while (isRunning(s)) {
      const runResult = await run(s.controller.signal);

      if (runResult.isOk()) {
        s.consecutiveErrors = 0;
      } else {
        s.consecutiveErrors++;
        s.failures++;
      }
      s.totalIterations++;

      const delayMs = getNextDelayMs({
        runResult,
        consecutiveErrors: s.consecutiveErrors,
        iteration: s.totalIterations,
      });

      if (!isRunning(s)) break;

      log.info({ delayMs }, 'Next iteration scheduled');
      await sleep(delayMs, s.controller.signal);
    }
  }

  function start() {
    const state = newLoopState();

    state.startedAt = new Date();
    initLoop(state)
      .then(() => {
        log.info(`Loop stopped`);
        state.stoppedAt = new Date();
        state.promise.resolve();
      })
      .catch((error: unknown) => {
        log.error({ error }, 'Loop error');
        state.stoppedAt = new Date();
        state.promise.reject(error);
      });

    function stop() {
      log.info('Stopping loop');
      state.controller.abort();
      return state.promise.promise;
    }

    function getMetrics(): LoopMetrics {
      return {
        isRunning: isRunning(state),
        startedAt: state.startedAt,
        stoppedAt: state.stoppedAt,
        totalIterations: state.totalIterations,
        consecutiveErrors: state.consecutiveErrors,
        failures: state.failures,
      };
    }

    onStart?.();

    return { promise: state.promise.promise, stop, getMetrics };
  }

  return { start };
}
