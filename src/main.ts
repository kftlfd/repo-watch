import 'dotenv/config';

import { createApp } from '@/app.js';
import { config } from '@/config/config.js';
import { applyDBMigrations, closeDB } from '@/db/client.js';
import { closeRedis } from '@/redis/redis.js';

function bootstrap() {
  const { logger, app, scannerLoop, createWorkers } = createApp(config);

  let workers: ReturnType<typeof createWorkers> = [];

  async function start() {
    await applyDBMigrations(config.migrations, logger);

    workers = createWorkers();

    return Promise.all([
      scannerLoop.start(),

      app.listen({
        host: config.server.host,
        port: config.server.port,
      }),
    ]);
  }

  function setupShutdown() {
    let shuttingDown = false;

    function shutdownHandler(signal: string) {
      if (shuttingDown) return;
      shuttingDown = true;
      shutdown(signal).catch((error: unknown) => {
        logger.error({ error }, 'Shutdown error');
        process.exit(1);
      });
    }

    async function shutdown(signal: string) {
      console.log(`Shutting down (${signal})...`);
      await scannerLoop.stop();
      await Promise.all(workers.map((worker) => worker.close()));
      await app.close();
      await closeRedis();
      await closeDB();
      logger.info('Shutdown complete');
      process.exit(0);
    }

    process.on('SIGINT', shutdownHandler);
    process.on('SIGTERM', shutdownHandler);
  }

  setupShutdown();

  start().catch((err: unknown) => {
    logger.error(err, 'Bootstrap fail');
    process.exit(1);
  });
}

bootstrap();
