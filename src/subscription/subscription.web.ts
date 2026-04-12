import type { FastifyPluginCallback } from 'fastify';

import { mapErrorToHttp } from '@/utils/errors.js';

import type { SubscriptionController } from './subscription.controller.js';
import {
  renderConfirmError,
  renderConfirmSuccess,
  renderHomeForm,
  renderSubscribeError,
  renderSubscribeSuccess,
  renderUnsubscribeError,
  renderUnsubscribeSuccess,
} from './templates.js';

type Deps = {
  subscriptionController: SubscriptionController;
};

export function createSubscriptionWeb({ subscriptionController }: Deps): FastifyPluginCallback {
  return function subscriptionWebRoutes(fastify, _opts, done) {
    fastify.get('/', async (_req, reply) => {
      return reply.type('text/html').send(renderHomeForm());
    });

    fastify.post('/subscribe', async (req, reply) => {
      const result = await subscriptionController.subscribe(req.body);

      return result.match(
        () => reply.type('text/html').send(renderSubscribeSuccess()),
        (error) => {
          const statusCode = mapErrorToHttp(error);
          const message = error.message || 'Something went wrong';
          return reply.code(statusCode).type('text/html').send(renderSubscribeError(message));
        },
      );
    });

    fastify.get<{ Params: { token: string } }>('/confirm/:token', async (req, reply) => {
      const { token } = req.params;
      const result = await subscriptionController.confirm(token);

      return result.match(
        () => reply.type('text/html').send(renderConfirmSuccess()),
        (error) => {
          const message = error.message || 'Invalid or expired confirmation link';
          return reply.code(400).type('text/html').send(renderConfirmError(message));
        },
      );
    });

    fastify.get<{ Params: { token: string } }>('/unsubscribe/:token', async (req, reply) => {
      const { token } = req.params;
      const result = await subscriptionController.unsubscribe(token);

      return result.match(
        () => reply.type('text/html').send(renderUnsubscribeSuccess()),
        (error) => {
          const message = error.message || 'Invalid or expired link';
          return reply.code(400).type('text/html').send(renderUnsubscribeError(message));
        },
      );
    });

    done();
  };
}
