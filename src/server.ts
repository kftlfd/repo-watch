import Fastify from 'fastify';

import { env } from '@/config/env.js';
import { subscriptionRoutes } from '@/subscription/subscription.controller.js';

const app = Fastify({
  logger: true,
});

app.get('/', function handler() {
  return { hello: 'world' };
});

app.register(subscriptionRoutes, { prefix: '/api' });

app
  .listen({
    host: env.NODE_ENV === 'dev' ? '127.0.0.1' : '0.0.0.0',
    port: 3000,
  })
  .catch((err: unknown) => {
    app.log.error(err);
    process.exit(1);
  });
