import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import z from 'zod';

import { mapErrorToHttp } from '@/utils/errors.js';
import { OpenApiTag } from '@/utils/openapi.js';

import type { SubscriptionService } from './subscription.service.js';
import { SubscribeInputSchema } from './subscription.schema.js';
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
  subscriptionService: SubscriptionService;
};

export function createSubscriptionWeb({ subscriptionService }: Deps): FastifyPluginCallbackZod {
  return function subscriptionWebRoutes(fastify, _opts, done) {
    fastify.get(
      '/',
      {
        schema: {
          tags: [OpenApiTag.Web],
        },
      },
      async (_req, reply) => {
        return reply.type('text/html').send(renderHomeForm());
      },
    );

    fastify.post(
      '/subscribe',
      {
        schema: {
          tags: [OpenApiTag.Web],
          body: SubscribeInputSchema,
        },
      },
      async (req, reply) => {
        const result = await subscriptionService.subscribe(req.body);

        return result.match(
          () => reply.type('text/html').send(renderSubscribeSuccess()),
          (error) => {
            const statusCode = mapErrorToHttp(error);
            const message = error.message || 'Something went wrong';
            return reply.code(statusCode).type('text/html').send(renderSubscribeError(message));
          },
        );
      },
    );

    fastify.get(
      '/confirm/:token',
      {
        schema: {
          tags: [OpenApiTag.Web],
          params: z.object({
            token: z.string().min(10),
          }),
        },
      },
      async (req, reply) => {
        const { token } = req.params;

        const result = await subscriptionService.confirm(token);

        return result.match(
          () => reply.type('text/html').send(renderConfirmSuccess()),
          (error) => {
            const message = error.message || 'Invalid or expired confirmation link';
            return reply.code(400).type('text/html').send(renderConfirmError(message));
          },
        );
      },
    );

    fastify.get(
      '/unsubscribe/:token',
      {
        schema: {
          tags: [OpenApiTag.Web],
          params: z.object({
            token: z.string().min(10),
          }),
        },
      },
      async (req, reply) => {
        const { token } = req.params;

        const result = await subscriptionService.unsubscribe(token);

        return result.match(
          () => reply.type('text/html').send(renderUnsubscribeSuccess()),
          (error) => {
            const message = error.message || 'Invalid or expired link';
            return reply.code(400).type('text/html').send(renderUnsubscribeError(message));
          },
        );
      },
    );

    done();
  };
}
