import 'dotenv/config';

import { createApp } from '@/app.js';
import { createConfig } from '@/config/config.js';
import { createRuntime, createRuntimeStatus } from '@/lib/runtime/runtime.js';
import { createLogger } from '@/logger/logger.js';

async function main() {
  const config = createConfig();

  const logger = createLogger();

  const runtimeStatus = createRuntimeStatus();

  const modules = createApp({ config, logger });

  const runtime = createRuntime({
    config: config.runtime,
    logger,
    modules,
    runtimeStatus: runtimeStatus.controller,
  });

  process.on('SIGINT', (signal) => {
    runtime.shutdown(signal);
  });
  process.on('SIGTERM', (signal) => {
    runtime.shutdown(signal);
  });
  process.on('uncaughtException', (err) => {
    runtime.shutdown('unhandled exception', err);
  });
  process.on('unhandledRejection', (err) => {
    runtime.shutdown(
      'unhandled promise rejection',
      new Error('unhandled promise rejection', { cause: err }),
    );
  });

  const errors: unknown[] = [];

  await runtime
    .run()
    .then(() => {
      logger.info('Shutdown complete');
    })
    .catch((error: unknown) => {
      logger.error({ error }, 'Runtime error');
      errors.push(error);
    });

  if (errors.length > 0) {
    throw new AggregateError(errors, 'exited with errors');
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
