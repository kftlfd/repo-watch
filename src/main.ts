import 'dotenv/config';

import { createApp } from '@/app.js';
import { createConfig } from '@/config/config.js';
import { createRuntime, createRuntimeStatus } from '@/lib/runtime/runtime.js';
import { createLogger } from '@/logger/logger.js';

async function main() {
  const config = createConfig();

  const logger = createLogger();

  const runtimeStatus = createRuntimeStatus();

  const modules = createApp({ config, logger, runtimeStatus: runtimeStatus.status });

  const runtime = createRuntime({
    config: config.runtime,
    logger,
    modules,
    runtimeStatus: runtimeStatus.controller,
  });

  function signalHandler(signal: string) {
    runtime.shutdown(signal);
  }

  process.on('SIGINT', signalHandler);
  process.on('SIGTERM', signalHandler);

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

  let exitErr: Error | null = null;
  if (errors.length > 0) {
    exitErr = new AggregateError(errors, 'exited with errors');
    logger.error({ err: exitErr }, 'Exit errors');
  }

  await new Promise<void>((resolve, reject) => {
    logger.flush((err) => {
      if (err) reject(err);
      resolve();
    });
  });

  process.removeListener('SIGINT', signalHandler);
  process.removeListener('SIGTERM', signalHandler);

  if (exitErr) throw exitErr;
}

main().catch(() => {
  process.exit(1);
});
