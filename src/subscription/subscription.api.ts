import type { FastifyPluginCallback } from 'fastify';

import { mapErrorToHttp } from '@/utils/errors.js';

import type { SubscriptionController } from './subscription.controller.js';

type Deps = {
  subscriptionController: SubscriptionController;
};

export function createSubscriptionApi({ subscriptionController }: Deps): FastifyPluginCallback {
  return function subscriptionApiRoutes(fastify, _opts, done) {
    fastify.post('/subscribe', async (req, reply) => {
      const result = await subscriptionController.subscribe(req.body);

      return result.match(
        () =>
          reply.code(200).send({ message: 'Subscription successful. Confirmation email sent.' }),
        (error) => {
          const statusCode = mapErrorToHttp(error);
          req.log.error({ error, statusCode }, 'Subscription service error');
          return reply.code(statusCode).send(error);
        },
      );
    });

    fastify.get<{ Params: { token: string } }>('/confirm/:token', async (req, reply) => {
      const { token } = req.params;
      const result = await subscriptionController.confirm(token);

      return result.match(
        () => reply.code(200).send({ message: 'Subscription confirmed successfully.' }),
        (error) => {
          const statusCode = mapErrorToHttp(error);
          req.log.error({ error, statusCode }, 'Confirm service error');
          return reply.code(statusCode).send(error);
        },
      );
    });

    fastify.get<{ Params: { token: string } }>('/unsubscribe/:token', async (req, reply) => {
      const { token } = req.params;
      const result = await subscriptionController.unsubscribe(token);

      return result.match(
        () => reply.code(200).send({ message: 'Unsubscribed successfully.' }),
        (error) => {
          const statusCode = mapErrorToHttp(error);
          req.log.error({ error, statusCode }, 'Unsubscribe service error');
          return reply.code(statusCode).send(error);
        },
      );
    });

    fastify.get<{ Querystring: { email?: string } }>('/subscriptions', async (req, reply) => {
      const email = req.query.email;
      const result = await subscriptionController.listSubscriptions(email ?? '');

      return result.match(
        (subscriptions) => {
          // Swagger schema requires last_seen_tag to be string (not nullable)
          type SubscriptionsListItem = {
            email: string;
            repo: string;
            confirmed: boolean;
            last_seen_tag: string;
          };

          const response: SubscriptionsListItem[] = subscriptions.map((sub) => ({
            email: sub.email,
            repo: sub.repo,
            confirmed: sub.confirmed,
            last_seen_tag: sub.last_seen_tag ?? '',
          }));
          return reply.code(200).send(response);
        },
        (error) => {
          const statusCode = mapErrorToHttp(error);
          req.log.error({ error, statusCode }, 'List subscriptions service error');
          return reply.code(statusCode).send(error);
        },
      );
    });

    done();
  };
}
