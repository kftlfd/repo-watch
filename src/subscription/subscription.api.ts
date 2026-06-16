import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import z from 'zod';

import { OpenApiTag } from '@/utils/openapi.js';

import type { SubscriptionService } from './subscription.service.js';
import { ApiErrorSchema, SubscribeInputSchema } from './subscription.schema.js';

type Deps = {
  subscriptionService: SubscriptionService;
};

export function createSubscriptionApi({ subscriptionService }: Deps): FastifyPluginCallbackZod {
  return function subscriptionApiRoutes(fastify, _opts, done) {
    fastify.post(
      '/subscribe',
      {
        schema: {
          tags: [OpenApiTag.API],
          consumes: ['application/json', 'application/x-www-form-urlencoded'],
          body: SubscribeInputSchema,
          response: {
            200: z.object({ message: z.string() }),
            400: ApiErrorSchema,
            404: ApiErrorSchema,
            409: ApiErrorSchema,
            500: ApiErrorSchema,
            502: ApiErrorSchema,
            503: ApiErrorSchema,
          },
        },
      },
      async (req, reply) => {
        const result = await subscriptionService.subscribe(req.body);

        return result.match(
          () => {
            return reply
              .code(200)
              .send({ message: 'Subscription successful. Confirmation email sent.' });
          },

          (error) => {
            req.log.error({ error }, 'Subscription service error');
            switch (error.type) {
              case 'Validation': {
                return reply.code(400).send({ message: error.message });
              }
              case 'NotFound': {
                return reply.code(404).send({ message: error.message });
              }
              case 'Conflict': {
                return reply.code(409).send({ message: error.message });
              }
              case 'External': {
                return reply.code(502).send({ message: error.message });
              }
              case 'RateLimited': {
                const retryAfter = error.retryAfterSeconds?.toString();
                if (retryAfter) {
                  reply.header('Retry-After', retryAfter);
                }
                return reply.code(503).send({ message: error.message });
              }
              default:
                return reply.code(500).send({ message: error.message });
            }
          },
        );
      },
    );

    fastify.get(
      '/confirm/:token',
      {
        schema: {
          tags: [OpenApiTag.API],
          params: z.object({
            token: z.string().min(10),
          }),
          response: {
            200: z.object({ message: z.string() }),
            400: ApiErrorSchema,
            404: ApiErrorSchema,
            409: ApiErrorSchema,
            500: ApiErrorSchema,
            502: ApiErrorSchema,
            503: ApiErrorSchema,
          },
        },
      },
      async (req, reply) => {
        const { token } = req.params;

        const result = await subscriptionService.confirm(token);

        return result.match(
          () => {
            return reply.code(200).send({ message: 'Subscription confirmed successfully.' });
          },

          (error) => {
            req.log.error({ error }, 'Confirm service error');
            switch (error.type) {
              case 'Validation': {
                return reply.code(400).send({ message: error.message });
              }
              case 'NotFound': {
                return reply.code(404).send({ message: error.message });
              }
              case 'Conflict': {
                return reply.code(409).send({ message: error.message });
              }
              case 'External': {
                return reply.code(502).send({ message: error.message });
              }
              case 'RateLimited': {
                const retryAfter = error.retryAfterSeconds?.toString();
                if (retryAfter) {
                  reply.header('Retry-After', retryAfter);
                }
                return reply.code(503).send({ message: error.message });
              }
              default:
                return reply.code(500).send({ message: error.message });
            }
          },
        );
      },
    );

    fastify.get(
      '/unsubscribe/:token',
      {
        schema: {
          tags: [OpenApiTag.API],
          params: z.object({
            token: z.string().min(10),
          }),
          response: {
            200: z.object({ message: z.string() }),
            400: ApiErrorSchema,
            404: ApiErrorSchema,
            409: ApiErrorSchema,
            500: ApiErrorSchema,
            502: ApiErrorSchema,
            503: ApiErrorSchema,
          },
        },
      },
      async (req, reply) => {
        const { token } = req.params;

        const result = await subscriptionService.unsubscribe(token);

        return result.match(
          () => {
            return reply.code(200).send({ message: 'Unsubscribed successfully.' });
          },

          (error) => {
            req.log.error({ error }, 'Unsubscribe service error');
            switch (error.type) {
              case 'Validation': {
                return reply.code(400).send({ message: error.message });
              }
              case 'NotFound': {
                return reply.code(404).send({ message: error.message });
              }
              case 'Conflict': {
                return reply.code(409).send({ message: error.message });
              }
              case 'External': {
                return reply.code(502).send({ message: error.message });
              }
              case 'RateLimited': {
                const retryAfter = error.retryAfterSeconds?.toString();
                if (retryAfter) {
                  reply.header('Retry-After', retryAfter);
                }
                return reply.code(503).send({ message: error.message });
              }
              default:
                return reply.code(500).send({ message: error.message });
            }
          },
        );
      },
    );

    fastify.get(
      '/subscriptions',
      {
        schema: {
          tags: [OpenApiTag.API],
          querystring: z.object({
            email: z.email().meta({ example: 'user@mail.com' }),
          }),
          response: {
            200: z.array(
              z.object({
                email: z.string(),
                repo: z.string(),
                confirmed: z.boolean(),
                last_seen_tag: z.string(),
              }),
            ),
            400: ApiErrorSchema,
            404: ApiErrorSchema,
            409: ApiErrorSchema,
            500: ApiErrorSchema,
            502: ApiErrorSchema,
            503: ApiErrorSchema,
          },
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
            switch (error.type) {
              case 'Validation': {
                return reply.code(400).send({ message: error.message });
              }
              case 'NotFound': {
                return reply.code(404).send({ message: error.message });
              }
              case 'Conflict': {
                return reply.code(409).send({ message: error.message });
              }
              case 'External': {
                return reply.code(502).send({ message: error.message });
              }
              case 'RateLimited': {
                const retryAfter = error.retryAfterSeconds?.toString();
                if (retryAfter) {
                  reply.header('Retry-After', retryAfter);
                }
                return reply.code(503).send({ message: error.message });
              }
              default:
                return reply.code(500).send({ message: error.message });
            }
          },
        );
      },
    );

    done();
  };
}
