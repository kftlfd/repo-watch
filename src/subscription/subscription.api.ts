import type { FastifyReply } from 'fastify';
import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import z from 'zod';

import type { AppError } from '@/utils/errors.js';
import { mapErrorToHttp } from '@/utils/errors.js';

import type { SubscriptionService } from './subscription.service.js';
import { SubscribeInputSchema } from './subscription.schema.js';

type Deps = {
  subscriptionService: SubscriptionService;
};

export function createSubscriptionApi({ subscriptionService }: Deps): FastifyPluginCallbackZod {
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

    fastify.post(
      '/subscribe',
      {
        schema: {
          body: SubscribeInputSchema,
        },
      },
      async (req, reply) => {
        const result = await subscriptionService.subscribe(req.body);

        return result.match(
          () =>
            reply.code(200).send({ message: 'Subscription successful. Confirmation email sent.' }),
          (error) => {
            req.log.error({ error }, 'Subscription service error');
            return sendAppError(reply, error);
          },
        );
      },
    );

    fastify.get(
      '/confirm/:token',
      {
        schema: {
          params: z.object({
            token: z.string().min(10),
          }),
        },
      },
      async (req, reply) => {
        const { token } = req.params;

        const result = await subscriptionService.confirm(token);

        return result.match(
          () => reply.code(200).send({ message: 'Subscription confirmed successfully.' }),
          (error) => {
            req.log.error({ error }, 'Confirm service error');
            return sendAppError(reply, error);
          },
        );
      },
    );

    fastify.get(
      '/unsubscribe/:token',
      {
        schema: {
          params: z.object({
            token: z.string().min(10),
          }),
        },
      },
      async (req, reply) => {
        const { token } = req.params;

        const result = await subscriptionService.unsubscribe(token);

        return result.match(
          () => reply.code(200).send({ message: 'Unsubscribed successfully.' }),
          (error) => {
            req.log.error({ error }, 'Unsubscribe service error');
            return sendAppError(reply, error);
          },
        );
      },
    );

    fastify.get(
      '/subscriptions',
      {
        schema: {
          querystring: z.object({
            email: z.email(),
          }),
        },
      },
      async (req, reply) => {
        const email = req.query.email;

        const result = await subscriptionService.listSubscriptions(email);

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
      },
    );

    done();
  };
}
