import 'dotenv/config';

import { createApp } from '@/app.js';
import { createConfig } from '@/config/config.js';
import {
  createRuntime,
  createRuntimeStatus,
  createShutdownController,
} from '@/lib/runtime/runtime.js';
import { createLogger } from '@/logger/logger.js';
import { withTimeout } from '@/utils/promises.js';

async function main() {
  const config = createConfig();

  const logger = createLogger();

  const runtimeStatus = createRuntimeStatus();

  const modules = createApp({ config, logger });

  const runtime = createRuntime({ logger, modules, runtimeStatus });

  const shutdown = createShutdownController({
    logger,
    shutdown: runtime.stop,
    timeoutMs: config.runtime.shutdownTimeoutMs,
  });

  const finished = runtime
    .start()
    .then(() => runtime.waitForExit())
    .then((m) => {
      if (m.status === 'finished') {
        shutdown.trigger(`module exited: ${m.name}`, new Error('module exited unexpectedly'));
      } else {
        shutdown.trigger(
          `module failed: ${m.name}`,
          new Error('module failed', { cause: m.error }),
        );
      }
    })
    .catch((err: unknown) => {
      shutdown.trigger('runtime error', new Error('runtime error', { cause: err }));
    });

  process.on('SIGINT', (signal) => {
    shutdown.trigger(signal);
  });
  process.on('SIGTERM', (signal) => {
    shutdown.trigger(signal);
  });
  process.on('uncaughtException', (err) => {
    shutdown.trigger('unhandled exception', err);
  });
  process.on('unhandledRejection', (err) => {
    shutdown.trigger(
      'unhandled promise rejection',
      new Error('unhandled promise rejection', { cause: err }),
    );
  });

  const errors: unknown[] = [];

  await shutdown.done
    .then(() => {
      logger.info('Shutdown complete');
    })
    .catch((error: unknown) => {
      logger.error(
        { error, msg: error instanceof Error ? error.message : 'err' },
        'Shutdown with error',
      );
      errors.push(error);
    });

  await withTimeout(
    finished,
    config.runtime.shutdownTimeoutMs,
    new Error('timeout awaiting tasks finish'),
  ).catch((error: unknown) => {
    logger.error({ error }, 'Error awaiting tasks finish');
    errors.push(error);
  });

  if (errors.length > 0) {
    throw new AggregateError(errors, 'exited with errors');
  }
}

main().catch((err: unknown) => {
  console.error('main error:', err);
  process.exit(1);
});
