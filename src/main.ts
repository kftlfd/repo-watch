import { createApp } from '@/app.js';
import { config } from '@/config/config.js';
import { env } from '@/config/env.js';

function bootstrap() {
  const { app, scannerService, logger } = createApp(config);

  async function start() {
    return Promise.all([
      scannerService.start(),

      app.listen({
        host: env.NODE_ENV === 'dev' ? '127.0.0.1' : '0.0.0.0',
        port: 3000,
      }),
    ]);
  }

  start().catch((err: unknown) => {
    logger.error(err, 'Bootstrap fail');
    process.exit(1);
  });
}

bootstrap();
