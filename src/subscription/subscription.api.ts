import type { FastifyPluginCallback, FastifyReply } from 'fastify';

import type { AppError } from '@/utils/errors.js';
import { mapErrorToHttp } from '@/utils/errors.js';

import type { SubscriptionController } from './subscription.controller.js';

type Deps = {
  subscriptionController: SubscriptionController;
};

export function createSubscriptionApi({ subscriptionController }: Deps): FastifyPluginCallback {
  return function subscriptionApiRoutes(fastify, _opts, done) {
    function sendAppError(reply: FastifyReply, error: AppError) {
      const statusCode = mapErrorToHttp(error);

      const retryAfter =
        error.type === 'RateLimited' && error.retryAfterSeconds !== null
          ? error.retryAfterSeconds.toString()
          : null;

      if (retryAfter) {
        reply.header('Retry-After', retryAfter);
      }

      return reply.code(statusCode).send(error);
    }

    fastify.post('/subscribe', async (req, reply) => {
      const result = await subscriptionController.subscribe(req.body);

      return result.match(
        () =>
          reply.code(200).send({ message: 'Subscription successful. Confirmation email sent.' }),
        (error) => {
          req.log.error({ error }, 'Subscription service error');
          return sendAppError(reply, error);
        },
      );
    });

    fastify.get<{ Params: { token: string } }>('/confirm/:token', async (req, reply) => {
      const { token } = req.params;
      const result = await subscriptionController.confirm(token);

      return result.match(
        () => reply.code(200).send({ message: 'Subscription confirmed successfully.' }),
        (error) => {
          req.log.error({ error }, 'Confirm service error');
          return sendAppError(reply, error);
        },
      );
    });

    fastify.get<{ Params: { token: string } }>('/unsubscribe/:token', async (req, reply) => {
      const { token } = req.params;
      const result = await subscriptionController.unsubscribe(token);

      return result.match(
        () => reply.code(200).send({ message: 'Unsubscribed successfully.' }),
        (error) => {
          req.log.error({ error }, 'Unsubscribe service error');
          return sendAppError(reply, error);
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
          req.log.error({ error }, 'List subscriptions service error');
          return sendAppError(reply, error);
        },
      );
    });

    done();
  };
}
