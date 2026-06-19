import type { RuntimeConfig } from '@/config/config.js';
import type { Logger } from '@/logger/logger.js';
import { newPromise, withTimeout } from '@/utils/promises.js';

type Module = {
  readonly name: string;

  /**
   * Acquires resources and starts execution.
   * Resolves only when is ready for use.
   */
  start(): Promise<LifecycleHandle>;
};

type LifecycleHandle = {
  /**
   * For detecting failures or unexpected exits
   * */
  readonly exited: Promise<void>;

  /**
   * Shutdown and cleanup
   */
  stop(): Promise<void>;
};

type ModuleTaskArgs = {
  exit: () => void;
  fail: (error: unknown) => void;
  watch: (promise: Promise<unknown>) => void;
};

type DefineModuleOptions = {
  start?: (args: ModuleTaskArgs) => void | Promise<void>;
  stop?: () => void | Promise<void>;
};

export function defineModule(name: string, opts: DefineModuleOptions) {
  const module: Module = {
    name,
    async start() {
      const exited = newPromise();

      function exit() {
        exited.resolve();
      }

      function fail(error: unknown) {
        exited.reject(error);
      }

      function watch(promise: Promise<unknown>) {
        promise.then(exit, fail);
      }

      await opts.start?.({ exit, fail, watch });

      return {
        exited: exited.promise,

        async stop() {
          const errors: unknown[] = [];

          try {
            await opts.stop?.();
          } catch (err) {
            errors.push(err);
          }

          exited.resolve();
          try {
            await exited.promise;
          } catch (err) {
            errors.push(err);
          }

          if (errors.length > 0) {
            throw new AggregateError(errors, `module stop: ${name}`);
          }
        },
      };
    },
  };

  return module;
}

type RuntimeState = 'starting' | 'running' | 'shutting-down' | 'stopped';

type RuntimeStatusController = {
  getState(): RuntimeState;
  setState(state: RuntimeState): void;
};

type RuntimeStatus = {
  getState(): RuntimeState;
};

export function createRuntimeStatus() {
  let state: RuntimeState = 'starting';

  const status: RuntimeStatus = {
    getState: () => state,
  };

  const controller: RuntimeStatusController = {
    getState: () => state,
    setState: (next) => {
      state = next;
    },
  };

  return { status, controller };
}

export function createRuntime({
  config,
  logger,
  modules,
  runtimeStatus,
}: {
  config: RuntimeConfig;
  logger: Logger;
  modules: Module[];
  runtimeStatus: RuntimeStatusController;
}) {
  const active: { name: string; handle: LifecycleHandle }[] = [];
  const startupSettled = newPromise();
  const shutdownPromise = newPromise();
  let isShuttingDown = false;

  async function startModules() {
    try {
      logger.info('Starting modules');

      for (const m of modules) {
        logger.info(`Starting: ${m.name}`);
        const handle = await m.start();
        active.push({ name: m.name, handle });
      }

      runtimeStatus.setState('running');
      logger.info('All modules started successfully');
    } finally {
      startupSettled.resolve();
    }
  }

  function waitForExit() {
    return Promise.race(
      active.map((m) =>
        m.handle.exited
          .then(() => ({ name: m.name, status: 'finished' as const }))
          .catch((error: unknown) => ({ name: m.name, status: 'failed' as const, error })),
      ),
    );
  }

  async function stop() {
    await startupSettled.promise;

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
      throw new AggregateError(errors, 'runtime stop errors');
    }
  }

  /**
   * Starts and watches modules. Resolves when shutdown completes.
   */
  async function run() {
    if (modules.length < 1) {
      throw new Error('no modules to run');
    }

    try {
      await startModules();
    } catch (err) {
      shutdown('start error', new Error('start error', { cause: err }));
      return shutdownPromise.promise;
    }

    const m = await waitForExit();
    if (m.status === 'finished') {
      shutdown(`module exited: ${m.name}`, new Error(`module exited unexpectedly: ${m.name}`));
    } else {
      shutdown(
        `module failed: ${m.name}`,
        new Error(`module failed: ${m.name}`, { cause: m.error }),
      );
    }

    return shutdownPromise.promise;
  }

  /**
   * Trigger shutdown only once, subsequent calls are ignored.
   */
  function shutdown(reason: string, err?: Error) {
    if (isShuttingDown) return;

    isShuttingDown = true;
    if (err) {
      logger.error({ reason, error: err }, 'Shutting down because of error');
    } else {
      logger.info({ reason }, 'Shutting down');
    }

    const timeoutError = new Error('shutdown timeout');

    withTimeout(stop(), config.shutdownTimeoutMs, timeoutError)
      .then(() => {
        if (err) shutdownPromise.reject(shutdownError([], err));
        else shutdownPromise.resolve();
      })
      .catch((shutdownErr: unknown) => {
        shutdownPromise.reject(shutdownError([shutdownErr], err));
      })
      .finally(() => {
        runtimeStatus.setState('stopped');
      });
  }

  return { run, shutdown };
}

function shutdownError(errs: unknown[], cause?: unknown) {
  return new AggregateError(errs, 'shutdown error', { cause });
}
