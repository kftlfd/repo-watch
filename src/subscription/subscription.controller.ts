import type { FastifyPluginCallback } from 'fastify';

import { mapErrorToHttp } from '@/utils/errors.js';

import type { SubscriptionService } from './subscription.service.js';
import { EmailSchema, SubscribeInputSchema } from './subscription.schema.js';

export function createSubscriptionController(
  subscriptionService: SubscriptionService,
): FastifyPluginCallback {
  return function subscriptionRoutes(fastify, opts, done) {
    fastify.post('/subscribe', async (req, reply) => {
      const parsed = SubscribeInputSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ message: 'Invalid input' });
      }
      const result = await subscriptionService.subscribe(parsed.data);
      return result.match(
        () =>
          reply.code(200).send({ message: 'Subscription successful. Confirmation email sent.' }),
        (error) => reply.code(mapErrorToHttp(error)).send(error),
      );
    });

    fastify.get<{ Params: { token: string } }>('/confirm/:token', async (req, reply) => {
      const { token } = req.params;
      const result = await subscriptionService.confirm(token);
      return result.match(
        () => reply.code(200).send({ message: 'Subscription confirmed successfully.' }),
        (error) => reply.code(mapErrorToHttp(error)).send(error),
      );
    });

    fastify.get<{ Params: { token: string } }>('/unsubscribe/:token', async (req, reply) => {
      const { token } = req.params;
      const result = await subscriptionService.unsubscribe(token);
      return result.match(
        () => reply.code(200).send({ message: 'Unsubscribed successfully.' }),
        (error) => reply.code(mapErrorToHttp(error)).send(error),
      );
    });

    fastify.get<{ Querystring: { email?: string } }>('/subscriptions', async (req, reply) => {
      const email = req.query.email;
      if (!email) {
        return reply.code(400).send({ message: 'Email parameter is required' });
      }
      if (!EmailSchema.safeParse(email).success) {
        return reply.code(400).send({ message: 'Invalid email' });
      }
      const result = await subscriptionService.listSubscriptions(email);
      return result.match(
        (subscriptions) => reply.code(200).send(subscriptions),
        (error) => reply.code(mapErrorToHttp(error)).send(error),
      );
    });

    done();
  };
}
