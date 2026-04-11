import { createApp } from '@/app.js';
import { config } from '@/config/config.js';
import { env } from '@/config/env.js';

function bootstrap() {
  const { app, scannerService, workers, logger, closeDB, closeRedis } = createApp(config);

  async function start() {
    return Promise.all([
      scannerService.start(),

      app.listen({
        host: env.NODE_ENV === 'dev' ? '127.0.0.1' : '0.0.0.0',
        port: 3000,
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
      scannerService.stop();
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
