import type { Logger } from '@/logger/logger.js';
import { newPromise, withTimeout } from '@/utils/promises.js';

export type Module = {
  readonly name: string;

  /**
   * Acquires resources and starts execution.
   * Resolves only when is ready for use.
   */
  start(): Promise<LifecycleHandle>;
};

export type LifecycleHandle = {
  /**
   * For detecting failures or unexpected exits
   * */
  readonly exited: Promise<void>;

  /**
   * Shutdown and cleanup
   */
  stop(): Promise<void>;
};

type RuntimeState = 'starting' | 'running' | 'shutting-down';

type RuntimeStatus = {
  getState(): RuntimeState;
  setState(state: RuntimeState): void;
};

export function createRuntimeStatus(): RuntimeStatus {
  let state: RuntimeState = 'starting';

  return {
    getState: () => state,
    setState: (next) => {
      state = next;
    },
  };
}

export function createShutdownController({
  logger,
  shutdown,
  timeoutMs,
}: {
  logger: Logger;
  shutdown: () => Promise<void>;
  timeoutMs: number;
}) {
  let isShuttingDown = false;
  const { promise: done, resolve, reject } = newPromise();

  function trigger(reason: string, err?: Error) {
    if (isShuttingDown) return;

    isShuttingDown = true;
    logger.info({ reason }, 'Shutting down');

    const timeoutError = err
      ? new Error('shutdown timeout', { cause: err })
      : new Error('shutdown timeout');

    withTimeout(shutdown(), timeoutMs, timeoutError)
      .then(() => {
        if (err) reject(err);
        else resolve();
      })
      .catch((shutdownErr: unknown) => {
        reject(shutdownErr);
      });
  }

  return { done, trigger };
}

export function createRuntime({
  logger,
  modules,
  runtimeStatus,
}: {
  logger: Logger;
  modules: Module[];
  runtimeStatus: RuntimeStatus;
}) {
  const active: { name: string; handle: LifecycleHandle }[] = [];

  async function start() {
    logger.info('Starting modules');

    for (const m of modules) {
      logger.info(`Starting: ${m.name}`);
      const handle = await m.start();
      active.push({ name: m.name, handle });
    }

    runtimeStatus.setState('running');
    logger.info('All modules started successfully');
  }

  function waitForExit() {
    if (active.length < 1) {
      return Promise.reject(new Error('no modules to wait for'));
    }
    return Promise.race(
      active.map((m) =>
        m.handle.exited
          .then(() => ({ name: m.name, status: 'finished' as const }))
          .catch((error: unknown) => ({ name: m.name, status: 'failed' as const, error })),
      ),
    );
  }

  async function stop() {
    runtimeStatus.setState('shutting-down');
    const errors: unknown[] = [];

    for (const m of active.toReversed()) {
      try {
        await m.handle.stop();
      } catch (err: unknown) {
        errors.push(err);
      }
    }

    if (errors.length > 0) {
      throw new AggregateError(errors, 'runtime stop error');
    }
  }

  return { start, waitForExit, stop };
}
